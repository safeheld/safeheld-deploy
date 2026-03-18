import { prisma } from '../../utils/prisma';
import { logger } from '../../utils/logger';
import { sendEmail, emailLayout } from '../../utils/email';
import { logAudit } from '../../modules/audit/service';
import { Prisma } from '@prisma/client';

// ─── Constants ───────────────────────────────────────────────────────────────

const DEFAULT_BASIS_POINTS = 0.0000025; // 0.00025%/month = 0.003%/year
const STRIPE_ENABLED = !!process.env.STRIPE_SECRET_KEY;

// ─── Stripe (lazy init) ─────────────────────────────────────────────────────

let stripe: any = null;
function getStripe() {
  if (!stripe && STRIPE_ENABLED) {
    const Stripe = require('stripe');
    stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
  }
  return stripe;
}

// ─── Helper ──────────────────────────────────────────────────────────────────

function toNum(val: unknown): number {
  if (val === null || val === undefined) return 0;
  if (typeof val === 'number') return val;
  return Number(val.toString());
}

function formatGBP(amount: number): string {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(amount);
}

function monthName(date: Date): string {
  return date.toLocaleString('en-GB', { month: 'long', year: 'numeric' });
}

// ─── Monthly Billing Job ─────────────────────────────────────────────────────

/**
 * Run monthly billing for all active firms.
 * Called by scheduler on the 1st of each month at 07:00 UTC.
 */
export async function runMonthlyBilling(): Promise<{ invoiced: number; failed: number; skipped: number }> {
  const now = new Date();
  const periodEnd = new Date(now.getFullYear(), now.getMonth(), 0); // last day of prev month
  const periodStart = new Date(periodEnd.getFullYear(), periodEnd.getMonth(), 1);

  const firms = await prisma.firm.findMany({
    where: { billingStatus: 'ACTIVE' },
    select: {
      id: true,
      name: true,
      stripeCustomerId: true,
      baseMonthlyFee: true,
      basisPointsRate: true,
      baseCurrency: true,
      users: { where: { role: 'ADMIN', status: 'ACTIVE' }, select: { email: true, id: true }, take: 1 },
    },
  });

  let invoiced = 0;
  let failed = 0;
  let skipped = 0;

  for (const firm of firms) {
    try {
      const result = await generateInvoice(firm.id, periodStart, periodEnd);
      if (result) {
        invoiced++;
        logger.info({ firmId: firm.id, total: result.totalAmount }, 'Monthly invoice generated');
      } else {
        skipped++;
      }
    } catch (err) {
      failed++;
      logger.error({ err, firmId: firm.id }, 'Monthly invoice generation failed');

      // Alert admin
      if (firm.users[0]) {
        sendEmail({
          to: firm.users[0].email,
          subject: `[Safeheld] Billing failed for ${firm.name}`,
          html: emailLayout('Billing Error', `<p>Invoice generation failed for <strong>${firm.name}</strong>. Please check the admin billing portal.</p>`),
          firmId: firm.id,
          userId: firm.users[0].id,
          emailType: 'BILLING_FAILED',
        }).catch(() => {});
      }
    }
  }

  return { invoiced, failed, skipped };
}

/**
 * Generate an invoice for a specific firm and period.
 */
export async function generateInvoice(firmId: string, periodStart: Date, periodEnd: Date) {
  const firm = await prisma.firm.findUnique({
    where: { id: firmId },
    select: {
      id: true,
      name: true,
      stripeCustomerId: true,
      baseMonthlyFee: true,
      basisPointsRate: true,
      baseCurrency: true,
      billingStatus: true,
    },
  });

  if (!firm) throw new Error(`Firm ${firmId} not found`);
  if (firm.billingStatus !== 'ACTIVE') return null;

  // Get month-end safeguarded balance from last reconciliation of the period
  const lastRecon = await prisma.reconciliationRun.findFirst({
    where: {
      firmId,
      reconciliationType: 'INTERNAL',
      reconciliationDate: { gte: periodStart, lte: periodEnd },
    },
    orderBy: { reconciliationDate: 'desc' },
    select: { totalRequirement: true },
  });

  const monthEndBalance = toNum(lastRecon?.totalRequirement ?? 0);
  const baseFee = toNum(firm.baseMonthlyFee);
  const basisPointsRate = toNum(firm.basisPointsRate);
  const basisPointsAmount = Math.round(monthEndBalance * basisPointsRate * 100) / 100;
  const totalAmount = Math.round((baseFee + basisPointsAmount) * 100) / 100;

  // Create Stripe invoice if configured
  let stripeInvoiceId: string | null = null;
  const s = getStripe();
  if (s && firm.stripeCustomerId) {
    try {
      const period = monthName(periodStart);

      // Add line items
      await s.invoiceItems.create({
        customer: firm.stripeCustomerId,
        amount: Math.round(baseFee * 100), // Stripe uses pence
        currency: 'gbp',
        description: `Safeheld Platform Fee — ${period}`,
      });

      if (basisPointsAmount > 0) {
        await s.invoiceItems.create({
          customer: firm.stripeCustomerId,
          amount: Math.round(basisPointsAmount * 100),
          currency: 'gbp',
          description: `Verification Fee — ${formatGBP(monthEndBalance)} safeguarded @ 0.00025%/month`,
        });
      }

      const invoice = await s.invoices.create({
        customer: firm.stripeCustomerId,
        auto_advance: true, // Finalise and send
        collection_method: 'send_invoice',
        days_until_due: 14,
      });

      await s.invoices.sendInvoice(invoice.id);
      stripeInvoiceId = invoice.id;
    } catch (err) {
      logger.error({ err, firmId }, 'Stripe invoice creation failed — storing locally only');
    }
  }

  const billingInvoice = await prisma.billingInvoice.create({
    data: {
      firmId,
      stripeInvoiceId,
      periodStart,
      periodEnd,
      monthEndBalance,
      baseFee,
      basisPointsAmount,
      totalAmount,
      currency: firm.baseCurrency || 'GBP',
      status: stripeInvoiceId ? 'PENDING' : 'DRAFT',
    },
  });

  await logAudit({
    action: 'BILLING_INVOICE_CREATED',
    entityType: 'billing_invoices',
    entityId: billingInvoice.id,
    details: {
      firmId,
      firmName: firm.name,
      period: `${periodStart.toISOString().split('T')[0]} to ${periodEnd.toISOString().split('T')[0]}`,
      monthEndBalance,
      baseFee,
      basisPointsAmount,
      totalAmount,
      stripeInvoiceId,
    },
  });

  return billingInvoice;
}

// ─── Trial Management ────────────────────────────────────────────────────────

/**
 * Check for expiring and expired trials. Called daily at 09:00 UTC.
 */
export async function checkTrials(): Promise<{ warned: number; activated: number }> {
  const now = new Date();
  const sevenDaysFromNow = new Date(now);
  sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7);

  let warned = 0;
  let activated = 0;

  // Warn firms whose trial expires in 7 days
  const expiringFirms = await prisma.firm.findMany({
    where: {
      billingStatus: 'TRIAL',
      trialEndsAt: {
        gte: new Date(sevenDaysFromNow.toISOString().split('T')[0]),
        lt: new Date(new Date(sevenDaysFromNow.getTime() + 86400000).toISOString().split('T')[0]),
      },
    },
    include: { users: { where: { role: { in: ['ADMIN', 'COMPLIANCE_OFFICER'] }, status: 'ACTIVE' }, select: { email: true, id: true } } },
  });

  for (const firm of expiringFirms) {
    for (const user of firm.users) {
      await sendEmail({
        to: user.email,
        subject: `[Safeheld] Your trial expires in 7 days`,
        html: emailLayout('Trial Expiring', `
          <p>Your Safeheld trial for <strong>${firm.name}</strong> expires in 7 days.</p>
          <p>Your first invoice will be calculated based on your month-end safeguarded balance at a rate of ${formatGBP(toNum(firm.baseMonthlyFee))}/month plus 0.00025% of safeguarded funds.</p>
          <p>No action needed — your account will automatically transition to active billing.</p>
        `),
        firmId: firm.id,
        userId: user.id,
        emailType: 'TRIAL_EXPIRING',
      }).catch(() => {});
    }
    warned++;
  }

  // Activate expired trials
  const expiredFirms = await prisma.firm.findMany({
    where: {
      billingStatus: 'TRIAL',
      trialEndsAt: { lt: now },
    },
    include: { users: { where: { role: { in: ['ADMIN', 'COMPLIANCE_OFFICER'] }, status: 'ACTIVE' }, select: { email: true, id: true } } },
  });

  for (const firm of expiredFirms) {
    await prisma.firm.update({
      where: { id: firm.id },
      data: { billingStatus: 'ACTIVE' },
    });

    // Auto-set base fee by fund size
    const lastRecon = await prisma.reconciliationRun.findFirst({
      where: { firmId: firm.id, reconciliationType: 'INTERNAL' },
      orderBy: { reconciliationDate: 'desc' },
      select: { totalRequirement: true },
    });

    const balance = toNum(lastRecon?.totalRequirement ?? 0);
    let baseFee = 1500;
    if (balance >= 500_000_000) baseFee = 6000;
    else if (balance >= 50_000_000) baseFee = 3000;

    await prisma.firm.update({
      where: { id: firm.id },
      data: { baseMonthlyFee: baseFee },
    });

    await logAudit({
      action: 'BILLING_TRIAL_EXPIRED',
      entityType: 'firms',
      entityId: firm.id,
      details: { firmName: firm.name, newStatus: 'ACTIVE', baseFee },
    });

    for (const user of firm.users) {
      await sendEmail({
        to: user.email,
        subject: `[Safeheld] Your trial has ended — billing is now active`,
        html: emailLayout('Trial Ended', `
          <p>Your Safeheld trial for <strong>${firm.name}</strong> has ended.</p>
          <p>Your account is now on active billing at <strong>${formatGBP(baseFee)}/month</strong> plus 0.00025% of safeguarded funds.</p>
          <p>Your first invoice will be generated on the 1st of next month.</p>
        `),
        firmId: firm.id,
        userId: user.id,
        emailType: 'TRIAL_EXPIRED',
      }).catch(() => {});
    }

    activated++;
  }

  return { warned, activated };
}

// ─── Stripe Webhook Handling ─────────────────────────────────────────────────

export async function handleStripeWebhook(event: any): Promise<void> {
  switch (event.type) {
    case 'invoice.paid': {
      const invoice = event.data.object;
      await prisma.billingInvoice.updateMany({
        where: { stripeInvoiceId: invoice.id },
        data: { status: 'PAID', paidAt: new Date() },
      });

      // Send confirmation email
      const billingInvoice = await prisma.billingInvoice.findFirst({
        where: { stripeInvoiceId: invoice.id },
        include: { firm: { include: { users: { where: { role: 'ADMIN', status: 'ACTIVE' }, select: { email: true, id: true }, take: 1 } } } },
      });
      if (billingInvoice?.firm.users[0]) {
        await sendEmail({
          to: billingInvoice.firm.users[0].email,
          subject: `[Safeheld] Payment confirmed — ${formatGBP(toNum(billingInvoice.totalAmount))}`,
          html: emailLayout('Payment Confirmed', `
            <p>Payment confirmed for <strong>${billingInvoice.firm.name}</strong>.</p>
            <p>Amount: <strong>${formatGBP(toNum(billingInvoice.totalAmount))}</strong></p>
            <p>Your Safeheld verification continues uninterrupted.</p>
          `),
          firmId: billingInvoice.firmId,
          userId: billingInvoice.firm.users[0].id,
          emailType: 'BILLING_PAID',
        }).catch(() => {});
      }
      break;
    }

    case 'invoice.payment_failed': {
      const invoice = event.data.object;
      await prisma.billingInvoice.updateMany({
        where: { stripeInvoiceId: invoice.id },
        data: { status: 'FAILED' },
      });

      const billingInvoice = await prisma.billingInvoice.findFirst({
        where: { stripeInvoiceId: invoice.id },
        include: { firm: { include: { users: { where: { role: 'ADMIN', status: 'ACTIVE' }, select: { email: true, id: true }, take: 1 } } } },
      });
      if (billingInvoice?.firm.users[0]) {
        await sendEmail({
          to: billingInvoice.firm.users[0].email,
          subject: `[Safeheld] Payment failed — action required`,
          html: emailLayout('Payment Failed', `
            <p>Payment failed for invoice <strong>${formatGBP(toNum(billingInvoice.totalAmount))}</strong> for ${billingInvoice.firm.name}.</p>
            <p>Please update your payment method within 14 days to avoid service suspension.</p>
          `),
          firmId: billingInvoice.firmId,
          userId: billingInvoice.firm.users[0].id,
          emailType: 'BILLING_FAILED',
        }).catch(() => {});
      }
      break;
    }

    case 'customer.subscription.deleted': {
      const sub = event.data.object;
      const firm = await prisma.firm.findFirst({ where: { stripeCustomerId: sub.customer } });
      if (firm) {
        await prisma.firm.update({ where: { id: firm.id }, data: { billingStatus: 'CANCELLED' } });
      }
      break;
    }
  }
}

// ─── Admin Dashboard Queries ─────────────────────────────────────────────────

export async function getBillingDashboard() {
  const now = new Date();
  const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);
  const lastMonthStart = new Date(lastMonthEnd.getFullYear(), lastMonthEnd.getMonth(), 1);

  const [activeFirms, trialFirms, suspendedFirms, lastMonthInvoices, allFirms] = await Promise.all([
    prisma.firm.count({ where: { billingStatus: 'ACTIVE' } }),
    prisma.firm.count({ where: { billingStatus: 'TRIAL' } }),
    prisma.firm.count({ where: { billingStatus: 'SUSPENDED' } }),
    prisma.billingInvoice.findMany({
      where: { periodStart: { gte: lastMonthStart }, periodEnd: { lte: lastMonthEnd } },
      select: { baseFee: true, basisPointsAmount: true, totalAmount: true, monthEndBalance: true },
    }),
    prisma.firm.findMany({
      where: { billingStatus: 'ACTIVE' },
      select: { baseMonthlyFee: true },
    }),
  ]);

  const totalBaseFees = allFirms.reduce((sum, f) => sum + toNum(f.baseMonthlyFee), 0);
  const lastMonthBasisPoints = lastMonthInvoices.reduce((sum, i) => sum + toNum(i.basisPointsAmount), 0);
  const mrr = totalBaseFees + lastMonthBasisPoints;
  const totalFundsUnderVerification = lastMonthInvoices.reduce((sum, i) => sum + toNum(i.monthEndBalance), 0);
  const avgContractValue = activeFirms > 0 ? mrr / activeFirms : 0;

  return {
    mrr: Math.round(mrr * 100) / 100,
    arr: Math.round(mrr * 12 * 100) / 100,
    totalFundsUnderVerification: Math.round(totalFundsUnderVerification * 100) / 100,
    basisPointsRevenueThisMonth: Math.round(lastMonthBasisPoints * 100) / 100,
    activeFirms,
    trialFirms,
    suspendedFirms,
    avgContractValue: Math.round(avgContractValue * 100) / 100,
  };
}

export async function getBillingFirms(page = 1, pageSize = 50) {
  const skip = (page - 1) * pageSize;

  const [firms, total] = await Promise.all([
    prisma.firm.findMany({
      skip,
      take: pageSize,
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        billingStatus: true,
        baseMonthlyFee: true,
        basisPointsRate: true,
        stripeCustomerId: true,
        trialEndsAt: true,
        billingDay: true,
        billingInvoices: {
          orderBy: { periodEnd: 'desc' },
          take: 1,
          select: { totalAmount: true, monthEndBalance: true, periodEnd: true, status: true },
        },
      },
    }),
    prisma.firm.count(),
  ]);

  return { firms, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
}

export async function getInvoices(filters: { firmId?: string; status?: string; page?: number; pageSize?: number }) {
  const where: Prisma.BillingInvoiceWhereInput = {};
  if (filters.firmId) where.firmId = filters.firmId;
  if (filters.status) where.status = filters.status as any;

  const page = filters.page || 1;
  const pageSize = filters.pageSize || 50;
  const skip = (page - 1) * pageSize;

  const [invoices, total] = await Promise.all([
    prisma.billingInvoice.findMany({
      where,
      skip,
      take: pageSize,
      orderBy: { createdAt: 'desc' },
      include: { firm: { select: { name: true } } },
    }),
    prisma.billingInvoice.count({ where }),
  ]);

  return { invoices, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
}

export async function updateBillingSettings(firmId: string, userId: string, data: {
  baseMonthlyFee?: number;
  basisPointsRate?: number;
  billingStatus?: string;
  trialEndsAt?: string;
  notes?: string;
}) {
  const updateData: any = {};
  if (data.baseMonthlyFee !== undefined) updateData.baseMonthlyFee = data.baseMonthlyFee;
  if (data.basisPointsRate !== undefined) updateData.basisPointsRate = data.basisPointsRate;
  if (data.billingStatus !== undefined) updateData.billingStatus = data.billingStatus;
  if (data.trialEndsAt !== undefined) updateData.trialEndsAt = new Date(data.trialEndsAt);

  const firm = await prisma.firm.update({
    where: { id: firmId },
    data: updateData,
    select: { id: true, name: true, baseMonthlyFee: true, basisPointsRate: true, billingStatus: true, trialEndsAt: true },
  });

  // Record settings change
  await prisma.billingSetting.create({
    data: {
      firmId,
      baseMonthlyFee: toNum(firm.baseMonthlyFee),
      basisPointsRate: toNum(firm.basisPointsRate),
      notes: data.notes || null,
      updatedBy: userId,
    },
  });

  await logAudit({
    userId,
    action: 'BILLING_SETTINGS_UPDATED',
    entityType: 'firms',
    entityId: firmId,
    details: { ...data, firmName: firm.name },
  });

  return firm;
}

export async function extendTrial(firmId: string, userId: string, newTrialEnd: string) {
  const firm = await prisma.firm.update({
    where: { id: firmId },
    data: { trialEndsAt: new Date(newTrialEnd), billingStatus: 'TRIAL' },
    select: { id: true, name: true, trialEndsAt: true },
  });

  await logAudit({
    userId,
    action: 'BILLING_TRIAL_EXTENDED',
    entityType: 'firms',
    entityId: firmId,
    details: { firmName: firm.name, newTrialEnd },
  });

  return firm;
}

// ─── Firm-facing billing ─────────────────────────────────────────────────────

export async function getFirmBilling(firmId: string) {
  const firm = await prisma.firm.findUnique({
    where: { id: firmId },
    select: {
      billingStatus: true,
      baseMonthlyFee: true,
      basisPointsRate: true,
      trialEndsAt: true,
      billingDay: true,
    },
  });

  if (!firm) throw new Error('Firm not found');

  // Get current month estimated balance
  const lastRecon = await prisma.reconciliationRun.findFirst({
    where: { firmId, reconciliationType: 'INTERNAL' },
    orderBy: { reconciliationDate: 'desc' },
    select: { totalRequirement: true, reconciliationDate: true },
  });

  const currentBalance = toNum(lastRecon?.totalRequirement ?? 0);
  const basisPointsEstimate = Math.round(currentBalance * toNum(firm.basisPointsRate) * 100) / 100;
  const estimatedTotal = Math.round((toNum(firm.baseMonthlyFee) + basisPointsEstimate) * 100) / 100;

  const daysRemaining = firm.billingStatus === 'TRIAL' && firm.trialEndsAt
    ? Math.max(0, Math.ceil((new Date(firm.trialEndsAt).getTime() - Date.now()) / 86400000))
    : null;

  return {
    billingStatus: firm.billingStatus,
    baseMonthlyFee: toNum(firm.baseMonthlyFee),
    basisPointsRate: toNum(firm.basisPointsRate),
    trialEndsAt: firm.trialEndsAt,
    trialDaysRemaining: daysRemaining,
    currentBalance,
    basisPointsEstimate,
    estimatedTotal,
    billingDay: firm.billingDay,
  };
}

export async function getFirmInvoices(firmId: string, page = 1, pageSize = 20) {
  const skip = (page - 1) * pageSize;
  const [invoices, total] = await Promise.all([
    prisma.billingInvoice.findMany({
      where: { firmId },
      skip,
      take: pageSize,
      orderBy: { createdAt: 'desc' },
    }),
    prisma.billingInvoice.count({ where: { firmId } }),
  ]);
  return { invoices, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
}

// ─── Stripe Customer Creation ────────────────────────────────────────────────

export async function createStripeCustomer(firmId: string, firmName: string, email: string): Promise<string | null> {
  const s = getStripe();
  if (!s) return null;

  try {
    const customer = await s.customers.create({
      name: firmName,
      email,
      metadata: { firmId },
    });

    await prisma.firm.update({
      where: { id: firmId },
      data: { stripeCustomerId: customer.id },
    });

    return customer.id;
  } catch (err) {
    logger.error({ err, firmId }, 'Failed to create Stripe customer');
    return null;
  }
}

// ─── Failed Payment Suspension ───────────────────────────────────────────────

export async function checkFailedPayments(): Promise<number> {
  const fourteenDaysAgo = new Date();
  fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);

  const failedInvoices = await prisma.billingInvoice.findMany({
    where: {
      status: 'FAILED',
      createdAt: { lt: fourteenDaysAgo },
      firm: { billingStatus: 'ACTIVE' },
    },
    include: { firm: { include: { users: { where: { role: 'ADMIN', status: 'ACTIVE' }, select: { email: true, id: true }, take: 1 } } } },
  });

  let suspended = 0;
  for (const inv of failedInvoices) {
    await prisma.firm.update({
      where: { id: inv.firmId },
      data: { billingStatus: 'SUSPENDED' },
    });

    if (inv.firm.users[0]) {
      await sendEmail({
        to: inv.firm.users[0].email,
        subject: `[Safeheld] Service suspended — non-payment`,
        html: emailLayout('Service Suspended', `
          <p>Your Safeheld access for <strong>${inv.firm.name}</strong> has been suspended due to non-payment.</p>
          <p>Contact <a href="mailto:support@safeheld.com">support@safeheld.com</a> to reinstate your account.</p>
        `),
        firmId: inv.firmId,
        userId: inv.firm.users[0].id,
        emailType: 'BILLING_SUSPENDED',
      }).catch(() => {});
    }

    suspended++;
  }

  return suspended;
}

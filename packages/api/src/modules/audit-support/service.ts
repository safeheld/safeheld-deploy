import crypto from 'crypto';
import PDFDocument from 'pdfkit';
import { prisma } from '../../utils/prisma';
import { logger } from '../../utils/logger';
import { fileStorage } from '../../utils/fileStorage';
import { Prisma } from '@prisma/client';

// ─── PDF Constants ──────────────────────────────────────────────────────────

const NAVY = '#0C1445';
const ACCENT = '#3D3DFF';
const WHITE = '#FFFFFF';
const LIGHT_GRAY = '#F1F5F9';
const BORDER = '#CBD5E1';
const TEXT_PRIMARY = '#0F172A';
const TEXT_SECONDARY = '#64748B';
const DANGER = '#DC2626';
const SUCCESS = '#16A34A';
const WARNING = '#D97706';
const PAGE_MARGIN = 50;
const CONTENT_WIDTH = 595.28 - PAGE_MARGIN * 2;

function fmtDate(d: Date | string): string {
  const date = typeof d === 'string' ? new Date(d) : d;
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function fmtNum(n: number | string | null | undefined, decimals = 2): string {
  const num = Number(n ?? 0);
  return num.toLocaleString('en-GB', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function ensureSpace(doc: PDFKit.PDFDocument, needed: number) {
  if (doc.y + needed > 770) {
    doc.addPage();
    doc.y = PAGE_MARGIN;
  }
}

function addHeader(doc: PDFKit.PDFDocument, title: string, firmName: string, subtitle?: string) {
  doc.rect(0, 0, 595.28, 80).fill(NAVY);
  doc.font('Helvetica-Bold').fontSize(20).fillColor(WHITE)
    .text('Safeheld', PAGE_MARGIN, 22, { continued: false });
  doc.font('Helvetica').fontSize(10).fillColor('#94A3B8')
    .text(firmName, PAGE_MARGIN, 28, { width: CONTENT_WIDTH, align: 'right' });
  doc.rect(0, 80, 595.28, 4).fill(ACCENT);
  doc.moveDown(0.5);
  const titleY = 100;
  doc.font('Helvetica-Bold').fontSize(18).fillColor(TEXT_PRIMARY)
    .text(title, PAGE_MARGIN, titleY);
  const sub = subtitle || `Generated ${fmtDate(new Date())} at ${new Date().toLocaleTimeString('en-GB')}`;
  doc.font('Helvetica').fontSize(9).fillColor(TEXT_SECONDARY)
    .text(sub, PAGE_MARGIN, titleY + 24);
  doc.y = titleY + 48;
}

function addSectionTitle(doc: PDFKit.PDFDocument, title: string) {
  ensureSpace(doc, 40);
  doc.moveDown(0.8);
  doc.rect(PAGE_MARGIN, doc.y, CONTENT_WIDTH, 28).fill(NAVY);
  doc.font('Helvetica-Bold').fontSize(11).fillColor(WHITE)
    .text(title, PAGE_MARGIN + 10, doc.y + 8, { width: CONTENT_WIDTH - 20 });
  doc.y += 28;
  doc.moveDown(0.3);
}

function addFieldRow(doc: PDFKit.PDFDocument, label: string, value: string) {
  ensureSpace(doc, 18);
  const y = doc.y;
  doc.font('Helvetica').fontSize(9).fillColor(TEXT_SECONDARY)
    .text(label, PAGE_MARGIN, y, { width: 180 });
  doc.font('Helvetica-Bold').fontSize(9).fillColor(TEXT_PRIMARY)
    .text(value, PAGE_MARGIN + 185, y, { width: CONTENT_WIDTH - 185 });
  doc.y = y + 16;
}

function addFooter(doc: PDFKit.PDFDocument) {
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    doc.font('Helvetica').fontSize(7).fillColor(TEXT_SECONDARY)
      .text(
        `Safeheld  |  Audit Evidence Pack  |  Confidential  |  Page ${i + 1} of ${range.count}`,
        PAGE_MARGIN, 795,
        { width: CONTENT_WIDTH, align: 'center' }
      );
  }
}

// ─── Service Functions ──────────────────────────────────────────────────────

export async function generateAuditEvidencePack(
  firmId: string,
  periodStart: string,
  periodEnd: string,
  userId: string
) {
  const firm = await prisma.firm.findUnique({
    where: { id: firmId },
    select: {
      name: true, fcaFrn: true, regime: true, safeguardingMethod: true,
      baseCurrency: true, auditRequirementStatus: true,
    },
  });
  if (!firm) throw new Error('Firm not found');

  const startDate = new Date(periodStart);
  const endDate = new Date(periodEnd + 'T23:59:59.999Z');

  // Gather all data for the period
  const [reconRuns, breaches, fcaNotifications, resolutionPacks, ackLetters, policies, auditLogs] = await Promise.all([
    prisma.reconciliationRun.findMany({
      where: { firmId, reconciliationDate: { gte: startDate, lte: endDate } },
      orderBy: { reconciliationDate: 'asc' },
      select: {
        id: true, reconciliationDate: true, reconciliationType: true, currency: true,
        totalRequirement: true, totalResource: true, variance: true, variancePercentage: true,
        status: true, dataCompleteness: true,
      },
    }),
    prisma.breach.findMany({
      where: { firmId, createdAt: { gte: startDate, lte: endDate } },
      orderBy: { createdAt: 'asc' },
      include: {
        fcaNotifications: { select: { id: true, status: true, notificationType: true, submittedAt: true } },
      },
    }),
    prisma.fcaNotification.findMany({
      where: { firmId, createdAt: { gte: startDate, lte: endDate } },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.resolutionPack.findMany({
      where: { firmId, createdAt: { gte: startDate, lte: endDate } },
      orderBy: { createdAt: 'desc' },
      take: 2,
    }).catch(() => []),
    prisma.acknowledgementLetter.findMany({
      where: {
        firmId,
        createdAt: { gte: startDate, lte: endDate },
      },
      orderBy: { createdAt: 'asc' },
      include: { safeguardingAccount: { select: { bankName: true, accountNumberMasked: true } } },
    }).catch(() => []),
    prisma.policyDocument.findMany({
      where: { firmId, createdAt: { gte: startDate, lte: endDate } },
      orderBy: { createdAt: 'asc' },
    }).catch(() => []),
    prisma.auditLog.findMany({
      where: { firmId, createdAt: { gte: startDate, lte: endDate } },
      orderBy: { createdAt: 'asc' },
      select: { action: true, entityType: true, entityId: true, createdAt: true, userId: true },
    }),
  ]);

  const shortfallCount = breaches.filter(b => b.breachType === 'SHORTFALL').length;
  const resPackStatus = resolutionPacks.length > 0 ? 'EXISTS' : 'NOT_FOUND';

  // Generate PDF
  const pdfBuffer = await generateEvidencePackPdf({
    firm,
    periodStart: startDate,
    periodEnd: new Date(periodEnd),
    reconRuns,
    breaches,
    fcaNotifications,
    resolutionPacks,
    ackLetters,
    policies,
    auditLogs,
    shortfallCount,
    resPackStatus,
  });

  // Store PDF
  const contentHash = crypto.createHash('sha256').update(pdfBuffer).digest('hex');
  const key = `firms/${firmId}/audit-evidence-packs/${periodStart}_${periodEnd}_${contentHash.substring(0, 8)}.pdf`;
  const storagePath = await fileStorage.store(key, pdfBuffer, 'application/pdf');

  // Save record
  const pack = await prisma.auditEvidencePack.create({
    data: {
      firmId,
      periodStart: startDate,
      periodEnd: new Date(periodEnd),
      pdfStoragePath: storagePath,
      contentHash,
      generatedBy: userId,
      reconDaysCount: reconRuns.length,
      breachCount: breaches.length,
      shortfallCount,
      resPackStatus,
    },
  });

  logger.info({ firmId, packId: pack.id, periodStart, periodEnd }, 'Audit evidence pack generated');
  return pack;
}

export async function getAuditPeriodInfo(firmId: string) {
  const firm = await prisma.firm.findUnique({
    where: { id: firmId },
    select: {
      auditPeriodStart: true, auditPeriodEnd: true,
      auditSubmissionDeadline: true, auditRequirementStatus: true,
      auditThresholdExceeded: true, createdAt: true,
    },
  });
  if (!firm) throw new Error('Firm not found');

  const today = new Date();

  // Compute days until audit period ends
  let daysUntilPeriodEnd: number | null = null;
  if (firm.auditPeriodEnd) {
    const diffMs = firm.auditPeriodEnd.getTime() - today.getTime();
    daysUntilPeriodEnd = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  }

  // Compute days until submission deadline
  let daysUntilSubmissionDeadline: number | null = null;
  if (firm.auditSubmissionDeadline) {
    const diffMs = firm.auditSubmissionDeadline.getTime() - today.getTime();
    daysUntilSubmissionDeadline = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  }

  // Determine if this is the first audit period (6 months) or subsequent (4 months)
  let submissionMonths = 4;
  if (firm.auditPeriodStart && firm.createdAt) {
    const firmAge = firm.auditPeriodStart.getTime() - firm.createdAt.getTime();
    const oneYear = 365 * 24 * 60 * 60 * 1000;
    if (firmAge < oneYear) submissionMonths = 6;
  }

  return {
    auditPeriodStart: firm.auditPeriodStart,
    auditPeriodEnd: firm.auditPeriodEnd,
    daysUntilPeriodEnd,
    submissionDeadline: firm.auditSubmissionDeadline,
    daysUntilSubmissionDeadline,
    submissionMonthsAllowed: submissionMonths,
    auditRequirementStatus: firm.auditRequirementStatus,
    auditThresholdExceeded: firm.auditThresholdExceeded,
  };
}

export async function checkAuditThreshold(firmId: string) {
  const firm = await prisma.firm.findUnique({
    where: { id: firmId },
    select: {
      maxSafeguardedAmount: true, maxSafeguardedAmountDate: true,
      auditThresholdExceeded: true, auditRequirementStatus: true,
      createdAt: true,
    },
  });
  if (!firm) throw new Error('Firm not found');

  const THRESHOLD_AMOUNT = 100000; // 100k GBP
  const THRESHOLD_WEEKS = 53;

  // Look at reconciliation runs to check max safeguarded amount over time
  const reconRuns = await prisma.reconciliationRun.findMany({
    where: { firmId, reconciliationType: 'INTERNAL' },
    orderBy: { reconciliationDate: 'asc' },
    select: { reconciliationDate: true, totalResource: true },
  });

  let maxAmount = Number(firm.maxSafeguardedAmount ?? 0);
  let maxDate = firm.maxSafeguardedAmountDate;
  let weeksAboveThreshold = 0;
  let consecutiveWeeksAbove = 0;

  // Calculate weeks where safeguarded amount exceeded 100k
  const weeklyMax: Map<string, number> = new Map();
  for (const run of reconRuns) {
    const weekKey = getISOWeek(run.reconciliationDate);
    const amount = Number(run.totalResource ?? 0);
    const current = weeklyMax.get(weekKey) || 0;
    weeklyMax.set(weekKey, Math.max(current, amount));
    if (amount > maxAmount) {
      maxAmount = amount;
      maxDate = run.reconciliationDate;
    }
  }

  for (const [, amount] of weeklyMax) {
    if (amount >= THRESHOLD_AMOUNT) {
      weeksAboveThreshold++;
      consecutiveWeeksAbove++;
    } else {
      consecutiveWeeksAbove = 0;
    }
  }

  const thresholdExceeded = weeksAboveThreshold >= THRESHOLD_WEEKS;
  const recommendation = thresholdExceeded
    ? 'AUDIT_REQUIRED'
    : weeksAboveThreshold >= THRESHOLD_WEEKS * 0.8
      ? 'APPROACHING_THRESHOLD'
      : 'BELOW_THRESHOLD';

  // Update firm record
  await prisma.firm.update({
    where: { id: firmId },
    data: {
      maxSafeguardedAmount: maxAmount,
      maxSafeguardedAmountDate: maxDate,
      auditThresholdExceeded: thresholdExceeded,
      auditRequirementStatus: thresholdExceeded ? 'REQUIRED' : firm.auditRequirementStatus,
    },
  });

  return {
    maxSafeguardedAmount: maxAmount,
    maxSafeguardedAmountDate: maxDate,
    thresholdAmount: THRESHOLD_AMOUNT,
    thresholdWeeks: THRESHOLD_WEEKS,
    weeksAboveThreshold,
    thresholdExceeded,
    recommendation,
    currentStatus: thresholdExceeded ? 'REQUIRED' : firm.auditRequirementStatus,
  };
}

export async function signOffAuditExemption(firmId: string, signedOffBy: string) {
  const firm = await prisma.firm.findUnique({
    where: { id: firmId },
    select: { auditThresholdExceeded: true, auditRequirementStatus: true },
  });
  if (!firm) throw new Error('Firm not found');
  if (firm.auditThresholdExceeded) {
    throw new Error('Cannot sign off exemption when threshold is exceeded - audit is required');
  }

  const updated = await prisma.firm.update({
    where: { id: firmId },
    data: {
      auditRequirementStatus: 'EXEMPT',
      auditExemptionSignedOffBy: signedOffBy,
      auditExemptionSignedOffAt: new Date(),
    },
    select: {
      id: true, auditRequirementStatus: true,
      auditExemptionSignedOffBy: true, auditExemptionSignedOffAt: true,
    },
  });

  logger.info({ firmId, signedOffBy }, 'Audit exemption signed off');
  return updated;
}

export async function getAuditorView(firmId: string, userId: string) {
  // Get user's auditor period scope
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true, auditorPeriodStart: true, auditorPeriodEnd: true },
  });
  if (!user) throw new Error('User not found');

  // For non-AUDITOR roles, return all data
  const hasPeriodScope = user.role === 'AUDITOR' && user.auditorPeriodStart && user.auditorPeriodEnd;
  const startDate = hasPeriodScope ? user.auditorPeriodStart! : new Date('2000-01-01');
  const endDate = hasPeriodScope ? new Date(user.auditorPeriodEnd!.getTime() + 86400000 - 1) : new Date('2099-12-31');

  const dateFilter = { gte: startDate, lte: endDate };

  const [firm, reconRuns, breaches, fcaNotifications, resolutionPacks, ackLetters, policies, auditLogs] = await Promise.all([
    prisma.firm.findUnique({
      where: { id: firmId },
      select: {
        name: true, fcaFrn: true, regime: true, safeguardingMethod: true,
        baseCurrency: true, auditRequirementStatus: true,
        auditPeriodStart: true, auditPeriodEnd: true,
      },
    }),
    prisma.reconciliationRun.findMany({
      where: { firmId, reconciliationDate: dateFilter },
      orderBy: { reconciliationDate: 'desc' },
      select: {
        id: true, reconciliationDate: true, reconciliationType: true, currency: true,
        totalRequirement: true, totalResource: true, variance: true, variancePercentage: true,
        status: true, dataCompleteness: true,
      },
    }),
    prisma.breach.findMany({
      where: { firmId, createdAt: dateFilter },
      orderBy: { createdAt: 'desc' },
      include: {
        fcaNotifications: { select: { id: true, status: true, notificationType: true } },
      },
    }),
    prisma.fcaNotification.findMany({
      where: { firmId, createdAt: dateFilter },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.resolutionPack.findMany({
      where: { firmId, createdAt: dateFilter },
      orderBy: { createdAt: 'desc' },
    }).catch(() => []),
    prisma.acknowledgementLetter.findMany({
      where: {
        firmId,
        createdAt: dateFilter,
      },
      include: { safeguardingAccount: { select: { bankName: true, accountNumberMasked: true } } },
    }).catch(() => []),
    prisma.policyDocument.findMany({
      where: { firmId, createdAt: dateFilter },
      orderBy: { createdAt: 'desc' },
    }).catch(() => []),
    prisma.auditLog.findMany({
      where: { firmId, createdAt: dateFilter },
      orderBy: { createdAt: 'desc' },
      take: 500,
      select: { id: true, action: true, entityType: true, entityId: true, createdAt: true, userId: true },
    }),
  ]);

  return {
    firm,
    scopedPeriod: hasPeriodScope
      ? { start: user.auditorPeriodStart, end: user.auditorPeriodEnd }
      : null,
    reconciliationRuns: reconRuns,
    breaches,
    fcaNotifications,
    resolutionPacks,
    acknowledgementLetters: ackLetters,
    policies,
    auditTrail: auditLogs,
    summary: {
      totalReconRuns: reconRuns.length,
      totalBreaches: breaches.length,
      openBreaches: breaches.filter(b => !['RESOLVED', 'CLOSED'].includes(b.status)).length,
      materialBreaches: breaches.filter(b => b.isMaterial).length,
      shortfalls: reconRuns.filter(r => r.status === 'SHORTFALL').length,
      fcaNotificationCount: fcaNotifications.length,
    },
  };
}

export async function listAuditEvidencePacks(firmId: string) {
  return prisma.auditEvidencePack.findMany({
    where: { firmId },
    orderBy: { createdAt: 'desc' },
  });
}

export async function getAuditEvidencePackDownload(firmId: string, packId: string) {
  const pack = await prisma.auditEvidencePack.findFirst({
    where: { id: packId, firmId },
  });
  if (!pack) throw new Error('Audit evidence pack not found');
  if (!pack.pdfStoragePath) throw new Error('PDF not yet generated for this pack');

  const buffer = await fileStorage.get(pack.pdfStoragePath);
  return { buffer, pack };
}

// ─── Internal Helpers ───────────────────────────────────────────────────────

function getISOWeek(date: Date): string {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
  const week1 = new Date(d.getFullYear(), 0, 4);
  const weekNum = 1 + Math.round(((d.getTime() - week1.getTime()) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7);
  return `${d.getFullYear()}-W${String(weekNum).padStart(2, '0')}`;
}

async function generateEvidencePackPdf(params: {
  firm: {
    name: string; fcaFrn: string | null; regime: string;
    safeguardingMethod: string; baseCurrency: string; auditRequirementStatus: string;
  };
  periodStart: Date;
  periodEnd: Date;
  reconRuns: any[];
  breaches: any[];
  fcaNotifications: any[];
  resolutionPacks: any[];
  ackLetters: any[];
  policies: any[];
  auditLogs: any[];
  shortfallCount: number;
  resPackStatus: string;
}): Promise<Buffer> {
  const { firm, periodStart, periodEnd, reconRuns, breaches, fcaNotifications, resolutionPacks, ackLetters, policies, auditLogs, shortfallCount, resPackStatus } = params;

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: PAGE_MARGIN, bufferPages: true });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    // Cover page
    addHeader(doc, 'Audit Evidence Pack', firm.name,
      `Period: ${fmtDate(periodStart)} - ${fmtDate(periodEnd)}  |  Generated ${fmtDate(new Date())}`);

    addSectionTitle(doc, 'Cover Summary');
    addFieldRow(doc, 'Firm Name', firm.name);
    addFieldRow(doc, 'FCA FRN', firm.fcaFrn || 'N/A');
    addFieldRow(doc, 'Regulatory Regime', firm.regime.replace(/_/g, ' '));
    addFieldRow(doc, 'Safeguarding Method', firm.safeguardingMethod.replace(/_/g, ' '));
    addFieldRow(doc, 'Base Currency', firm.baseCurrency);
    addFieldRow(doc, 'Audit Period', `${fmtDate(periodStart)} - ${fmtDate(periodEnd)}`);
    addFieldRow(doc, 'Total Reconciliation Days', String(reconRuns.length));
    addFieldRow(doc, 'Total Breaches', String(breaches.length));
    addFieldRow(doc, 'Shortfall Count', String(shortfallCount));
    addFieldRow(doc, 'Resolution Pack Status', resPackStatus);
    addFieldRow(doc, 'Audit Requirement', firm.auditRequirementStatus.replace(/_/g, ' '));
    addFieldRow(doc, 'FCA Notifications', String(fcaNotifications.length));
    addFieldRow(doc, 'Acknowledgement Letters', String(ackLetters.length));
    addFieldRow(doc, 'Policy Documents', String(policies.length));
    addFieldRow(doc, 'Audit Log Entries', String(auditLogs.length));

    // Section: Reconciliation Results
    doc.addPage();
    doc.y = PAGE_MARGIN;
    addSectionTitle(doc, '1. Daily Reconciliation Results');

    if (reconRuns.length > 0) {
      for (const run of reconRuns.slice(0, 100)) {
        ensureSpace(doc, 30);
        const y = doc.y;
        doc.font('Helvetica').fontSize(8).fillColor(TEXT_PRIMARY)
          .text(`${fmtDate(run.reconciliationDate)}  |  ${run.reconciliationType}  |  ${run.currency}  |  Req: ${fmtNum(run.totalRequirement)}  |  Res: ${fmtNum(run.totalResource)}  |  Var: ${fmtNum(run.variance)}  |  ${run.status}`,
            PAGE_MARGIN, y, { width: CONTENT_WIDTH });
        doc.y = y + 14;
      }
      if (reconRuns.length > 100) {
        doc.font('Helvetica').fontSize(8).fillColor(TEXT_SECONDARY)
          .text(`... and ${reconRuns.length - 100} more reconciliation runs`, PAGE_MARGIN, doc.y);
        doc.moveDown(0.3);
      }
    } else {
      doc.font('Helvetica').fontSize(9).fillColor(TEXT_SECONDARY)
        .text('No reconciliation runs found for this period.', PAGE_MARGIN, doc.y);
    }

    // Section: Breach Register
    doc.addPage();
    doc.y = PAGE_MARGIN;
    addSectionTitle(doc, '2. Breach Register');

    if (breaches.length > 0) {
      for (const b of breaches.slice(0, 50)) {
        ensureSpace(doc, 45);
        const y = doc.y;
        doc.font('Helvetica-Bold').fontSize(8).fillColor(TEXT_PRIMARY)
          .text(`${b.breachType.replace(/_/g, ' ')} - ${b.severity} - ${b.status}`, PAGE_MARGIN, y);
        doc.font('Helvetica').fontSize(7.5).fillColor(TEXT_SECONDARY)
          .text(`Detected: ${fmtDate(b.createdAt)}  |  Material: ${b.isMaterial ? 'Yes' : 'No'}  |  FCA Notifiable: ${b.isNotifiable ? 'Yes' : 'No'}`,
            PAGE_MARGIN, y + 12);
        doc.font('Helvetica').fontSize(7.5).fillColor(TEXT_PRIMARY)
          .text(b.description.substring(0, 200), PAGE_MARGIN, y + 24, { width: CONTENT_WIDTH });
        doc.y = y + 40;
      }
    } else {
      doc.font('Helvetica').fontSize(9).fillColor(TEXT_SECONDARY)
        .text('No breaches recorded for this period.', PAGE_MARGIN, doc.y);
    }

    // Section: FCA Notifications
    addSectionTitle(doc, '3. FCA Notifications');
    if (fcaNotifications.length > 0) {
      for (const n of fcaNotifications) {
        ensureSpace(doc, 20);
        doc.font('Helvetica').fontSize(8).fillColor(TEXT_PRIMARY)
          .text(`${fmtDate(n.createdAt)}  |  ${n.notificationType.replace(/_/g, ' ')}  |  ${n.status}${n.fcaReference ? `  |  Ref: ${n.fcaReference}` : ''}`,
            PAGE_MARGIN, doc.y, { width: CONTENT_WIDTH });
        doc.y += 14;
      }
    } else {
      doc.font('Helvetica').fontSize(9).fillColor(TEXT_SECONDARY)
        .text('No FCA notifications for this period.', PAGE_MARGIN, doc.y);
    }

    // Section: Resolution Pack
    addSectionTitle(doc, '4. Resolution Pack Status');
    if (resolutionPacks.length > 0) {
      for (const rp of resolutionPacks) {
        ensureSpace(doc, 20);
        doc.font('Helvetica').fontSize(8).fillColor(TEXT_PRIMARY)
          .text(`Created: ${fmtDate(rp.createdAt)}  |  Status: ${rp.status || 'N/A'}`,
            PAGE_MARGIN, doc.y, { width: CONTENT_WIDTH });
        doc.y += 14;
      }
    } else {
      doc.font('Helvetica').fontSize(9).fillColor(TEXT_SECONDARY)
        .text('No resolution pack snapshots found for this period.', PAGE_MARGIN, doc.y);
    }

    // Section: Acknowledgement Letters
    addSectionTitle(doc, '5. Acknowledgement Letter Status');
    if (ackLetters.length > 0) {
      for (const al of ackLetters) {
        ensureSpace(doc, 20);
        const acct = (al as any).safeguardingAccount;
        doc.font('Helvetica').fontSize(8).fillColor(TEXT_PRIMARY)
          .text(`${acct?.bankName || 'Unknown'} (${acct?.accountNumberMasked || 'N/A'})  |  Status: ${al.status}  |  Version: ${al.version}`,
            PAGE_MARGIN, doc.y, { width: CONTENT_WIDTH });
        doc.y += 14;
      }
    } else {
      doc.font('Helvetica').fontSize(9).fillColor(TEXT_SECONDARY)
        .text('No acknowledgement letter activity for this period.', PAGE_MARGIN, doc.y);
    }

    // Section: Policy Version History
    addSectionTitle(doc, '6. Policy Version History');
    if (policies.length > 0) {
      for (const p of policies) {
        ensureSpace(doc, 20);
        doc.font('Helvetica').fontSize(8).fillColor(TEXT_PRIMARY)
          .text(`${p.title || p.documentType}  |  Version: ${p.version || '1'}  |  Status: ${p.status}  |  ${fmtDate(p.createdAt)}`,
            PAGE_MARGIN, doc.y, { width: CONTENT_WIDTH });
        doc.y += 14;
      }
    } else {
      doc.font('Helvetica').fontSize(9).fillColor(TEXT_SECONDARY)
        .text('No policy documents for this period.', PAGE_MARGIN, doc.y);
    }

    // Section: Audit Trail
    doc.addPage();
    doc.y = PAGE_MARGIN;
    addSectionTitle(doc, '7. Audit Trail');
    if (auditLogs.length > 0) {
      for (const log of auditLogs.slice(0, 200)) {
        ensureSpace(doc, 14);
        doc.font('Helvetica').fontSize(7).fillColor(TEXT_PRIMARY)
          .text(`${fmtDate(log.createdAt)}  |  ${log.action}  |  ${log.entityType}/${log.entityId.substring(0, 8)}`,
            PAGE_MARGIN, doc.y, { width: CONTENT_WIDTH });
        doc.y += 12;
      }
      if (auditLogs.length > 200) {
        doc.font('Helvetica').fontSize(8).fillColor(TEXT_SECONDARY)
          .text(`... and ${auditLogs.length - 200} more audit entries`, PAGE_MARGIN, doc.y);
      }
    } else {
      doc.font('Helvetica').fontSize(9).fillColor(TEXT_SECONDARY)
        .text('No audit log entries for this period.', PAGE_MARGIN, doc.y);
    }

    addFooter(doc);
    doc.end();
  });
}

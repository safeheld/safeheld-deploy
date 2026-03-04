import { prisma } from '../../utils/prisma';
import { logger } from '../../utils/logger';
import {
  FundType,
  ReconciliationType,
  ReconciliationStatus,
  ReconciliationTrigger,
  DataCompleteness,
  BreakClassification,
  Prisma,
} from '@prisma/client';
import { detectBreaches } from '../breach/service';
import { sendEmail, reconciliationFailedEmail } from '../../utils/email';

function toNum(val: unknown): number {
  if (val === null || val === undefined) return 0;
  if (typeof val === 'number') return val;
  return Number(val.toString());
}

export interface RunReconciliationParams {
  firmId: string;
  reconciliationDate: Date;
  trigger: ReconciliationTrigger;
  triggeredByUserId?: string;
}

// Calculate business days between two dates (Monday–Friday)
export function businessDaysBetween(from: Date, to: Date): number {
  let count = 0;
  const current = new Date(from);
  current.setHours(0, 0, 0, 0);
  const end = new Date(to);
  end.setHours(0, 0, 0, 0);
  while (current < end) {
    const day = current.getDay();
    if (day !== 0 && day !== 6) count++;
    current.setDate(current.getDate() + 1);
  }
  return count;
}

export async function runReconciliation(params: RunReconciliationParams): Promise<string[]> {
  const { firmId, reconciliationDate, trigger } = params;

  const firm = await prisma.firm.findUnique({
    where: { id: firmId },
    include: { safeguardingAccounts: { where: { status: 'ACTIVE' } } },
  });
  if (!firm) throw new Error(`Firm ${firmId} not found`);

  // Get active rule pack for this firm's regime
  const rulePack = await prisma.rulePack.findFirst({
    where: { regime: firm.regime, status: 'ACTIVE' },
    orderBy: { version: 'desc' },
  });
  if (!rulePack) throw new Error(`No active rule pack found for regime ${firm.regime}`);

  const runIds: string[] = [];

  // ─── Internal Reconciliation ─────────────────────────────────────────────────
  // Sum of client balances (requirement) vs sum of safeguarding ledger balances (resource)
  const clientBalances = await prisma.clientBalance.groupBy({
    by: ['currency'],
    where: { firmId, balanceDate: reconciliationDate },
    _sum: { balance: true },
  });

  const ledgerBalances = await prisma.safeguardingLedgerBalance.groupBy({
    by: ['currency'],
    where: { firmId, balanceDate: reconciliationDate },
    _sum: { balance: true },
  });

  const clientBalanceByCurrency = new Map(
    clientBalances.map(r => [r.currency, toNum(r._sum.balance)])
  );
  const ledgerByCurrency = new Map(
    ledgerBalances.map(r => [r.currency, toNum(r._sum.balance)])
  );

  const allCurrencies = new Set([...clientBalanceByCurrency.keys(), ...ledgerByCurrency.keys()]);

  for (const currency of allCurrencies) {
    const requirement = clientBalanceByCurrency.get(currency) ?? 0;
    const resource = ledgerByCurrency.get(currency) ?? 0;
    const variance = resource - requirement;
    const variancePct = requirement === 0 ? 0 : parseFloat(((variance / requirement) * 100).toFixed(4));

    let status: ReconciliationStatus;
    if (resource >= requirement) {
      status = variance === 0 ? 'MET' : 'EXCESS';
    } else {
      status = 'SHORTFALL';
    }

    const hasClientData = clientBalanceByCurrency.has(currency);
    const hasLedgerData = ledgerByCurrency.has(currency);
    const dataCompleteness: DataCompleteness = hasClientData && hasLedgerData
      ? 'COMPLETE'
      : hasClientData ? 'PARTIAL_RESOURCE'
      : hasLedgerData ? 'PARTIAL_REQUIREMENT'
      : 'PARTIAL_BOTH';

    const run = await prisma.reconciliationRun.create({
      data: {
        firmId,
        reconciliationDate,
        reconciliationType: 'INTERNAL',
        fundType: 'ALL',
        currency,
        totalRequirement: requirement,
        totalResource: resource,
        variance,
        variancePercentage: variancePct,
        status,
        rulePackId: rulePack.id,
        trigger,
        dataCompleteness,
        startedAt: new Date(),
        completedAt: new Date(),
      },
    });

    runIds.push(run.id);

    // Detect breaches from internal reconciliation
    await detectBreaches({
      firmId,
      reconciliationRunId: run.id,
      reconciliationType: 'INTERNAL',
      currency,
      status,
      variance,
      variancePct,
      requirement,
      firm: {
        ...firm,
        materialDiscrepancyPct: toNum(firm.materialDiscrepancyPct),
        materialDiscrepancyAbs: toNum(firm.materialDiscrepancyAbs),
      },
    });

    // Notify stakeholders if reconciliation failed
    if (status === 'SHORTFALL') {
      notifyReconciliationFailure(firmId, firm.name, 'INTERNAL', currency, requirement, resource, variance, variancePct, reconciliationDate).catch(() => {});
    }

    logger.info({ firmId, currency, status, variance }, 'Internal recon completed');
  }

  // ─── External Reconciliation ──────────────────────────────────────────────────
  // Per safeguarding account: ledger balance vs bank balance
  for (const account of firm.safeguardingAccounts) {
    const ledgerBalancesForAccount = await prisma.safeguardingLedgerBalance.groupBy({
      by: ['currency'],
      where: { firmId, safeguardingAccountId: account.id, balanceDate: reconciliationDate },
      _sum: { balance: true },
    });

    const bankBalancesForAccount = await prisma.bankBalance.groupBy({
      by: ['currency'],
      where: { firmId, safeguardingAccountId: account.id, balanceDate: reconciliationDate },
      _sum: { closingBalance: true },
    });

    const ledgerMap = new Map(
      ledgerBalancesForAccount.map(r => [r.currency, toNum(r._sum.balance)])
    );
    const bankMap = new Map(
      bankBalancesForAccount.map(r => [r.currency, toNum(r._sum.closingBalance)])
    );

    const extCurrencies = new Set([...ledgerMap.keys(), ...bankMap.keys()]);

    for (const currency of extCurrencies) {
      const ledgerBal = ledgerMap.get(currency) ?? 0;
      const bankBal = bankMap.get(currency) ?? 0;
      const variance = bankBal - ledgerBal;
      const variancePct = ledgerBal === 0 ? 0 : parseFloat(((variance / ledgerBal) * 100).toFixed(4));

      let status: ReconciliationStatus;
      if (variance === 0) {
        status = 'MET';
      } else if (variance > 0) {
        status = 'EXCESS';
      } else {
        status = 'SHORTFALL';
      }

      const hasLedger = ledgerMap.has(currency);
      const hasBank = bankMap.has(currency);
      const dataCompleteness: DataCompleteness = hasLedger && hasBank ? 'COMPLETE'
        : hasLedger ? 'PARTIAL_RESOURCE' : hasBank ? 'PARTIAL_REQUIREMENT' : 'PARTIAL_BOTH';

      const run = await prisma.reconciliationRun.create({
        data: {
          firmId,
          reconciliationDate,
          reconciliationType: 'EXTERNAL',
          fundType: account.fundType,
          currency,
          totalRequirement: ledgerBal,
          totalResource: bankBal,
          variance,
          variancePercentage: variancePct,
          status,
          rulePackId: rulePack.id,
          trigger,
          dataCompleteness,
          startedAt: new Date(),
          completedAt: new Date(),
        },
      });

      runIds.push(run.id);

      // Create external break if there is a variance
      if (variance !== 0) {
        const existingBreak = await prisma.reconciliationBreak.findFirst({
          where: { firmId, safeguardingAccountId: account.id, resolvedAt: null },
          orderBy: { createdAt: 'asc' },
        });

        const firstDetected = existingBreak?.firstDetectedDate || reconciliationDate;
        const ageDays = businessDaysBetween(firstDetected, new Date());

        await prisma.reconciliationBreak.create({
          data: {
            firmId,
            reconciliationRunId: run.id,
            safeguardingAccountId: account.id,
            internalBalance: ledgerBal,
            externalBalance: bankBal,
            variance,
            classification: ageDays <= 1 ? 'TIMING' : 'UNRESOLVED',
            firstDetectedDate: firstDetected,
            ageBusinessDays: ageDays,
          },
        });

        // Detect breach if break is old enough
        await detectBreaches({
          firmId,
          reconciliationRunId: run.id,
          reconciliationType: 'EXTERNAL',
          currency,
          status,
          variance,
          variancePct,
          requirement: ledgerBal,
          firm: {
            ...firm,
            materialDiscrepancyPct: toNum(firm.materialDiscrepancyPct),
            materialDiscrepancyAbs: toNum(firm.materialDiscrepancyAbs),
          },
          safeguardingAccountId: account.id,
          breakAgeDays: ageDays,
        });
      }

      // Notify stakeholders if reconciliation failed
      if (status === 'SHORTFALL') {
        notifyReconciliationFailure(firmId, firm.name, 'EXTERNAL', currency, ledgerBal, bankBal, variance, variancePct, reconciliationDate, `${account.bankName} (${account.accountNumberMasked})`).catch(() => {});
      }

      logger.info({ firmId, accountId: account.id, currency, status }, 'External recon completed');
    }
  }

  return runIds;
}

async function notifyReconciliationFailure(
  firmId: string,
  firmName: string,
  reconciliationType: string,
  currency: string,
  requirement: number,
  resource: number,
  variance: number,
  variancePct: number,
  reconciliationDate: Date,
  accountName?: string,
): Promise<void> {
  try {
    const users = await prisma.user.findMany({
      where: { firmId, role: { in: ['COMPLIANCE_OFFICER', 'ADMIN'] }, status: 'ACTIVE' },
      select: { email: true, id: true },
    });

    const dateStr = reconciliationDate.toISOString().split('T')[0];

    for (const user of users) {
      await sendEmail({
        to: user.email,
        subject: `[Safeheld] Reconciliation Shortfall - ${currency} ${reconciliationType}`,
        html: reconciliationFailedEmail({
          firmName,
          reconciliationType,
          currency,
          requirement: requirement.toFixed(2),
          resource: resource.toFixed(2),
          variance: variance.toFixed(2),
          variancePct: variancePct.toFixed(2),
          status: 'SHORTFALL',
          reconciliationDate: dateStr,
          accountName,
        }),
        firmId,
        userId: user.id,
        emailType: 'RECONCILIATION_FAILED',
      }).catch(() => {});
    }
  } catch (err) {
    logger.error({ err, firmId, reconciliationType, currency }, 'Failed to notify reconciliation failure');
  }
}

export async function getReconciliationHistory(
  firmId: string,
  filters: {
    reconciliationType?: ReconciliationType;
    currency?: string;
    from?: Date;
    to?: Date;
    page?: number;
    pageSize?: number;
  }
) {
  const where: Prisma.ReconciliationRunWhereInput = { firmId };
  if (filters.reconciliationType) where.reconciliationType = filters.reconciliationType;
  if (filters.currency) where.currency = filters.currency;
  if (filters.from || filters.to) {
    where.reconciliationDate = {};
    if (filters.from) (where.reconciliationDate as Prisma.DateTimeFilter).gte = filters.from;
    if (filters.to) (where.reconciliationDate as Prisma.DateTimeFilter).lte = filters.to;
  }

  const page = filters.page || 1;
  const pageSize = filters.pageSize || 50;
  const skip = (page - 1) * pageSize;

  const [runs, total] = await Promise.all([
    prisma.reconciliationRun.findMany({
      where,
      orderBy: [{ reconciliationDate: 'desc' }, { reconciliationType: 'asc' }],
      skip,
      take: pageSize,
      include: {
        breaks: { where: { resolvedAt: null }, select: { id: true, variance: true, ageBusinessDays: true, classification: true } },
        rulePack: { select: { name: true, version: true } },
      },
    }),
    prisma.reconciliationRun.count({ where }),
  ]);

  return { runs, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
}

export async function getReconciliationBreaks(
  firmId: string,
  filters: { resolved?: boolean; page?: number; pageSize?: number }
) {
  const where: Prisma.ReconciliationBreakWhereInput = { firmId };
  if (filters.resolved === false) where.resolvedAt = null;
  if (filters.resolved === true) where.resolvedAt = { not: null };

  const page = filters.page || 1;
  const pageSize = filters.pageSize || 50;
  const skip = (page - 1) * pageSize;

  const [breaks, total] = await Promise.all([
    prisma.reconciliationBreak.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take: pageSize,
      include: {
        safeguardingAccount: { select: { bankName: true, accountNumberMasked: true, externalAccountId: true } },
        reconciliationRun: { select: { reconciliationDate: true, reconciliationType: true, currency: true } },
        resolver: { select: { name: true } },
      },
    }),
    prisma.reconciliationBreak.count({ where }),
  ]);

  return { breaks, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
}

export async function resolveBreak(
  breakId: string,
  firmId: string,
  userId: string,
  data: { classification: BreakClassification; explanation: string }
) {
  const brk = await prisma.reconciliationBreak.findFirst({ where: { id: breakId, firmId } });
  if (!brk) throw new Error('Break not found');

  return prisma.reconciliationBreak.update({
    where: { id: breakId },
    data: {
      classification: data.classification,
      explanation: data.explanation,
      resolvedAt: new Date(),
      resolvedBy: userId,
    },
  });
}

export async function getDashboardSummary(firmId: string) {
  const [latestInternalRuns, latestExternalRuns, openBreaks, openBreaches] = await Promise.all([
    prisma.reconciliationRun.findMany({
      where: { firmId, reconciliationType: 'INTERNAL' },
      orderBy: { reconciliationDate: 'desc' },
      take: 5,
      select: { reconciliationDate: true, currency: true, status: true, variance: true, variancePercentage: true },
    }),
    prisma.reconciliationRun.findMany({
      where: { firmId, reconciliationType: 'EXTERNAL' },
      orderBy: { reconciliationDate: 'desc' },
      take: 5,
      select: { reconciliationDate: true, currency: true, status: true, variance: true },
    }),
    prisma.reconciliationBreak.count({ where: { firmId, resolvedAt: null } }),
    prisma.breach.count({ where: { firmId, status: { notIn: ['RESOLVED', 'CLOSED'] } } }),
  ]);

  return {
    latestInternalRuns,
    latestExternalRuns,
    openBreaks,
    openBreaches,
    asOf: new Date().toISOString(),
  };
}

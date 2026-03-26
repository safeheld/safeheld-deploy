import { prisma } from '../../utils/prisma';
import { logger } from '../../utils/logger';
import {
  FundType,
  ReconciliationType,
  ReconciliationStatus,
  ReconciliationTrigger,
  DataCompleteness,
  BreakClassification,
  BankStatementFormat,
  Prisma,
} from '@prisma/client';
import { detectBreaches } from '../breach/service';
import { sendEmail, reconciliationFailedEmail } from '../../utils/email';
import { rulesEngine } from '../../services/rules-engine';
import {
  isWeekend,
  toDateOnly,
  dayOfWeekAbbrev,
  isUkBankHoliday,
  getHolidaysInRange,
} from '../../utils/dates';

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
  assetPoolId?: string;
}

// Calculate business days between two dates (Monday-Friday)
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

function determineActionTaken(status: ReconciliationStatus, variance: number): string | null {
  if (status === 'SHORTFALL') {
    return `SHORTFALL - remedy required (shortfall of ${Math.abs(variance).toFixed(2)})`;
  }
  if (status === 'EXCESS') {
    return `EXCESS - may withdraw (excess of ${Math.abs(variance).toFixed(2)})`;
  }
  return null;
}

export async function runReconciliation(params: RunReconciliationParams): Promise<string[]> {
  const { firmId, reconciliationDate, trigger, assetPoolId } = params;

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

  // Check if firm has asset pools
  const assetPools = await prisma.assetPool.findMany({
    where: { firmId, isActive: true },
  });

  // If firm has asset pools and no specific pool requested, run per pool
  if (assetPools.length > 0 && !assetPoolId) {
    const allRunIds: string[] = [];
    for (const pool of assetPools) {
      const poolRunIds = await runReconciliation({
        ...params,
        assetPoolId: pool.id,
      });
      allRunIds.push(...poolRunIds);
    }
    return allRunIds;
  }

  const reconPointTime = new Date();
  const reconMethod = firm.reconciliationMethod ?? 'STANDARD';

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
        segregationRequirement: requirement,
        segregationResource: resource,
        reconMethod,
        reconciliationPointTime: reconPointTime,
        assetPoolId: assetPoolId ?? null,
        actionTaken: determineActionTaken(status, variance),
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

    logger.info({ firmId, currency, status, variance, assetPoolId }, 'Internal recon completed');
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
          segregationRequirement: ledgerBal,
          segregationResource: bankBal,
          reconMethod,
          reconciliationPointTime: reconPointTime,
          assetPoolId: assetPoolId ?? null,
          actionTaken: determineActionTaken(status, variance),
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

      logger.info({ firmId, accountId: account.id, currency, status, assetPoolId }, 'External recon completed');
    }
  }

  // ─── Rules Engine Evaluation ──────────────────────────────────────────────────
  // Run the rules engine against each reconciliation run
  for (const runId of runIds) {
    try {
      await rulesEngine.evaluate(runId);
    } catch (err) {
      logger.error({ err, runId, firmId }, 'Rules engine evaluation failed — reconciliation run persisted without compliance scoring');
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

// ─── Reconciliation Calendar ──────────────────────────────────────────────────

export interface CalendarDay {
  date: string;
  isReconDay: boolean;
  isHoliday: boolean;
  holidayName: string | null;
  isOverdue: boolean;
  isCompleted: boolean;
}

export async function getReconciliationCalendar(
  firmId: string,
  year: number,
  month: number,
): Promise<CalendarDay[]> {
  const firm = await prisma.firm.findUnique({
    where: { id: firmId },
    select: {
      reconciliationDays: true,
      includeBankHolidaysAsReconDays: true,
      foreignMarketCalendars: true,
    },
  });
  if (!firm) throw new Error(`Firm ${firmId} not found`);

  const reconDays = (firm.reconciliationDays as string[]) || ['MON', 'TUE', 'WED', 'THU', 'FRI'];

  // Build the full month range
  const startDate = new Date(Date.UTC(year, month - 1, 1));
  const endDate = new Date(Date.UTC(year, month, 0)); // last day of month

  // Fetch all holidays in this month range
  const holidays = await getHolidaysInRange(startDate, endDate, firmId);
  const holidayMap = new Map<string, string | null>();
  for (const h of holidays) {
    const key = h.date.toISOString().split('T')[0];
    holidayMap.set(key, h.holidayName);
  }

  // Fetch all completed recon runs in this month
  const completedRuns = await prisma.reconciliationRun.findMany({
    where: {
      firmId,
      reconciliationDate: { gte: startDate, lte: endDate },
    },
    select: { reconciliationDate: true },
    distinct: ['reconciliationDate'],
  });
  const completedDates = new Set(
    completedRuns.map(r => r.reconciliationDate.toISOString().split('T')[0])
  );

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const days: CalendarDay[] = [];
  const daysInMonth = endDate.getUTCDate();

  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(Date.UTC(year, month - 1, d));
    const dateStr = date.toISOString().split('T')[0];
    const weekend = isWeekend(date);
    const isHoliday = holidayMap.has(dateStr);
    const holidayName = holidayMap.get(dateStr) ?? null;

    // A day is a recon day if:
    // 1. It falls on a configured reconciliation day of week
    // 2. It is NOT a weekend
    // 3. It is NOT a holiday (unless firm includes bank holidays as recon days)
    const isConfiguredDay = reconDays.includes(dayOfWeekAbbrev(date));
    let isReconDay = isConfiguredDay && !weekend;

    if (isReconDay && isHoliday && !firm.includeBankHolidaysAsReconDays) {
      isReconDay = false;
    }

    const isCompleted = completedDates.has(dateStr);
    const isPast = date < today;
    const isOverdue = isReconDay && isPast && !isCompleted;

    days.push({
      date: dateStr,
      isReconDay,
      isHoliday,
      holidayName,
      isOverdue,
      isCompleted,
    });
  }

  return days;
}

// ─── Next Recon Due ───────────────────────────────────────────────────────────

export interface NextReconDueResult {
  nextReconDate: string | null;
  daysSinceLastRecon: number | null;
  lastReconDate: string | null;
  isOverdue: boolean;
}

export async function getNextReconDue(firmId: string): Promise<NextReconDueResult> {
  const firm = await prisma.firm.findUnique({
    where: { id: firmId },
    select: {
      reconciliationDays: true,
      includeBankHolidaysAsReconDays: true,
    },
  });
  if (!firm) throw new Error(`Firm ${firmId} not found`);

  const reconDays = (firm.reconciliationDays as string[]) || ['MON', 'TUE', 'WED', 'THU', 'FRI'];

  // Find last completed reconciliation
  const lastRun = await prisma.reconciliationRun.findFirst({
    where: { firmId },
    orderBy: { reconciliationDate: 'desc' },
    select: { reconciliationDate: true },
  });

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const lastReconDate = lastRun ? lastRun.reconciliationDate : null;
  let daysSinceLastRecon: number | null = null;
  if (lastReconDate) {
    daysSinceLastRecon = businessDaysBetween(lastReconDate, today);
  }

  // Find next recon day from today (inclusive)
  let nextDate: Date | null = null;
  const searchDate = new Date(today);
  for (let i = 0; i < 30; i++) {
    if (!isWeekend(searchDate) && reconDays.includes(dayOfWeekAbbrev(searchDate))) {
      // Check if it is a holiday
      const { isHoliday } = await isUkBankHoliday(searchDate, firmId);
      if (!isHoliday || firm.includeBankHolidaysAsReconDays) {
        // Check if recon already completed for this date
        const existing = await prisma.reconciliationRun.findFirst({
          where: { firmId, reconciliationDate: toDateOnly(searchDate) },
        });
        if (!existing) {
          nextDate = new Date(searchDate);
          break;
        }
      }
    }
    searchDate.setDate(searchDate.getDate() + 1);
  }

  // Determine if overdue: if the most recent business recon day before today has no completed run
  let isOverdue = false;
  if (lastReconDate) {
    // Find the most recent past recon day
    const checkDate = new Date(today);
    checkDate.setDate(checkDate.getDate() - 1);
    for (let i = 0; i < 10; i++) {
      if (!isWeekend(checkDate) && reconDays.includes(dayOfWeekAbbrev(checkDate))) {
        const { isHoliday } = await isUkBankHoliday(checkDate, firmId);
        if (!isHoliday || firm.includeBankHolidaysAsReconDays) {
          const dateOnly = toDateOnly(checkDate);
          if (dateOnly > lastReconDate) {
            isOverdue = true;
          }
          break;
        }
      }
      checkDate.setDate(checkDate.getDate() - 1);
    }
  } else {
    // No recon ever run - overdue if there has been at least one business day
    isOverdue = true;
  }

  return {
    nextReconDate: nextDate ? nextDate.toISOString().split('T')[0] : null,
    daysSinceLastRecon,
    lastReconDate: lastReconDate ? lastReconDate.toISOString().split('T')[0] : null,
    isOverdue,
  };
}

// ─── Bank Statement Import ────────────────────────────────────────────────────

export interface ImportBankStatementParams {
  firmId: string;
  safeguardingAccountId: string;
  format: BankStatementFormat;
  userId: string;
  // For CSV/MT940 file imports
  fileBuffer?: Buffer;
  filename?: string;
  // For MANUAL imports
  closingBalance?: number;
  openingBalance?: number;
  statementDate?: Date;
  currency?: string;
}

interface ParsedStatement {
  openingBalance: number | null;
  closingBalance: number | null;
  statementDate: Date | null;
  currency: string | null;
  bankReference: string | null;
  transactions: ParsedTransaction[];
}

interface ParsedTransaction {
  date: Date;
  description: string;
  amount: number;
  direction: 'CREDIT' | 'DEBIT';
  reference: string | null;
}

function parseCsvGeneric(content: string): ParsedStatement {
  const lines = content.split(/\r?\n/).filter(l => l.trim().length > 0);
  if (lines.length < 2) {
    return { openingBalance: null, closingBalance: null, statementDate: null, currency: null, bankReference: null, transactions: [] };
  }

  const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/"/g, ''));

  // Auto-detect column indices
  const dateIdx = headers.findIndex(h => /^(date|transaction.?date|value.?date|posting.?date)$/i.test(h));
  const descIdx = headers.findIndex(h => /^(description|narrative|details|memo|reference)$/i.test(h));
  const debitIdx = headers.findIndex(h => /^(debit|debit.?amount|money.?out|paid.?out|withdrawals?)$/i.test(h));
  const creditIdx = headers.findIndex(h => /^(credit|credit.?amount|money.?in|paid.?in|deposits?)$/i.test(h));
  const balanceIdx = headers.findIndex(h => /^(balance|closing.?balance|running.?balance)$/i.test(h));
  const amountIdx = headers.findIndex(h => /^(amount)$/i.test(h));

  const transactions: ParsedTransaction[] = [];
  let lastBalance: number | null = null;
  let firstBalance: number | null = null;
  let latestDate: Date | null = null;

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',').map(c => c.trim().replace(/"/g, ''));
    if (cols.length < 2) continue;

    const rawDate = dateIdx >= 0 ? cols[dateIdx] : null;
    const description = descIdx >= 0 ? cols[descIdx] : '';
    const rawDebit = debitIdx >= 0 ? cols[debitIdx] : '';
    const rawCredit = creditIdx >= 0 ? cols[creditIdx] : '';
    const rawBalance = balanceIdx >= 0 ? cols[balanceIdx] : '';
    const rawAmount = amountIdx >= 0 ? cols[amountIdx] : '';

    // Parse date (try multiple formats)
    let txDate: Date | null = null;
    if (rawDate) {
      // Try DD/MM/YYYY
      const ddmmyyyy = rawDate.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/);
      if (ddmmyyyy) {
        txDate = new Date(Date.UTC(parseInt(ddmmyyyy[3]), parseInt(ddmmyyyy[2]) - 1, parseInt(ddmmyyyy[1])));
      }
      // Try YYYY-MM-DD
      if (!txDate) {
        const yyyymmdd = rawDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
        if (yyyymmdd) {
          txDate = new Date(Date.UTC(parseInt(yyyymmdd[1]), parseInt(yyyymmdd[2]) - 1, parseInt(yyyymmdd[3])));
        }
      }
      if (!txDate) {
        txDate = new Date(rawDate);
        if (isNaN(txDate.getTime())) txDate = null;
      }
    }

    if (!txDate) continue;

    if (!latestDate || txDate > latestDate) latestDate = txDate;

    // Parse amounts
    let amount = 0;
    let direction: 'CREDIT' | 'DEBIT' = 'CREDIT';

    if (rawAmount) {
      const val = parseFloat(rawAmount.replace(/[^0-9.\-]/g, ''));
      if (!isNaN(val)) {
        amount = Math.abs(val);
        direction = val < 0 ? 'DEBIT' : 'CREDIT';
      }
    } else {
      const debit = rawDebit ? parseFloat(rawDebit.replace(/[^0-9.\-]/g, '')) : NaN;
      const credit = rawCredit ? parseFloat(rawCredit.replace(/[^0-9.\-]/g, '')) : NaN;
      if (!isNaN(debit) && debit > 0) {
        amount = debit;
        direction = 'DEBIT';
      } else if (!isNaN(credit) && credit > 0) {
        amount = credit;
        direction = 'CREDIT';
      }
    }

    if (amount === 0) continue;

    if (rawBalance) {
      const bal = parseFloat(rawBalance.replace(/[^0-9.\-]/g, ''));
      if (!isNaN(bal)) {
        if (firstBalance === null) firstBalance = bal;
        lastBalance = bal;
      }
    }

    transactions.push({
      date: txDate,
      description,
      amount,
      direction,
      reference: null,
    });
  }

  return {
    openingBalance: firstBalance,
    closingBalance: lastBalance,
    statementDate: latestDate,
    currency: null, // CSV doesn't reliably include currency
    bankReference: null,
    transactions,
  };
}

function parseMt940(content: string): ParsedStatement {
  const transactions: ParsedTransaction[] = [];
  let openingBalance: number | null = null;
  let closingBalance: number | null = null;
  let statementDate: Date | null = null;
  let currency: string | null = null;
  let bankReference: string | null = null;

  // Parse tag :20: - Transaction Reference
  const refMatch = content.match(/:20:(.+)/);
  if (refMatch) bankReference = refMatch[1].trim();

  // Parse tag :60F: - Opening Balance
  // Format: D/CYYMMDDCURRENCYAMOUNT
  const openingMatch = content.match(/:60F:([DC])(\d{6})([A-Z]{3})([\d,]+)/);
  if (openingMatch) {
    currency = openingMatch[3];
    const amt = parseFloat(openingMatch[4].replace(',', '.'));
    openingBalance = openingMatch[1] === 'D' ? -amt : amt;
  }

  // Parse tag :62F: - Closing Balance
  const closingMatch = content.match(/:62F:([DC])(\d{6})([A-Z]{3})([\d,]+)/);
  if (closingMatch) {
    const yr = parseInt('20' + closingMatch[2].substring(0, 2));
    const mo = parseInt(closingMatch[2].substring(2, 4)) - 1;
    const dy = parseInt(closingMatch[2].substring(4, 6));
    statementDate = new Date(Date.UTC(yr, mo, dy));
    const amt = parseFloat(closingMatch[4].replace(',', '.'));
    closingBalance = closingMatch[1] === 'D' ? -amt : amt;
  }

  // Parse tag :61: - Statement lines
  // Format: YYMMDD[MMDD]D/CAMOUNTTYPE//REFERENCE\n:86:DESCRIPTION
  const statementLines = content.match(/:61:(.+?)(?=:6[0-9]:|:61:|-}|\n\n|$)/gs);
  if (statementLines) {
    for (const line of statementLines) {
      const lineMatch = line.match(/:61:(\d{6})\d{0,4}(C|D|RC|RD)([\d,]+)([A-Z]\d{3})([^\n]*)/);
      if (!lineMatch) continue;

      const yr = parseInt('20' + lineMatch[1].substring(0, 2));
      const mo = parseInt(lineMatch[1].substring(2, 4)) - 1;
      const dy = parseInt(lineMatch[1].substring(4, 6));
      const txDate = new Date(Date.UTC(yr, mo, dy));

      const dcInd = lineMatch[2];
      const amt = parseFloat(lineMatch[3].replace(',', '.'));
      const direction: 'CREDIT' | 'DEBIT' = (dcInd === 'C' || dcInd === 'RC') ? 'CREDIT' : 'DEBIT';

      // Extract description from :86: tag if present
      const descMatch = line.match(/:86:(.+)/s);
      const description = descMatch ? descMatch[1].trim().split('\n')[0] : '';

      const refPart = lineMatch[5]?.trim() || null;

      transactions.push({
        date: txDate,
        description,
        amount: amt,
        direction,
        reference: refPart,
      });
    }
  }

  return {
    openingBalance,
    closingBalance,
    statementDate,
    currency,
    bankReference,
    transactions,
  };
}

export async function importBankStatement(params: ImportBankStatementParams) {
  const {
    firmId,
    safeguardingAccountId,
    format,
    userId,
    fileBuffer,
    filename,
    closingBalance: manualClosingBalance,
    openingBalance: manualOpeningBalance,
    statementDate: manualStatementDate,
    currency: manualCurrency,
  } = params;

  // Validate safeguarding account belongs to firm
  const account = await prisma.safeguardingAccount.findFirst({
    where: { id: safeguardingAccountId, firmId },
  });
  if (!account) throw new Error('Safeguarding account not found for this firm');

  let parsed: ParsedStatement;
  let importFilename = filename || 'manual-entry';

  if (format === 'MANUAL') {
    if (manualClosingBalance === undefined || manualClosingBalance === null) {
      throw new Error('Closing balance is required for manual import');
    }
    if (!manualStatementDate) {
      throw new Error('Statement date is required for manual import');
    }
    parsed = {
      openingBalance: manualOpeningBalance ?? null,
      closingBalance: manualClosingBalance,
      statementDate: manualStatementDate,
      currency: manualCurrency || account.currency,
      bankReference: null,
      transactions: [],
    };
    importFilename = `manual-${manualStatementDate.toISOString().split('T')[0]}`;
  } else if (format === 'MT940') {
    if (!fileBuffer) throw new Error('File is required for MT940 import');
    const content = fileBuffer.toString('utf-8');
    parsed = parseMt940(content);
  } else {
    // All CSV formats
    if (!fileBuffer) throw new Error('File is required for CSV import');
    const content = fileBuffer.toString('utf-8');
    parsed = parseCsvGeneric(content);
  }

  const effectiveCurrency = parsed.currency || manualCurrency || account.currency;
  const effectiveDate = parsed.statementDate || manualStatementDate || new Date();

  // Create the import record
  const importRecord = await prisma.bankStatementImport.create({
    data: {
      firmId,
      safeguardingAccountId,
      format,
      filename: importFilename,
      statementDate: toDateOnly(effectiveDate),
      openingBalance: parsed.openingBalance,
      closingBalance: parsed.closingBalance,
      transactionCount: parsed.transactions.length,
      currency: effectiveCurrency,
      bankReference: parsed.bankReference,
      rawData: format !== 'MANUAL' ? { transactionCount: parsed.transactions.length } : undefined,
      status: 'PARSED',
      importedBy: userId,
    },
  });

  // Create a system upload record for linking bank balances and transactions
  const upload = await prisma.upload.create({
    data: {
      firmId,
      userId,
      inputType: 'BANK_BALANCES',
      filename: importFilename,
      fileHash: `import-${importRecord.id}`,
      fileSizeBytes: fileBuffer?.length || 0,
      rowCount: parsed.transactions.length + 1,
      rowsAccepted: parsed.transactions.length + 1,
      status: 'ACCEPTED',
    },
  });

  // Create BankBalance record if we have a closing balance
  if (parsed.closingBalance !== null) {
    await prisma.bankBalance.create({
      data: {
        firmId,
        safeguardingAccountId,
        currency: effectiveCurrency,
        closingBalance: parsed.closingBalance,
        balanceDate: toDateOnly(effectiveDate),
        statementReference: parsed.bankReference || `Import ${importRecord.id}`,
        uploadId: upload.id,
      },
    });
  }

  // Create BankTransaction records
  for (let i = 0; i < parsed.transactions.length; i++) {
    const tx = parsed.transactions[i];
    await prisma.bankTransaction.create({
      data: {
        firmId,
        safeguardingAccountId,
        externalTransactionId: `${importRecord.id}-${i + 1}`,
        amount: tx.amount,
        currency: effectiveCurrency,
        direction: tx.direction,
        transactionDate: toDateOnly(tx.date),
        counterparty: tx.description || null,
        reference: tx.reference,
        uploadId: upload.id,
      },
    });
  }

  // Update import status to MATCHED
  await prisma.bankStatementImport.update({
    where: { id: importRecord.id },
    data: { status: 'MATCHED' },
  });

  logger.info({
    firmId,
    importId: importRecord.id,
    format,
    transactionCount: parsed.transactions.length,
    closingBalance: parsed.closingBalance,
  }, 'Bank statement imported');

  return {
    ...importRecord,
    status: 'MATCHED' as const,
    transactionsCreated: parsed.transactions.length,
    balanceCreated: parsed.closingBalance !== null,
  };
}

// ─── Dashboard Summary (Enhanced) ─────────────────────────────────────────────

export async function getDashboardSummary(firmId: string) {
  const [latestInternalRuns, latestExternalRuns, openBreaks, openBreaches, assetPools, nextDue] = await Promise.all([
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
    prisma.assetPool.findMany({
      where: { firmId, isActive: true },
      select: { id: true, name: true, poolType: true },
      orderBy: { name: 'asc' },
    }),
    getNextReconDue(firmId),
  ]);

  return {
    latestInternalRuns,
    latestExternalRuns,
    openBreaks,
    openBreaches,
    asOf: new Date().toISOString(),
    nextReconDue: nextDue.nextReconDate,
    daysSinceLastRecon: nextDue.daysSinceLastRecon,
    lastReconDate: nextDue.lastReconDate,
    isOverdue: nextDue.isOverdue,
    assetPools,
  };
}

// ─── Asset Pools ──────────────────────────────────────────────────────────────

export async function getAssetPools(firmId: string) {
  return prisma.assetPool.findMany({
    where: { firmId },
    orderBy: { name: 'asc' },
    include: {
      _count: { select: { reconciliationRuns: true } },
    },
  });
}

export async function createAssetPool(
  firmId: string,
  data: { name: string; poolType: 'E_MONEY' | 'PAYMENT_SERVICES' | 'COMBINED'; description?: string },
) {
  return prisma.assetPool.create({
    data: {
      firmId,
      name: data.name,
      poolType: data.poolType,
      description: data.description,
    },
  });
}

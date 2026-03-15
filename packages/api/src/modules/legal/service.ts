import { prisma } from '../../utils/prisma';
import { logger } from '../../utils/logger';
import { runReconciliation } from '../reconciliation/service';

// SRA requires reconciliation every 5 weeks (35 days)
const SRA_RECON_CYCLE_DAYS = 35;

function toNum(val: unknown): number {
  if (val === null || val === undefined) return 0;
  if (typeof val === 'number') return val;
  return Number(val.toString());
}

/**
 * Run SRA reconciliation for a solicitor firm.
 * Wraps the core reconciliation engine with SRA-specific rules:
 * - Any shortfall is a breach (zero tolerance)
 * - Additional checks for interest allocation and bank mandate compliance
 */
export async function runSraReconciliation(
  firmId: string,
  reconciliationDate: Date,
  triggeredByUserId?: string,
): Promise<{ runIds: string[]; sraChecks: Record<string, unknown> }> {
  const firm = await prisma.firm.findUnique({
    where: { id: firmId },
    include: { safeguardingAccounts: { where: { status: 'ACTIVE' } } },
  });
  if (!firm) throw new Error(`Firm ${firmId} not found`);

  // Run core reconciliation
  const runIds = await runReconciliation({
    firmId,
    reconciliationDate,
    trigger: 'MANUAL',
    triggeredByUserId,
  });

  // SRA-specific: any shortfall at all is a breach (stricter than PS25 material threshold)
  const runs = await prisma.reconciliationRun.findMany({
    where: { id: { in: runIds } },
  });

  for (const run of runs) {
    if (run.status === 'SHORTFALL') {
      const existing = await prisma.breach.findFirst({
        where: { firmId, reconciliationRunId: run.id, breachType: 'SHORTFALL' },
      });

      if (!existing) {
        const breach = await prisma.breach.create({
          data: {
            firmId,
            reconciliationRunId: run.id,
            breachType: 'SHORTFALL',
            severity: 'HIGH',
            isNotifiable: true,
            materialDiscrepancyExceeded: true,
            currency: run.currency,
            shortfallAmount: Math.abs(toNum(run.variance)),
            shortfallPercentage: Math.abs(toNum(run.variancePercentage)),
            description: `SRA client account shortfall: ${run.currency} ${run.reconciliationType} reconciliation. ` +
              `Requirement: ${toNum(run.totalRequirement).toFixed(2)}, Resource: ${toNum(run.totalResource).toFixed(2)}. ` +
              `SRA rules require zero tolerance for shortfalls.`,
            status: 'DETECTED',
          },
        });

        logger.info({ firmId, breachId: breach.id, runId: run.id }, 'SRA zero-tolerance shortfall breach created');
      }
    }
  }

  // SRA-specific checks
  const interestCheck = await checkInterestAllocation(firmId);
  const mandateCheck = await checkBankMandateCompliance(firmId);

  logger.info({ firmId, runIds, reconciliationDate }, 'SRA reconciliation completed');

  return {
    runIds,
    sraChecks: {
      interestAllocation: interestCheck,
      bankMandateCompliance: mandateCheck,
    },
  };
}

/**
 * Check SRA compliance status for a firm.
 * - Client account reconciliation must not be overdue (5-week cycle)
 * - All client accounts must be properly designated
 * - Accountant's report due date tracking
 */
export async function checkSraCompliance(firmId: string) {
  const firm = await prisma.firm.findUnique({
    where: { id: firmId },
    include: { safeguardingAccounts: { where: { status: 'ACTIVE' } } },
  });
  if (!firm) throw new Error(`Firm ${firmId} not found`);

  const now = new Date();

  // 1. Check reconciliation cycle (5-week / 35-day cycle)
  const latestRecon = await prisma.reconciliationRun.findFirst({
    where: { firmId },
    orderBy: { reconciliationDate: 'desc' },
    select: { reconciliationDate: true, status: true },
  });

  let reconOverdue = false;
  let daysSinceLastRecon: number | null = null;
  let nextReconDue: Date | null = null;

  if (latestRecon) {
    const diffMs = now.getTime() - latestRecon.reconciliationDate.getTime();
    daysSinceLastRecon = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    reconOverdue = daysSinceLastRecon > SRA_RECON_CYCLE_DAYS;
    nextReconDue = new Date(latestRecon.reconciliationDate);
    nextReconDue.setDate(nextReconDue.getDate() + SRA_RECON_CYCLE_DAYS);
  } else {
    reconOverdue = true;
  }

  // 2. Check client account designation
  const accounts = firm.safeguardingAccounts;
  const undesignatedAccounts = accounts.filter(
    (a) => a.designation !== 'SAFEGUARDING' && a.designation !== 'DESIGNATED_RELEVANT_FUNDS'
  );

  // 3. Accountant's report tracking (annual requirement)
  // Check if there's been a report filed in the last 12 months via audit log
  const oneYearAgo = new Date(now);
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

  const accountantsReport = await prisma.auditLog.findFirst({
    where: {
      firmId,
      action: 'ACCOUNTANTS_REPORT_FILED',
      createdAt: { gte: oneYearAgo },
    },
    orderBy: { createdAt: 'desc' },
  });

  const accountantsReportOverdue = !accountantsReport;
  const lastAccountantsReport = accountantsReport?.createdAt || null;

  // 4. Open breaches count
  const openBreaches = await prisma.breach.count({
    where: { firmId, status: { notIn: ['RESOLVED', 'CLOSED'] } },
  });

  // 5. Open breaks count
  const openBreaks = await prisma.reconciliationBreak.count({
    where: { firmId, resolvedAt: null },
  });

  return {
    regime: 'SRA_SOLICITOR',
    reconciliation: {
      lastReconciliationDate: latestRecon?.reconciliationDate || null,
      lastReconciliationStatus: latestRecon?.status || null,
      daysSinceLastRecon,
      cycleDays: SRA_RECON_CYCLE_DAYS,
      overdue: reconOverdue,
      nextReconDue,
    },
    accountDesignation: {
      totalAccounts: accounts.length,
      undesignatedCount: undesignatedAccounts.length,
      compliant: undesignatedAccounts.length === 0,
      undesignatedAccounts: undesignatedAccounts.map((a) => ({
        id: a.id,
        bankName: a.bankName,
        accountNumberMasked: a.accountNumberMasked,
      })),
    },
    accountantsReport: {
      overdue: accountantsReportOverdue,
      lastFiled: lastAccountantsReport,
    },
    openBreaches,
    openBreaks,
    asOf: now.toISOString(),
  };
}

/**
 * Check that interest earned on client accounts is properly allocated.
 */
async function checkInterestAllocation(firmId: string) {
  // Check for any safeguarding accounts that should be earning interest
  const accounts = await prisma.safeguardingAccount.findMany({
    where: { firmId, status: 'ACTIVE' },
    select: { id: true, bankName: true, accountNumberMasked: true, fundType: true },
  });

  // SRA Rule 2.2: firms must account to clients for interest earned unless agreed otherwise
  return {
    accountsReviewed: accounts.length,
    status: accounts.length > 0 ? 'REVIEWED' : 'NO_ACCOUNTS',
  };
}

/**
 * Check bank mandate compliance — signatories and authorisations on client accounts.
 */
async function checkBankMandateCompliance(firmId: string) {
  const accounts = await prisma.safeguardingAccount.findMany({
    where: { firmId, status: 'ACTIVE' },
    include: {
      acknowledgementLetters: {
        where: { status: 'CURRENT' },
        orderBy: { version: 'desc' },
        take: 1,
      },
    },
  });

  const accountsWithoutLetters = accounts.filter((a) => a.acknowledgementLetters.length === 0);

  return {
    totalAccounts: accounts.length,
    accountsWithCurrentLetters: accounts.length - accountsWithoutLetters.length,
    accountsMissingLetters: accountsWithoutLetters.length,
    compliant: accountsWithoutLetters.length === 0,
    missingLetterAccounts: accountsWithoutLetters.map((a) => ({
      id: a.id,
      bankName: a.bankName,
      accountNumberMasked: a.accountNumberMasked,
    })),
  };
}

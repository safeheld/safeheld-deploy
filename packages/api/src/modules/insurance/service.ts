import { prisma } from '../../utils/prisma';
import { logger } from '../../utils/logger';
import { runReconciliation } from '../reconciliation/service';

function toNum(val: unknown): number {
  if (val === null || val === undefined) return 0;
  if (typeof val === 'number') return val;
  return Number(val.toString());
}

/**
 * Run insurance reconciliation for an FCA-regulated insurance intermediary.
 * Wraps the core reconciliation engine with insurance-specific rules:
 * - Premium trust account segregation verification
 * - Insurer remittance tracking
 * - Material discrepancy based on firm's settings
 */
export async function runInsuranceReconciliation(
  firmId: string,
  reconciliationDate: Date,
  triggeredByUserId?: string,
): Promise<{ runIds: string[]; insuranceChecks: Record<string, unknown> }> {
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

  // Insurance-specific: check runs against firm's material discrepancy thresholds
  const runs = await prisma.reconciliationRun.findMany({
    where: { id: { in: runIds } },
  });

  for (const run of runs) {
    if (run.status === 'SHORTFALL') {
      const absVariance = Math.abs(toNum(run.variance));
      const absVariancePct = Math.abs(toNum(run.variancePercentage));
      const materialPct = toNum(firm.materialDiscrepancyPct) || 1.0;
      const materialAbs = toNum(firm.materialDiscrepancyAbs) || 1000;

      const isMaterial = absVariancePct >= materialPct || absVariance >= materialAbs;

      if (isMaterial) {
        const existing = await prisma.breach.findFirst({
          where: { firmId, reconciliationRunId: run.id, breachType: 'SHORTFALL' },
        });

        if (!existing) {
          const breach = await prisma.breach.create({
            data: {
              firmId,
              reconciliationRunId: run.id,
              breachType: 'SHORTFALL',
              severity: absVariancePct >= materialPct * 5 ? 'CRITICAL' : absVariancePct >= materialPct * 2 ? 'HIGH' : 'MEDIUM',
              isNotifiable: absVariancePct >= materialPct * 2,
              materialDiscrepancyExceeded: true,
              currency: run.currency,
              shortfallAmount: absVariance,
              shortfallPercentage: absVariancePct,
              description: `Insurance premium trust account shortfall: ${run.currency} ${run.reconciliationType} reconciliation. ` +
                `Requirement: ${toNum(run.totalRequirement).toFixed(2)}, Resource: ${toNum(run.totalResource).toFixed(2)}. ` +
                `Material discrepancy threshold exceeded (${materialPct}% / ${materialAbs.toFixed(2)}).`,
              status: 'DETECTED',
            },
          });

          logger.info({ firmId, breachId: breach.id, runId: run.id }, 'Insurance material shortfall breach created');
        }
      }
    }
  }

  // Insurance-specific checks
  const segregationCheck = await checkPremiumSegregation(firmId);
  const remittanceCheck = await getRemittanceStatus(firmId);

  logger.info({ firmId, runIds, reconciliationDate }, 'Insurance reconciliation completed');

  return {
    runIds,
    insuranceChecks: {
      premiumSegregation: segregationCheck,
      remittanceStatus: remittanceCheck,
    },
  };
}

/**
 * Verify that client premiums are held in properly designated trust accounts.
 * FCA requires insurance intermediaries to segregate client premiums from firm funds.
 */
export async function checkPremiumSegregation(firmId: string) {
  const firm = await prisma.firm.findUnique({
    where: { id: firmId },
    include: { safeguardingAccounts: { where: { status: 'ACTIVE' } } },
  });
  if (!firm) throw new Error(`Firm ${firmId} not found`);

  const accounts = firm.safeguardingAccounts;

  // Check each active account is properly designated
  const designatedAccounts = accounts.filter(
    (a) => a.designation === 'SAFEGUARDING' || a.designation === 'DESIGNATED_RELEVANT_FUNDS'
  );
  const undesignatedAccounts = accounts.filter(
    (a) => a.designation !== 'SAFEGUARDING' && a.designation !== 'DESIGNATED_RELEVANT_FUNDS'
  );

  // Check acknowledgement letters are in place
  const accountsWithLetters = await prisma.safeguardingAccount.findMany({
    where: { firmId, status: 'ACTIVE' },
    include: {
      acknowledgementLetters: {
        where: { status: 'CURRENT' },
        take: 1,
      },
    },
  });

  const accountsMissingLetters = accountsWithLetters.filter(
    (a) => a.acknowledgementLetters.length === 0
  );

  // Get total balances across trust accounts
  const latestBalances = await prisma.bankBalance.groupBy({
    by: ['currency'],
    where: { firmId },
    _sum: { closingBalance: true },
    orderBy: { _sum: { closingBalance: 'desc' } },
  });

  return {
    totalTrustAccounts: accounts.length,
    designatedAccounts: designatedAccounts.length,
    undesignatedAccounts: undesignatedAccounts.length,
    accountsMissingLetters: accountsMissingLetters.length,
    compliant: undesignatedAccounts.length === 0 && accountsMissingLetters.length === 0,
    balancesByCurrency: latestBalances.map((b) => ({
      currency: b.currency,
      balance: toNum(b._sum.closingBalance),
    })),
    issues: [
      ...undesignatedAccounts.map((a) => ({
        type: 'UNDESIGNATED_ACCOUNT',
        accountId: a.id,
        bankName: a.bankName,
        accountNumberMasked: a.accountNumberMasked,
      })),
      ...accountsMissingLetters.map((a) => ({
        type: 'MISSING_TRUST_LETTER',
        accountId: a.id,
        bankName: a.bankName,
        accountNumberMasked: a.accountNumberMasked,
      })),
    ],
  };
}

/**
 * Track premium remittance to insurers.
 * Insurance intermediaries must remit premiums to insurers promptly.
 * Uses reconciliation breaks and client transactions to assess remittance status.
 */
export async function getRemittanceStatus(firmId: string) {
  const now = new Date();

  // Get open reconciliation breaks (potential remittance issues)
  const openBreaks = await prisma.reconciliationBreak.findMany({
    where: { firmId, resolvedAt: null },
    orderBy: { ageBusinessDays: 'desc' },
    take: 20,
    include: {
      safeguardingAccount: {
        select: { bankName: true, accountNumberMasked: true },
      },
      reconciliationRun: {
        select: { reconciliationDate: true, reconciliationType: true, currency: true },
      },
    },
  });

  // Get latest reconciliation run to see overall status
  const latestRecon = await prisma.reconciliationRun.findFirst({
    where: { firmId },
    orderBy: { reconciliationDate: 'desc' },
    select: { reconciliationDate: true, status: true, currency: true },
  });

  // Count breaches related to shortfalls (possible delayed remittances)
  const activeShortfallBreaches = await prisma.breach.count({
    where: {
      firmId,
      breachType: 'SHORTFALL',
      status: { notIn: ['RESOLVED', 'CLOSED'] },
    },
  });

  // Aged breaks indicate potential remittance delays
  const agedBreaks = openBreaks.filter((b) => b.ageBusinessDays >= 5);

  return {
    lastReconciliationDate: latestRecon?.reconciliationDate || null,
    lastReconciliationStatus: latestRecon?.status || null,
    openBreaks: openBreaks.length,
    agedBreaks: agedBreaks.length,
    activeShortfallBreaches,
    remittanceRisk: agedBreaks.length > 0 ? 'HIGH' : openBreaks.length > 0 ? 'MEDIUM' : 'LOW',
    breaks: openBreaks.map((b) => ({
      id: b.id,
      variance: toNum(b.variance),
      ageBusinessDays: b.ageBusinessDays,
      classification: b.classification,
      bankName: b.safeguardingAccount?.bankName || null,
      accountNumberMasked: b.safeguardingAccount?.accountNumberMasked || null,
      reconciliationDate: b.reconciliationRun?.reconciliationDate || null,
      currency: b.reconciliationRun?.currency || null,
    })),
    asOf: now.toISOString(),
  };
}

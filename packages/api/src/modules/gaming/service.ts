import { prisma } from '../../utils/prisma';
import { logger } from '../../utils/logger';
import { runReconciliation } from '../reconciliation/service';

// ─── Player Fund Protection Methods ────────────────────────────────────────

export type ProtectionMethod = 'SEPARATE_ACCOUNTS' | 'TRUST_ACCOUNTS' | 'INSURANCE';

function toNum(val: unknown): number {
  if (val === null || val === undefined) return 0;
  if (typeof val === 'number') return val;
  return Number(val.toString());
}

// ─── Player Fund Reconciliation ─────────────────────────────────────────────

export async function runPlayerFundReconciliation(
  firmId: string,
  reconciliationDate: Date,
  triggeredByUserId?: string,
): Promise<{ runIds: string[]; segregationCheck: SegregationResult; reserveCheck: ReserveResult }> {
  const firm = await prisma.firm.findUnique({
    where: { id: firmId },
    include: { safeguardingAccounts: { where: { status: 'ACTIVE' } } },
  });
  if (!firm) throw new Error(`Firm ${firmId} not found`);

  // Run core reconciliation (internal + external)
  const runIds = await runReconciliation({
    firmId,
    reconciliationDate,
    trigger: 'MANUAL',
    triggeredByUserId,
  });

  // Additional gaming-specific checks
  const segregationCheck = await verifyPlayerFundSegregation(firmId, reconciliationDate);
  const reserveCheck = await verifyReserveAdequacy(firmId, reconciliationDate);

  logger.info(
    { firmId, reconciliationDate, runIds: runIds.length, segregationOk: segregationCheck.compliant, reserveOk: reserveCheck.compliant },
    'Gaming player fund reconciliation completed',
  );

  return { runIds, segregationCheck, reserveCheck };
}

// ─── Segregation Verification ───────────────────────────────────────────────

export interface SegregationResult {
  compliant: boolean;
  totalPlayerFunds: number;
  totalSegregated: number;
  shortfall: number;
  currency: string;
  protectionMethod: string | null;
  issues: string[];
}

async function verifyPlayerFundSegregation(firmId: string, reconciliationDate: Date): Promise<SegregationResult> {
  // Player balances represent the requirement (what must be protected)
  const clientBalances = await prisma.clientBalance.groupBy({
    by: ['currency'],
    where: { firmId, balanceDate: reconciliationDate },
    _sum: { balance: true },
  });

  // Safeguarding ledger balances represent what is segregated
  const ledgerBalances = await prisma.safeguardingLedgerBalance.groupBy({
    by: ['currency'],
    where: { firmId, balanceDate: reconciliationDate },
    _sum: { balance: true },
  });

  const totalPlayerFunds = clientBalances.reduce((acc, r) => acc + toNum(r._sum.balance), 0);
  const totalSegregated = ledgerBalances.reduce((acc, r) => acc + toNum(r._sum.balance), 0);
  const shortfall = Math.max(0, totalPlayerFunds - totalSegregated);
  const currency = clientBalances[0]?.currency || 'GBP';

  const issues: string[] = [];
  if (shortfall > 0) {
    issues.push(`Player fund segregation shortfall of ${shortfall.toFixed(2)} ${currency}`);
  }
  if (totalPlayerFunds > 0 && totalSegregated === 0) {
    issues.push('No segregated funds detected despite active player balances');
  }

  // Check firm metadata for protection method (stored in firm notes/config)
  const firmConfig = await prisma.firm.findUnique({
    where: { id: firmId },
    select: { safeguardingMethod: true },
  });

  const protectionMethod = firmConfig?.safeguardingMethod || null;

  return {
    compliant: shortfall === 0 && totalPlayerFunds >= 0,
    totalPlayerFunds,
    totalSegregated,
    shortfall,
    currency,
    protectionMethod,
    issues,
  };
}

// ─── Reserve Adequacy ───────────────────────────────────────────────────────

export interface ReserveResult {
  compliant: boolean;
  totalPlayerFunds: number;
  totalBankBalance: number;
  reserveRatio: number;
  currency: string;
  issues: string[];
}

async function verifyReserveAdequacy(firmId: string, reconciliationDate: Date): Promise<ReserveResult> {
  const clientBalances = await prisma.clientBalance.groupBy({
    by: ['currency'],
    where: { firmId, balanceDate: reconciliationDate },
    _sum: { balance: true },
  });

  const bankBalances = await prisma.bankBalance.groupBy({
    by: ['currency'],
    where: { firmId, balanceDate: reconciliationDate },
    _sum: { closingBalance: true },
  });

  const totalPlayerFunds = clientBalances.reduce((acc, r) => acc + toNum(r._sum.balance), 0);
  const totalBankBalance = bankBalances.reduce((acc, r) => acc + toNum(r._sum.closingBalance), 0);
  const reserveRatio = totalPlayerFunds === 0 ? 1 : totalBankBalance / totalPlayerFunds;
  const currency = clientBalances[0]?.currency || 'GBP';

  const issues: string[] = [];
  if (reserveRatio < 1) {
    issues.push(`Reserve ratio ${(reserveRatio * 100).toFixed(2)}% is below 100% — bank balance insufficient to cover player funds`);
  }

  return {
    compliant: reserveRatio >= 1,
    totalPlayerFunds,
    totalBankBalance,
    reserveRatio: parseFloat(reserveRatio.toFixed(4)),
    currency,
    issues,
  };
}

// ─── Player Fund Protection Compliance ──────────────────────────────────────

export interface ProtectionComplianceResult {
  compliant: boolean;
  protectionMethod: string | null;
  fundsRingFenced: boolean;
  reserveAdequate: boolean;
  segregationVerified: boolean;
  lastReconciliationDate: string | null;
  openBreaches: number;
  openBreaks: number;
  issues: string[];
}

export async function checkPlayerFundProtection(firmId: string): Promise<ProtectionComplianceResult> {
  const firm = await prisma.firm.findUnique({ where: { id: firmId } });
  if (!firm) throw new Error(`Firm ${firmId} not found`);

  const issues: string[] = [];

  // Protection method
  const protectionMethod = firm.safeguardingMethod || null;
  if (!protectionMethod) {
    issues.push('No protection method configured — Gambling Commission requires operators to declare protection level');
  }

  // Latest reconciliation
  const latestRecon = await prisma.reconciliationRun.findFirst({
    where: { firmId },
    orderBy: { reconciliationDate: 'desc' },
    select: { reconciliationDate: true, status: true },
  });

  const lastReconDate = latestRecon?.reconciliationDate || null;
  if (!lastReconDate) {
    issues.push('No reconciliation has been run — regular reconciliation is required');
  }

  // Segregation check using latest recon date
  let segregationVerified = false;
  let fundsRingFenced = false;
  let reserveAdequate = false;

  if (lastReconDate) {
    const segResult = await verifyPlayerFundSegregation(firmId, lastReconDate);
    segregationVerified = segResult.compliant;
    fundsRingFenced = segResult.shortfall === 0;
    issues.push(...segResult.issues);

    const resResult = await verifyReserveAdequacy(firmId, lastReconDate);
    reserveAdequate = resResult.compliant;
    issues.push(...resResult.issues);
  }

  // Open breaches and breaks
  const [openBreaches, openBreaks] = await Promise.all([
    prisma.breach.count({ where: { firmId, status: { notIn: ['RESOLVED', 'CLOSED'] } } }),
    prisma.reconciliationBreak.count({ where: { firmId, resolvedAt: null } }),
  ]);

  if (openBreaches > 0) {
    issues.push(`${openBreaches} open breach(es) require attention`);
  }
  if (openBreaks > 0) {
    issues.push(`${openBreaks} unresolved reconciliation break(s)`);
  }

  const compliant = issues.length === 0;

  return {
    compliant,
    protectionMethod,
    fundsRingFenced,
    reserveAdequate,
    segregationVerified,
    lastReconciliationDate: lastReconDate?.toISOString().split('T')[0] || null,
    openBreaches,
    openBreaks,
    issues,
  };
}

// ─── Player Fund Summary ────────────────────────────────────────────────────

export interface PlayerFundSummary {
  totalPlayerBalances: number;
  totalProtectedFunds: number;
  totalBankBalance: number;
  surplus: number;
  currency: string;
  protectionMethod: string | null;
  accountCount: number;
  lastReconciliationDate: string | null;
  lastReconciliationStatus: string | null;
}

export async function getPlayerFundSummary(firmId: string): Promise<PlayerFundSummary> {
  const firm = await prisma.firm.findUnique({
    where: { id: firmId },
    include: { safeguardingAccounts: { where: { status: 'ACTIVE' } } },
  });
  if (!firm) throw new Error(`Firm ${firmId} not found`);

  // Get latest reconciliation date
  const latestRecon = await prisma.reconciliationRun.findFirst({
    where: { firmId },
    orderBy: { reconciliationDate: 'desc' },
    select: { reconciliationDate: true, status: true },
  });

  const reconDate = latestRecon?.reconciliationDate || new Date();

  const [clientBalances, ledgerBalances, bankBalances] = await Promise.all([
    prisma.clientBalance.groupBy({
      by: ['currency'],
      where: { firmId, balanceDate: reconDate },
      _sum: { balance: true },
    }),
    prisma.safeguardingLedgerBalance.groupBy({
      by: ['currency'],
      where: { firmId, balanceDate: reconDate },
      _sum: { balance: true },
    }),
    prisma.bankBalance.groupBy({
      by: ['currency'],
      where: { firmId, balanceDate: reconDate },
      _sum: { closingBalance: true },
    }),
  ]);

  const totalPlayerBalances = clientBalances.reduce((acc, r) => acc + toNum(r._sum.balance), 0);
  const totalProtectedFunds = ledgerBalances.reduce((acc, r) => acc + toNum(r._sum.balance), 0);
  const totalBankBalance = bankBalances.reduce((acc, r) => acc + toNum(r._sum.closingBalance), 0);
  const currency = clientBalances[0]?.currency || 'GBP';

  return {
    totalPlayerBalances,
    totalProtectedFunds,
    totalBankBalance,
    surplus: totalProtectedFunds - totalPlayerBalances,
    currency,
    protectionMethod: firm.safeguardingMethod || null,
    accountCount: firm.safeguardingAccounts.length,
    lastReconciliationDate: latestRecon?.reconciliationDate?.toISOString().split('T')[0] || null,
    lastReconciliationStatus: latestRecon?.status || null,
  };
}

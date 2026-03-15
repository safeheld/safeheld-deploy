import { prisma } from '../../utils/prisma';
import { logger } from '../../utils/logger';
import { runReconciliation } from '../reconciliation/service';

function toNum(val: unknown): number {
  if (val === null || val === undefined) return 0;
  if (typeof val === 'number') return val;
  return Number(val.toString());
}

// ─── Deposit Reconciliation ─────────────────────────────────────────────────

export interface DepositReconciliationResult {
  runIds: string[];
  schemeComplianceCheck: SchemeComplianceResult;
  depositCapCheck: DepositCapResult;
}

export async function runDepositReconciliation(
  firmId: string,
  reconciliationDate: Date,
  triggeredByUserId?: string,
): Promise<DepositReconciliationResult> {
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

  // Additional real-estate-specific checks
  const schemeComplianceCheck = await verifyDepositProtection(firmId, reconciliationDate);
  const depositCapCheck = await verifyDepositCaps(firmId, reconciliationDate);

  logger.info(
    {
      firmId,
      reconciliationDate,
      runIds: runIds.length,
      schemeCompliant: schemeComplianceCheck.compliant,
      capCompliant: depositCapCheck.compliant,
    },
    'Real estate deposit reconciliation completed',
  );

  return { runIds, schemeComplianceCheck, depositCapCheck };
}

// ─── Deposit Protection Verification ───────────────────────────────────────

export interface SchemeComplianceResult {
  compliant: boolean;
  totalDeposits: number;
  totalProtectedFunds: number;
  totalClientFunds: number;
  shortfall: number;
  currency: string;
  issues: string[];
}

async function verifyDepositProtection(firmId: string, reconciliationDate: Date): Promise<SchemeComplianceResult> {
  // Client balances represent individual tenancy deposits
  const clientBalances = await prisma.clientBalance.groupBy({
    by: ['currency'],
    where: { firmId, balanceDate: reconciliationDate },
    _sum: { balance: true },
  });

  // Safeguarding ledger balances represent what is protected in designated accounts
  const ledgerBalances = await prisma.safeguardingLedgerBalance.groupBy({
    by: ['currency'],
    where: { firmId, balanceDate: reconciliationDate },
    _sum: { balance: true },
  });

  const totalClientFunds = clientBalances.reduce((acc, r) => acc + toNum(r._sum.balance), 0);
  const totalProtectedFunds = ledgerBalances.reduce((acc, r) => acc + toNum(r._sum.balance), 0);
  const shortfall = Math.max(0, totalClientFunds - totalProtectedFunds);
  const currency = clientBalances[0]?.currency || 'GBP';

  const issues: string[] = [];
  if (shortfall > 0) {
    issues.push(`Deposit protection shortfall of ${shortfall.toFixed(2)} ${currency}`);
  }
  if (totalClientFunds > 0 && totalProtectedFunds === 0) {
    issues.push('No protected funds detected despite active client deposits');
  }

  // Check that accounts have current acknowledgement letters (scheme registration proxy)
  const accountsMissingLetters = await prisma.safeguardingAccount.count({
    where: { firmId, status: 'ACTIVE', letterStatus: { in: ['MISSING', 'EXPIRED'] } },
  });
  if (accountsMissingLetters > 0) {
    issues.push(`${accountsMissingLetters} deposit account(s) missing or have expired scheme confirmation letters`);
  }

  const totalDeposits = await prisma.clientAccount.count({ where: { firmId, status: 'ACTIVE' } });

  return {
    compliant: shortfall === 0 && accountsMissingLetters === 0,
    totalDeposits,
    totalProtectedFunds,
    totalClientFunds,
    shortfall,
    currency,
    issues,
  };
}

// ─── Deposit Cap Verification ───────────────────────────────────────────────

export interface DepositCapResult {
  compliant: boolean;
  totalDepositsChecked: number;
  averageDeposit: number;
  currency: string;
  issues: string[];
}

async function verifyDepositCaps(firmId: string, reconciliationDate: Date): Promise<DepositCapResult> {
  const clientBalances = await prisma.clientBalance.findMany({
    where: { firmId, balanceDate: reconciliationDate },
    include: {
      clientAccount: { select: { id: true, clientId: true, clientName: true } },
    },
  });

  const issues: string[] = [];
  const totalDepositsChecked = clientBalances.length;
  const totalAmount = clientBalances.reduce((acc, b) => acc + toNum(b.balance), 0);
  const averageDeposit = totalDepositsChecked > 0 ? totalAmount / totalDepositsChecked : 0;
  const currency = clientBalances[0]?.currency || 'GBP';

  // Flag unusually large deposits (over 10x average or over 50k) as potential compliance risks
  const threshold = Math.max(averageDeposit * 10, 50000);
  for (const balance of clientBalances) {
    const amount = toNum(balance.balance);
    if (amount > threshold) {
      const clientRef = balance.clientAccount?.clientId || balance.clientAccountId;
      issues.push(
        `Deposit for client ${clientRef}: ${amount.toFixed(2)} ${currency} exceeds review threshold of ${threshold.toFixed(2)} ${currency}`,
      );
    }
  }

  return {
    compliant: issues.length === 0,
    totalDepositsChecked,
    averageDeposit: parseFloat(averageDeposit.toFixed(2)),
    currency,
    issues,
  };
}

// ─── Deposit Scheme Compliance ──────────────────────────────────────────────

export interface DepositSchemeComplianceResult {
  compliant: boolean;
  depositProtection: SchemeComplianceResult;
  depositCaps: DepositCapResult;
  lastReconciliationDate: string | null;
  openBreaches: number;
  openBreaks: number;
  issues: string[];
}

export async function checkDepositSchemeCompliance(firmId: string): Promise<DepositSchemeComplianceResult> {
  const firm = await prisma.firm.findUnique({ where: { id: firmId } });
  if (!firm) throw new Error(`Firm ${firmId} not found`);

  const issues: string[] = [];

  // Get latest reconciliation date
  const latestRecon = await prisma.reconciliationRun.findFirst({
    where: { firmId },
    orderBy: { reconciliationDate: 'desc' },
    select: { reconciliationDate: true },
  });

  const reconDate = latestRecon?.reconciliationDate || new Date();

  // Deposit protection check
  const depositProtection = await verifyDepositProtection(firmId, reconDate);
  issues.push(...depositProtection.issues);

  // Deposit cap check
  const depositCaps = await verifyDepositCaps(firmId, reconDate);
  issues.push(...depositCaps.issues);

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

  return {
    compliant: depositProtection.compliant && depositCaps.compliant && openBreaches === 0,
    depositProtection,
    depositCaps,
    lastReconciliationDate: latestRecon?.reconciliationDate?.toISOString().split('T')[0] || null,
    openBreaches,
    openBreaks,
    issues,
  };
}

// ─── Deposit Summary ────────────────────────────────────────────────────────

export interface DepositSummary {
  totalDepositsHeld: number;
  totalDepositValue: number;
  totalProtectedValue: number;
  totalBankBalance: number;
  surplus: number;
  currency: string;
  accountCount: number;
  lastReconciliationDate: string | null;
  lastReconciliationStatus: string | null;
}

export async function getDepositSummary(firmId: string): Promise<DepositSummary> {
  const firm = await prisma.firm.findUnique({
    where: { id: firmId },
    include: { safeguardingAccounts: { where: { status: 'ACTIVE' } } },
  });
  if (!firm) throw new Error(`Firm ${firmId} not found`);

  // Latest reconciliation
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

  const totalDepositValue = clientBalances.reduce((acc, r) => acc + toNum(r._sum.balance), 0);
  const totalProtectedValue = ledgerBalances.reduce((acc, r) => acc + toNum(r._sum.balance), 0);
  const totalBankBalance = bankBalances.reduce((acc, r) => acc + toNum(r._sum.closingBalance), 0);
  const currency = clientBalances[0]?.currency || 'GBP';

  const totalDepositsHeld = await prisma.clientAccount.count({ where: { firmId, status: 'ACTIVE' } });

  return {
    totalDepositsHeld,
    totalDepositValue,
    totalProtectedValue,
    totalBankBalance,
    surplus: totalProtectedValue - totalDepositValue,
    currency,
    accountCount: firm.safeguardingAccounts.length,
    lastReconciliationDate: latestRecon?.reconciliationDate?.toISOString().split('T')[0] || null,
    lastReconciliationStatus: latestRecon?.status || null,
  };
}

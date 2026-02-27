import { prisma } from '../../utils/prisma';
import { Prisma } from '@prisma/client';

export type RAGStatus = 'GREEN' | 'AMBER' | 'RED';

export interface BreachCountBySeverity {
  LOW: number;
  MEDIUM: number;
  HIGH: number;
  CRITICAL: number;
}

export interface LetterStatusSummary {
  CONFIRMED: number;
  PENDING: number;
  MISSING: number;
  EXPIRED: number;
}

export interface FirmOverviewRow {
  firmId: string;
  firmName: string;
  regime: string;
  ragStatus: RAGStatus;
  lastReconDate: string | null;
  lastReconResult: string | null;
  openBreachCount: BreachCountBySeverity;
  letterStatusSummary: LetterStatusSummary;
  daysSinceLastUpload: number | null;
}

// ─── RAG computation ──────────────────────────────────────────────────────────

export function computeRAG(params: {
  lastReconStatus: string | null;
  lastReconDate: Date | null;
  openBreaches: Array<{ severity: string }>;
  latestLetters: Array<{ status: string; expiryDate: Date | null }>;
}): RAGStatus {
  const { lastReconStatus, lastReconDate, openBreaches, latestLetters } = params;
  const today = new Date();

  const daysSinceRecon = lastReconDate
    ? Math.floor((today.getTime() - lastReconDate.getTime()) / (1000 * 60 * 60 * 24))
    : 999;

  // RED: material breach (HIGH/CRITICAL) OR any CRITICAL breach OR missing recon 3+ days
  const hasCritical = openBreaches.some(b => b.severity === 'CRITICAL');
  const hasHigh = openBreaches.some(b => b.severity === 'HIGH');
  if (hasCritical || hasHigh || daysSinceRecon >= 3) return 'RED';

  // AMBER: minor breach open OR letter expiring ≤30 days OR recon older than 2 days
  const hasMinorBreach = openBreaches.some(b => b.severity === 'LOW' || b.severity === 'MEDIUM');
  const reconOlderThan2Days = daysSinceRecon >= 2;
  const in30Days = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000);
  const hasExpiringLetter = latestLetters.some(
    l => l.status === 'CURRENT' && l.expiryDate && new Date(l.expiryDate) <= in30Days
  );

  if (hasMinorBreach || reconOlderThan2Days || hasExpiringLetter) return 'AMBER';

  // GREEN: last recon MET, zero open breaches, letters ok
  return 'GREEN';
}

// ─── Resolve bankInstitutionId for a BANK_VIEWER user ────────────────────────

export async function getBankInstitutionId(userId: string): Promise<string | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { bankInstitutionId: true },
  });
  return user?.bankInstitutionId ?? null;
}

// ─── Overview ─────────────────────────────────────────────────────────────────

export async function getBankOverview(bankInstitutionId: string): Promise<FirmOverviewRow[]> {
  const links = await prisma.bankInstitutionFirm.findMany({
    where: { bankInstitutionId },
    include: {
      firm: {
        select: {
          id: true,
          name: true,
          regime: true,
        },
      },
    },
  });

  const firmIds = links.map(l => l.firmId);
  if (firmIds.length === 0) return [];

  // Fetch data for all firms in parallel
  const [reconRuns, openBreaches, safeAccounts, latestUploads] = await Promise.all([
    // Latest recon run per firm
    prisma.reconciliationRun.findMany({
      where: { firmId: { in: firmIds } },
      orderBy: { reconciliationDate: 'desc' },
      select: { firmId: true, reconciliationDate: true, status: true },
    }),
    // Open breaches per firm
    prisma.breach.findMany({
      where: { firmId: { in: firmIds }, status: { notIn: ['RESOLVED', 'CLOSED'] } },
      select: { firmId: true, severity: true },
    }),
    // Safeguarding accounts with their latest CURRENT letter
    prisma.safeguardingAccount.findMany({
      where: { firmId: { in: firmIds }, status: 'ACTIVE' },
      select: {
        firmId: true,
        letterStatus: true,
        acknowledgementLetters: {
          where: { status: 'CURRENT' },
          orderBy: { version: 'desc' },
          take: 1,
          select: { status: true, expiryDate: true },
        },
      },
    }),
    // Latest upload per firm
    prisma.upload.findMany({
      where: { firmId: { in: firmIds } },
      orderBy: { createdAt: 'desc' },
      select: { firmId: true, createdAt: true },
    }),
  ]);

  // Index by firmId for fast lookup
  const reconByFirm = new Map<string, typeof reconRuns[0]>();
  for (const run of reconRuns) {
    if (!reconByFirm.has(run.firmId)) {
      reconByFirm.set(run.firmId, run);
    }
  }

  const latestUploadByFirm = new Map<string, Date>();
  for (const upload of latestUploads) {
    if (!latestUploadByFirm.has(upload.firmId)) {
      latestUploadByFirm.set(upload.firmId, upload.createdAt);
    }
  }

  const today = new Date();

  return links.map(link => {
    const { firm } = link;
    const lastRecon = reconByFirm.get(firm.id) ?? null;
    const firmBreaches = openBreaches.filter(b => b.firmId === firm.id);
    const firmAccounts = safeAccounts.filter(a => a.firmId === firm.id);
    const latestUpload = latestUploadByFirm.get(firm.id) ?? null;

    const latestLetters = firmAccounts.flatMap(a =>
      a.acknowledgementLetters.map(l => ({ status: l.status, expiryDate: l.expiryDate }))
    );

    const ragStatus = computeRAG({
      lastReconStatus: lastRecon?.status ?? null,
      lastReconDate: lastRecon ? lastRecon.reconciliationDate : null,
      openBreaches: firmBreaches,
      latestLetters,
    });

    const openBreachCount: BreachCountBySeverity = { LOW: 0, MEDIUM: 0, HIGH: 0, CRITICAL: 0 };
    for (const b of firmBreaches) {
      openBreachCount[b.severity as keyof BreachCountBySeverity]++;
    }

    const letterStatusSummary: LetterStatusSummary = {
      CONFIRMED: 0, PENDING: 0, MISSING: 0, EXPIRED: 0,
    };
    for (const acct of firmAccounts) {
      const ls = acct.letterStatus as keyof LetterStatusSummary;
      if (ls in letterStatusSummary) letterStatusSummary[ls]++;
    }

    const daysSinceLastUpload = latestUpload
      ? Math.floor((today.getTime() - latestUpload.getTime()) / (1000 * 60 * 60 * 24))
      : null;

    return {
      firmId: firm.id,
      firmName: firm.name,
      regime: firm.regime,
      ragStatus,
      lastReconDate: lastRecon ? lastRecon.reconciliationDate.toISOString().split('T')[0] : null,
      lastReconResult: lastRecon?.status ?? null,
      openBreachCount,
      letterStatusSummary,
      daysSinceLastUpload,
    };
  });
}

// ─── Firm summary (deep dive) ─────────────────────────────────────────────────

export async function getFirmSummary(bankInstitutionId: string, firmId: string) {
  // Verify firm is linked to this bank institution
  const link = await prisma.bankInstitutionFirm.findUnique({
    where: { bankInstitutionId_firmId: { bankInstitutionId, firmId } },
  });
  if (!link) return null;

  const [reconHistory, activeBreaches, accounts, latestDD] = await Promise.all([
    prisma.reconciliationRun.findMany({
      where: { firmId },
      orderBy: { reconciliationDate: 'desc' },
      take: 10,
      select: {
        id: true,
        reconciliationDate: true,
        reconciliationType: true,
        currency: true,
        status: true,
        variance: true,
        variancePercentage: true,
        dataCompleteness: true,
        completedAt: true,
      },
    }),
    prisma.breach.findMany({
      where: { firmId, status: { notIn: ['RESOLVED', 'CLOSED'] } },
      orderBy: [{ severity: 'desc' }, { createdAt: 'asc' }],
      select: {
        id: true,
        breachType: true,
        severity: true,
        status: true,
        isNotifiable: true,
        description: true,
        createdAt: true,
        acknowledgedAt: true,
      },
    }),
    prisma.safeguardingAccount.findMany({
      where: { firmId, status: 'ACTIVE' },
      select: {
        id: true,
        bankName: true,
        accountNumberMasked: true,
        currency: true,
        letterStatus: true,
        acknowledgementLetters: {
          where: { status: 'CURRENT' },
          orderBy: { version: 'desc' },
          take: 1,
          select: {
            status: true,
            effectiveDate: true,
            expiryDate: true,
            annualReviewDue: true,
          },
        },
        thirdPartyDueDiligence: {
          orderBy: { lastReviewDate: 'desc' },
          take: 1,
          select: {
            bankName: true,
            lastReviewDate: true,
            nextReviewDue: true,
            reviewStatus: true,
            ddOutcome: true,
          },
        },
      },
    }),
    prisma.thirdPartyDueDiligence.findFirst({
      where: { firmId },
      orderBy: { lastReviewDate: 'desc' },
      select: {
        bankName: true,
        lastReviewDate: true,
        nextReviewDue: true,
        reviewStatus: true,
        ddOutcome: true,
      },
    }),
  ]);

  return {
    firmId,
    reconciliationHistory: reconHistory,
    activeBreaches,
    accounts: accounts.map(a => ({
      id: a.id,
      bankName: a.bankName,
      accountNumberMasked: a.accountNumberMasked,
      currency: a.currency,
      letterStatus: a.letterStatus,
      currentLetter: a.acknowledgementLetters[0] ?? null,
      dueDiligence: a.thirdPartyDueDiligence[0] ?? null,
    })),
    latestDD,
  };
}

// ─── Alerts: all open breaches across all linked firms ────────────────────────

const SEVERITY_ORDER: Record<string, number> = {
  CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3,
};

export async function getBankAlerts(bankInstitutionId: string) {
  const links = await prisma.bankInstitutionFirm.findMany({
    where: { bankInstitutionId },
    select: { firmId: true, firm: { select: { name: true } } },
  });
  if (links.length === 0) return [];

  const firmIds = links.map(l => l.firmId);
  const firmNameById = new Map(links.map(l => [l.firmId, l.firm.name]));

  const breaches = await prisma.breach.findMany({
    where: { firmId: { in: firmIds }, status: { notIn: ['RESOLVED', 'CLOSED'] } },
    select: {
      id: true,
      firmId: true,
      breachType: true,
      severity: true,
      status: true,
      isNotifiable: true,
      description: true,
      createdAt: true,
    },
  });

  const today = new Date();

  return breaches
    .map(b => ({
      ...b,
      firmName: firmNameById.get(b.firmId) ?? '',
      ageDays: Math.floor((today.getTime() - b.createdAt.getTime()) / (1000 * 60 * 60 * 24)),
    }))
    .sort((a, b) => {
      const severityDiff = (SEVERITY_ORDER[a.severity] ?? 99) - (SEVERITY_ORDER[b.severity] ?? 99);
      if (severityDiff !== 0) return severityDiff;
      return b.ageDays - a.ageDays; // older first within same severity
    });
}

// ─── Portfolio summary bar ────────────────────────────────────────────────────

export async function getPortfolioSummary(bankInstitutionId: string, overview: FirmOverviewRow[]) {
  const totalFirms = overview.length;
  const greenCount = overview.filter(f => f.ragStatus === 'GREEN').length;
  const amberCount = overview.filter(f => f.ragStatus === 'AMBER').length;
  const redCount = overview.filter(f => f.ragStatus === 'RED').length;

  // Sum total funds from bank_institution_firms
  const agg = await prisma.bankInstitutionFirm.aggregate({
    where: { bankInstitutionId },
    _sum: { totalFundsHeld: true },
  });

  return {
    totalFirms,
    totalFundsUnderOversight: Number(agg._sum.totalFundsHeld ?? 0),
    green: greenCount,
    amber: amberCount,
    red: redCount,
  };
}

// ─── CSV export ───────────────────────────────────────────────────────────────

export function buildOverviewCsv(rows: FirmOverviewRow[]): string {
  const headers = [
    'Firm ID', 'Firm Name', 'Regime', 'RAG Status',
    'Last Recon Date', 'Last Recon Result',
    'Open Breaches (LOW)', 'Open Breaches (MEDIUM)', 'Open Breaches (HIGH)', 'Open Breaches (CRITICAL)',
    'Letters CONFIRMED', 'Letters PENDING', 'Letters MISSING', 'Letters EXPIRED',
    'Days Since Last Upload',
  ];

  const escape = (v: string | number | null) => {
    if (v === null || v === undefined) return '';
    const s = String(v);
    if (s.includes(',') || s.includes('"') || s.includes('\n')) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };

  const lines = [
    headers.join(','),
    ...rows.map(r => [
      escape(r.firmId),
      escape(r.firmName),
      escape(r.regime),
      escape(r.ragStatus),
      escape(r.lastReconDate),
      escape(r.lastReconResult),
      escape(r.openBreachCount.LOW),
      escape(r.openBreachCount.MEDIUM),
      escape(r.openBreachCount.HIGH),
      escape(r.openBreachCount.CRITICAL),
      escape(r.letterStatusSummary.CONFIRMED),
      escape(r.letterStatusSummary.PENDING),
      escape(r.letterStatusSummary.MISSING),
      escape(r.letterStatusSummary.EXPIRED),
      escape(r.daysSinceLastUpload),
    ].join(',')),
  ];

  return lines.join('\n');
}

import { prisma } from '../../utils/prisma';
import { logger } from '../../utils/logger';
import { NotFoundError } from '../../utils/errors';
import { SafeguardingObligationStatus, FxTransactionType, Prisma } from '@prisma/client';

// ─── Types ──────────────────────────────────────────────────────────────────

interface RecordFundsReceivedData {
  clientAccountId?: string;
  transactionRef?: string;
  amount: number;
  currency: string;
  fundsReceivedAt: string;
  fxType?: 'FX_ONLY' | 'PAYMENT_LINKED';
}

interface RecordFundsExitedData {
  safeguardingEndedAt: string;
  endReason: 'PAYMENT_EXECUTED' | 'E_MONEY_REDEEMED' | 'FX_SETTLEMENT' | 'OTHER';
}

interface ActiveObligationFilters {
  page?: number;
  pageSize?: number;
  currency?: string;
  isUnclaimed?: boolean;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function toNum(val: unknown): number {
  if (val === null || val === undefined) return 0;
  if (typeof val === 'number') return val;
  return Number(val.toString());
}

const FIVE_YEARS_MS = 5 * 365.25 * 24 * 60 * 60 * 1000;
const SIX_YEARS_MS = 6 * 365.25 * 24 * 60 * 60 * 1000;

// ─── Service Functions ──────────────────────────────────────────────────────

export async function recordFundsReceived(firmId: string, data: RecordFundsReceivedData) {
  const fundsReceivedAt = new Date(data.fundsReceivedAt);
  const fxType: FxTransactionType = data.fxType === 'FX_ONLY'
    ? 'FX_ONLY'
    : data.fxType === 'PAYMENT_LINKED'
      ? 'PAYMENT_LINKED'
      : 'UNKNOWN';

  // FX-only transactions don't need safeguarding
  const status: SafeguardingObligationStatus = fxType === 'FX_ONLY' ? 'ENDED' : 'ACTIVE';

  const obligation = await prisma.safeguardingObligation.create({
    data: {
      firmId,
      clientAccountId: data.clientAccountId ?? null,
      transactionRef: data.transactionRef ?? null,
      amount: new Prisma.Decimal(data.amount),
      currency: data.currency,
      fundsReceivedAt,
      safeguardingStartedAt: fundsReceivedAt,
      safeguardingEndedAt: fxType === 'FX_ONLY' ? fundsReceivedAt : null,
      endReason: fxType === 'FX_ONLY' ? 'FX_SETTLEMENT' : null,
      fxType,
      status,
    },
  });

  logger.info({ firmId, obligationId: obligation.id, fxType, status }, 'Funds received recorded');

  return obligation;
}

export async function recordFundsExited(firmId: string, obligationId: string, data: RecordFundsExitedData) {
  const existing = await prisma.safeguardingObligation.findFirst({
    where: { id: obligationId, firmId },
  });

  if (!existing) {
    throw new NotFoundError('Safeguarding obligation');
  }

  if (existing.status === 'ENDED') {
    throw new Error('This obligation has already ended');
  }

  const obligation = await prisma.safeguardingObligation.update({
    where: { id: obligationId },
    data: {
      safeguardingEndedAt: new Date(data.safeguardingEndedAt),
      endReason: data.endReason,
      status: 'ENDED',
    },
  });

  logger.info({ firmId, obligationId, endReason: data.endReason }, 'Funds exit recorded');

  return obligation;
}

export async function getActiveObligations(firmId: string, filters: ActiveObligationFilters = {}) {
  const page = filters.page ?? 1;
  const pageSize = filters.pageSize ?? 50;
  const skip = (page - 1) * pageSize;

  const where: Prisma.SafeguardingObligationWhereInput = {
    firmId,
    status: 'ACTIVE',
  };

  if (filters.currency) {
    where.currency = filters.currency;
  }
  if (filters.isUnclaimed !== undefined) {
    where.isUnclaimed = filters.isUnclaimed;
  }

  const [obligations, total] = await Promise.all([
    prisma.safeguardingObligation.findMany({
      where,
      orderBy: { fundsReceivedAt: 'desc' },
      skip,
      take: pageSize,
    }),
    prisma.safeguardingObligation.count({ where }),
  ]);

  return {
    obligations: obligations.map((o) => ({
      ...o,
      amount: toNum(o.amount),
      ageDays: Math.floor((Date.now() - o.fundsReceivedAt.getTime()) / 86400000),
    })),
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
    },
  };
}

export async function tagFxTransaction(firmId: string, obligationId: string, fxType: 'FX_ONLY' | 'PAYMENT_LINKED') {
  const existing = await prisma.safeguardingObligation.findFirst({
    where: { id: obligationId, firmId },
  });

  if (!existing) {
    throw new NotFoundError('Safeguarding obligation');
  }

  const updateData: Prisma.SafeguardingObligationUpdateInput = {
    fxType: fxType as FxTransactionType,
  };

  // If tagging as FX_ONLY, end the obligation
  if (fxType === 'FX_ONLY' && existing.status === 'ACTIVE') {
    updateData.status = 'ENDED';
    updateData.safeguardingEndedAt = new Date();
    updateData.endReason = 'FX_SETTLEMENT';
  }

  const obligation = await prisma.safeguardingObligation.update({
    where: { id: obligationId },
    data: updateData,
  });

  logger.info({ firmId, obligationId, fxType }, 'FX transaction tagged');

  return obligation;
}

export async function getUnclaimedFunds(firmId: string) {
  const now = Date.now();

  const unclaimed = await prisma.safeguardingObligation.findMany({
    where: { firmId, isUnclaimed: true, status: 'ACTIVE' },
    orderBy: { fundsReceivedAt: 'asc' },
  });

  let totalAmount = 0;
  const obligations = unclaimed.map((o) => {
    const ageMs = now - o.fundsReceivedAt.getTime();
    const ageDays = Math.floor(ageMs / 86400000);
    const ageYears = ageMs / (365.25 * 86400000);
    const amount = toNum(o.amount);
    totalAmount += amount;

    let alertLevel: 'NORMAL' | 'WARNING' | 'CRITICAL' = 'NORMAL';
    if (ageMs >= SIX_YEARS_MS) {
      alertLevel = 'CRITICAL';
    } else if (ageMs >= FIVE_YEARS_MS) {
      alertLevel = 'WARNING';
    }

    return {
      id: o.id,
      transactionRef: o.transactionRef,
      amount,
      currency: o.currency,
      fundsReceivedAt: o.fundsReceivedAt,
      unclaimedSince: o.unclaimedSince,
      ageDays,
      ageYears: Math.round(ageYears * 10) / 10,
      alertLevel,
    };
  });

  return {
    totalAmount,
    totalCount: obligations.length,
    warningCount: obligations.filter((o) => o.alertLevel === 'WARNING').length,
    criticalCount: obligations.filter((o) => o.alertLevel === 'CRITICAL').length,
    obligations,
  };
}

export async function markAsUnclaimed(firmId: string, obligationId: string) {
  const existing = await prisma.safeguardingObligation.findFirst({
    where: { id: obligationId, firmId },
  });

  if (!existing) {
    throw new NotFoundError('Safeguarding obligation');
  }

  const obligation = await prisma.safeguardingObligation.update({
    where: { id: obligationId },
    data: {
      isUnclaimed: true,
      unclaimedSince: new Date(),
    },
  });

  logger.info({ firmId, obligationId }, 'Obligation marked as unclaimed');

  return obligation;
}

export async function getTimingDashboard(firmId: string) {
  const now = Date.now();

  // Total active obligations
  const [activeCount, totalActiveAmount, unclaimedObligations, allActive] = await Promise.all([
    prisma.safeguardingObligation.count({
      where: { firmId, status: 'ACTIVE' },
    }),
    prisma.safeguardingObligation.aggregate({
      where: { firmId, status: 'ACTIVE' },
      _sum: { amount: true },
    }),
    prisma.safeguardingObligation.findMany({
      where: { firmId, isUnclaimed: true, status: 'ACTIVE' },
      select: { amount: true, fundsReceivedAt: true },
    }),
    prisma.safeguardingObligation.findMany({
      where: { firmId, status: 'ACTIVE' },
      select: { fundsReceivedAt: true, safeguardingStartedAt: true },
    }),
  ]);

  // Calculate average safeguarding delay
  let avgDelayMs = 0;
  const validDelays = allActive.filter((o) => o.safeguardingStartedAt);
  if (validDelays.length > 0) {
    const totalDelay = validDelays.reduce((sum, o) => {
      return sum + (o.safeguardingStartedAt!.getTime() - o.fundsReceivedAt.getTime());
    }, 0);
    avgDelayMs = totalDelay / validDelays.length;
  }
  const avgDelayMinutes = Math.round(avgDelayMs / 60000);

  // Unclaimed funds totals
  let totalUnclaimedAmount = 0;
  let unclaimedWarning = 0;
  let unclaimedCritical = 0;
  for (const o of unclaimedObligations) {
    totalUnclaimedAmount += toNum(o.amount);
    const ageMs = now - o.fundsReceivedAt.getTime();
    if (ageMs >= SIX_YEARS_MS) {
      unclaimedCritical++;
    } else if (ageMs >= FIVE_YEARS_MS) {
      unclaimedWarning++;
    }
  }

  // Unsafeguarded warnings: active obligations where safeguardingStartedAt is null
  const unsafeguardedCount = await prisma.safeguardingObligation.count({
    where: { firmId, status: 'ACTIVE', safeguardingStartedAt: null },
  });

  return {
    totalActiveObligations: activeCount,
    totalActiveAmount: toNum(totalActiveAmount._sum.amount),
    totalUnclaimedFunds: totalUnclaimedAmount,
    totalUnclaimedCount: unclaimedObligations.length,
    unclaimedApproaching5Years: unclaimedWarning,
    unclaimedApproaching6Years: unclaimedCritical,
    averageSafeguardingDelayMinutes: avgDelayMinutes,
    unsafeguardedFundsWarning: unsafeguardedCount > 0,
    unsafeguardedCount,
  };
}

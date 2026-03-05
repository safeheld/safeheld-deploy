import { prisma } from '../../utils/prisma';
import { Prisma } from '@prisma/client';
import crypto from 'crypto';

// ─── Wallets ─────────────────────────────────────────────────────────────────

export async function getWallets(firmId: string, opts: {
  page: number; pageSize: number; walletType?: string; network?: string; status?: string;
}) {
  const skip = (opts.page - 1) * opts.pageSize;
  const where: Record<string, unknown> = { firmId };
  if (opts.walletType) where.walletType = opts.walletType;
  if (opts.network) where.network = opts.network;
  if (opts.status) where.status = opts.status;

  const [wallets, total] = await Promise.all([
    prisma.wallet.findMany({
      where, orderBy: { createdAt: 'desc' }, skip, take: opts.pageSize,
      include: { balances: { orderBy: { snapshotDate: 'desc' }, take: 5 } },
    }),
    prisma.wallet.count({ where }),
  ]);

  return { wallets, page: opts.page, pageSize: opts.pageSize, total, totalPages: Math.ceil(total / opts.pageSize) };
}

export async function createWallet(firmId: string, data: {
  walletName: string; walletType: string; network: string; address: string;
  custodian?: string; isMultisig?: boolean; requiredSignatures?: number;
  totalSignatories?: number; notes?: string;
}) {
  return prisma.wallet.create({
    data: {
      firmId,
      walletName: data.walletName,
      walletType: data.walletType as any,
      network: data.network as any,
      address: data.address,
      custodian: data.custodian,
      isMultisig: data.isMultisig || false,
      requiredSignatures: data.requiredSignatures,
      totalSignatories: data.totalSignatories,
      notes: data.notes,
    },
  });
}

export async function updateWallet(id: string, firmId: string, data: { status?: string; notes?: string }) {
  const updateData: Record<string, unknown> = {};
  if (data.status) updateData.status = data.status;
  if (data.notes !== undefined) updateData.notes = data.notes;
  return prisma.wallet.update({ where: { id, firmId }, data: updateData });
}

// ─── Wallet Balances ─────────────────────────────────────────────────────────

export async function getWalletBalances(firmId: string, opts: {
  page: number; pageSize: number; walletId?: string; tokenSymbol?: string; snapshotDate?: string;
}) {
  const skip = (opts.page - 1) * opts.pageSize;
  const where: Record<string, unknown> = { firmId };
  if (opts.walletId) where.walletId = opts.walletId;
  if (opts.tokenSymbol) where.tokenSymbol = opts.tokenSymbol;
  if (opts.snapshotDate) where.snapshotDate = new Date(opts.snapshotDate);

  const [balances, total] = await Promise.all([
    prisma.walletBalance.findMany({
      where, orderBy: { snapshotDate: 'desc' }, skip, take: opts.pageSize,
      include: { wallet: { select: { walletName: true, walletType: true, network: true, address: true } } },
    }),
    prisma.walletBalance.count({ where }),
  ]);

  return { balances, page: opts.page, pageSize: opts.pageSize, total, totalPages: Math.ceil(total / opts.pageSize) };
}

export async function createWalletBalance(firmId: string, data: {
  walletId: string; tokenSymbol: string; tokenName?: string; contractAddress?: string;
  balance: string; balanceUsd?: number; snapshotDate: string; blockNumber?: string;
}) {
  return prisma.walletBalance.create({
    data: {
      firmId,
      walletId: data.walletId,
      tokenSymbol: data.tokenSymbol.toUpperCase(),
      tokenName: data.tokenName,
      contractAddress: data.contractAddress,
      balance: data.balance,
      balanceUsd: data.balanceUsd,
      snapshotDate: new Date(data.snapshotDate),
      blockNumber: data.blockNumber ? BigInt(data.blockNumber) : null,
    },
  });
}

// ─── Client Entitlements ─────────────────────────────────────────────────────

export async function getClientEntitlements(firmId: string, opts: {
  page: number; pageSize: number; clientId?: string; tokenSymbol?: string;
}) {
  const skip = (opts.page - 1) * opts.pageSize;
  const where: Record<string, unknown> = { firmId };
  if (opts.clientId) where.clientId = opts.clientId;
  if (opts.tokenSymbol) where.tokenSymbol = opts.tokenSymbol;

  const [entitlements, total] = await Promise.all([
    prisma.clientEntitlement.findMany({
      where, orderBy: { recordDate: 'desc' }, skip, take: opts.pageSize,
    }),
    prisma.clientEntitlement.count({ where }),
  ]);

  return { entitlements, page: opts.page, pageSize: opts.pageSize, total, totalPages: Math.ceil(total / opts.pageSize) };
}

export async function createClientEntitlement(firmId: string, data: {
  clientId: string; clientName?: string; tokenSymbol: string;
  entitledBalance: string; entitledValueUsd?: number; recordDate: string;
}) {
  return prisma.clientEntitlement.create({
    data: {
      firmId,
      clientId: data.clientId,
      clientName: data.clientName,
      tokenSymbol: data.tokenSymbol.toUpperCase(),
      entitledBalance: data.entitledBalance,
      entitledValueUsd: data.entitledValueUsd,
      recordDate: new Date(data.recordDate),
    },
  });
}

// ─── Proof of Reserves ───────────────────────────────────────────────────────

export async function getProofOfReserves(firmId: string, opts: {
  page: number; pageSize: number;
}) {
  const skip = (opts.page - 1) * opts.pageSize;
  const [proofs, total] = await Promise.all([
    prisma.proofOfReserves.findMany({
      where: { firmId }, orderBy: { snapshotDate: 'desc' }, skip, take: opts.pageSize,
    }),
    prisma.proofOfReserves.count({ where: { firmId } }),
  ]);

  return { proofs, page: opts.page, pageSize: opts.pageSize, total, totalPages: Math.ceil(total / opts.pageSize) };
}

export async function generateProofOfReserves(firmId: string, snapshotDate: string, userId: string) {
  const date = new Date(snapshotDate);

  // Get latest wallet balances for the snapshot date
  const walletBalances = await prisma.walletBalance.findMany({
    where: { firmId, snapshotDate: date },
    include: { wallet: { select: { walletName: true, walletType: true, network: true } } },
  });

  // Get client entitlements for the snapshot date
  const entitlements = await prisma.clientEntitlement.findMany({
    where: { firmId, recordDate: date },
  });

  // Aggregate by token
  const tokenReserves: Record<string, { balance: number; usd: number }> = {};
  for (const wb of walletBalances) {
    if (!tokenReserves[wb.tokenSymbol]) tokenReserves[wb.tokenSymbol] = { balance: 0, usd: 0 };
    tokenReserves[wb.tokenSymbol].balance += Number(wb.balance);
    tokenReserves[wb.tokenSymbol].usd += Number(wb.balanceUsd || 0);
  }

  const tokenEntitlements: Record<string, { balance: number; usd: number }> = {};
  for (const e of entitlements) {
    if (!tokenEntitlements[e.tokenSymbol]) tokenEntitlements[e.tokenSymbol] = { balance: 0, usd: 0 };
    tokenEntitlements[e.tokenSymbol].balance += Number(e.entitledBalance);
    tokenEntitlements[e.tokenSymbol].usd += Number(e.entitledValueUsd || 0);
  }

  const totalReservesUsd = Object.values(tokenReserves).reduce((s, t) => s + t.usd, 0);
  const totalEntitlementsUsd = Object.values(tokenEntitlements).reduce((s, t) => s + t.usd, 0);
  const reserveRatio = totalEntitlementsUsd > 0 ? totalReservesUsd / totalEntitlementsUsd : 1;

  // Build breakdown
  const tokenBreakdown = Object.keys({ ...tokenReserves, ...tokenEntitlements }).map(symbol => ({
    symbol,
    reserves: tokenReserves[symbol] || { balance: 0, usd: 0 },
    entitlements: tokenEntitlements[symbol] || { balance: 0, usd: 0 },
    ratio: (tokenEntitlements[symbol]?.usd || 0) > 0
      ? ((tokenReserves[symbol]?.usd || 0) / (tokenEntitlements[symbol]?.usd || 1))
      : null,
  }));

  // Wallet breakdown
  const walletBreakdown = walletBalances.map(wb => ({
    walletName: wb.wallet.walletName,
    walletType: wb.wallet.walletType,
    network: wb.wallet.network,
    tokenSymbol: wb.tokenSymbol,
    balance: Number(wb.balance),
    balanceUsd: Number(wb.balanceUsd || 0),
  }));

  // Generate attestation hash
  const attestationData = JSON.stringify({ firmId, snapshotDate, tokenBreakdown, walletBreakdown, totalReservesUsd, totalEntitlementsUsd });
  const attestationHash = crypto.createHash('sha256').update(attestationData).digest('hex');

  const proof = await prisma.proofOfReserves.create({
    data: {
      firmId,
      snapshotDate: date,
      totalReservesUsd,
      totalEntitlementsUsd,
      reserveRatio,
      status: 'VERIFIED',
      tokenBreakdown: tokenBreakdown as unknown as Prisma.InputJsonValue,
      walletBreakdown: walletBreakdown as unknown as Prisma.InputJsonValue,
      attestationHash,
      generatedBy: userId,
      verifiedAt: new Date(),
    },
  });

  // Log data lineage event
  await prisma.dataLineageEvent.create({
    data: {
      firmId,
      eventType: 'ATTESTATION',
      sourceSystem: 'proof-of-reserves-engine',
      entityType: 'proof_of_reserves',
      entityId: proof.id,
      recordCount: walletBalances.length + entitlements.length,
      dataHash: attestationHash,
      metadata: { tokenCount: tokenBreakdown.length, walletCount: walletBalances.length },
    },
  });

  return proof;
}

// ─── Data Lineage ────────────────────────────────────────────────────────────

export async function getDataLineage(firmId: string, opts: {
  page: number; pageSize: number; eventType?: string; entityType?: string;
}) {
  const skip = (opts.page - 1) * opts.pageSize;
  const where: Record<string, unknown> = { firmId };
  if (opts.eventType) where.eventType = opts.eventType;
  if (opts.entityType) where.entityType = opts.entityType;

  const [events, total] = await Promise.all([
    prisma.dataLineageEvent.findMany({
      where, orderBy: { createdAt: 'desc' }, skip, take: opts.pageSize,
    }),
    prisma.dataLineageEvent.count({ where }),
  ]);

  return { events, page: opts.page, pageSize: opts.pageSize, total, totalPages: Math.ceil(total / opts.pageSize) };
}

// ─── Crypto Dashboard ────────────────────────────────────────────────────────

export async function getCryptoDashboard(firmId: string) {
  const [
    walletCount,
    activeWallets,
    totalBalanceUsd,
    uniqueTokens,
    clientCount,
    latestPoR,
    lineageEvents,
  ] = await Promise.all([
    prisma.wallet.count({ where: { firmId } }),
    prisma.wallet.count({ where: { firmId, status: 'ACTIVE' } }),
    prisma.walletBalance.aggregate({
      where: { firmId },
      _sum: { balanceUsd: true },
    }),
    prisma.walletBalance.groupBy({
      by: ['tokenSymbol'],
      where: { firmId },
    }),
    prisma.clientEntitlement.groupBy({
      by: ['clientId'],
      where: { firmId },
    }),
    prisma.proofOfReserves.findFirst({
      where: { firmId }, orderBy: { snapshotDate: 'desc' },
    }),
    prisma.dataLineageEvent.count({ where: { firmId } }),
  ]);

  return {
    totalWallets: walletCount,
    activeWallets,
    totalBalanceUsd: totalBalanceUsd._sum.balanceUsd?.toString() || '0',
    uniqueTokens: uniqueTokens.length,
    totalClients: clientCount.length,
    latestReserveRatio: latestPoR?.reserveRatio?.toString() || null,
    latestPoRDate: latestPoR?.snapshotDate || null,
    latestPoRStatus: latestPoR?.status || null,
    lineageEvents,
  };
}

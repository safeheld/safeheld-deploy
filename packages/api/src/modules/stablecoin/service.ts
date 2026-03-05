import { prisma } from '../../utils/prisma';
import { Prisma } from '@prisma/client';
import crypto from 'crypto';

// ─── Tokens ──────────────────────────────────────────────────────────────────

export async function getTokens(firmId: string, opts: {
  page: number; pageSize: number; network?: string; pegStatus?: string;
}) {
  const skip = (opts.page - 1) * opts.pageSize;
  const where: Record<string, unknown> = { firmId };
  if (opts.network) where.network = opts.network;
  if (opts.pegStatus) where.pegStatus = opts.pegStatus;

  const [tokens, total] = await Promise.all([
    prisma.stablecoinToken.findMany({
      where, orderBy: { createdAt: 'desc' }, skip, take: opts.pageSize,
    }),
    prisma.stablecoinToken.count({ where }),
  ]);

  return { tokens, page: opts.page, pageSize: opts.pageSize, total, totalPages: Math.ceil(total / opts.pageSize) };
}

export async function createToken(firmId: string, data: {
  symbol: string; name: string; contractAddress?: string; network: string;
  pegCurrency: string; pegTarget?: number; regime?: string;
  issuerName?: string; notes?: string;
}) {
  return prisma.stablecoinToken.create({
    data: {
      firmId,
      symbol: data.symbol.toUpperCase(),
      name: data.name,
      contractAddress: data.contractAddress,
      network: data.network as any,
      pegCurrency: data.pegCurrency.toUpperCase(),
      pegTarget: data.pegTarget || 1.0,
      regime: (data.regime as any) || 'UNREGULATED',
      issuerName: data.issuerName,
      notes: data.notes,
    },
  });
}

export async function updateToken(id: string, firmId: string, data: {
  currentPrice?: number; pegStatus?: string; totalSupply?: string;
  circulatingSupply?: string; notes?: string;
}) {
  const updateData: Record<string, unknown> = {};
  if (data.currentPrice !== undefined) updateData.currentPrice = data.currentPrice;
  if (data.pegStatus) updateData.pegStatus = data.pegStatus;
  if (data.totalSupply) updateData.totalSupply = data.totalSupply;
  if (data.circulatingSupply) updateData.circulatingSupply = data.circulatingSupply;
  if (data.notes !== undefined) updateData.notes = data.notes;
  return prisma.stablecoinToken.update({ where: { id, firmId }, data: updateData });
}

// ─── Peg Snapshots ───────────────────────────────────────────────────────────

export async function getPegSnapshots(firmId: string, opts: {
  page: number; pageSize: number; tokenId?: string; pegStatus?: string;
}) {
  const skip = (opts.page - 1) * opts.pageSize;
  const where: Record<string, unknown> = { firmId };
  if (opts.tokenId) where.tokenId = opts.tokenId;
  if (opts.pegStatus) where.pegStatus = opts.pegStatus;

  const [snapshots, total] = await Promise.all([
    prisma.pegSnapshot.findMany({
      where, orderBy: { snapshotAt: 'desc' }, skip, take: opts.pageSize,
      include: { token: { select: { symbol: true, name: true, pegCurrency: true } } },
    }),
    prisma.pegSnapshot.count({ where }),
  ]);

  return { snapshots, page: opts.page, pageSize: opts.pageSize, total, totalPages: Math.ceil(total / opts.pageSize) };
}

export async function createPegSnapshot(firmId: string, data: {
  tokenId: string; price: number; snapshotAt: string;
  totalSupply?: string; marketCap?: number; volume24h?: number;
}) {
  // Fetch the token to get peg target
  const token = await prisma.stablecoinToken.findFirstOrThrow({ where: { id: data.tokenId, firmId } });
  const pegTarget = Number(token.pegTarget);
  const deviationPct = ((data.price - pegTarget) / pegTarget) * 100;
  const absDeviation = Math.abs(deviationPct);

  let pegStatus: string;
  if (absDeviation <= 0.5) pegStatus = 'ON_PEG';
  else if (absDeviation <= 2) pegStatus = 'MINOR_DEVIATION';
  else if (absDeviation <= 5) pegStatus = 'MAJOR_DEVIATION';
  else pegStatus = 'DEPEGGED';

  // Update token with latest price and status
  await prisma.stablecoinToken.update({
    where: { id: data.tokenId },
    data: {
      currentPrice: data.price,
      pegStatus: pegStatus as any,
      totalSupply: data.totalSupply || undefined,
    },
  });

  return prisma.pegSnapshot.create({
    data: {
      firmId,
      tokenId: data.tokenId,
      price: data.price,
      pegTarget,
      deviationPct,
      pegStatus: pegStatus as any,
      totalSupply: data.totalSupply || null,
      marketCap: data.marketCap || null,
      volume24h: data.volume24h || null,
      snapshotAt: new Date(data.snapshotAt),
    },
    include: { token: { select: { symbol: true, name: true } } },
  });
}

// ─── Reserve Assets ──────────────────────────────────────────────────────────

export async function getReserveAssets(firmId: string, opts: {
  page: number; pageSize: number; tokenId?: string; assetType?: string; status?: string;
}) {
  const skip = (opts.page - 1) * opts.pageSize;
  const where: Record<string, unknown> = { firmId };
  if (opts.tokenId) where.tokenId = opts.tokenId;
  if (opts.assetType) where.assetType = opts.assetType;
  if (opts.status) where.status = opts.status;

  const [assets, total] = await Promise.all([
    prisma.reserveAsset.findMany({
      where, orderBy: { recordDate: 'desc' }, skip, take: opts.pageSize,
      include: { token: { select: { symbol: true, name: true } } },
    }),
    prisma.reserveAsset.count({ where }),
  ]);

  return { assets, page: opts.page, pageSize: opts.pageSize, total, totalPages: Math.ceil(total / opts.pageSize) };
}

export async function createReserveAsset(firmId: string, data: {
  tokenId: string; assetType: string; description: string; custodian?: string;
  faceValue: number; marketValue?: number; currency: string;
  maturityDate?: string; isin?: string; notes?: string; recordDate: string;
}) {
  return prisma.reserveAsset.create({
    data: {
      firmId,
      tokenId: data.tokenId,
      assetType: data.assetType as any,
      description: data.description,
      custodian: data.custodian,
      faceValue: data.faceValue,
      marketValue: data.marketValue,
      currency: data.currency.toUpperCase(),
      maturityDate: data.maturityDate ? new Date(data.maturityDate) : null,
      isin: data.isin,
      notes: data.notes,
      recordDate: new Date(data.recordDate),
    },
  });
}

// ─── Reserve Attestations ────────────────────────────────────────────────────

export async function getAttestations(firmId: string, opts: {
  page: number; pageSize: number; tokenId?: string;
}) {
  const skip = (opts.page - 1) * opts.pageSize;
  const where: Record<string, unknown> = { firmId };
  if (opts.tokenId) where.tokenId = opts.tokenId;

  const [attestations, total] = await Promise.all([
    prisma.reserveAttestation.findMany({
      where, orderBy: { snapshotDate: 'desc' }, skip, take: opts.pageSize,
      include: { token: { select: { symbol: true, name: true } } },
    }),
    prisma.reserveAttestation.count({ where }),
  ]);

  return { attestations, page: opts.page, pageSize: opts.pageSize, total, totalPages: Math.ceil(total / opts.pageSize) };
}

export async function generateAttestation(firmId: string, tokenId: string, snapshotDate: string, userId: string) {
  const date = new Date(snapshotDate);

  // Get token info
  const token = await prisma.stablecoinToken.findFirstOrThrow({ where: { id: tokenId, firmId } });

  // Get reserve assets for this token as of the snapshot date
  const assets = await prisma.reserveAsset.findMany({
    where: { firmId, tokenId, recordDate: { lte: date }, status: 'ACTIVE' },
    orderBy: { recordDate: 'desc' },
  });

  // Aggregate reserves by asset type
  const assetBreakdown: Record<string, { count: number; faceValue: number; marketValue: number }> = {};
  let totalReserveValue = 0;
  for (const a of assets) {
    const t = a.assetType;
    if (!assetBreakdown[t]) assetBreakdown[t] = { count: 0, faceValue: 0, marketValue: 0 };
    assetBreakdown[t].count++;
    assetBreakdown[t].faceValue += Number(a.faceValue);
    assetBreakdown[t].marketValue += Number(a.marketValue || a.faceValue);
    totalReserveValue += Number(a.marketValue || a.faceValue);
  }

  // Calculate circulating value
  const circulatingSupply = Number(token.circulatingSupply || token.totalSupply || 0);
  const pegTarget = Number(token.pegTarget);
  const totalCirculatingValue = circulatingSupply * pegTarget;

  const coverageRatio = totalCirculatingValue > 0 ? totalReserveValue / totalCirculatingValue : 1;

  // Build attestation data for hash
  const attestationData = JSON.stringify({
    firmId, tokenId, snapshotDate, assetBreakdown, totalReserveValue, totalCirculatingValue,
  });
  const attestationHash = crypto.createHash('sha256').update(attestationData).digest('hex');

  const attestation = await prisma.reserveAttestation.create({
    data: {
      firmId,
      tokenId,
      snapshotDate: date,
      totalReserveValue,
      totalCirculatingValue,
      coverageRatio,
      status: 'COMPLETED',
      assetBreakdown: Object.entries(assetBreakdown).map(([type, v]) => ({ type, ...v })) as unknown as Prisma.InputJsonValue,
      attestationHash,
      generatedBy: userId,
      completedAt: new Date(),
    },
    include: { token: { select: { symbol: true, name: true } } },
  });

  // Log data lineage event
  await prisma.dataLineageEvent.create({
    data: {
      firmId,
      eventType: 'ATTESTATION',
      sourceSystem: 'stablecoin-attestation-engine',
      entityType: 'reserve_attestation',
      entityId: attestation.id,
      recordCount: assets.length,
      dataHash: attestationHash,
      metadata: { tokenSymbol: token.symbol, assetCount: assets.length, coverageRatio },
    },
  });

  return attestation;
}

// ─── Stablecoin Dashboard ────────────────────────────────────────────────────

export async function getStablecoinDashboard(firmId: string) {
  const [
    tokenCount,
    onPegCount,
    totalCirculatingUsd,
    latestAttestation,
    pegSnapshotCount,
    reserveAssetCount,
    totalReserveValue,
  ] = await Promise.all([
    prisma.stablecoinToken.count({ where: { firmId } }),
    prisma.stablecoinToken.count({ where: { firmId, pegStatus: 'ON_PEG' } }),
    prisma.stablecoinToken.aggregate({
      where: { firmId },
      _sum: { circulatingSupply: true },
    }),
    prisma.reserveAttestation.findFirst({
      where: { firmId }, orderBy: { snapshotDate: 'desc' },
      include: { token: { select: { symbol: true } } },
    }),
    prisma.pegSnapshot.count({ where: { firmId } }),
    prisma.reserveAsset.count({ where: { firmId, status: 'ACTIVE' } }),
    prisma.reserveAsset.aggregate({
      where: { firmId, status: 'ACTIVE' },
      _sum: { marketValue: true },
    }),
  ]);

  return {
    totalTokens: tokenCount,
    onPegTokens: onPegCount,
    totalCirculatingSupply: totalCirculatingUsd._sum.circulatingSupply?.toString() || '0',
    activeReserveAssets: reserveAssetCount,
    totalReserveValue: totalReserveValue._sum.marketValue?.toString() || '0',
    latestCoverageRatio: latestAttestation?.coverageRatio?.toString() || null,
    latestAttestationDate: latestAttestation?.snapshotDate || null,
    latestAttestationToken: latestAttestation?.token?.symbol || null,
    pegSnapshots: pegSnapshotCount,
  };
}

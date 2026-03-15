import { prisma } from '../../utils/prisma';
import { logger } from '../../utils/logger';
import { Prisma } from '@prisma/client';

function toNum(val: unknown): number {
  if (val === null || val === undefined) return 0;
  if (typeof val === 'number') return val;
  return Number(val.toString());
}

// ─── Custody Asset Reconciliation ───────────────────────────────────────────

export async function runCustodyAssetReconciliation(
  firmId: string,
  reconciliationDate: Date,
): Promise<string> {
  const firm = await prisma.firm.findUnique({ where: { id: firmId } });
  if (!firm) throw new Error(`Firm ${firmId} not found`);

  const materialPct = toNum(firm.materialDiscrepancyPct) || 1.0;
  const materialAbs = toNum(firm.materialDiscrepancyAbs) || 1000;

  // Get all CUSTODY_ASSET records for this firm on the given date that are HELD
  const assets = await prisma.clientAsset.findMany({
    where: {
      firmId,
      assetType: 'CUSTODY_ASSET',
      status: 'HELD',
      recordDate: reconciliationDate,
    },
    orderBy: [{ custodian: 'asc' }, { isin: 'asc' }],
  });

  let matched = 0;
  let mismatched = 0;
  let missing = 0;
  let unregistered = 0;
  let breachesCreated = 0;
  let totalFirmQuantity = 0;
  let totalCustodianQuantity = 0;
  let totalFirmValue = 0;
  let totalCustodianValue = 0;

  const itemsData: Array<{
    clientAssetId: string;
    firmQuantity: number;
    custodianQuantity: number | null;
    quantityVariance: number;
    firmMarketValue: number | null;
    custodianMarketValue: number | null;
    valueVariance: number | null;
    status: 'MATCHED' | 'QUANTITY_MISMATCH' | 'VALUE_MISMATCH' | 'MISSING_AT_CUSTODIAN' | 'UNREGISTERED_HOLDING';
    breachId: string | null;
  }> = [];

  for (const asset of assets) {
    const firmQty = toNum(asset.quantity);
    const custQty = asset.custodianQuantity !== null ? toNum(asset.custodianQuantity) : null;
    const firmVal = asset.marketValue !== null ? toNum(asset.marketValue) : null;
    const custVal = asset.custodianMarketValue !== null ? toNum(asset.custodianMarketValue) : null;

    totalFirmQuantity += firmQty;
    totalCustodianQuantity += custQty ?? 0;
    totalFirmValue += firmVal ?? 0;
    totalCustodianValue += custVal ?? 0;

    let status: 'MATCHED' | 'QUANTITY_MISMATCH' | 'VALUE_MISMATCH' | 'MISSING_AT_CUSTODIAN' | 'UNREGISTERED_HOLDING';
    let breachId: string | null = null;

    if (custQty === null) {
      // No custodian record — asset is missing at custodian
      status = 'MISSING_AT_CUSTODIAN';
      missing++;

      const breach = await createCustodyBreach(
        firmId, 'MISSING_CUSTODY_ASSET', 'HIGH',
        `Asset "${asset.assetName}" (ISIN: ${asset.isin || 'N/A'}) held for client ${asset.clientId} ` +
        `has no corresponding custodian record. Firm quantity: ${firmQty}. ` +
        `Custodian: ${asset.custodian || 'Unknown'}.`,
        asset.currency,
        firmVal ? Math.abs(firmVal) : undefined,
      );
      if (breach) {
        breachId = breach.id;
        breachesCreated++;
      }
    } else if (!asset.nomineeRegistered && asset.custodian) {
      // Asset held but not registered in nominee name
      status = 'UNREGISTERED_HOLDING';
      unregistered++;

      const breach = await createCustodyBreach(
        firmId, 'UNREGISTERED_HOLDING', 'MEDIUM',
        `Asset "${asset.assetName}" (ISIN: ${asset.isin || 'N/A'}) held at ${asset.custodian} ` +
        `is not registered in a nominee name. Client: ${asset.clientId}.`,
        asset.currency,
      );
      if (breach) {
        breachId = breach.id;
        breachesCreated++;
      }
    } else {
      const quantityVariance = custQty - firmQty;
      const quantityVariancePct = firmQty === 0 ? 0 : Math.abs((quantityVariance / firmQty) * 100);

      if (Math.abs(quantityVariance) > 0.000001) {
        // Quantity mismatch
        status = 'QUANTITY_MISMATCH';
        mismatched++;

        // Determine if material
        const isMaterial = quantityVariancePct >= materialPct ||
          (firmVal !== null && Math.abs(quantityVariance / firmQty) * firmVal >= materialAbs);

        if (isMaterial) {
          const severity = quantityVariancePct >= materialPct * 5 ? 'CRITICAL'
            : quantityVariancePct >= materialPct * 2 ? 'HIGH' : 'MEDIUM';

          const breach = await createCustodyBreach(
            firmId, 'CUSTODY_MISMATCH', severity as 'CRITICAL' | 'HIGH' | 'MEDIUM',
            `Quantity mismatch for "${asset.assetName}" (ISIN: ${asset.isin || 'N/A'}). ` +
            `Firm: ${firmQty}, Custodian: ${custQty}, Variance: ${quantityVariance.toFixed(6)} ` +
            `(${quantityVariancePct.toFixed(2)}%). Client: ${asset.clientId}. ` +
            `Custodian: ${asset.custodian || 'Unknown'}.`,
            asset.currency,
            firmVal ? Math.abs(quantityVariance / firmQty) * firmVal : undefined,
          );
          if (breach) {
            breachId = breach.id;
            breachesCreated++;
          }
        }
      } else if (firmVal !== null && custVal !== null && Math.abs(custVal - firmVal) > 0.01) {
        // Quantities match but values differ
        status = 'VALUE_MISMATCH';
        mismatched++;
      } else {
        status = 'MATCHED';
        matched++;
      }
    }

    const quantityVariance = (custQty ?? 0) - firmQty;
    const valueVariance = (firmVal !== null && custVal !== null) ? custVal - firmVal : null;

    itemsData.push({
      clientAssetId: asset.id,
      firmQuantity: firmQty,
      custodianQuantity: custQty,
      quantityVariance,
      firmMarketValue: firmVal,
      custodianMarketValue: custVal,
      valueVariance,
      status,
      breachId,
    });

    // Update lastReconciled on the asset
    await prisma.clientAsset.update({
      where: { id: asset.id },
      data: { lastReconciled: reconciliationDate },
    });
  }

  // Create reconciliation record and items in a transaction
  const recon = await prisma.custodyAssetReconciliation.create({
    data: {
      firmId,
      reconciliationDate,
      totalAssets: assets.length,
      matched,
      mismatched,
      missing,
      unregistered,
      totalFirmQuantity,
      totalCustodianQuantity,
      totalFirmValue,
      totalCustodianValue,
      breachesCreated,
      items: {
        create: itemsData.map((item) => ({
          clientAssetId: item.clientAssetId,
          firmQuantity: item.firmQuantity,
          custodianQuantity: item.custodianQuantity,
          quantityVariance: item.quantityVariance,
          firmMarketValue: item.firmMarketValue,
          custodianMarketValue: item.custodianMarketValue,
          valueVariance: item.valueVariance,
          status: item.status,
          breachId: item.breachId,
        })),
      },
    },
  });

  logger.info(
    { firmId, reconId: recon.id, totalAssets: assets.length, matched, mismatched, missing, unregistered, breachesCreated },
    'Custody asset reconciliation completed',
  );

  return recon.id;
}

async function createCustodyBreach(
  firmId: string,
  breachType: 'CUSTODY_MISMATCH' | 'MISSING_CUSTODY_ASSET' | 'UNREGISTERED_HOLDING',
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW',
  description: string,
  currency: string,
  shortfallAmount?: number,
): Promise<{ id: string } | null> {
  try {
    const breach = await prisma.breach.create({
      data: {
        firmId,
        breachType,
        severity,
        isNotifiable: severity === 'HIGH' || severity === 'CRITICAL',
        materialDiscrepancyExceeded: severity !== 'LOW',
        currency,
        shortfallAmount: shortfallAmount ?? null,
        description,
        status: 'DETECTED',
      },
    });
    logger.info({ firmId, breachId: breach.id, breachType, severity }, `${breachType} breach detected`);
    return breach;
  } catch (err) {
    logger.error({ err, firmId, breachType }, 'Failed to create custody breach');
    return null;
  }
}

// ─── Reconciliation History ─────────────────────────────────────────────────

export async function getCustodyReconciliationHistory(
  firmId: string,
  filters: { from?: Date; to?: Date; page?: number; pageSize?: number },
) {
  const where: Prisma.CustodyAssetReconciliationWhereInput = { firmId };
  if (filters.from || filters.to) {
    where.reconciliationDate = {};
    if (filters.from) (where.reconciliationDate as Prisma.DateTimeFilter).gte = filters.from;
    if (filters.to) (where.reconciliationDate as Prisma.DateTimeFilter).lte = filters.to;
  }

  const page = filters.page || 1;
  const pageSize = filters.pageSize || 50;
  const skip = (page - 1) * pageSize;

  const [reconciliations, total] = await Promise.all([
    prisma.custodyAssetReconciliation.findMany({
      where,
      orderBy: { reconciliationDate: 'desc' },
      skip,
      take: pageSize,
      include: {
        items: {
          where: { status: { not: 'MATCHED' } },
          select: {
            id: true, status: true, quantityVariance: true, valueVariance: true,
            clientAsset: { select: { assetName: true, isin: true, custodian: true, clientId: true } },
          },
        },
      },
    }),
    prisma.custodyAssetReconciliation.count({ where }),
  ]);

  return { reconciliations, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
}

// ─── Nominee Account Status ─────────────────────────────────────────────────

export async function getNomineeAccountStatus(firmId: string) {
  const assets = await prisma.clientAsset.findMany({
    where: { firmId, assetType: 'CUSTODY_ASSET', status: 'HELD' },
    select: {
      id: true,
      assetName: true,
      isin: true,
      custodian: true,
      subCustodian: true,
      nomineeRegistered: true,
      nomineeName: true,
      clientId: true,
      quantity: true,
      marketValue: true,
      currency: true,
    },
    orderBy: [{ custodian: 'asc' }, { nomineeRegistered: 'asc' }],
  });

  const totalAssets = assets.length;
  const registered = assets.filter((a) => a.nomineeRegistered).length;
  const unregistered = assets.filter((a) => !a.nomineeRegistered).length;

  // Group by custodian
  const byCustodian: Record<string, { total: number; registered: number; unregistered: number; assets: typeof assets }> = {};
  for (const asset of assets) {
    const key = asset.custodian || 'Unknown';
    if (!byCustodian[key]) {
      byCustodian[key] = { total: 0, registered: 0, unregistered: 0, assets: [] };
    }
    byCustodian[key].total++;
    if (asset.nomineeRegistered) byCustodian[key].registered++;
    else byCustodian[key].unregistered++;
    byCustodian[key].assets.push(asset);
  }

  return {
    summary: { totalAssets, registered, unregistered },
    byCustodian,
  };
}

// ─── Sub-Custodian Exposure ─────────────────────────────────────────────────

export async function getSubCustodianExposure(firmId: string) {
  const assets = await prisma.clientAsset.findMany({
    where: { firmId, assetType: 'CUSTODY_ASSET', status: 'HELD' },
    select: {
      custodian: true,
      subCustodian: true,
      quantity: true,
      marketValue: true,
      currency: true,
      assetName: true,
      isin: true,
      clientId: true,
    },
  });

  // Aggregate by sub-custodian
  const exposureMap: Record<string, {
    subCustodian: string;
    custodian: string;
    totalAssets: number;
    totalMarketValue: number;
    currencies: Set<string>;
    clients: Set<string>;
  }> = {};

  for (const asset of assets) {
    const subCust = asset.subCustodian || asset.custodian || 'Direct/Unknown';
    const custodian = asset.custodian || 'Unknown';
    const key = `${subCust}||${custodian}`;

    if (!exposureMap[key]) {
      exposureMap[key] = {
        subCustodian: subCust,
        custodian,
        totalAssets: 0,
        totalMarketValue: 0,
        currencies: new Set(),
        clients: new Set(),
      };
    }
    exposureMap[key].totalAssets++;
    exposureMap[key].totalMarketValue += toNum(asset.marketValue);
    exposureMap[key].currencies.add(asset.currency);
    exposureMap[key].clients.add(asset.clientId);
  }

  const exposures = Object.values(exposureMap).map((e) => ({
    subCustodian: e.subCustodian,
    custodian: e.custodian,
    totalAssets: e.totalAssets,
    totalMarketValue: e.totalMarketValue,
    currencies: Array.from(e.currencies),
    uniqueClients: e.clients.size,
  }));

  // Sort by market value descending
  exposures.sort((a, b) => b.totalMarketValue - a.totalMarketValue);

  const totalExposure = exposures.reduce((sum, e) => sum + e.totalMarketValue, 0);

  return {
    totalExposure,
    totalSubCustodians: exposures.length,
    exposures: exposures.map((e) => ({
      ...e,
      concentrationPct: totalExposure > 0
        ? parseFloat(((e.totalMarketValue / totalExposure) * 100).toFixed(2))
        : 0,
    })),
  };
}

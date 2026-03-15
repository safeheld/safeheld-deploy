import { prisma } from '../../utils/prisma';
import { Prisma } from '@prisma/client';
import { logger } from '../../utils/logger';

// ─── GENIUS Act Constants ───────────────────────────────────────────────────

/** Maximum maturity for Treasury bills to qualify (93 days) */
const MAX_TBILL_MATURITY_DAYS = 93;

/** Qualifying reserve asset types under the GENIUS Act */
const QUALIFYING_ASSET_TYPES = new Set([
  'CASH',            // US dollars in FDIC-insured accounts
  'TREASURY_BILL',   // US Treasury bills (< 93 days maturity)
]);

/** Asset types that are partially qualifying (with conditions) */
const CONDITIONAL_ASSET_TYPES = new Set([
  'GOVERNMENT_BOND',   // Only qualifies if Fed reverse repo
  'MONEY_MARKET_FUND', // Only if backed by qualifying assets
]);

/** Non-qualifying asset types */
const NON_QUALIFYING_ASSET_TYPES = new Set([
  'CRYPTO_COLLATERAL',
  'COMMERCIAL_PAPER',
  'CERTIFICATE_OF_DEPOSIT',
  'OTHER',
]);

// ─── Types ──────────────────────────────────────────────────────────────────

interface ComplianceCheckResult {
  category: string;
  check: string;
  status: 'PASS' | 'FAIL' | 'WARNING' | 'NOT_APPLICABLE';
  details: string;
  value?: string | number | null;
  threshold?: string | number | null;
}

interface ReserveAssetAnalysis {
  assetId: string;
  assetType: string;
  description: string;
  faceValue: number;
  marketValue: number;
  currency: string;
  maturityDate: string | null;
  qualification: 'QUALIFYING' | 'CONDITIONAL' | 'NON_QUALIFYING';
  reason: string;
}

interface GeniusActDashboard {
  firmId: string;
  overallStatus: 'COMPLIANT' | 'NON_COMPLIANT' | 'NEEDS_REVIEW';
  lastCheckAt: string | null;
  reserveSummary: {
    totalReserveValue: number;
    totalCirculatingValue: number;
    coverageRatio: number;
    qualifyingAssetsPct: number;
    nonQualifyingAssetsPct: number;
  };
  tokenBreakdown: Array<{
    tokenId: string;
    symbol: string;
    coverageRatio: number;
    qualifyingPct: number;
    compliant: boolean;
  }>;
  reportingStatus: {
    latestAttestationDate: string | null;
    daysSinceLastAttestation: number | null;
    monthlyReportingCompliant: boolean;
  };
  checks: ComplianceCheckResult[];
}

// ─── GENIUS Act Compliance Check ────────────────────────────────────────────

export async function runGeniusActComplianceCheck(firmId: string): Promise<{
  firmId: string;
  checkedAt: string;
  overallStatus: 'COMPLIANT' | 'NON_COMPLIANT' | 'NEEDS_REVIEW';
  checks: ComplianceCheckResult[];
}> {
  const firm = await prisma.firm.findUniqueOrThrow({ where: { id: firmId } });
  const checks: ComplianceCheckResult[] = [];
  const checkedAt = new Date().toISOString();

  logger.info({ firmId }, 'Running GENIUS Act compliance check');

  // Get all GENIUS_ACT tokens for this firm
  const tokens = await prisma.stablecoinToken.findMany({
    where: { firmId, regime: 'GENIUS_ACT' },
  });

  if (tokens.length === 0) {
    checks.push({
      category: 'GENERAL',
      check: 'Payment stablecoin registration',
      status: 'WARNING',
      details: 'No stablecoin tokens registered under the GENIUS Act regime for this firm.',
    });
    return { firmId, checkedAt, overallStatus: 'NEEDS_REVIEW', checks };
  }

  // ── 1. Reserve Requirements: 1:1 backing ──

  for (const token of tokens) {
    const assets = await prisma.reserveAsset.findMany({
      where: { firmId, tokenId: token.id, status: 'ACTIVE' },
    });

    let totalReserveValue = 0;
    for (const a of assets) {
      totalReserveValue += Number(a.marketValue || a.faceValue);
    }

    const circulatingSupply = Number(token.circulatingSupply || token.totalSupply || 0);
    const pegTarget = Number(token.pegTarget);
    const totalCirculatingValue = circulatingSupply * pegTarget;
    const coverageRatio = totalCirculatingValue > 0 ? totalReserveValue / totalCirculatingValue : 1;

    checks.push({
      category: 'RESERVE_RATIO',
      check: `1:1 reserve backing — ${token.symbol}`,
      status: coverageRatio >= 1.0 ? 'PASS' : 'FAIL',
      details: coverageRatio >= 1.0
        ? `${token.symbol}: Reserve coverage is ${(coverageRatio * 100).toFixed(2)}%, meeting the 100% requirement.`
        : `${token.symbol}: Reserve coverage is ${(coverageRatio * 100).toFixed(2)}%, below the required 100%. GENIUS Act Sec. 4 requires full backing.`,
      value: Number((coverageRatio * 100).toFixed(2)),
      threshold: 100,
    });
  }

  // ── 2. Reserve Composition: Only qualifying assets ──

  const allAssets = await prisma.reserveAsset.findMany({
    where: {
      firmId,
      tokenId: { in: tokens.map(t => t.id) },
      status: 'ACTIVE',
    },
  });

  let qualifyingValue = 0;
  let conditionalValue = 0;
  let nonQualifyingValue = 0;
  const nonQualifyingItems: string[] = [];

  for (const asset of allAssets) {
    const val = Number(asset.marketValue || asset.faceValue);

    if (QUALIFYING_ASSET_TYPES.has(asset.assetType)) {
      // For T-bills, verify maturity
      if (asset.assetType === 'TREASURY_BILL' && asset.maturityDate) {
        const daysToMaturity = Math.floor(
          (new Date(asset.maturityDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
        );
        if (daysToMaturity <= MAX_TBILL_MATURITY_DAYS) {
          qualifyingValue += val;
        } else {
          conditionalValue += val;
          nonQualifyingItems.push(`T-bill ${asset.isin || asset.description}: ${daysToMaturity} days to maturity (max ${MAX_TBILL_MATURITY_DAYS})`);
        }
      } else {
        qualifyingValue += val;
      }
    } else if (CONDITIONAL_ASSET_TYPES.has(asset.assetType)) {
      conditionalValue += val;
    } else {
      nonQualifyingValue += val;
      nonQualifyingItems.push(`${asset.assetType}: ${asset.description} ($${val.toLocaleString()})`);
    }
  }

  const totalAssetValue = qualifyingValue + conditionalValue + nonQualifyingValue;
  const qualifyingPct = totalAssetValue > 0 ? (qualifyingValue / totalAssetValue) * 100 : 0;
  const nonQualifyingPct = totalAssetValue > 0 ? (nonQualifyingValue / totalAssetValue) * 100 : 0;

  checks.push({
    category: 'RESERVE_COMPOSITION',
    check: 'Qualifying reserve assets',
    status: nonQualifyingValue === 0 ? 'PASS' : 'FAIL',
    details: nonQualifyingValue === 0
      ? `100% of reserves ($${totalAssetValue.toLocaleString()}) are in qualifying or conditionally qualifying assets.`
      : `${nonQualifyingPct.toFixed(1)}% of reserves ($${nonQualifyingValue.toLocaleString()}) are in non-qualifying assets. GENIUS Act requires reserves in USD, T-bills, or Fed reverse repos only.`,
    value: Number(qualifyingPct.toFixed(1)),
    threshold: 100,
  });

  // ── 3. No crypto-backed reserves ──

  const cryptoAssets = allAssets.filter(a => a.assetType === 'CRYPTO_COLLATERAL');
  const cryptoValue = cryptoAssets.reduce((sum, a) => sum + Number(a.marketValue || a.faceValue), 0);

  checks.push({
    category: 'RESERVE_COMPOSITION',
    check: 'No crypto-backed reserves',
    status: cryptoValue === 0 ? 'PASS' : 'FAIL',
    details: cryptoValue === 0
      ? 'No crypto collateral found in reserves. Compliant with GENIUS Act prohibition on crypto-backed reserves.'
      : `$${cryptoValue.toLocaleString()} in crypto collateral found. GENIUS Act explicitly prohibits crypto-backed reserves for payment stablecoins.`,
    value: cryptoValue,
    threshold: 0,
  });

  // ── 4. Monthly Reserve Reporting ──

  const attestations = await prisma.reserveAttestation.findMany({
    where: {
      firmId,
      tokenId: { in: tokens.map(t => t.id) },
      status: 'COMPLETED',
    },
    orderBy: { snapshotDate: 'desc' },
    take: 12, // Last 12 months
  });

  if (attestations.length > 0) {
    const latestDate = attestations[0].snapshotDate;
    const daysSince = Math.floor(
      (Date.now() - new Date(latestDate).getTime()) / (1000 * 60 * 60 * 24)
    );

    checks.push({
      category: 'REPORTING',
      check: 'Monthly reserve reporting',
      status: daysSince <= 31 ? 'PASS' : daysSince <= 45 ? 'WARNING' : 'FAIL',
      details: daysSince <= 31
        ? `Latest reserve attestation is ${daysSince} day(s) old. Monthly reporting requirement met.`
        : `Latest reserve attestation is ${daysSince} day(s) old. GENIUS Act requires monthly public disclosure of reserve composition.`,
      value: daysSince,
      threshold: 31,
    });

    // Check reporting frequency over last 6 months
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    const recentAttestations = attestations.filter(a => new Date(a.snapshotDate) >= sixMonthsAgo);

    checks.push({
      category: 'REPORTING',
      check: 'Reporting frequency (6-month lookback)',
      status: recentAttestations.length >= 5 ? 'PASS' : recentAttestations.length >= 3 ? 'WARNING' : 'FAIL',
      details: `${recentAttestations.length} attestation(s) in the last 6 months (expected at least 6 for monthly reporting).`,
      value: recentAttestations.length,
      threshold: 6,
    });
  } else {
    checks.push({
      category: 'REPORTING',
      check: 'Monthly reserve reporting',
      status: 'FAIL',
      details: 'No completed reserve attestations found. GENIUS Act requires monthly public disclosure.',
    });
  }

  // ── 5. Redemption at Par ──

  for (const token of tokens) {
    const pegTarget = Number(token.pegTarget);
    const currentPrice = Number(token.currentPrice || 0);
    const deviationPct = pegTarget > 0 ? Math.abs(((currentPrice - pegTarget) / pegTarget) * 100) : 0;

    if (currentPrice > 0) {
      checks.push({
        category: 'REDEMPTION',
        check: `Redemption at par — ${token.symbol}`,
        status: deviationPct <= 0.5 ? 'PASS' : deviationPct <= 2 ? 'WARNING' : 'FAIL',
        details: deviationPct <= 0.5
          ? `${token.symbol} is trading at $${currentPrice.toFixed(4)}, within 0.5% of par ($${pegTarget.toFixed(2)}). Redemption at par verified.`
          : `${token.symbol} is trading at $${currentPrice.toFixed(4)}, ${deviationPct.toFixed(2)}% from par ($${pegTarget.toFixed(2)}). GENIUS Act requires redemption at par value.`,
        value: Number(deviationPct.toFixed(2)),
        threshold: 0.5,
      });
    }
  }

  // ── 6. FDIC-insured account verification ──

  const cashAssets = allAssets.filter(a => a.assetType === 'CASH' && a.currency === 'USD');
  checks.push({
    category: 'RESERVE_COMPOSITION',
    check: 'USD held in FDIC-insured accounts',
    status: cashAssets.length > 0 ? 'PASS' : totalAssetValue > 0 ? 'WARNING' : 'NOT_APPLICABLE',
    details: cashAssets.length > 0
      ? `${cashAssets.length} USD cash position(s) on record totaling $${cashAssets.reduce((s, a) => s + Number(a.marketValue || a.faceValue), 0).toLocaleString()}. Manual verification of FDIC insurance required.`
      : totalAssetValue > 0
        ? 'No USD cash positions found. GENIUS Act requires a portion of reserves in FDIC-insured deposit accounts.'
        : 'No reserve assets registered.',
    value: cashAssets.length,
  });

  // ── Determine overall status ──

  const hasFailures = checks.some(c => c.status === 'FAIL');
  const hasWarnings = checks.some(c => c.status === 'WARNING');
  const overallStatus = hasFailures ? 'NON_COMPLIANT' : hasWarnings ? 'NEEDS_REVIEW' : 'COMPLIANT';

  logger.info({ firmId, overallStatus, checksCount: checks.length }, 'GENIUS Act compliance check completed');

  return { firmId, checkedAt, overallStatus, checks };
}

// ─── Reserve Composition Analysis ───────────────────────────────────────────

export async function checkReserveComposition(firmId: string): Promise<{
  firmId: string;
  checkedAt: string;
  summary: {
    totalValue: number;
    qualifyingValue: number;
    conditionalValue: number;
    nonQualifyingValue: number;
    qualifyingPct: number;
    nonQualifyingPct: number;
  };
  assets: ReserveAssetAnalysis[];
  flaggedAssets: ReserveAssetAnalysis[];
}> {
  logger.info({ firmId }, 'Analyzing GENIUS Act reserve composition');

  const tokens = await prisma.stablecoinToken.findMany({
    where: { firmId, regime: 'GENIUS_ACT' },
  });

  const allAssets = await prisma.reserveAsset.findMany({
    where: {
      firmId,
      tokenId: { in: tokens.map(t => t.id) },
      status: 'ACTIVE',
    },
    include: { token: { select: { symbol: true } } },
  });

  const analyzed: ReserveAssetAnalysis[] = [];
  let qualifyingValue = 0;
  let conditionalValue = 0;
  let nonQualifyingValue = 0;

  for (const asset of allAssets) {
    const val = Number(asset.marketValue || asset.faceValue);
    let qualification: 'QUALIFYING' | 'CONDITIONAL' | 'NON_QUALIFYING';
    let reason: string;

    if (asset.assetType === 'CASH' && asset.currency === 'USD') {
      qualification = 'QUALIFYING';
      reason = 'US dollars in deposit account. Verify FDIC insurance status.';
      qualifyingValue += val;
    } else if (asset.assetType === 'CASH' && asset.currency !== 'USD') {
      qualification = 'NON_QUALIFYING';
      reason = `Non-USD cash (${asset.currency}). GENIUS Act requires USD-denominated reserves.`;
      nonQualifyingValue += val;
    } else if (asset.assetType === 'TREASURY_BILL') {
      if (asset.maturityDate) {
        const daysToMaturity = Math.floor(
          (new Date(asset.maturityDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
        );
        if (daysToMaturity <= MAX_TBILL_MATURITY_DAYS && daysToMaturity >= 0) {
          qualification = 'QUALIFYING';
          reason = `US Treasury bill with ${daysToMaturity} days to maturity (within ${MAX_TBILL_MATURITY_DAYS}-day limit).`;
          qualifyingValue += val;
        } else if (daysToMaturity < 0) {
          qualification = 'NON_QUALIFYING';
          reason = 'Treasury bill has matured. Must be replaced with active qualifying asset.';
          nonQualifyingValue += val;
        } else {
          qualification = 'NON_QUALIFYING';
          reason = `Treasury bill has ${daysToMaturity} days to maturity, exceeding the ${MAX_TBILL_MATURITY_DAYS}-day limit.`;
          nonQualifyingValue += val;
        }
      } else {
        qualification = 'CONDITIONAL';
        reason = 'Treasury bill maturity date not recorded. Cannot verify compliance with 93-day limit.';
        conditionalValue += val;
      }
    } else if (asset.assetType === 'GOVERNMENT_BOND') {
      qualification = 'CONDITIONAL';
      reason = 'Government bond. Only qualifies if it is a Fed reverse repo agreement. Manual verification required.';
      conditionalValue += val;
    } else if (asset.assetType === 'MONEY_MARKET_FUND') {
      qualification = 'CONDITIONAL';
      reason = 'Money market fund. Must be verified that underlying assets are qualifying (T-bills, Fed repos).';
      conditionalValue += val;
    } else if (NON_QUALIFYING_ASSET_TYPES.has(asset.assetType)) {
      qualification = 'NON_QUALIFYING';
      reason = `${asset.assetType} is not a qualifying reserve asset under the GENIUS Act.`;
      nonQualifyingValue += val;
    } else {
      qualification = 'NON_QUALIFYING';
      reason = `Unknown asset type. Cannot determine qualification status.`;
      nonQualifyingValue += val;
    }

    analyzed.push({
      assetId: asset.id,
      assetType: asset.assetType,
      description: asset.description,
      faceValue: Number(asset.faceValue),
      marketValue: Number(asset.marketValue || asset.faceValue),
      currency: asset.currency,
      maturityDate: asset.maturityDate?.toISOString().slice(0, 10) || null,
      qualification,
      reason,
    });
  }

  const totalValue = qualifyingValue + conditionalValue + nonQualifyingValue;
  const flaggedAssets = analyzed.filter(a => a.qualification !== 'QUALIFYING');

  return {
    firmId,
    checkedAt: new Date().toISOString(),
    summary: {
      totalValue,
      qualifyingValue,
      conditionalValue,
      nonQualifyingValue,
      qualifyingPct: totalValue > 0 ? Number(((qualifyingValue / totalValue) * 100).toFixed(1)) : 0,
      nonQualifyingPct: totalValue > 0 ? Number(((nonQualifyingValue / totalValue) * 100).toFixed(1)) : 0,
    },
    assets: analyzed,
    flaggedAssets,
  };
}

// ─── GENIUS Act Dashboard ───────────────────────────────────────────────────

export async function getGeniusActDashboard(firmId: string): Promise<GeniusActDashboard> {
  // Run compliance check
  const complianceResult = await runGeniusActComplianceCheck(firmId);

  // Get tokens
  const tokens = await prisma.stablecoinToken.findMany({
    where: { firmId, regime: 'GENIUS_ACT' },
  });

  // Build per-token breakdown
  const tokenBreakdown = await Promise.all(tokens.map(async (token) => {
    const assets = await prisma.reserveAsset.findMany({
      where: { firmId, tokenId: token.id, status: 'ACTIVE' },
    });

    let totalReserveValue = 0;
    let qualifyingValue = 0;
    for (const a of assets) {
      const val = Number(a.marketValue || a.faceValue);
      totalReserveValue += val;
      if (QUALIFYING_ASSET_TYPES.has(a.assetType)) {
        qualifyingValue += val;
      }
    }

    const circulatingSupply = Number(token.circulatingSupply || token.totalSupply || 0);
    const totalCirculatingValue = circulatingSupply * Number(token.pegTarget);
    const coverageRatio = totalCirculatingValue > 0 ? totalReserveValue / totalCirculatingValue : 1;
    const qualifyingPct = totalReserveValue > 0 ? (qualifyingValue / totalReserveValue) * 100 : 0;

    return {
      tokenId: token.id,
      symbol: token.symbol,
      coverageRatio: Number(coverageRatio.toFixed(4)),
      qualifyingPct: Number(qualifyingPct.toFixed(1)),
      compliant: coverageRatio >= 1.0 && qualifyingPct >= 99, // essentially all qualifying
    };
  }));

  // Aggregate reserve summary
  const allAssets = await prisma.reserveAsset.findMany({
    where: { firmId, tokenId: { in: tokens.map(t => t.id) }, status: 'ACTIVE' },
  });

  let totalReserveValue = 0;
  let qualifyingTotal = 0;
  let nonQualifyingTotal = 0;
  for (const a of allAssets) {
    const val = Number(a.marketValue || a.faceValue);
    totalReserveValue += val;
    if (QUALIFYING_ASSET_TYPES.has(a.assetType)) {
      qualifyingTotal += val;
    } else if (NON_QUALIFYING_ASSET_TYPES.has(a.assetType)) {
      nonQualifyingTotal += val;
    }
  }

  let totalCirculatingValue = 0;
  for (const token of tokens) {
    const supply = Number(token.circulatingSupply || token.totalSupply || 0);
    totalCirculatingValue += supply * Number(token.pegTarget);
  }

  const overallCoverage = totalCirculatingValue > 0 ? totalReserveValue / totalCirculatingValue : 1;

  // Reporting status
  const latestAttestation = await prisma.reserveAttestation.findFirst({
    where: { firmId, tokenId: { in: tokens.map(t => t.id) }, status: 'COMPLETED' },
    orderBy: { snapshotDate: 'desc' },
  });

  let daysSinceLastAttestation: number | null = null;
  if (latestAttestation) {
    daysSinceLastAttestation = Math.floor(
      (Date.now() - new Date(latestAttestation.snapshotDate).getTime()) / (1000 * 60 * 60 * 24)
    );
  }

  return {
    firmId,
    overallStatus: complianceResult.overallStatus,
    lastCheckAt: complianceResult.checkedAt,
    reserveSummary: {
      totalReserveValue,
      totalCirculatingValue,
      coverageRatio: Number(overallCoverage.toFixed(4)),
      qualifyingAssetsPct: totalReserveValue > 0 ? Number(((qualifyingTotal / totalReserveValue) * 100).toFixed(1)) : 0,
      nonQualifyingAssetsPct: totalReserveValue > 0 ? Number(((nonQualifyingTotal / totalReserveValue) * 100).toFixed(1)) : 0,
    },
    tokenBreakdown,
    reportingStatus: {
      latestAttestationDate: latestAttestation?.snapshotDate?.toISOString().slice(0, 10) || null,
      daysSinceLastAttestation,
      monthlyReportingCompliant: daysSinceLastAttestation !== null && daysSinceLastAttestation <= 31,
    },
    checks: complianceResult.checks,
  };
}

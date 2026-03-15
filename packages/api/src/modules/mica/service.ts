import { prisma } from '../../utils/prisma';
import { Prisma } from '@prisma/client';
import { logger } from '../../utils/logger';

// ─── MiCA Compliance Constants ──────────────────────────────────────────────

/** Minimum capital requirements by CASP class (EUR) */
const CASP_CAPITAL_REQUIREMENTS: Record<string, number> = {
  CLASS_1: 50_000,   // Reception/transmission of orders, advice
  CLASS_2: 125_000,  // Exchange, execution, placement
  CLASS_3: 150_000,  // Custody & administration of crypto-assets
};

/** ART reserve bank deposit requirement (30% min in credit institutions) */
const ART_BANK_DEPOSIT_MIN_PCT = 30;

/** EMT and ART must maintain 1:1 reserve ratio */
const REQUIRED_RESERVE_RATIO = 1.0;

// ─── Types ──────────────────────────────────────────────────────────────────

interface ComplianceCheckResult {
  category: string;
  check: string;
  status: 'PASS' | 'FAIL' | 'WARNING' | 'NOT_APPLICABLE';
  details: string;
  value?: string | number | null;
  threshold?: string | number | null;
}

interface MicaDashboard {
  firmId: string;
  regime: string;
  overallStatus: 'COMPLIANT' | 'NON_COMPLIANT' | 'NEEDS_REVIEW';
  lastCheckAt: string | null;
  prudentialRequirements: {
    minimumCapitalRequired: number | null;
    caspClass: string | null;
  };
  assetSegregation: {
    totalWallets: number;
    activeWallets: number;
    custodialWallets: number;
    segregationVerified: boolean;
  };
  reserveStatus: {
    totalTokens: number;
    tokensWithAdequateReserves: number;
    latestCoverageRatio: string | null;
  };
  whitePaperStatus: {
    documentsOnFile: number;
    upToDate: boolean;
  };
  checks: ComplianceCheckResult[];
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function determineCaspClass(firm: { regime: string }): string | null {
  switch (firm.regime) {
    case 'MICA_CUSTODY':
    case 'MICA_CASP':
      return 'CLASS_3'; // Default to highest class; could be refined per firm config
    case 'MICA_EMT':
      return null; // EMT issuers have separate prudential requirements
    default:
      return null;
  }
}

// ─── MiCA Compliance Check ──────────────────────────────────────────────────

export async function runMicaComplianceCheck(firmId: string): Promise<{
  firmId: string;
  checkedAt: string;
  overallStatus: 'COMPLIANT' | 'NON_COMPLIANT' | 'NEEDS_REVIEW';
  checks: ComplianceCheckResult[];
}> {
  const firm = await prisma.firm.findUniqueOrThrow({ where: { id: firmId } });
  const checks: ComplianceCheckResult[] = [];
  const checkedAt = new Date().toISOString();

  logger.info({ firmId }, 'Running MiCA compliance check');

  // ── 1. Prudential Requirements (Capital Adequacy) ──

  const caspClass = determineCaspClass(firm);
  if (caspClass) {
    const requiredCapital = CASP_CAPITAL_REQUIREMENTS[caspClass] || 150_000;
    // Check if firm has a governance policy document indicating capital adequacy
    const capitalDocs = await prisma.policyDocument.findMany({
      where: { firmId, documentType: 'SAFEGUARDING_POLICY' },
      orderBy: { createdAt: 'desc' },
      take: 1,
    });

    checks.push({
      category: 'PRUDENTIAL',
      check: 'Minimum capital requirement',
      status: capitalDocs.length > 0 ? 'WARNING' : 'FAIL',
      details: capitalDocs.length > 0
        ? `CASP ${caspClass} requires minimum EUR ${requiredCapital.toLocaleString()}. Policy document on file — manual verification required.`
        : `CASP ${caspClass} requires minimum EUR ${requiredCapital.toLocaleString()}. No capital adequacy documentation found.`,
      value: capitalDocs.length > 0 ? 'DOCUMENTED' : 'MISSING',
      threshold: requiredCapital,
    });
  } else {
    checks.push({
      category: 'PRUDENTIAL',
      check: 'Minimum capital requirement',
      status: 'NOT_APPLICABLE',
      details: 'Firm regime does not require CASP capital adequacy assessment.',
    });
  }

  // ── 2. Client Asset Segregation ──

  const wallets = await prisma.wallet.findMany({ where: { firmId } });
  const activeWallets = wallets.filter(w => w.status === 'ACTIVE');
  const custodialWallets = wallets.filter(w => w.walletType === 'CUSTODIAL' || w.walletType === 'OMNIBUS');

  // MiCA requires clear segregation between firm assets and client assets
  const hasCustodialWallets = custodialWallets.length > 0;
  const hasMultipleWalletTypes = new Set(wallets.map(w => w.walletType)).size > 1;

  checks.push({
    category: 'ASSET_SEGREGATION',
    check: 'Client asset segregation',
    status: hasCustodialWallets && hasMultipleWalletTypes ? 'PASS' : wallets.length === 0 ? 'NOT_APPLICABLE' : 'WARNING',
    details: hasCustodialWallets
      ? `${custodialWallets.length} custodial/omnibus wallet(s) found with clear segregation from ${wallets.length - custodialWallets.length} operational wallet(s).`
      : wallets.length === 0
        ? 'No wallets registered for this firm.'
        : 'No dedicated custodial wallets found. MiCA Art. 70 requires clear segregation of client crypto-assets.',
    value: custodialWallets.length,
  });

  // ── 3. Wallet Security (Multisig) ──

  const multisigWallets = wallets.filter(w => w.isMultisig);
  checks.push({
    category: 'ASSET_SEGREGATION',
    check: 'Wallet security controls',
    status: activeWallets.length === 0 ? 'NOT_APPLICABLE' : multisigWallets.length >= Math.ceil(activeWallets.length * 0.5) ? 'PASS' : 'WARNING',
    details: `${multisigWallets.length} of ${activeWallets.length} active wallets use multi-signature controls.`,
    value: multisigWallets.length,
    threshold: Math.ceil(activeWallets.length * 0.5),
  });

  // ── 4. White Paper Requirements ──

  const whitePaperDocs = await prisma.policyDocument.findMany({
    where: { firmId, documentType: 'SAFEGUARDING_POLICY' },
    orderBy: { createdAt: 'desc' },
    take: 5,
  });

  const recentDoc = whitePaperDocs.find(d => {
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    return d.createdAt >= sixMonthsAgo;
  });

  checks.push({
    category: 'WHITE_PAPER',
    check: 'Crypto-asset white paper',
    status: recentDoc ? 'PASS' : whitePaperDocs.length > 0 ? 'WARNING' : 'FAIL',
    details: recentDoc
      ? 'White paper / disclosure document on file and updated within the last 6 months.'
      : whitePaperDocs.length > 0
        ? 'Disclosure documents on file but may be outdated. MiCA requires ongoing updates.'
        : 'No crypto-asset white paper / disclosure documentation found. Required under MiCA Art. 6.',
    value: whitePaperDocs.length,
  });

  // ── 5. Governance & Risk Management ──

  const riskControls = await prisma.riskControl.count({ where: { firmId } });
  const responsibilityAssignments = await prisma.responsibilityAssignment.count({ where: { firmId } });

  checks.push({
    category: 'GOVERNANCE',
    check: 'Risk management framework',
    status: riskControls > 0 ? 'PASS' : 'FAIL',
    details: riskControls > 0
      ? `${riskControls} risk control(s) documented. MiCA Art. 62 governance requirements addressed.`
      : 'No risk controls documented. MiCA Art. 62 requires CASPs to have sound governance arrangements.',
    value: riskControls,
  });

  checks.push({
    category: 'GOVERNANCE',
    check: 'Responsibility assignments',
    status: responsibilityAssignments > 0 ? 'PASS' : 'WARNING',
    details: responsibilityAssignments > 0
      ? `${responsibilityAssignments} responsibility assignment(s) on record.`
      : 'No responsibility assignments found. MiCA requires clear allocation of responsibilities.',
    value: responsibilityAssignments,
  });

  // ── 6. Reconciliation Checks ──

  const latestRecon = await prisma.reconciliationRun.findFirst({
    where: { firmId },
    orderBy: { reconciliationDate: 'desc' },
  });

  if (latestRecon) {
    const daysSinceRecon = Math.floor(
      (Date.now() - new Date(latestRecon.reconciliationDate).getTime()) / (1000 * 60 * 60 * 24)
    );
    checks.push({
      category: 'RECONCILIATION',
      check: 'Regular reconciliation',
      status: daysSinceRecon <= 1 ? 'PASS' : daysSinceRecon <= 7 ? 'WARNING' : 'FAIL',
      details: `Last reconciliation ${daysSinceRecon} day(s) ago on ${latestRecon.reconciliationDate.toISOString().slice(0, 10)}.`,
      value: daysSinceRecon,
      threshold: 1,
    });
  } else {
    checks.push({
      category: 'RECONCILIATION',
      check: 'Regular reconciliation',
      status: 'FAIL',
      details: 'No reconciliation runs found. MiCA requires regular reconciliation of client assets.',
    });
  }

  // ── Determine overall status ──

  const hasFailures = checks.some(c => c.status === 'FAIL');
  const hasWarnings = checks.some(c => c.status === 'WARNING');
  const overallStatus = hasFailures ? 'NON_COMPLIANT' : hasWarnings ? 'NEEDS_REVIEW' : 'COMPLIANT';

  logger.info({ firmId, overallStatus, checksCount: checks.length }, 'MiCA compliance check completed');

  return { firmId, checkedAt, overallStatus, checks };
}

// ─── MiCA Reserve Requirements ──────────────────────────────────────────────

export async function checkReserveRequirements(firmId: string): Promise<{
  firmId: string;
  checkedAt: string;
  tokens: Array<{
    tokenId: string;
    symbol: string;
    regime: string;
    totalReserveValue: number;
    totalCirculatingValue: number;
    coverageRatio: number;
    reserveComposition: Array<{ assetType: string; value: number; pct: number }>;
    bankDepositPct: number;
    checks: ComplianceCheckResult[];
  }>;
}> {
  const tokens = await prisma.stablecoinToken.findMany({
    where: { firmId, regime: { in: ['MICA'] } },
  });

  logger.info({ firmId, tokenCount: tokens.length }, 'Checking MiCA reserve requirements');

  const tokenResults = await Promise.all(tokens.map(async (token) => {
    const checks: ComplianceCheckResult[] = [];

    // Get active reserve assets
    const assets = await prisma.reserveAsset.findMany({
      where: { firmId, tokenId: token.id, status: 'ACTIVE' },
    });

    // Calculate reserve composition
    const compositionMap: Record<string, number> = {};
    let totalReserveValue = 0;
    for (const a of assets) {
      const val = Number(a.marketValue || a.faceValue);
      compositionMap[a.assetType] = (compositionMap[a.assetType] || 0) + val;
      totalReserveValue += val;
    }

    const reserveComposition = Object.entries(compositionMap).map(([assetType, value]) => ({
      assetType,
      value,
      pct: totalReserveValue > 0 ? (value / totalReserveValue) * 100 : 0,
    }));

    // Calculate circulating value
    const circulatingSupply = Number(token.circulatingSupply || token.totalSupply || 0);
    const pegTarget = Number(token.pegTarget);
    const totalCirculatingValue = circulatingSupply * pegTarget;
    const coverageRatio = totalCirculatingValue > 0 ? totalReserveValue / totalCirculatingValue : 1;

    // Check 1: Reserve ratio (1:1)
    checks.push({
      category: 'RESERVE_RATIO',
      check: 'Minimum 1:1 reserve backing',
      status: coverageRatio >= REQUIRED_RESERVE_RATIO ? 'PASS' : 'FAIL',
      details: coverageRatio >= REQUIRED_RESERVE_RATIO
        ? `Reserve coverage ratio is ${(coverageRatio * 100).toFixed(2)}%, meeting the 100% minimum.`
        : `Reserve coverage ratio is ${(coverageRatio * 100).toFixed(2)}%, below the required 100% minimum.`,
      value: Number((coverageRatio * 100).toFixed(2)),
      threshold: 100,
    });

    // Check 2: Bank deposit requirement for ARTs (30% minimum)
    const cashValue = compositionMap['CASH'] || 0;
    const bankDepositPct = totalReserveValue > 0 ? (cashValue / totalReserveValue) * 100 : 0;

    // Determine if this is an ART (asset-referenced token) — heuristic: non-EUR/USD peg or multiple backing assets
    const isArt = token.pegCurrency !== 'EUR' && token.pegCurrency !== 'USD';
    if (isArt) {
      checks.push({
        category: 'RESERVE_COMPOSITION',
        check: 'ART bank deposit minimum (30%)',
        status: bankDepositPct >= ART_BANK_DEPOSIT_MIN_PCT ? 'PASS' : 'FAIL',
        details: `${bankDepositPct.toFixed(1)}% of reserves held as cash in credit institutions (minimum ${ART_BANK_DEPOSIT_MIN_PCT}% required for ARTs under MiCA Art. 38).`,
        value: Number(bankDepositPct.toFixed(1)),
        threshold: ART_BANK_DEPOSIT_MIN_PCT,
      });
    }

    // Check 3: No crypto-backed reserves for EMTs
    const cryptoCollateralValue = compositionMap['CRYPTO_COLLATERAL'] || 0;
    if (cryptoCollateralValue > 0) {
      checks.push({
        category: 'RESERVE_COMPOSITION',
        check: 'No crypto collateral in reserves',
        status: 'FAIL',
        details: `EUR ${cryptoCollateralValue.toLocaleString()} in crypto collateral found in reserves. MiCA prohibits crypto-backed reserves for regulated tokens.`,
        value: cryptoCollateralValue,
        threshold: 0,
      });
    } else {
      checks.push({
        category: 'RESERVE_COMPOSITION',
        check: 'No crypto collateral in reserves',
        status: 'PASS',
        details: 'No crypto collateral found in reserves. Compliant with MiCA reserve composition rules.',
      });
    }

    // Check 4: Redemption rights — verify there is an active attestation
    const latestAttestation = await prisma.reserveAttestation.findFirst({
      where: { firmId, tokenId: token.id, status: 'COMPLETED' },
      orderBy: { snapshotDate: 'desc' },
    });

    if (latestAttestation) {
      const daysSinceAttestation = Math.floor(
        (Date.now() - new Date(latestAttestation.snapshotDate).getTime()) / (1000 * 60 * 60 * 24)
      );
      checks.push({
        category: 'REDEMPTION',
        check: 'Redemption right verification',
        status: daysSinceAttestation <= 30 ? 'PASS' : 'WARNING',
        details: `Latest reserve attestation is ${daysSinceAttestation} day(s) old. MiCA requires holders to have redemption rights at any time.`,
        value: daysSinceAttestation,
        threshold: 30,
      });
    } else {
      checks.push({
        category: 'REDEMPTION',
        check: 'Redemption right verification',
        status: 'FAIL',
        details: 'No completed reserve attestation found. Cannot verify redemption at par capability.',
      });
    }

    return {
      tokenId: token.id,
      symbol: token.symbol,
      regime: token.regime,
      totalReserveValue,
      totalCirculatingValue,
      coverageRatio,
      reserveComposition,
      bankDepositPct,
      checks,
    };
  }));

  return { firmId, checkedAt: new Date().toISOString(), tokens: tokenResults };
}

// ─── MiCA Dashboard ─────────────────────────────────────────────────────────

export async function getMicaDashboard(firmId: string): Promise<MicaDashboard> {
  const firm = await prisma.firm.findUniqueOrThrow({ where: { id: firmId } });

  // Run compliance check to get current status
  const complianceResult = await runMicaComplianceCheck(firmId);

  // Get asset segregation info
  const [totalWallets, activeWallets, custodialWallets] = await Promise.all([
    prisma.wallet.count({ where: { firmId } }),
    prisma.wallet.count({ where: { firmId, status: 'ACTIVE' } }),
    prisma.wallet.count({ where: { firmId, walletType: { in: ['CUSTODIAL', 'OMNIBUS'] } } }),
  ]);

  // Get reserve status
  const micaTokens = await prisma.stablecoinToken.count({ where: { firmId, regime: 'MICA' } });
  const latestAttestation = await prisma.reserveAttestation.findFirst({
    where: { firmId },
    orderBy: { snapshotDate: 'desc' },
  });

  // Count tokens with adequate reserves (coverage >= 1.0)
  const attestations = await prisma.reserveAttestation.findMany({
    where: { firmId, status: 'COMPLETED' },
    orderBy: { snapshotDate: 'desc' },
    distinct: ['tokenId'],
  });
  const tokensWithAdequateReserves = attestations.filter(a => Number(a.coverageRatio) >= 1.0).length;

  // White paper status
  const policyDocs = await prisma.policyDocument.count({ where: { firmId } });
  const recentPolicyDocs = await prisma.policyDocument.count({
    where: {
      firmId,
      createdAt: { gte: new Date(Date.now() - 6 * 30 * 24 * 60 * 60 * 1000) },
    },
  });

  const caspClass = determineCaspClass(firm);

  return {
    firmId,
    regime: firm.regime,
    overallStatus: complianceResult.overallStatus,
    lastCheckAt: complianceResult.checkedAt,
    prudentialRequirements: {
      minimumCapitalRequired: caspClass ? (CASP_CAPITAL_REQUIREMENTS[caspClass] || null) : null,
      caspClass,
    },
    assetSegregation: {
      totalWallets,
      activeWallets,
      custodialWallets,
      segregationVerified: custodialWallets > 0 && activeWallets > custodialWallets,
    },
    reserveStatus: {
      totalTokens: micaTokens,
      tokensWithAdequateReserves,
      latestCoverageRatio: latestAttestation?.coverageRatio?.toString() || null,
    },
    whitePaperStatus: {
      documentsOnFile: policyDocs,
      upToDate: recentPolicyDocs > 0,
    },
    checks: complianceResult.checks,
  };
}

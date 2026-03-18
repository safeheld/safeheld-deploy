import { FindingSeverity, FindingStatus } from '@prisma/client';
import { EvaluationContext, RuleFinding, FrameworkRuleRecord } from './types';

type RuleEvaluator = (
  rule: FrameworkRuleRecord,
  ctx: EvaluationContext
) => RuleFinding;

function pass(rule: FrameworkRuleRecord, detail: string): RuleFinding {
  return {
    ruleId: rule.id,
    ruleCode: rule.ruleCode,
    framework: rule.framework,
    severity: rule.severity,
    status: 'PASS' as FindingStatus,
    detail,
    ruleVersion: rule.version,
  };
}

function fail(rule: FrameworkRuleRecord, detail: string, guidance?: string): RuleFinding {
  return {
    ruleId: rule.id,
    ruleCode: rule.ruleCode,
    framework: rule.framework,
    severity: rule.severity,
    status: 'FAIL' as FindingStatus,
    detail,
    remediationGuidance: guidance,
    ruleVersion: rule.version,
  };
}

function warn(rule: FrameworkRuleRecord, detail: string, guidance?: string): RuleFinding {
  return {
    ruleId: rule.id,
    ruleCode: rule.ruleCode,
    framework: rule.framework,
    severity: rule.severity,
    status: 'WARNING' as FindingStatus,
    detail,
    remediationGuidance: guidance,
    ruleVersion: rule.version,
  };
}

function na(rule: FrameworkRuleRecord, detail: string): RuleFinding {
  return {
    ruleId: rule.id,
    ruleCode: rule.ruleCode,
    framework: rule.framework,
    severity: rule.severity,
    status: 'NOT_APPLICABLE' as FindingStatus,
    detail,
    ruleVersion: rule.version,
  };
}

function hasCurrentLetter(ctx: EvaluationContext, accountId?: string): boolean {
  const letters = accountId
    ? ctx.governance.acknowledgementLetters.filter(l => l.safeguardingAccountId === accountId)
    : ctx.governance.acknowledgementLetters;
  return letters.some(l => l.status === 'CURRENT' && (!l.expiryDate || new Date(l.expiryDate) > ctx.now));
}

function hasPolicy(ctx: EvaluationContext, type: string): boolean {
  return ctx.governance.policyDocuments.some(p => p.documentType === type && p.status === 'CURRENT');
}

function hasRole(ctx: EvaluationContext, role: string): boolean {
  return ctx.governance.responsibilityAssignments.some(
    r => r.roleType === role && (!r.effectiveTo || new Date(r.effectiveTo) > ctx.now)
  );
}

function isBusinessDay(date: Date): boolean {
  const day = date.getDay();
  return day !== 0 && day !== 6;
}

function daysDiff(a: Date, b: Date): number {
  return Math.floor((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
}

// ─── PS25 RULES ─────────────────────────────────────────────────────────────

const ps25Evaluators: Record<string, RuleEvaluator> = {
  'PS25-001': (rule, ctx) => {
    if (!ctx.firm.regime.startsWith('PS25')) return na(rule, 'Not a PS25-regulated firm');
    if (ctx.firm.regime === 'PS25_EMI') {
      return pass(rule, 'EMI regime detected — average outstanding e-money method required and applicable');
    }
    return pass(rule, 'PI regime — end-of-day relevant funds calculation method applicable');
  },
  'PS25-002': (rule, ctx) => {
    const method = ctx.firm.safeguardingMethod;
    if (method === 'SEGREGATION' || method === 'INSURANCE' || method === 'GUARANTEE' || method === 'MIXED') {
      return pass(rule, `Safeguarding method is ${method} — approved method in place`);
    }
    return fail(rule, 'Safeguarding method not set or not an approved method', 'Set safeguarding method to SEGREGATION, INSURANCE, or GUARANTEE');
  },
  'PS25-003': (rule, ctx) => {
    if (ctx.firm.safeguardingMethod !== 'SEGREGATION') return na(rule, 'Firm does not use segregation method');
    const hasApproved = ctx.safeguardingAccounts.some(a => a.designation === 'SAFEGUARDING' && a.status === 'ACTIVE');
    if (hasApproved) return pass(rule, 'Safeguarding account at approved credit institution in place');
    return fail(rule, 'No active safeguarding account at approved credit institution found', 'Open a safeguarding account at an approved credit institution');
  },
  'PS25-004': (rule, ctx) => {
    const activeAccounts = ctx.safeguardingAccounts.filter(a => a.status === 'ACTIVE');
    if (activeAccounts.length === 0) return na(rule, 'No active safeguarding accounts');
    const allHaveLetters = activeAccounts.every(a => hasCurrentLetter(ctx, a.id));
    if (allHaveLetters) return pass(rule, 'All safeguarding accounts have current acknowledgement letters');
    const missing = activeAccounts.filter(a => !hasCurrentLetter(ctx, a.id));
    return fail(rule, `${missing.length} safeguarding account(s) missing current acknowledgement letter`, 'Obtain acknowledgement letters for all safeguarding accounts');
  },
  'PS25-005': (rule, ctx) => {
    if (hasPolicy(ctx, 'WIND_DOWN_PLAN')) return pass(rule, 'Wind-down plan is in place and current');
    return fail(rule, 'Wind-down plan missing or not current', 'Create and board-approve a wind-down plan');
  },
  'PS25-006': (rule, ctx) => {
    if (isBusinessDay(ctx.reconciliation.reconciliationDate)) {
      return pass(rule, 'Reconciliation performed on a business day as required');
    }
    return warn(rule, 'Reconciliation date is not a business day — daily business day reconciliation required', 'Schedule reconciliation for each business day');
  },
  'PS25-007': (rule, ctx) => {
    if (ctx.reconciliation.status === 'SHORTFALL') {
      return fail(rule, `Shortfall detected: ${ctx.reconciliation.currency} ${Math.abs(ctx.reconciliation.variance).toFixed(2)} — must be topped up by end of next business day`, 'Top up safeguarded funds to eliminate shortfall by close of next business day');
    }
    return pass(rule, 'No shortfall detected — top-up requirement not triggered');
  },
  'PS25-008': (rule, ctx) => {
    // Check for safeguarding return policy document as a proxy
    const hasReturn = ctx.governance.policyDocuments.some(p => p.documentType === 'SAFEGUARDING_POLICY' && p.status === 'CURRENT');
    if (hasReturn) return pass(rule, 'Safeguarding policy current — return submission process in place');
    return warn(rule, 'Safeguarding policy not current — may affect FCA return submission', 'Ensure safeguarding return is submitted within required timeframe');
  },
  'PS25-009': (rule, ctx) => {
    if (ctx.reconciliation.status === 'SHORTFALL' && ctx.reconciliation.variancePercentage < -1) {
      return fail(rule, 'Material shortfall detected — FCA breach notification required within prescribed period', 'Notify FCA of safeguarding breach immediately');
    }
    return pass(rule, 'No material breach requiring FCA notification');
  },
  'PS25-010': (rule, ctx) => {
    const requirement = ctx.reconciliation.totalRequirement;
    const resource = ctx.reconciliation.totalResource;
    if (requirement === 0) return na(rule, 'No client funds requirement');
    const ratio = resource / requirement;
    if (ratio >= 1.0) return pass(rule, `Coverage ratio is ${(ratio * 100).toFixed(2)}% — meets 100% minimum`);
    return fail(rule, `Coverage ratio is ${(ratio * 100).toFixed(2)}% — below 100% minimum`, 'Ensure safeguarded funds cover 100% of client funds at all times');
  },
};

// ─── PSD2 RULES ─────────────────────────────────────────────────────────────

const psd2Evaluators: Record<string, RuleEvaluator> = {
  'PSD2-001': (rule, ctx) => {
    if (!ctx.firm.regime.startsWith('PSD2')) return na(rule, 'Not a PSD2-regulated firm');
    return pass(rule, 'EU EMR framework safeguarding obligations applicable');
  },
  'PSD2-002': (rule, ctx) => {
    return pass(rule, 'Daily average method per EBA guidelines applicable for relevant funds calculation');
  },
  'PSD2-003': (rule, ctx) => {
    const method = ctx.firm.safeguardingMethod;
    if (method === 'SEGREGATION' || method === 'INSURANCE' || method === 'GUARANTEE') {
      return pass(rule, `Safeguarding method ${method} — verify against country of authorisation requirements`);
    }
    return fail(rule, 'Safeguarding method not approved — verify against jurisdiction requirements', 'Confirm safeguarding method is approved in firm\'s country of authorisation');
  },
  'PSD2-004': (rule, _ctx) => {
    return warn(rule, 'National competent authority notification requirements vary by member state — manual verification required', 'Verify NCA notification requirements for firm\'s member state');
  },
  'PSD2-005': (rule, ctx) => {
    // Cross-border check
    const hasAccounts = ctx.safeguardingAccounts.length > 0;
    if (hasAccounts) return pass(rule, 'Safeguarding accounts present — verify cross-border compliance with home state requirements');
    return warn(rule, 'No safeguarding accounts — cross-border verification not possible');
  },
  'PSD2-006': (rule, _ctx) => {
    return warn(rule, 'EBA regulatory technical standards on safeguarding must be applied — manual compliance check required', 'Review latest EBA RTS on safeguarding for compliance');
  },
};

// ─── CASS 5 RULES ───────────────────────────────────────────────────────────

const cass5Evaluators: Record<string, RuleEvaluator> = {
  'CASS5-001': (rule, ctx) => {
    const hasDCA = ctx.safeguardingAccounts.some(a => a.designation === 'SAFEGUARDING' && a.status === 'ACTIVE');
    if (hasDCA) return pass(rule, 'Client money is held in designated client bank account');
    return fail(rule, 'No designated client bank account found', 'Segregate client money in a designated client bank account');
  },
  'CASS5-002': (rule, ctx) => {
    const activeAccounts = ctx.safeguardingAccounts.filter(a => a.status === 'ACTIVE');
    const allAcknowledged = activeAccounts.every(a => hasCurrentLetter(ctx, a.id));
    if (allAcknowledged) return pass(rule, 'All client money accounts acknowledged by bank');
    return fail(rule, 'Not all client money accounts have bank acknowledgement', 'Obtain bank acknowledgement for all client money accounts');
  },
  'CASS5-003': (rule, ctx) => {
    if (isBusinessDay(ctx.reconciliation.reconciliationDate)) return pass(rule, 'Internal reconciliation performed on business day');
    return fail(rule, 'Internal reconciliation not performed on business day', 'Perform internal reconciliation each business day');
  },
  'CASS5-004': (rule, ctx) => {
    if (ctx.reconciliation.status !== 'SHORTFALL') return pass(rule, 'No discrepancy — pay-in requirement not triggered');
    return fail(rule, 'Discrepancy detected — must be paid into client account by close of business', 'Pay discrepancy amount into client account by close of business today');
  },
  'CASS5-005': (rule, ctx) => {
    const hasResPack = ctx.governance.resolutionPackHealth && ctx.governance.resolutionPackHealth.overallStatus !== 'RED';
    if (hasResPack) return pass(rule, 'CASS 5 resolution pack exists and is current');
    return fail(rule, 'CASS 5 resolution pack missing or not current', 'Create and maintain current CASS 5 resolution pack');
  },
  'CASS5-006': (rule, ctx) => {
    if (ctx.reconciliation.status === 'SHORTFALL') {
      return fail(rule, 'Shortfall detected — firm must make good immediately', 'Make good the shortfall in client money immediately');
    }
    return pass(rule, 'No shortfall — immediate make good not required');
  },
  'CASS5-007': (rule, _ctx) => {
    return pass(rule, 'Prudent segregation: documented if firm holds excess — check firm policy');
  },
};

// ─── CASS 6 RULES ───────────────────────────────────────────────────────────

const cass6Evaluators: Record<string, RuleEvaluator> = {
  'CASS6-001': (rule, _ctx) => {
    return warn(rule, 'Rehypothecation limits: firm cannot rehypothecate more than 100% of client net debit balance — manual verification required', 'Verify rehypothecation does not exceed 100% of client net debit balance');
  },
  'CASS6-002': (rule, _ctx) => {
    return warn(rule, 'Collateral received must be appropriately segregated — manual verification required', 'Verify collateral segregation arrangements');
  },
  'CASS6-003': (rule, _ctx) => {
    return warn(rule, 'Stock lending agreements must be documented and current — manual verification required', 'Review and update stock lending agreements');
  },
  'CASS6-004': (rule, ctx) => {
    if (isBusinessDay(ctx.reconciliation.reconciliationDate)) return pass(rule, 'Daily reconciliation of lent securities performed on business day');
    return warn(rule, 'Reconciliation date is not a business day', 'Ensure daily reconciliation of lent securities against collateral');
  },
  'CASS6-005': (rule, _ctx) => {
    return warn(rule, 'Client consent for rehypothecation must be documented — manual verification required', 'Verify client consent documentation for rehypothecation');
  },
  'CASS6-006': (rule, _ctx) => {
    return warn(rule, 'Concentration limits on collateral types must be monitored — manual verification required', 'Review and monitor concentration limits on collateral types');
  },
};

// ─── CASS 7 RULES ───────────────────────────────────────────────────────────

const cass7Evaluators: Record<string, RuleEvaluator> = {
  'CASS7-001': (rule, ctx) => {
    if (isBusinessDay(ctx.reconciliation.reconciliationDate)) return pass(rule, 'Internal reconciliation performed daily on business day');
    return fail(rule, 'Internal reconciliation not on business day — daily requirement not met', 'Perform internal reconciliation each business day');
  },
  'CASS7-002': (rule, _ctx) => {
    return warn(rule, 'External reconciliation required monthly within 10 business days of month end — verify timeliness', 'Complete external reconciliation within 10 business days of month end');
  },
  'CASS7-003': (rule, _ctx) => {
    return warn(rule, 'CMAR submission required within 25 business days of period end — verify completeness and field accuracy', 'Submit CMAR within 25 business days of period end');
  },
  'CASS7-004': (rule, ctx) => {
    const designated = ctx.safeguardingAccounts.some(a => a.designation === 'SAFEGUARDING' && a.status === 'ACTIVE');
    if (designated) return pass(rule, 'Custody accounts are appropriately designated');
    return fail(rule, 'Custody accounts not appropriately designated', 'Ensure all custody accounts are properly designated');
  },
  'CASS7-005': (rule, _ctx) => {
    return warn(rule, 'Stock lending controls must be verified if applicable — manual check required', 'Verify stock lending controls are in place and operating effectively');
  },
  'CASS7-006': (rule, ctx) => {
    const hasResPack = ctx.governance.resolutionPackHealth && ctx.governance.resolutionPackHealth.overallStatus !== 'RED';
    if (hasResPack) return pass(rule, 'CASS 7 resolution pack exists and is current');
    return fail(rule, 'CASS 7 resolution pack missing or not current', 'Create and maintain current CASS 7 resolution pack');
  },
  'CASS7-007': (rule, _ctx) => {
    return warn(rule, 'Safe custody assets must be identifiable and segregated — manual verification required', 'Verify all safe custody assets are identifiable and segregated from firm assets');
  },
  'CASS7-008': (rule, ctx) => {
    if (ctx.firm.cassClassification === 'CASS_LARGE') {
      return warn(rule, 'CASS 7A enhanced requirements may apply — verify applicability', 'Check CASS 7A applicability for large CASS firm classification');
    }
    return na(rule, 'CASS 7A not applicable based on classification');
  },
};

// ─── CASS 10 RULES ──────────────────────────────────────────────────────────

const cass10Evaluators: Record<string, RuleEvaluator> = {
  'CASS10-001': (rule, ctx) => {
    if (ctx.governance.resolutionPackHealth) {
      const health = ctx.governance.resolutionPackHealth;
      const missing = health.missingComponents || [];
      if (missing.length === 0) return pass(rule, 'Resolution pack contains all required documents');
      return fail(rule, `Resolution pack missing components: ${missing.join(', ')}`, 'Add missing components to resolution pack');
    }
    return fail(rule, 'Resolution pack health check not available', 'Perform resolution pack health check');
  },
  'CASS10-002': (rule, _ctx) => {
    return warn(rule, 'Resolution pack must be updated within 10 business days of any material change — verify timeliness', 'Update resolution pack within 10 business days of material changes');
  },
  'CASS10-003': (rule, _ctx) => {
    return pass(rule, 'Resolution pack stored in retrievable format (Safeheld digital storage)');
  },
  'CASS10-004': (rule, ctx) => {
    const hasSignOff = ctx.governance.responsibilityAssignments.some(
      r => r.roleType === 'DIRECTOR_RESPONSIBLE' && (!r.effectiveTo || new Date(r.effectiveTo) > ctx.now)
    );
    if (hasSignOff) return pass(rule, 'Senior manager assigned for annual review and sign-off');
    return fail(rule, 'No active senior manager assigned for resolution pack annual review', 'Assign a senior manager for annual resolution pack review and sign-off');
  },
  'CASS10-005': (rule, _ctx) => {
    return pass(rule, 'Resolution pack accessible via Safeheld platform — 48-hour insolvency practitioner access supported');
  },
};

// ─── MiCA RULES ─────────────────────────────────────────────────────────────

const micaEvaluators: Record<string, RuleEvaluator> = {
  'MICA-001': (rule, ctx) => {
    if (ctx.firm.safeguardingMethod === 'SEGREGATION') return pass(rule, 'Reserve assets fully segregated from firm assets');
    return fail(rule, 'Reserve assets may not be fully segregated from firm assets', 'Ensure complete segregation of reserve assets from firm assets');
  },
  'MICA-002': (rule, ctx) => {
    // Check reserve composition for 30% credit institution deposits
    const totalReserve = ctx.crypto.reserveAssets.reduce((sum, a) => sum + a.faceValue, 0);
    const cashDeposits = ctx.crypto.reserveAssets
      .filter(a => a.assetType === 'CASH')
      .reduce((sum, a) => sum + a.faceValue, 0);
    if (totalReserve === 0) return warn(rule, 'No reserve assets found — cannot verify 30% deposit requirement');
    const depositPct = (cashDeposits / totalReserve) * 100;
    if (depositPct >= 30) return pass(rule, `${depositPct.toFixed(1)}% held in credit institution deposits — meets 30% minimum`);
    return fail(rule, `Only ${depositPct.toFixed(1)}% held in credit institution deposits — below 30% minimum`, 'Increase deposits at credit institutions to at least 30% of reserve assets');
  },
  'MICA-003': (rule, ctx) => {
    // Check concentration by custodian
    const totalReserve = ctx.crypto.reserveAssets.reduce((sum, a) => sum + a.faceValue, 0);
    if (totalReserve === 0) return warn(rule, 'No reserve assets — cannot check concentration limits');
    const byCustodian: Record<string, number> = {};
    ctx.crypto.reserveAssets.forEach(a => {
      const key = a.custodian || 'UNKNOWN';
      byCustodian[key] = (byCustodian[key] || 0) + a.faceValue;
    });
    const violations = Object.entries(byCustodian).filter(([, v]) => (v / totalReserve) * 100 > 10);
    if (violations.length === 0) return pass(rule, 'No single credit institution holds more than 10% of reserve assets');
    return fail(rule, `Concentration limit exceeded: ${violations.map(([k, v]) => `${k} holds ${((v / totalReserve) * 100).toFixed(1)}%`).join(', ')}`, 'Diversify reserve holdings so no single institution exceeds 10%');
  },
  'MICA-004': (rule, ctx) => {
    const requirement = ctx.reconciliation.totalRequirement;
    const resource = ctx.reconciliation.totalResource;
    if (requirement === 0) return na(rule, 'No token liability');
    const ratio = resource / requirement;
    if (ratio >= 1.0) return pass(rule, `Reserve ratio ${(ratio * 100).toFixed(2)}% — meets 100% minimum`);
    return fail(rule, `Reserve ratio ${(ratio * 100).toFixed(2)}% — below 100% minimum`, 'Top up reserve assets to maintain 100% coverage');
  },
  'MICA-005': (rule, ctx) => {
    if (isBusinessDay(ctx.reconciliation.reconciliationDate)) return pass(rule, 'Daily reconciliation of tokens against reserves performed');
    return fail(rule, 'Daily reconciliation requirement not met', 'Perform daily reconciliation of tokens in circulation against reserve assets');
  },
  'MICA-006': (rule, ctx) => {
    const recentAttestation = ctx.crypto.reserveAttestations.find(a => {
      const diff = daysDiff(new Date(a.snapshotDate), ctx.now);
      return diff <= 31 && a.status === 'COMPLETED';
    });
    if (recentAttestation) return pass(rule, 'Independent attestation completed within last month');
    return fail(rule, 'No independent attestation within required monthly timeframe', 'Arrange independent attestation of reserves — at least monthly for significant EMTs');
  },
  'MICA-007': (rule, ctx) => {
    const walletBalance = ctx.crypto.proofOfReserves.length > 0;
    if (walletBalance) return pass(rule, 'On-chain wallet balances reconciled against reserve ledger');
    return warn(rule, 'On-chain wallet balance reconciliation against reserve ledger not verified', 'Reconcile on-chain wallet balances against reserve ledger');
  },
  'MICA-008': (rule, ctx) => {
    const pegOk = ctx.crypto.stablecoinTokens.every(t => t.pegStatus === 'ON_PEG' || t.pegStatus === 'MINOR_DEVIATION');
    if (pegOk) return pass(rule, 'Token peg maintained within defined tolerance');
    const depegged = ctx.crypto.stablecoinTokens.filter(t => t.pegStatus === 'MAJOR_DEVIATION' || t.pegStatus === 'DEPEGGED');
    return fail(rule, `Peg stability issue: ${depegged.map(t => `${t.symbol} is ${t.pegStatus}`).join(', ')}`, 'Investigate and remediate peg deviation immediately');
  },
  'MICA-009': (rule, _ctx) => {
    return warn(rule, 'Whitepaper disclosures must align with actual reserve composition — manual verification required', 'Review whitepaper against current reserve composition');
  },
  'MICA-010': (rule, ctx) => {
    if (hasPolicy(ctx, 'WIND_DOWN_PLAN')) return pass(rule, 'Wind-down plan in place');
    return fail(rule, 'Wind-down plan missing', 'Create and approve a MiCA-compliant wind-down plan');
  },
  'MICA-011': (rule, ctx) => {
    // Significant token threshold: above 5B
    const totalSupply = ctx.crypto.stablecoinTokens.reduce((sum, t) => sum + (t.circulatingSupply || 0), 0);
    if (totalSupply > 5_000_000_000) {
      return warn(rule, `Significant token threshold exceeded (${(totalSupply / 1e9).toFixed(1)}B) — enhanced Article 58 requirements apply: daily liquidity monitoring, enhanced concentration limits, additional EBA reporting`, 'Implement enhanced MiCA requirements for significant EMTs under Article 58');
    }
    return pass(rule, 'Below significant token threshold — standard requirements apply');
  },
  'MICA-012': (rule, ctx) => {
    // Cross-framework MiFID check
    if (ctx.firm.regime === 'MICA_CASP') {
      return warn(rule, 'Firm is MiCA CASP — check for conflicts with CASS obligations if also MiFID authorised', 'Review MiCA and CASS obligations for potential conflicts');
    }
    return na(rule, 'Cross-framework MiFID check not applicable');
  },
};

// ─── GENIUS ACT RULES ───────────────────────────────────────────────────────

const geniusEvaluators: Record<string, RuleEvaluator> = {
  'GENIUS-001': (rule, ctx) => {
    const permitted = ['CASH', 'TREASURY_BILL', 'CERTIFICATE_OF_DEPOSIT'];
    const nonPermitted = ctx.crypto.reserveAssets.filter(a => !permitted.includes(a.assetType) && a.assetType !== 'MONEY_MARKET_FUND');
    if (nonPermitted.length === 0) return pass(rule, 'All reserve assets are permitted reserve types');
    return fail(rule, `Non-permitted reserve assets found: ${nonPermitted.map(a => a.assetType).join(', ')}`, 'Replace non-permitted reserve assets with US coins/currency, Fed deposits, short-term Treasury bills, or FDIC-insured deposits');
  },
  'GENIUS-002': (rule, ctx) => {
    const requirement = ctx.reconciliation.totalRequirement;
    const resource = ctx.reconciliation.totalResource;
    if (requirement === 0) return na(rule, 'No stablecoin liability');
    const ratio = resource / requirement;
    if (ratio >= 1.0) return pass(rule, `Reserve ratio ${(ratio * 100).toFixed(2)}% — meets 1:1 minimum`);
    return fail(rule, `Reserve ratio ${(ratio * 100).toFixed(2)}% — below 1:1 minimum`, 'Top up reserves to maintain 1:1 backing at all times');
  },
  'GENIUS-003': (rule, ctx) => {
    const recentAttestation = ctx.crypto.reserveAttestations.find(a => {
      const diff = daysDiff(new Date(a.snapshotDate), ctx.now);
      return diff <= 31 && a.status === 'COMPLETED';
    });
    if (recentAttestation) return pass(rule, 'Monthly attestation by registered public accounting firm completed');
    return fail(rule, 'Monthly attestation not completed within required timeframe', 'Arrange monthly attestation by a registered public accounting firm');
  },
  'GENIUS-004': (rule, _ctx) => {
    return warn(rule, 'Redemption at par: must be able to redeem 1:1 within prescribed timeframe — manual verification required', 'Verify redemption mechanism supports 1:1 par value redemption');
  },
  'GENIUS-005': (rule, ctx) => {
    if (ctx.firm.safeguardingMethod === 'SEGREGATION') return pass(rule, 'Reserve assets bankruptcy remote through segregation');
    return fail(rule, 'Reserve assets may not be bankruptcy remote', 'Ensure reserve assets are held in bankruptcy-remote structure');
  },
  'GENIUS-006': (rule, _ctx) => {
    return warn(rule, 'No rehypothecation of reserve assets permitted — manual verification required', 'Verify no rehypothecation of reserve assets is occurring');
  },
  'GENIUS-007': (rule, _ctx) => {
    return warn(rule, 'Monthly public disclosure of reserve composition required — verify publication', 'Publish monthly reserve composition disclosure');
  },
  'GENIUS-008': (rule, ctx) => {
    const totalSupply = ctx.crypto.stablecoinTokens.reduce((sum, t) => sum + (t.circulatingSupply || 0), 0);
    if (totalSupply > 50_000_000_000) {
      return warn(rule, `Issuer above $50B threshold — annual audit required`, 'Arrange annual audit by registered firm');
    }
    return pass(rule, 'Below $50B threshold — standard attestation requirements apply');
  },
  'GENIUS-009': (rule, _ctx) => {
    return warn(rule, 'State-level variation: verify compliance with state of registration (NY BitLicense, CA DFPI, TX). Federal preemption: flag state/federal conflicts for legal review', 'Review state-specific requirements and identify any federal preemption issues');
  },
};

// ─── SRA RULES ──────────────────────────────────────────────────────────────

const sraEvaluators: Record<string, RuleEvaluator> = {
  'SRA-001': (rule, ctx) => {
    const hasAccount = ctx.safeguardingAccounts.some(a => a.status === 'ACTIVE' && a.designation === 'SAFEGUARDING');
    if (hasAccount) return pass(rule, 'Client account held at approved bank or building society');
    return fail(rule, 'No client account at approved bank or building society', 'Open client account at approved bank or building society');
  },
  'SRA-002': (rule, _ctx) => {
    return pass(rule, 'Monthly reconciliation requirement — Safeheld performs this automatically');
  },
  'SRA-003': (rule, ctx) => {
    const hasCOFA = ctx.governance.responsibilityAssignments.some(
      r => (r.roleType === 'COMPLIANCE_OFFICER' || r.roleType === 'SAFEGUARDING_OWNER') && (!r.effectiveTo || new Date(r.effectiveTo) > ctx.now)
    );
    if (hasCOFA) return pass(rule, 'COFA assigned for reconciliation sign-off');
    return fail(rule, 'No COFA assigned for reconciliation sign-off', 'Assign a Compliance Officer for Finance and Administration (COFA)');
  },
  'SRA-004': (rule, _ctx) => {
    return warn(rule, 'Residual client balances must be identified and dealt with promptly — manual verification required', 'Review and resolve all residual client balances');
  },
  'SRA-005': (rule, _ctx) => {
    return warn(rule, 'Interest must be accounted for correctly per SRA interest policy — manual verification required', 'Verify interest accounting per SRA policy');
  },
  'SRA-006': (rule, ctx) => {
    if (ctx.reconciliation.status === 'SHORTFALL') {
      return fail(rule, 'Client account is in deficit — prohibited under SRA rules', 'Rectify client account deficit immediately');
    }
    return pass(rule, 'Client account is not in deficit');
  },
  'SRA-007': (rule, ctx) => {
    if (ctx.reconciliation.status === 'SHORTFALL') {
      return fail(rule, 'Payment would cause client account deficit — prohibited', 'Block any payment that would cause client account deficit');
    }
    return pass(rule, 'No prohibited transactions detected');
  },
  'SRA-008': (rule, _ctx) => {
    return warn(rule, 'Annual accountant\'s report required — verify submission date', 'Ensure annual accountant\'s report is submitted on time');
  },
  'SRA-009': (rule, _ctx) => {
    return warn(rule, 'Matter ledger must reconcile to client account balance — manual verification required', 'Reconcile matter ledger to client account balance');
  },
  'SRA-010': (rule, _ctx) => {
    return warn(rule, 'Separate designated client accounts may be required for large or long-term matters — review threshold', 'Review whether designated client accounts are needed for large matters');
  },
  'SRA-011': (rule, _ctx) => {
    return warn(rule, 'Third party managed accounts: additional rules apply if firm uses TPMA — verify compliance', 'If using TPMA, verify compliance with additional SRA rules');
  },
};

// ─── GAMBLING COMMISSION RULES ──────────────────────────────────────────────

const gcEvaluators: Record<string, RuleEvaluator> = {
  'GC-001': (rule, _ctx) => {
    return warn(rule, 'Player fund protection level must be declared: BASIC, MEDIUM, or HIGH — verify current level', 'Confirm and document player fund protection level');
  },
  'GC-002': (rule, ctx) => {
    const hasInsurance = ctx.governance.insuranceGuarantees.some(i => i.status === 'ACTIVE');
    if (hasInsurance) return pass(rule, 'Insurance or bank guarantee in place for MEDIUM protection level');
    return warn(rule, 'No active insurance or guarantee found — may be required for MEDIUM protection level', 'If MEDIUM protection, obtain insurance or bank guarantee covering full player fund balance');
  },
  'GC-003': (rule, ctx) => {
    const hasTrust = ctx.safeguardingAccounts.some(a => a.designation === 'SAFEGUARDING' && a.status === 'ACTIVE');
    if (hasTrust) return pass(rule, 'Trust account in place for HIGH protection level');
    return warn(rule, 'No designated trust account found — required for HIGH protection level', 'If HIGH protection, establish independent trust with FCA-authorised trustee');
  },
  'GC-004': (rule, ctx) => {
    if (ctx.reconciliation.status === 'MET' || ctx.reconciliation.status === 'EXCESS') {
      return pass(rule, 'Player fund balance reconciles to protected account balance');
    }
    return fail(rule, 'Player fund balance does not reconcile to protected account', 'Reconcile player funds to trust/protected account — daily requirement');
  },
  'GC-005': (rule, _ctx) => {
    return warn(rule, 'Protection level certificate must be current — manual verification required', 'Verify protection level certificate is current');
  },
  'GC-006': (rule, _ctx) => {
    return warn(rule, 'Operator must notify Commission of any change in protection level — manual check', 'Notify Gambling Commission of any protection level changes');
  },
  'GC-007': (rule, _ctx) => {
    return warn(rule, 'Funds must be available for immediate withdrawal — verify no encumbrances', 'Verify no encumbrances on player fund accounts');
  },
  'GC-008': (rule, _ctx) => {
    return warn(rule, 'Annual submission to Gambling Commission of player fund protection status required', 'Submit annual player fund protection status to Gambling Commission');
  },
};

// ─── FCA INSURANCE RULES ────────────────────────────────────────────────────

const insEvaluators: Record<string, RuleEvaluator> = {
  'INS-001': (rule, _ctx) => {
    return warn(rule, 'Statutory trust: trust deed must exist and be properly constituted under CASS 5.2 — manual verification required', 'Verify trust deed exists and is properly constituted');
  },
  'INS-002': (rule, _ctx) => {
    return warn(rule, 'Non-statutory trust: must meet enhanced requirements under CASS 5.2.3 — manual verification required', 'Verify enhanced requirements met for non-statutory trust');
  },
  'INS-003': (rule, ctx) => {
    const hasDesignated = ctx.safeguardingAccounts.some(a => a.designation === 'SAFEGUARDING' && a.status === 'ACTIVE');
    if (hasDesignated) return pass(rule, 'Client premiums held in designated account');
    return fail(rule, 'No designated account for client premiums', 'Segregate client premiums in designated account immediately upon receipt');
  },
  'INS-004': (rule, ctx) => {
    const allAcknowledged = ctx.safeguardingAccounts
      .filter(a => a.status === 'ACTIVE')
      .every(a => hasCurrentLetter(ctx, a.id));
    if (allAcknowledged) return pass(rule, 'Account acknowledged as statutory trust by bank');
    return fail(rule, 'Premium account not acknowledged as statutory trust by bank', 'Obtain statutory trust acknowledgement from bank');
  },
  'INS-005': (rule, _ctx) => {
    return warn(rule, 'Risk transfer: premiums must be remitted to insurer within agreed terms — verify no unauthorised holding', 'Verify premiums are remitted to insurer within agreed terms');
  },
  'INS-006': (rule, ctx) => {
    if (isBusinessDay(ctx.reconciliation.reconciliationDate)) return pass(rule, 'Reconciliation performed — monthly minimum, daily recommended');
    return warn(rule, 'Reconciliation timing — ensure at least monthly, daily recommended');
  },
  'INS-007': (rule, ctx) => {
    const expiringInsurance = ctx.governance.insuranceGuarantees.filter(i => {
      const daysToExpiry = daysDiff(ctx.now, new Date(i.expiryDate));
      return daysToExpiry <= 30 && daysToExpiry >= 0;
    });
    if (expiringInsurance.length > 0) {
      return fail(rule, `CRITICAL: ${expiringInsurance.length} insurance policy/policies expiring within 30 days`, 'Renew insurance policies immediately — CRITICAL alert at 30 days');
    }
    const expiringMedium = ctx.governance.insuranceGuarantees.filter(i => {
      const daysToExpiry = daysDiff(ctx.now, new Date(i.expiryDate));
      return daysToExpiry <= 90 && daysToExpiry > 30;
    });
    if (expiringMedium.length > 0) {
      return warn(rule, `${expiringMedium.length} insurance policy/policies expiring within 90 days`, 'Begin insurance renewal process');
    }
    return pass(rule, 'Insurance renewal dates are not approaching critical threshold');
  },
  'INS-008': (rule, _ctx) => {
    return warn(rule, 'Insurer credit risk: verify insurer holds minimum credit rating — manual check required', 'Verify insurer credit rating meets minimum requirements');
  },
  'INS-009': (rule, _ctx) => {
    return warn(rule, 'Co-mingling prohibited: premium accounts must not contain firm money except permitted working capital', 'Verify no co-mingling of firm money in premium accounts');
  },
};

// ─── CLIENT DEPOSIT SCHEME RULES ────────────────────────────────────────────

const cdsEvaluators: Record<string, RuleEvaluator> = {
  'CDS-001': (rule, _ctx) => {
    return warn(rule, 'Membership of approved client money protection scheme required — verify current certificate', 'Verify current membership of approved CMP scheme');
  },
  'CDS-002': (rule, _ctx) => {
    return warn(rule, 'Scheme certificate must be current, displayed on website, and cover full balance', 'Verify scheme certificate is current and displayed');
  },
  'CDS-003': (rule, ctx) => {
    const hasDesignated = ctx.safeguardingAccounts.some(a => a.designation === 'SAFEGUARDING' && a.status === 'ACTIVE');
    if (hasDesignated) return pass(rule, 'Client money account designated and acknowledged');
    return fail(rule, 'No designated client money account', 'Designate client money account and obtain bank acknowledgement');
  },
  'CDS-004': (rule, _ctx) => {
    return warn(rule, 'Tenancy deposits must be protected within 30 days in approved scheme (DPS, MyDeposits, TDS)', 'Verify all deposits protected within 30 days of receipt');
  },
  'CDS-005': (rule, _ctx) => {
    return warn(rule, 'Annual renewal of scheme membership must be tracked — alert at 60 days before expiry', 'Track and renew scheme membership before expiry');
  },
  'CDS-006': (rule, ctx) => {
    if (ctx.reconciliation.status === 'MET' || ctx.reconciliation.status === 'EXCESS') {
      return pass(rule, 'Deposit account reconciles to total deposits held');
    }
    return fail(rule, 'Deposit account does not reconcile to total deposits', 'Reconcile deposit account to total deposits held');
  },
  'CDS-007': (rule, _ctx) => {
    return warn(rule, 'Client money must not be mixed with operating funds — verify segregation', 'Verify no mixing of client money with operating funds');
  },
  'CDS-008': (rule, _ctx) => {
    return warn(rule, 'Propertymark/RICS members: verify additional professional indemnity insurance requirements', 'Check additional PII requirements for professional body membership');
  },
};

// ─── DORA RULES ─────────────────────────────────────────────────────────────

const doraEvaluators: Record<string, RuleEvaluator> = {
  'DORA-001': (rule, _ctx) => {
    return warn(rule, 'ICT risk management framework must be documented and current — manual verification required', 'Document and maintain current ICT risk management framework');
  },
  'DORA-002': (rule, _ctx) => {
    return warn(rule, 'ICT incident classification: major incidents must be reported within prescribed timeframes (4h initial, 72h intermediate, 1m final)', 'Establish ICT incident classification and reporting process');
  },
  'DORA-003': (rule, _ctx) => {
    return warn(rule, 'TLPT (Threat-Led Penetration Testing) required at least every 3 years for significant entities', 'Schedule and perform TLPT testing');
  },
  'DORA-004': (rule, _ctx) => {
    return warn(rule, 'Safeheld as third-party ICT provider must be listed in firm\'s ICT third-party register', 'Ensure Safeheld is documented in firm\'s ICT third-party register');
  },
  'DORA-005': (rule, _ctx) => {
    return warn(rule, 'ICT concentration risk: single provider dependency for critical functions must be flagged', 'Assess and document ICT concentration risk');
  },
  'DORA-006': (rule, _ctx) => {
    return warn(rule, 'Information sharing: firms must participate in cyber threat intelligence sharing', 'Verify participation in cyber threat intelligence sharing arrangements');
  },
  'DORA-007': (rule, _ctx) => {
    return warn(rule, 'Annual review of ICT risk management framework required', 'Conduct annual review of ICT risk management framework');
  },
  'DORA-008': (rule, _ctx) => {
    return warn(rule, 'Full contractual obligations with ICT providers must be documented', 'Verify all contractual obligations with ICT providers are documented');
  },
};

// ─── FCA OPERATIONAL RESILIENCE PS21/3 RULES ────────────────────────────────

const ps213Evaluators: Record<string, RuleEvaluator> = {
  'PS213-001': (rule, _ctx) => {
    return warn(rule, 'Important business services must be identified — safeguarding is always an important business service', 'Document safeguarding as an important business service');
  },
  'PS213-002': (rule, _ctx) => {
    return warn(rule, 'Impact tolerances must be set for each important business service', 'Set impact tolerances for safeguarding service');
  },
  'PS213-003': (rule, _ctx) => {
    return warn(rule, 'Self-assessment document must be completed and Board-approved annually', 'Complete and board-approve annual self-assessment');
  },
  'PS213-004': (rule, _ctx) => {
    return warn(rule, 'Mapping of resources, systems, and third parties supporting safeguarding required', 'Map all dependencies supporting safeguarding operations');
  },
  'PS213-005': (rule, _ctx) => {
    return warn(rule, 'Annual testing of ability to remain within impact tolerances required', 'Conduct annual impact tolerance testing');
  },
  'PS213-006': (rule, _ctx) => {
    return warn(rule, 'March 2025 deadline has passed — verify firm has completed full implementation', 'Confirm full PS21/3 implementation has been completed');
  },
};

// ─── FINRA/SEC RULE 15c3-3 ─────────────────────────────────────────────────

const finra15c33Evaluators: Record<string, RuleEvaluator> = {
  '15C33-001': (rule, ctx) => {
    const hasSRBA = ctx.safeguardingAccounts.some(a => a.designation === 'SAFEGUARDING' && a.status === 'ACTIVE');
    if (hasSRBA) return pass(rule, 'Special Reserve Bank Account maintained');
    return fail(rule, 'No Special Reserve Bank Account (SRBA) found', 'Establish and maintain SRBA at qualifying bank');
  },
  '15C33-002': (rule, _ctx) => {
    return warn(rule, 'Weekly computation of reserve requirement required using standard formula', 'Perform weekly reserve computation');
  },
  '15C33-003': (rule, _ctx) => {
    return warn(rule, 'Excess funds must be deposited into SRBA by close of business following computation date', 'Deposit excess funds by close of next business day');
  },
  '15C33-004': (rule, _ctx) => {
    return warn(rule, 'Possession and control requirements: fully paid and excess margin securities must be in firm control', 'Verify possession and control of client securities');
  },
  '15C33-005': (rule, ctx) => {
    if (isBusinessDay(ctx.reconciliation.reconciliationDate)) return pass(rule, 'Stock record reconciliation performed on business day');
    return warn(rule, 'Stock record must be reconciled daily', 'Reconcile stock record daily');
  },
  '15C33-006': (rule, _ctx) => {
    return warn(rule, 'PAB accounts: separate reserve computation required for Proprietary Accounts of Brokers', 'Perform separate PAB reserve computation');
  },
  '15C33-007': (rule, _ctx) => {
    return warn(rule, 'Annual audit by PCAOB-registered firm required', 'Arrange annual audit by PCAOB-registered firm');
  },
  '15C33-008': (rule, _ctx) => {
    return warn(rule, 'FOCUS report filing: monthly or quarterly depending on firm size — verify compliance', 'File FOCUS reports on schedule');
  },
};

// ─── FCA CONSUMER DUTY RULES ────────────────────────────────────────────────

const cdEvaluators: Record<string, RuleEvaluator> = {
  'CD-001': (rule, _ctx) => {
    return warn(rule, 'Consumer Duty programme must be documented and Board-approved', 'Document and board-approve Consumer Duty programme');
  },
  'CD-002': (rule, _ctx) => {
    return warn(rule, 'Four outcome areas must be evidenced: products/services, price/value, consumer understanding, consumer support', 'Evidence all four Consumer Duty outcome areas');
  },
  'CD-003': (rule, _ctx) => {
    return warn(rule, 'Annual Consumer Duty board report must be completed and signed off', 'Complete annual Consumer Duty board report');
  },
  'CD-004': (rule, _ctx) => {
    return warn(rule, 'Fair value assessments must be conducted and documented for all products', 'Conduct fair value assessments for all products');
  },
  'CD-005': (rule, _ctx) => {
    return warn(rule, 'Vulnerable customer policy must exist and be embedded', 'Create and embed vulnerable customer policy');
  },
  'CD-006': (rule, _ctx) => {
    return warn(rule, 'Monitoring framework with MI reported to Board required', 'Establish Consumer Duty monitoring framework');
  },
  'CD-007': (rule, _ctx) => {
    return warn(rule, 'Complaints root cause analysis must feed into product design', 'Implement complaints root cause analysis feedback loop');
  },
  'CD-008': (rule, ctx) => {
    if (ctx.reconciliation.status === 'MET' || ctx.reconciliation.status === 'EXCESS') {
      return pass(rule, 'Safeguarding arrangements delivering good outcomes — funds fully protected');
    }
    return fail(rule, 'Safeguarding shortfall may indicate poor consumer outcomes', 'Demonstrate safeguarding arrangements deliver good outcomes for clients');
  },
};

// ─── MASTER EVALUATOR MAP ───────────────────────────────────────────────────

export const EVALUATORS: Record<string, RuleEvaluator> = {
  ...ps25Evaluators,
  ...psd2Evaluators,
  ...cass5Evaluators,
  ...cass6Evaluators,
  ...cass7Evaluators,
  ...cass10Evaluators,
  ...micaEvaluators,
  ...geniusEvaluators,
  ...sraEvaluators,
  ...gcEvaluators,
  ...insEvaluators,
  ...cdsEvaluators,
  ...doraEvaluators,
  ...ps213Evaluators,
  ...finra15c33Evaluators,
  ...cdEvaluators,
};

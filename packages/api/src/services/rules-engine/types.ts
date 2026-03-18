import { FindingSeverity, FindingStatus } from '@prisma/client';

export const RULES_ENGINE_VERSION = '1.0.0';

export interface RuleFinding {
  ruleId: string;
  ruleCode: string;
  framework: string;
  severity: FindingSeverity;
  status: FindingStatus;
  detail: string;
  remediationGuidance?: string;
  ruleVersion: number;
}

export interface ComplianceVerdict {
  compliant: boolean;
  score: number; // 0-100
  findings: RuleFinding[];
  certificateEligible: boolean;
  frameworkSpecificData: Record<string, unknown>;
  rulesEngineVersion: string;
  frameworksVerified: string[];
  rulesApplied: number;
  rulesPassed: number;
  rulesFailed: number;
  criticalFindings: number;
  certificateStatus: 'FULLY_COMPLIANT' | 'PARTIAL_COMPLIANCE' | 'NON_COMPLIANT';
}

export interface FirmContext {
  id: string;
  name: string;
  regime: string;
  safeguardingMethod: string;
  baseCurrency: string;
  materialDiscrepancyPct: number | null;
  materialDiscrepancyAbs: number | null;
  fcaFrn: string | null;
  cassClassification: string | null;
}

export interface ReconciliationContext {
  runId: string;
  reconciliationDate: Date;
  reconciliationType: string;
  currency: string;
  totalRequirement: number;
  totalResource: number;
  variance: number;
  variancePercentage: number;
  status: string;
  fundType: string;
}

export interface GovernanceContext {
  acknowledgementLetters: Array<{
    id: string;
    safeguardingAccountId: string;
    status: string;
    expiryDate: Date | null;
    effectiveDate: Date;
  }>;
  policyDocuments: Array<{
    id: string;
    documentType: string;
    status: string;
    boardApproved: boolean;
    annualReviewDue: Date | null;
  }>;
  responsibilityAssignments: Array<{
    roleType: string;
    personName: string;
    effectiveFrom: Date;
    effectiveTo: Date | null;
  }>;
  insuranceGuarantees: Array<{
    id: string;
    coverageAmount: number;
    coverageCurrency: string;
    expiryDate: Date;
    status: string;
  }>;
  dueDiligence: Array<{
    id: string;
    safeguardingAccountId: string;
    reviewStatus: string;
    nextReviewDue: Date;
    ddOutcome: string;
  }>;
  resolutionPackHealth: {
    overallStatus: string;
    components: Record<string, unknown>;
    missingComponents: string[] | null;
  } | null;
}

export interface SafeguardingAccountContext {
  id: string;
  bankName: string;
  designation: string;
  letterStatus: string;
  fundType: string;
  currency: string;
  status: string;
}

export interface CryptoContext {
  wallets: Array<{
    id: string;
    walletType: string;
    network: string;
    status: string;
  }>;
  stablecoinTokens: Array<{
    id: string;
    symbol: string;
    pegStatus: string;
    totalSupply: number | null;
    circulatingSupply: number | null;
    regime: string;
  }>;
  reserveAssets: Array<{
    assetType: string;
    faceValue: number;
    marketValue: number | null;
    currency: string;
    custodian: string | null;
    maturityDate: Date | null;
  }>;
  reserveAttestations: Array<{
    snapshotDate: Date;
    coverageRatio: number;
    status: string;
  }>;
  proofOfReserves: Array<{
    snapshotDate: Date;
    reserveRatio: number;
    status: string;
  }>;
}

export interface EvaluationContext {
  firm: FirmContext;
  reconciliation: ReconciliationContext;
  governance: GovernanceContext;
  safeguardingAccounts: SafeguardingAccountContext[];
  crypto: CryptoContext;
  now: Date;
}

export interface FrameworkRuleRecord {
  id: string;
  framework: string;
  ruleCode: string;
  ruleName: string;
  ruleDescription: string;
  severity: FindingSeverity;
  active: boolean;
  version: number;
  effectiveFrom: Date;
  effectiveTo: Date | null;
  sourceRegulation: string;
  sourceArticle: string;
  evaluationConfig: Record<string, unknown> | null;
}

// Maps firm regime to applicable frameworks
export const REGIME_FRAMEWORK_MAP: Record<string, string[]> = {
  PS25_PI: ['PS25', 'CD'],
  PS25_EMI: ['PS25', 'CD'],
  PS25_SMALL_EMI: ['PS25', 'CD'],
  PSD2_EMI: ['PSD2', 'DORA'],
  PSD2_PI: ['PSD2', 'DORA'],
  CASS5: ['CASS5', 'CASS10', 'CD'],
  CASS6: ['CASS6', 'CASS10', 'CD'],
  CASS7: ['CASS7', 'CASS10', 'CD'],
  CASS10: ['CASS10', 'CD'],
  CASS15: ['CASS7', 'CASS10', 'CD'],
  MICA_CUSTODY: ['MICA', 'DORA'],
  MICA_CASP: ['MICA', 'DORA'],
  MICA_EMT: ['MICA', 'DORA'],
  GENIUS_ACT: ['GENIUS'],
  SRA_SOLICITOR: ['SRA'],
  FCA_INSURANCE: ['INS', 'CD'],
  GAMBLING_COMMISSION: ['GC'],
  CLIENT_DEPOSIT_SCHEME: ['CDS'],
  DORA: ['DORA'],
  FCA_OP_RESILIENCE: ['PS213'],
  FINRA_15C33: ['15C33'],
  FCA_CONSUMER_DUTY: ['CD'],
};

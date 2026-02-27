export type UserRole = 'COMPLIANCE_OFFICER' | 'FINANCE_OPS' | 'AUDITOR' | 'BANK_VIEWER' | 'ADMIN';
export type FirmRegime = 'PS25_PI' | 'PS25_EMI' | 'PS25_SMALL_EMI' | 'CASS7' | 'CASS15' | 'MICA_CUSTODY';
export type SafeguardingMethod = 'SEGREGATION' | 'INSURANCE' | 'GUARANTEE' | 'MIXED';
export type ReconciliationStatus = 'MET' | 'SHORTFALL' | 'EXCESS' | 'INCOMPLETE' | 'NO_DATA';
export type BreachStatus = 'DETECTED' | 'ACKNOWLEDGED' | 'REMEDIATING' | 'RESOLVED' | 'CLOSED';
export type BreachSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type BreachType = 'SHORTFALL' | 'EXCESS' | 'EXTERNAL_BREAK' | 'MISSING_DATA' | 'LETTER_EXPIRED' |
  'LETTER_MISSING' | 'GOVERNANCE_GAP' | 'POLICY_OVERDUE' | 'DD_OVERDUE' | 'RESOLUTION_PACK_INCOMPLETE' |
  'SEGREGATION_FAILURE' | 'RECORD_KEEPING_FAILURE';
export type ReportType = 'MONTHLY' | 'QUARTERLY' | 'ANNUAL' | 'AD_HOC' | 'SAFEGUARDING_RETURN' | 'CMAR' | 'BOARD_PACK' | 'RESOLUTION_PACK' | 'AUDIT_EVIDENCE';
export type ResolutionPackHealth = 'GREEN' | 'AMBER' | 'RED';

export interface AuthUser {
  userId: string;
  firmId: string;
  email: string;
  role: UserRole;
  name: string;
}

export interface Firm {
  id: string;
  name: string;
  fcaFrn?: string;
  regime: FirmRegime;
  status: string;
  baseCurrency: string;
  safeguardingMethod: SafeguardingMethod;
  createdAt: string;
}

export interface User {
  id: string;
  firmId: string;
  email: string;
  name: string;
  role: UserRole;
  status: string;
  createdAt: string;
  lastLoginAt?: string;
}

export interface Upload {
  id: string;
  firmId: string;
  userId: string;
  inputType: string;
  filename: string;
  status: string;
  rowCount: number;
  rowsAccepted: number;
  rowsRejected: number;
  createdAt: string;
  errorSummary?: object;
}

export interface ReconciliationRun {
  id: string;
  firmId: string;
  reconciliationDate: string;
  reconciliationType: 'INTERNAL' | 'EXTERNAL';
  currency: string;
  totalRequirement: number;
  totalResource: number;
  variance: number;
  variancePercentage: number;
  status: ReconciliationStatus;
  createdAt: string;
}

export interface ReconciliationBreak {
  id: string;
  firmId: string;
  reconciliationRunId: string;
  internalBalance: number;
  externalBalance: number;
  variance: number;
  classification: string;
  explanation?: string;
  ageBusinessDays: number;
  resolvedAt?: string;
  safeguardingAccount?: { bankName: string; accountNumberMasked: string; externalAccountId: string };
  reconciliationRun?: { reconciliationDate: string; currency: string };
}

export interface Breach {
  id: string;
  firmId: string;
  breachType: BreachType;
  severity: BreachSeverity;
  status: BreachStatus;
  isNotifiable: boolean;
  materialDiscrepancyExceeded: boolean;
  currency?: string;
  shortfallAmount?: number;
  shortfallPercentage?: number;
  description: string;
  acknowledgedAt?: string;
  remediationAction?: string;
  resolvedAt?: string;
  closedAt?: string;
  createdAt: string;
}

export interface SafeguardingAccount {
  id: string;
  firmId: string;
  externalAccountId: string;
  bankName: string;
  accountNumberMasked: string;
  currency: string;
  designation: string;
  status: string;
  letterStatus: string;
  openedDate: string;
  acknowledgementLetters?: AcknowledgementLetter[];
}

export interface AcknowledgementLetter {
  id: string;
  version: number;
  effectiveDate: string;
  expiryDate?: string;
  annualReviewDue: string;
  status: string;
  uploadDate: string;
}

export interface PolicyDocument {
  id: string;
  documentType: string;
  title: string;
  version: number;
  boardApproved: boolean;
  boardApprovalDate?: string;
  annualReviewDue?: string;
  status: string;
  createdAt: string;
}

export interface ThirdPartyDD {
  id: string;
  bankName: string;
  initialDdDate: string;
  lastReviewDate: string;
  nextReviewDue: string;
  reviewStatus: string;
  ddOutcome: string;
}

export interface PaginatedResponse<T> {
  status: string;
  data: T[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

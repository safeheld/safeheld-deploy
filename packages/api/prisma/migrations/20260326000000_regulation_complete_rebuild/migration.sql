-- Task 1-12: Regulation-Complete Platform Rebuild

-- New enums
CREATE TYPE "ReconciliationMethod" AS ENUM ('STANDARD', 'NON_STANDARD');
CREATE TYPE "AssetPoolType" AS ENUM ('E_MONEY', 'PAYMENT_SERVICES', 'COMBINED');
CREATE TYPE "BankStatementFormat" AS ENUM ('CSV_GENERIC', 'CSV_BARCLAYS', 'CSV_NATWEST', 'CSV_HSBC', 'CSV_LLOYDS', 'CSV_CLEARBANK', 'CSV_MODULR', 'CSV_GRIFFIN', 'MT940', 'MANUAL', 'OPEN_BANKING');
CREATE TYPE "BankStatementImportStatus" AS ENUM ('PENDING', 'PARSED', 'MATCHED', 'FAILED');
CREATE TYPE "BreachCategory" AS ENUM ('SHORTFALL', 'EXCESS', 'RECORD_KEEPING', 'RECONCILIATION_FAILURE', 'NOTIFICATION_FAILURE', 'SEGREGATION_FAILURE', 'OTHER');
CREATE TYPE "FcaReturnStatus" AS ENUM ('DRAFT', 'REVIEW', 'FINAL', 'SUBMITTED');
CREATE TYPE "FcaFormType" AS ENUM ('FSA056', 'FSA057', 'FIN060A', 'SUP16_MONTHLY');
CREATE TYPE "AuditRequirementStatus" AS ENUM ('REQUIRED', 'EXEMPT', 'PENDING_DETERMINATION');
CREATE TYPE "AckLetterTrackingStatus" AS ENUM ('NOT_SENT', 'SENT', 'RECEIVED', 'REVIEWED', 'NEEDS_RENEWAL');
CREATE TYPE "ThirdPartyType" AS ENUM ('BANK', 'CUSTODIAN', 'INSURANCE_PROVIDER', 'GUARANTEE_PROVIDER', 'OTHER');
CREATE TYPE "SafeguardingObligationStatus" AS ENUM ('ACTIVE', 'ENDED', 'PENDING');
CREATE TYPE "FxTransactionType" AS ENUM ('FX_ONLY', 'PAYMENT_LINKED', 'UNKNOWN');

-- Firm: Task 1 fields
ALTER TABLE "firms" ADD COLUMN "reconciliation_method" "ReconciliationMethod" NOT NULL DEFAULT 'STANDARD';
ALTER TABLE "firms" ADD COLUMN "non_standard_method_doc" TEXT;
ALTER TABLE "firms" ADD COLUMN "non_standard_auditor_report" VARCHAR(500);
ALTER TABLE "firms" ADD COLUMN "foreign_market_calendars" JSONB NOT NULL DEFAULT '[]';

-- Firm: Task 6 fields
ALTER TABLE "firms" ADD COLUMN "audit_period_start" DATE;
ALTER TABLE "firms" ADD COLUMN "audit_period_end" DATE;
ALTER TABLE "firms" ADD COLUMN "audit_submission_deadline" DATE;
ALTER TABLE "firms" ADD COLUMN "audit_requirement_status" "AuditRequirementStatus" NOT NULL DEFAULT 'PENDING_DETERMINATION';
ALTER TABLE "firms" ADD COLUMN "audit_threshold_exceeded" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "firms" ADD COLUMN "audit_exemption_signed_off_by" VARCHAR(255);
ALTER TABLE "firms" ADD COLUMN "audit_exemption_signed_off_at" TIMESTAMPTZ;
ALTER TABLE "firms" ADD COLUMN "max_safeguarded_amount" DECIMAL(18, 2);
ALTER TABLE "firms" ADD COLUMN "max_safeguarded_amount_date" DATE;

-- User: Task 6 auditor scope
ALTER TABLE "users" ADD COLUMN "auditor_period_start" DATE;
ALTER TABLE "users" ADD COLUMN "auditor_period_end" DATE;

-- ReconciliationRun: Task 1 fields
ALTER TABLE "reconciliation_runs" ADD COLUMN "asset_pool_id" UUID;
ALTER TABLE "reconciliation_runs" ADD COLUMN "reconciliation_point_time" TIMESTAMPTZ;
ALTER TABLE "reconciliation_runs" ADD COLUMN "segregation_requirement" DECIMAL(18, 2);
ALTER TABLE "reconciliation_runs" ADD COLUMN "segregation_resource" DECIMAL(18, 2);
ALTER TABLE "reconciliation_runs" ADD COLUMN "action_taken" TEXT;
ALTER TABLE "reconciliation_runs" ADD COLUMN "recon_method" "ReconciliationMethod";

-- Breach: Task 3 enhanced fields
ALTER TABLE "breaches" ADD COLUMN "date_occurred" DATE;
ALTER TABLE "breaches" ADD COLUMN "date_identified" DATE;
ALTER TABLE "breaches" ADD COLUMN "date_reported_to_senior_mgmt" TIMESTAMPTZ;
ALTER TABLE "breaches" ADD COLUMN "breach_category" "BreachCategory";
ALTER TABLE "breaches" ADD COLUMN "root_cause_analysis" TEXT;
ALTER TABLE "breaches" ADD COLUMN "remediation_completion_date" DATE;
ALTER TABLE "breaches" ADD COLUMN "is_material" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "breaches" ADD COLUMN "fca_notification_date" TIMESTAMPTZ;
ALTER TABLE "breaches" ADD COLUMN "fca_notification_reference" VARCHAR(100);
ALTER TABLE "breaches" ADD COLUMN "person_responsible" VARCHAR(255);
ALTER TABLE "breaches" ADD COLUMN "supporting_doc_paths" JSONB;

-- InsuranceGuarantee: Task 9 enhanced fields
ALTER TABLE "insurance_guarantees" ADD COLUMN "premium" DECIMAL(18, 2);
ALTER TABLE "insurance_guarantees" ADD COLUMN "has_restrictive_conditions" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "insurance_guarantees" ADD COLUMN "restrictive_condition_details" TEXT;
ALTER TABLE "insurance_guarantees" ADD COLUMN "fca_notified_before_first_use" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "insurance_guarantees" ADD COLUMN "fca_first_use_notification_date" TIMESTAMPTZ;
ALTER TABLE "insurance_guarantees" ADD COLUMN "fca_change_notification_date" TIMESTAMPTZ;
ALTER TABLE "insurance_guarantees" ADD COLUMN "switch_to_segregation_plan" TEXT;
ALTER TABLE "insurance_guarantees" ADD COLUMN "decision_made" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "insurance_guarantees" ADD COLUMN "decision_date" DATE;

-- PolicyDocument: Task 10 enhanced fields
ALTER TABLE "policy_documents" ADD COLUMN "review_frequency_months" INTEGER;
ALTER TABLE "policy_documents" ADD COLUMN "text_content" TEXT;
ALTER TABLE "policy_documents" ADD COLUMN "last_reviewed_at" TIMESTAMPTZ;
ALTER TABLE "policy_documents" ADD COLUMN "last_reviewed_by" VARCHAR(255);

-- ThirdPartyDueDiligence: Task 8 enhanced fields
ALTER TABLE "third_party_due_diligence" ADD COLUMN "financial_stability_assessment" TEXT;
ALTER TABLE "third_party_due_diligence" ADD COLUMN "regulatory_status_assessment" TEXT;
ALTER TABLE "third_party_due_diligence" ADD COLUMN "service_quality_assessment" TEXT;
ALTER TABLE "third_party_due_diligence" ADD COLUMN "jurisdiction_risk_assessment" TEXT;
ALTER TABLE "third_party_due_diligence" ADD COLUMN "approved_by_name" VARCHAR(255);
ALTER TABLE "third_party_due_diligence" ADD COLUMN "approved_by_role" VARCHAR(255);
ALTER TABLE "third_party_due_diligence" ADD COLUMN "approved_date" DATE;

-- Task 1: Asset Pools
CREATE TABLE "asset_pools" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "firm_id" UUID NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "pool_type" "AssetPoolType" NOT NULL,
    "description" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "asset_pools_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "asset_pools_firm_id_name_key" ON "asset_pools"("firm_id", "name");
ALTER TABLE "asset_pools" ADD CONSTRAINT "asset_pools_firm_id_fkey" FOREIGN KEY ("firm_id") REFERENCES "firms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "reconciliation_runs" ADD CONSTRAINT "reconciliation_runs_asset_pool_id_fkey" FOREIGN KEY ("asset_pool_id") REFERENCES "asset_pools"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Task 1: Reconciliation Calendar
CREATE TABLE "reconciliation_calendar_days" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "firm_id" UUID,
    "calendar_date" DATE NOT NULL,
    "is_holiday" BOOLEAN NOT NULL DEFAULT false,
    "holiday_name" VARCHAR(255),
    "calendar_type" VARCHAR(50) NOT NULL,
    "country" VARCHAR(10) NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "reconciliation_calendar_days_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "reconciliation_calendar_days_firm_id_calendar_date_calendar_type_key" ON "reconciliation_calendar_days"("firm_id", "calendar_date", "calendar_type");
CREATE INDEX "reconciliation_calendar_days_calendar_date_idx" ON "reconciliation_calendar_days"("calendar_date");
ALTER TABLE "reconciliation_calendar_days" ADD CONSTRAINT "reconciliation_calendar_days_firm_id_fkey" FOREIGN KEY ("firm_id") REFERENCES "firms"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Task 1: Bank Statement Imports
CREATE TABLE "bank_statement_imports" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "firm_id" UUID NOT NULL,
    "safeguarding_account_id" UUID,
    "format" "BankStatementFormat" NOT NULL,
    "filename" VARCHAR(255) NOT NULL,
    "file_storage_path" VARCHAR(500),
    "statement_date" DATE,
    "opening_balance" DECIMAL(18, 2),
    "closing_balance" DECIMAL(18, 2),
    "transaction_count" INTEGER NOT NULL DEFAULT 0,
    "currency" CHAR(3),
    "bank_reference" VARCHAR(255),
    "raw_data" JSONB,
    "status" "BankStatementImportStatus" NOT NULL DEFAULT 'PENDING',
    "error_message" TEXT,
    "imported_by" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "bank_statement_imports_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "bank_statement_imports_firm_id_statement_date_idx" ON "bank_statement_imports"("firm_id", "statement_date");
ALTER TABLE "bank_statement_imports" ADD CONSTRAINT "bank_statement_imports_firm_id_fkey" FOREIGN KEY ("firm_id") REFERENCES "firms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "bank_statement_imports" ADD CONSTRAINT "bank_statement_imports_safeguarding_account_id_fkey" FOREIGN KEY ("safeguarding_account_id") REFERENCES "safeguarding_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Task 2: Resolution Pack
CREATE TABLE "resolution_packs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "firm_id" UUID NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "generated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "pdf_storage_path" VARCHAR(500),
    "completeness_score" INTEGER NOT NULL DEFAULT 0,
    "components" JSONB NOT NULL,
    "component_statuses" JSONB NOT NULL,
    "last_changed_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "resolution_packs_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "resolution_packs_firm_id_version_idx" ON "resolution_packs"("firm_id", "version");
ALTER TABLE "resolution_packs" ADD CONSTRAINT "resolution_packs_firm_id_fkey" FOREIGN KEY ("firm_id") REFERENCES "firms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Task 4: FCA Monthly Return
CREATE TABLE "fca_monthly_returns" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "firm_id" UUID NOT NULL,
    "reporting_month" DATE NOT NULL,
    "submission_deadline" DATE NOT NULL,
    "status" "FcaReturnStatus" NOT NULL DEFAULT 'DRAFT',
    "section_a" JSONB NOT NULL,
    "section_b" JSONB NOT NULL,
    "section_c" JSONB NOT NULL,
    "section_d" JSONB NOT NULL,
    "section_e" JSONB,
    "section_f" JSONB NOT NULL,
    "validation_errors" JSONB,
    "pdf_storage_path" VARCHAR(500),
    "export_data_path" VARCHAR(500),
    "finalised_by" UUID,
    "finalised_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "fca_monthly_returns_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "fca_monthly_returns_firm_id_reporting_month_key" ON "fca_monthly_returns"("firm_id", "reporting_month");
CREATE INDEX "fca_monthly_returns_firm_id_status_idx" ON "fca_monthly_returns"("firm_id", "status");
ALTER TABLE "fca_monthly_returns" ADD CONSTRAINT "fca_monthly_returns_firm_id_fkey" FOREIGN KEY ("firm_id") REFERENCES "firms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Task 5: FCA Form Submissions
CREATE TABLE "fca_form_submissions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "firm_id" UUID NOT NULL,
    "form_type" "FcaFormType" NOT NULL,
    "reporting_period_start" DATE NOT NULL,
    "reporting_period_end" DATE NOT NULL,
    "auto_populated_data" JSONB NOT NULL,
    "manual_fields" JSONB,
    "status" "FcaReturnStatus" NOT NULL DEFAULT 'DRAFT',
    "pdf_storage_path" VARCHAR(500),
    "export_data_path" VARCHAR(500),
    "notes" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "fca_form_submissions_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "fca_form_submissions_firm_id_form_type_idx" ON "fca_form_submissions"("firm_id", "form_type");
ALTER TABLE "fca_form_submissions" ADD CONSTRAINT "fca_form_submissions_firm_id_fkey" FOREIGN KEY ("firm_id") REFERENCES "firms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Task 6: Audit Evidence Pack
CREATE TABLE "audit_evidence_packs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "firm_id" UUID NOT NULL,
    "period_start" DATE NOT NULL,
    "period_end" DATE NOT NULL,
    "pdf_storage_path" VARCHAR(500),
    "content_hash" VARCHAR(64),
    "generated_by" UUID NOT NULL,
    "recon_days_count" INTEGER NOT NULL DEFAULT 0,
    "breach_count" INTEGER NOT NULL DEFAULT 0,
    "shortfall_count" INTEGER NOT NULL DEFAULT 0,
    "res_pack_status" VARCHAR(20),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "audit_evidence_packs_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "audit_evidence_packs_firm_id_period_start_idx" ON "audit_evidence_packs"("firm_id", "period_start");
ALTER TABLE "audit_evidence_packs" ADD CONSTRAINT "audit_evidence_packs_firm_id_fkey" FOREIGN KEY ("firm_id") REFERENCES "firms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Task 8: Third-Party Register
CREATE TABLE "third_party_registers" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "firm_id" UUID NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "party_type" "ThirdPartyType" NOT NULL,
    "jurisdiction" VARCHAR(100),
    "date_appointed" DATE NOT NULL,
    "services_provided" TEXT,
    "contact_name" VARCHAR(255),
    "contact_email" VARCHAR(255),
    "contact_phone" VARCHAR(50),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "linked_safeguarding_account_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "third_party_registers_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "third_party_registers_firm_id_party_type_idx" ON "third_party_registers"("firm_id", "party_type");
ALTER TABLE "third_party_registers" ADD CONSTRAINT "third_party_registers_firm_id_fkey" FOREIGN KEY ("firm_id") REFERENCES "firms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Task 8: Diversification Assessment
CREATE TABLE "diversification_assessments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "firm_id" UUID NOT NULL,
    "assessment_date" DATE NOT NULL,
    "is_diversified" BOOLEAN NOT NULL,
    "rationale" TEXT NOT NULL,
    "single_bank_flag" BOOLEAN NOT NULL DEFAULT false,
    "assessed_by" VARCHAR(255) NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "diversification_assessments_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "diversification_assessments_firm_id_assessment_date_idx" ON "diversification_assessments"("firm_id", "assessment_date");
ALTER TABLE "diversification_assessments" ADD CONSTRAINT "diversification_assessments_firm_id_fkey" FOREIGN KEY ("firm_id") REFERENCES "firms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Task 11: Bank API Keys
CREATE TABLE "bank_api_keys" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "firm_id" UUID,
    "bank_institution_id" UUID NOT NULL,
    "key_hash" VARCHAR(128) NOT NULL,
    "key_prefix" VARCHAR(10) NOT NULL,
    "label" VARCHAR(255) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "last_used_at" TIMESTAMPTZ,
    "expires_at" TIMESTAMPTZ,
    "rate_limit_per_min" INTEGER NOT NULL DEFAULT 60,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "bank_api_keys_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "bank_api_keys_key_hash_key" ON "bank_api_keys"("key_hash");
CREATE INDEX "bank_api_keys_bank_institution_id_idx" ON "bank_api_keys"("bank_institution_id");
ALTER TABLE "bank_api_keys" ADD CONSTRAINT "bank_api_keys_firm_id_fkey" FOREIGN KEY ("firm_id") REFERENCES "firms"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Task 12: Safeguarding Obligations
CREATE TABLE "safeguarding_obligations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "firm_id" UUID NOT NULL,
    "client_account_id" UUID,
    "transaction_ref" VARCHAR(255),
    "amount" DECIMAL(18, 2) NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "funds_received_at" TIMESTAMPTZ NOT NULL,
    "safeguarding_started_at" TIMESTAMPTZ,
    "safeguarding_ended_at" TIMESTAMPTZ,
    "end_reason" VARCHAR(100),
    "fx_type" "FxTransactionType" NOT NULL DEFAULT 'UNKNOWN',
    "is_unclaimed" BOOLEAN NOT NULL DEFAULT false,
    "unclaimed_since" TIMESTAMPTZ,
    "status" "SafeguardingObligationStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "safeguarding_obligations_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "safeguarding_obligations_firm_id_status_idx" ON "safeguarding_obligations"("firm_id", "status");
CREATE INDEX "safeguarding_obligations_firm_id_is_unclaimed_idx" ON "safeguarding_obligations"("firm_id", "is_unclaimed");
ALTER TABLE "safeguarding_obligations" ADD CONSTRAINT "safeguarding_obligations_firm_id_fkey" FOREIGN KEY ("firm_id") REFERENCES "firms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Seed UK Bank Holidays 2026-2027
INSERT INTO "reconciliation_calendar_days" ("id", "calendar_date", "is_holiday", "holiday_name", "calendar_type", "country") VALUES
-- 2026 UK Bank Holidays
(gen_random_uuid(), '2026-01-01', true, 'New Year''s Day', 'UK_BANK_HOLIDAY', 'GB'),
(gen_random_uuid(), '2026-04-03', true, 'Good Friday', 'UK_BANK_HOLIDAY', 'GB'),
(gen_random_uuid(), '2026-04-06', true, 'Easter Monday', 'UK_BANK_HOLIDAY', 'GB'),
(gen_random_uuid(), '2026-05-04', true, 'Early May Bank Holiday', 'UK_BANK_HOLIDAY', 'GB'),
(gen_random_uuid(), '2026-05-25', true, 'Spring Bank Holiday', 'UK_BANK_HOLIDAY', 'GB'),
(gen_random_uuid(), '2026-08-31', true, 'Summer Bank Holiday', 'UK_BANK_HOLIDAY', 'GB'),
(gen_random_uuid(), '2026-12-25', true, 'Christmas Day', 'UK_BANK_HOLIDAY', 'GB'),
(gen_random_uuid(), '2026-12-28', true, 'Boxing Day (substitute)', 'UK_BANK_HOLIDAY', 'GB'),
-- 2027 UK Bank Holidays
(gen_random_uuid(), '2027-01-01', true, 'New Year''s Day', 'UK_BANK_HOLIDAY', 'GB'),
(gen_random_uuid(), '2027-03-26', true, 'Good Friday', 'UK_BANK_HOLIDAY', 'GB'),
(gen_random_uuid(), '2027-03-29', true, 'Easter Monday', 'UK_BANK_HOLIDAY', 'GB'),
(gen_random_uuid(), '2027-05-03', true, 'Early May Bank Holiday', 'UK_BANK_HOLIDAY', 'GB'),
(gen_random_uuid(), '2027-05-31', true, 'Spring Bank Holiday', 'UK_BANK_HOLIDAY', 'GB'),
(gen_random_uuid(), '2027-08-30', true, 'Summer Bank Holiday', 'UK_BANK_HOLIDAY', 'GB'),
(gen_random_uuid(), '2027-12-27', true, 'Christmas Day (substitute)', 'UK_BANK_HOLIDAY', 'GB'),
(gen_random_uuid(), '2027-12-28', true, 'Boxing Day (substitute)', 'UK_BANK_HOLIDAY', 'GB');

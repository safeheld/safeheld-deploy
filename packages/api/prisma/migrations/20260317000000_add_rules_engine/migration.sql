-- CreateEnum
CREATE TYPE "FindingSeverity" AS ENUM ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW');

-- CreateEnum
CREATE TYPE "FindingStatus" AS ENUM ('PASS', 'FAIL', 'WARNING', 'NOT_APPLICABLE');

-- CreateEnum
CREATE TYPE "RemediationStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'RESOLVED', 'OVERDUE', 'ESCALATED');

-- AlterEnum: Add new FirmRegime values
ALTER TYPE "FirmRegime" ADD VALUE IF NOT EXISTS 'PSD2_EMI';
ALTER TYPE "FirmRegime" ADD VALUE IF NOT EXISTS 'PSD2_PI';
ALTER TYPE "FirmRegime" ADD VALUE IF NOT EXISTS 'CASS5';
ALTER TYPE "FirmRegime" ADD VALUE IF NOT EXISTS 'CASS6';
ALTER TYPE "FirmRegime" ADD VALUE IF NOT EXISTS 'CASS10';
ALTER TYPE "FirmRegime" ADD VALUE IF NOT EXISTS 'DORA';
ALTER TYPE "FirmRegime" ADD VALUE IF NOT EXISTS 'FCA_OP_RESILIENCE';
ALTER TYPE "FirmRegime" ADD VALUE IF NOT EXISTS 'FINRA_15C33';
ALTER TYPE "FirmRegime" ADD VALUE IF NOT EXISTS 'FCA_CONSUMER_DUTY';

-- AlterTable: Add rules engine fields to reconciliation_runs
ALTER TABLE "reconciliation_runs" ADD COLUMN IF NOT EXISTS "rules_engine_version" VARCHAR(20);
ALTER TABLE "reconciliation_runs" ADD COLUMN IF NOT EXISTS "compliance_score" INTEGER;
ALTER TABLE "reconciliation_runs" ADD COLUMN IF NOT EXISTS "rules_findings" JSONB;
ALTER TABLE "reconciliation_runs" ADD COLUMN IF NOT EXISTS "certificate_eligible" BOOLEAN;
ALTER TABLE "reconciliation_runs" ADD COLUMN IF NOT EXISTS "framework_rules_applied" JSONB;

-- CreateTable
CREATE TABLE "framework_rules" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "framework" VARCHAR(50) NOT NULL,
    "rule_code" VARCHAR(20) NOT NULL,
    "rule_name" VARCHAR(255) NOT NULL,
    "rule_description" TEXT NOT NULL,
    "severity" "FindingSeverity" NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1,
    "effective_from" DATE NOT NULL,
    "effective_to" DATE,
    "source_regulation" VARCHAR(255) NOT NULL,
    "source_article" VARCHAR(255) NOT NULL,
    "evaluation_config" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "framework_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "compliance_findings" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "reconciliation_run_id" UUID NOT NULL,
    "rule_id" UUID NOT NULL,
    "rule_code" VARCHAR(20) NOT NULL,
    "framework" VARCHAR(50) NOT NULL,
    "severity" "FindingSeverity" NOT NULL,
    "status" "FindingStatus" NOT NULL,
    "detail" TEXT NOT NULL,
    "remediation_guidance" TEXT,
    "rule_version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "compliance_findings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "remediation_actions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "finding_id" UUID NOT NULL,
    "firm_id" UUID NOT NULL,
    "action_description" TEXT NOT NULL,
    "deadline" TIMESTAMP(3) NOT NULL,
    "severity" "FindingSeverity" NOT NULL,
    "status" "RemediationStatus" NOT NULL DEFAULT 'OPEN',
    "assigned_to" VARCHAR(255),
    "escalation_path" TEXT,
    "resolved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "remediation_actions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "framework_rules_rule_code_key" ON "framework_rules"("rule_code");
CREATE INDEX "framework_rules_framework_active_idx" ON "framework_rules"("framework", "active");
CREATE INDEX "framework_rules_rule_code_idx" ON "framework_rules"("rule_code");

-- CreateIndex
CREATE INDEX "compliance_findings_reconciliation_run_id_idx" ON "compliance_findings"("reconciliation_run_id");
CREATE INDEX "compliance_findings_rule_code_status_idx" ON "compliance_findings"("rule_code", "status");

-- CreateIndex
CREATE INDEX "remediation_actions_firm_id_status_idx" ON "remediation_actions"("firm_id", "status");
CREATE INDEX "remediation_actions_finding_id_idx" ON "remediation_actions"("finding_id");

-- AddForeignKey
ALTER TABLE "compliance_findings" ADD CONSTRAINT "compliance_findings_reconciliation_run_id_fkey" FOREIGN KEY ("reconciliation_run_id") REFERENCES "reconciliation_runs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "compliance_findings" ADD CONSTRAINT "compliance_findings_rule_id_fkey" FOREIGN KEY ("rule_id") REFERENCES "framework_rules"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "remediation_actions" ADD CONSTRAINT "remediation_actions_finding_id_fkey" FOREIGN KEY ("finding_id") REFERENCES "compliance_findings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "remediation_actions" ADD CONSTRAINT "remediation_actions_firm_id_fkey" FOREIGN KEY ("firm_id") REFERENCES "firms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

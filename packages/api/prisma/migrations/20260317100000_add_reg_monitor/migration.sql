-- CreateEnum
CREATE TYPE "MonitorFrequency" AS ENUM ('DAILY', 'WEEKLY', 'MONTHLY');
CREATE TYPE "ChangeEventStatus" AS ENUM ('DETECTED', 'ANALYSED', 'PROPOSED', 'APPROVED', 'REJECTED', 'APPLIED');
CREATE TYPE "ProposalChangeType" AS ENUM ('UPDATE', 'CREATE', 'DEPRECATE');
CREATE TYPE "ProposalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "regulatory_sources" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "framework" VARCHAR(50) NOT NULL,
    "source_name" VARCHAR(255) NOT NULL,
    "source_url" VARCHAR(500) NOT NULL,
    "jurisdiction" VARCHAR(50) NOT NULL,
    "monitor_frequency" "MonitorFrequency" NOT NULL DEFAULT 'DAILY',
    "last_checked" TIMESTAMP(3),
    "last_changed" TIMESTAMP(3),
    "content_hash" VARCHAR(64),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "regulatory_sources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "regulatory_change_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "source_id" UUID NOT NULL,
    "detected_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "change_summary" TEXT,
    "previous_hash" VARCHAR(64),
    "new_hash" VARCHAR(64) NOT NULL,
    "raw_content" TEXT,
    "ai_analysis" JSONB,
    "status" "ChangeEventStatus" NOT NULL DEFAULT 'DETECTED',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "regulatory_change_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "regulatory_update_proposals" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "change_event_id" UUID NOT NULL,
    "rule_code" VARCHAR(20) NOT NULL,
    "framework" VARCHAR(50) NOT NULL,
    "proposed_change_type" "ProposalChangeType" NOT NULL,
    "current_rule_text" TEXT,
    "proposed_rule_text" TEXT NOT NULL,
    "change_rationale" TEXT NOT NULL,
    "severity" "FindingSeverity" NOT NULL,
    "effective_date" DATE,
    "status" "ProposalStatus" NOT NULL DEFAULT 'PENDING',
    "reviewed_by" UUID,
    "reviewed_at" TIMESTAMP(3),
    "rejection_reason" TEXT,
    "applied_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "regulatory_update_proposals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "regulatory_sources_framework_active_idx" ON "regulatory_sources"("framework", "active");
CREATE INDEX "regulatory_change_events_source_id_detected_at_idx" ON "regulatory_change_events"("source_id", "detected_at");
CREATE INDEX "regulatory_change_events_status_idx" ON "regulatory_change_events"("status");
CREATE INDEX "regulatory_update_proposals_status_idx" ON "regulatory_update_proposals"("status");
CREATE INDEX "regulatory_update_proposals_framework_rule_code_idx" ON "regulatory_update_proposals"("framework", "rule_code");

-- AddForeignKey
ALTER TABLE "regulatory_change_events" ADD CONSTRAINT "regulatory_change_events_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "regulatory_sources"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "regulatory_update_proposals" ADD CONSTRAINT "regulatory_update_proposals_change_event_id_fkey" FOREIGN KEY ("change_event_id") REFERENCES "regulatory_change_events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

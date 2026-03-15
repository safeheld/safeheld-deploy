-- AlterTable
ALTER TABLE "audit_log" ADD COLUMN "previous_hash" VARCHAR(64),
ADD COLUMN "current_hash" VARCHAR(64);

-- CreateTable
CREATE TABLE "verification_certificates" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "firm_id" UUID NOT NULL,
    "reconciliation_run_id" UUID NOT NULL,
    "issued_at" TIMESTAMP(3) NOT NULL,
    "client_funds" DECIMAL(18,2) NOT NULL,
    "safeguarded_funds" DECIMAL(18,2) NOT NULL,
    "variance" DECIMAL(18,2) NOT NULL,
    "coverage_ratio" DECIMAL(8,4) NOT NULL,
    "framework" VARCHAR(100) NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'VALID',
    "sha256_hash" VARCHAR(64) NOT NULL,
    "certificate_data" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "verification_certificates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "verification_certificates_sha256_hash_key" ON "verification_certificates"("sha256_hash");

-- CreateIndex
CREATE INDEX "verification_certificates_firm_id_issued_at_idx" ON "verification_certificates"("firm_id", "issued_at");

-- CreateIndex
CREATE INDEX "verification_certificates_sha256_hash_idx" ON "verification_certificates"("sha256_hash");

-- AddForeignKey
ALTER TABLE "verification_certificates" ADD CONSTRAINT "verification_certificates_firm_id_fkey" FOREIGN KEY ("firm_id") REFERENCES "firms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "verification_certificates" ADD CONSTRAINT "verification_certificates_reconciliation_run_id_fkey" FOREIGN KEY ("reconciliation_run_id") REFERENCES "reconciliation_runs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

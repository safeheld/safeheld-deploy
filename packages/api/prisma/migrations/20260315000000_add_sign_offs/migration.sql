-- CreateTable
CREATE TABLE "sign_offs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "firm_id" UUID NOT NULL,
    "entity_type" VARCHAR(50) NOT NULL,
    "entity_id" UUID NOT NULL,
    "requested_by" UUID NOT NULL,
    "approved_by" UUID,
    "status" VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    "comments" TEXT,
    "rejection_reason" TEXT,
    "requested_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMP(3),

    CONSTRAINT "sign_offs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "sign_offs_firm_id_entity_type_status_idx" ON "sign_offs"("firm_id", "entity_type", "status");

-- AddForeignKey
ALTER TABLE "sign_offs" ADD CONSTRAINT "sign_offs_firm_id_fkey" FOREIGN KEY ("firm_id") REFERENCES "firms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Add new FirmRegime enum values
ALTER TYPE "FirmRegime" ADD VALUE IF NOT EXISTS 'MICA_CASP';
ALTER TYPE "FirmRegime" ADD VALUE IF NOT EXISTS 'MICA_EMT';
ALTER TYPE "FirmRegime" ADD VALUE IF NOT EXISTS 'GENIUS_ACT';
ALTER TYPE "FirmRegime" ADD VALUE IF NOT EXISTS 'SRA_SOLICITOR';
ALTER TYPE "FirmRegime" ADD VALUE IF NOT EXISTS 'FCA_INSURANCE';
ALTER TYPE "FirmRegime" ADD VALUE IF NOT EXISTS 'GAMBLING_COMMISSION';
ALTER TYPE "FirmRegime" ADD VALUE IF NOT EXISTS 'CLIENT_DEPOSIT_SCHEME';

-- Add new BreachType enum values
ALTER TYPE "BreachType" ADD VALUE IF NOT EXISTS 'CUSTODY_MISMATCH';
ALTER TYPE "BreachType" ADD VALUE IF NOT EXISTS 'MISSING_CUSTODY_ASSET';
ALTER TYPE "BreachType" ADD VALUE IF NOT EXISTS 'UNREGISTERED_HOLDING';

-- CreateEnum
CREATE TYPE "CustodyReconStatus" AS ENUM ('MATCHED', 'QUANTITY_MISMATCH', 'VALUE_MISMATCH', 'MISSING_AT_CUSTODIAN', 'UNREGISTERED_HOLDING');

-- AlterTable: add CASS 6 custody fields to client_assets
ALTER TABLE "client_assets" ADD COLUMN "custodian_quantity" DECIMAL(18, 6),
ADD COLUMN "custodian_market_value" DECIMAL(18, 2),
ADD COLUMN "nominee_registered" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "nominee_name" VARCHAR(255),
ADD COLUMN "last_reconciled" DATE;

-- CreateIndex
CREATE INDEX "client_assets_firm_id_custodian_idx" ON "client_assets"("firm_id", "custodian");

-- CreateTable
CREATE TABLE "custody_asset_reconciliations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "firm_id" UUID NOT NULL,
    "reconciliation_date" DATE NOT NULL,
    "total_assets" INTEGER NOT NULL,
    "matched" INTEGER NOT NULL DEFAULT 0,
    "mismatched" INTEGER NOT NULL DEFAULT 0,
    "missing" INTEGER NOT NULL DEFAULT 0,
    "unregistered" INTEGER NOT NULL DEFAULT 0,
    "total_firm_quantity" DECIMAL(18, 6) NOT NULL,
    "total_custodian_quantity" DECIMAL(18, 6) NOT NULL,
    "total_firm_value" DECIMAL(18, 2) NOT NULL,
    "total_custodian_value" DECIMAL(18, 2) NOT NULL,
    "breaches_created" INTEGER NOT NULL DEFAULT 0,
    "completed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "custody_asset_reconciliations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "custody_asset_reconciliations_firm_id_reconciliation_date_idx" ON "custody_asset_reconciliations"("firm_id", "reconciliation_date");

-- AddForeignKey
ALTER TABLE "custody_asset_reconciliations" ADD CONSTRAINT "custody_asset_reconciliations_firm_id_fkey" FOREIGN KEY ("firm_id") REFERENCES "firms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "custody_asset_recon_items" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "reconciliation_id" UUID NOT NULL,
    "client_asset_id" UUID NOT NULL,
    "firm_quantity" DECIMAL(18, 6) NOT NULL,
    "custodian_quantity" DECIMAL(18, 6),
    "quantity_variance" DECIMAL(18, 6) NOT NULL,
    "firm_market_value" DECIMAL(18, 2),
    "custodian_market_value" DECIMAL(18, 2),
    "value_variance" DECIMAL(18, 2),
    "status" "CustodyReconStatus" NOT NULL DEFAULT 'MATCHED',
    "breach_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "custody_asset_recon_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "custody_asset_recon_items_reconciliation_id_idx" ON "custody_asset_recon_items"("reconciliation_id");

-- CreateIndex
CREATE INDEX "custody_asset_recon_items_client_asset_id_idx" ON "custody_asset_recon_items"("client_asset_id");

-- AddForeignKey
ALTER TABLE "custody_asset_recon_items" ADD CONSTRAINT "custody_asset_recon_items_reconciliation_id_fkey" FOREIGN KEY ("reconciliation_id") REFERENCES "custody_asset_reconciliations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "custody_asset_recon_items" ADD CONSTRAINT "custody_asset_recon_items_client_asset_id_fkey" FOREIGN KEY ("client_asset_id") REFERENCES "client_assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

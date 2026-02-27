-- CreateEnum
CREATE TYPE "BankInstitutionStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'OFFBOARDED');

-- CreateEnum
CREATE TYPE "CommercialStatus" AS ENUM ('PILOT', 'CONTRACTED', 'CHURNED');

-- CreateTable
CREATE TABLE "bank_institutions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" VARCHAR(255) NOT NULL,
    "lei_code" VARCHAR(20),
    "status" "BankInstitutionStatus" NOT NULL DEFAULT 'ACTIVE',
    "pilot_start_date" DATE NOT NULL,
    "pilot_end_date" DATE,
    "commercial_status" "CommercialStatus" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bank_institutions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bank_institution_firms" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "bank_institution_id" UUID NOT NULL,
    "firm_id" UUID NOT NULL,
    "safeguarding_account_count" INTEGER NOT NULL DEFAULT 0,
    "total_funds_held" DECIMAL(18,2) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bank_institution_firms_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "users" ADD COLUMN "bank_institution_id" UUID;

-- CreateIndex
CREATE UNIQUE INDEX "bank_institution_firms_bank_institution_id_firm_id_key" ON "bank_institution_firms"("bank_institution_id", "firm_id");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_bank_institution_id_fkey" FOREIGN KEY ("bank_institution_id") REFERENCES "bank_institutions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_institution_firms" ADD CONSTRAINT "bank_institution_firms_bank_institution_id_fkey" FOREIGN KEY ("bank_institution_id") REFERENCES "bank_institutions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_institution_firms" ADD CONSTRAINT "bank_institution_firms_firm_id_fkey" FOREIGN KEY ("firm_id") REFERENCES "firms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Billing engine tables and firm billing fields

-- Billing status enum
CREATE TYPE "BillingStatus" AS ENUM ('TRIAL', 'ACTIVE', 'SUSPENDED', 'CANCELLED');

-- Invoice status enum
CREATE TYPE "InvoiceStatus" AS ENUM ('DRAFT', 'PENDING', 'PAID', 'FAILED', 'VOID');

-- Add billing fields to firms table
ALTER TABLE "firms"
  ADD COLUMN "stripe_customer_id" VARCHAR(255),
  ADD COLUMN "base_monthly_fee" DECIMAL(12, 2) NOT NULL DEFAULT 1500,
  ADD COLUMN "basis_points_rate" DECIMAL(12, 10) NOT NULL DEFAULT 0.0000025,
  ADD COLUMN "billing_status" "BillingStatus" NOT NULL DEFAULT 'TRIAL',
  ADD COLUMN "trial_ends_at" TIMESTAMPTZ,
  ADD COLUMN "billing_day" INTEGER NOT NULL DEFAULT 28;

-- Set trial_ends_at for existing firms to 30 days from now
UPDATE "firms" SET "trial_ends_at" = NOW() + INTERVAL '30 days' WHERE "trial_ends_at" IS NULL;

-- Billing invoices table
CREATE TABLE "billing_invoices" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "firm_id" UUID NOT NULL,
  "stripe_invoice_id" VARCHAR(255),
  "period_start" DATE NOT NULL,
  "period_end" DATE NOT NULL,
  "month_end_balance" DECIMAL(18, 2) NOT NULL DEFAULT 0,
  "base_fee" DECIMAL(12, 2) NOT NULL,
  "basis_points_amount" DECIMAL(12, 2) NOT NULL,
  "total_amount" DECIMAL(12, 2) NOT NULL,
  "currency" CHAR(3) NOT NULL DEFAULT 'GBP',
  "status" "InvoiceStatus" NOT NULL DEFAULT 'DRAFT',
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "paid_at" TIMESTAMPTZ,

  CONSTRAINT "billing_invoices_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "billing_invoices_firm_id_fkey" FOREIGN KEY ("firm_id") REFERENCES "firms"("id") ON DELETE CASCADE
);

CREATE INDEX "billing_invoices_firm_id_status_idx" ON "billing_invoices"("firm_id", "status");
CREATE INDEX "billing_invoices_period_idx" ON "billing_invoices"("period_start", "period_end");

-- Billing settings / audit table
CREATE TABLE "billing_settings" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "firm_id" UUID NOT NULL,
  "base_monthly_fee" DECIMAL(12, 2) NOT NULL,
  "basis_points_rate" DECIMAL(12, 10) NOT NULL,
  "trial_days" INTEGER NOT NULL DEFAULT 30,
  "notes" TEXT,
  "updated_by" UUID,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT "billing_settings_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "billing_settings_firm_id_fkey" FOREIGN KEY ("firm_id") REFERENCES "firms"("id") ON DELETE CASCADE,
  CONSTRAINT "billing_settings_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id")
);

CREATE INDEX "billing_settings_firm_id_idx" ON "billing_settings"("firm_id");

-- AlterTable
ALTER TABLE "audit_log" ADD COLUMN "previous_hash" VARCHAR(64),
ADD COLUMN "current_hash" VARCHAR(64);

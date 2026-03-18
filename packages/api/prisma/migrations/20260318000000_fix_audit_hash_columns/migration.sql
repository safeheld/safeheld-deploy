-- Fix: Add audit hash chain columns if they don't exist
-- The 20260312000000_add_audit_hash_chain migration was recorded but columns were not created

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'audit_log' AND column_name = 'previous_hash'
  ) THEN
    ALTER TABLE "audit_log" ADD COLUMN "previous_hash" VARCHAR(64);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'audit_log' AND column_name = 'current_hash'
  ) THEN
    ALTER TABLE "audit_log" ADD COLUMN "current_hash" VARCHAR(64);
  END IF;
END $$;

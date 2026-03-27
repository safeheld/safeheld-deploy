-- Add profile fields and notification preferences to users table
ALTER TABLE "users" ADD COLUMN "phone" VARCHAR(50);
ALTER TABLE "users" ADD COLUMN "job_title" VARCHAR(255);
ALTER TABLE "users" ADD COLUMN "notification_preferences" JSONB;

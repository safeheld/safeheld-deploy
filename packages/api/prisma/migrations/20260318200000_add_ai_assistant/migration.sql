-- AI Assistant conversations table

CREATE TABLE "ai_conversations" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "firm_id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "session_id" VARCHAR(100) NOT NULL,
  "role" VARCHAR(20) NOT NULL,
  "content" TEXT NOT NULL,
  "context_type" VARCHAR(50) NOT NULL DEFAULT 'general',
  "tokens_used" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT "ai_conversations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ai_conversations_firm_id_fkey" FOREIGN KEY ("firm_id") REFERENCES "firms"("id") ON DELETE CASCADE,
  CONSTRAINT "ai_conversations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
);

CREATE INDEX "ai_conversations_firm_id_created_idx" ON "ai_conversations"("firm_id", "created_at" DESC);
CREATE INDEX "ai_conversations_session_id_idx" ON "ai_conversations"("session_id");
CREATE INDEX "ai_conversations_user_id_idx" ON "ai_conversations"("user_id");

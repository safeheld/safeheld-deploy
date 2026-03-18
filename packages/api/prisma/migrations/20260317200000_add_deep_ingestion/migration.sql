-- CreateEnum
CREATE TYPE "IngestionDocStatus" AS ENUM ('PENDING', 'FETCHING', 'CHUNKING', 'EXTRACTING', 'VALIDATING', 'COMPLETE', 'FAILED');
CREATE TYPE "ValidationStatus" AS ENUM ('VERIFIED', 'UPDATED', 'CREATED', 'UNVERIFIED');

-- CreateTable
CREATE TABLE "ingestion_documents" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "framework" VARCHAR(50) NOT NULL,
    "source_name" VARCHAR(255) NOT NULL,
    "source_url" VARCHAR(500) NOT NULL,
    "raw_content" TEXT,
    "content_hash" VARCHAR(64),
    "page_count" INTEGER,
    "chunk_count" INTEGER,
    "ingested_at" TIMESTAMP(3),
    "status" "IngestionDocStatus" NOT NULL DEFAULT 'PENDING',
    "error_message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ingestion_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ingestion_validation_results" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "document_id" UUID NOT NULL,
    "framework" VARCHAR(50) NOT NULL,
    "rule_code" VARCHAR(20),
    "validation_status" "ValidationStatus" NOT NULL,
    "source_article" VARCHAR(255),
    "extracted_obligation" TEXT NOT NULL,
    "confidence_score" INTEGER NOT NULL,
    "detail" TEXT,
    "admin_reviewed" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ingestion_validation_results_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ingestion_documents_framework_status_idx" ON "ingestion_documents"("framework", "status");
CREATE INDEX "ingestion_validation_results_framework_validation_status_idx" ON "ingestion_validation_results"("framework", "validation_status");
CREATE INDEX "ingestion_validation_results_document_id_idx" ON "ingestion_validation_results"("document_id");

-- AddForeignKey
ALTER TABLE "ingestion_validation_results" ADD CONSTRAINT "ingestion_validation_results_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "ingestion_documents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

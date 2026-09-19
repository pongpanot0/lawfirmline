-- trigram similarity for hybrid (vector + keyword) retrieval on Thai text
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- CreateTable
CREATE TABLE "LegalQuery" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "firmId" TEXT,
    "question" TEXT NOT NULL,
    "citationIds" JSONB NOT NULL,
    "factsText" JSONB NOT NULL,
    "results" JSONB NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'iapp',
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LegalQuery_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LegalQuery_caseId_createdAt_idx" ON "LegalQuery"("caseId", "createdAt");

-- AddForeignKey
ALTER TABLE "LegalQuery" ADD CONSTRAINT "LegalQuery_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LegalQuery" ADD CONSTRAINT "LegalQuery_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

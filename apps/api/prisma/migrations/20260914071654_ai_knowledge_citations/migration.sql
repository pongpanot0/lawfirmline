-- AlterTable
ALTER TABLE "CaseKnowledge" ADD COLUMN     "flags" JSONB,
ADD COLUMN     "reviewedAt" TIMESTAMP(3),
ADD COLUMN     "reviewedById" TEXT;

-- CreateTable
CREATE TABLE "KnowledgeCitation" (
    "id" TEXT NOT NULL,
    "knowledgeId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "documentVersion" INTEGER NOT NULL,
    "page" INTEGER,
    "statement" TEXT NOT NULL,
    "quote" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KnowledgeCitation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "KnowledgeCitation_knowledgeId_idx" ON "KnowledgeCitation"("knowledgeId");

-- AddForeignKey
ALTER TABLE "CaseKnowledge" ADD CONSTRAINT "CaseKnowledge_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeCitation" ADD CONSTRAINT "KnowledgeCitation_knowledgeId_fkey" FOREIGN KEY ("knowledgeId") REFERENCES "CaseKnowledge"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeCitation" ADD CONSTRAINT "KnowledgeCitation_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

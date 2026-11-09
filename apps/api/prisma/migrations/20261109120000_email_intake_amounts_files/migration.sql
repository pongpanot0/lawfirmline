ALTER TABLE "Intake" ADD COLUMN "insurerPaidAmount" DOUBLE PRECISION,
    ADD COLUMN "otherAmounts" JSONB;
ALTER TABLE "IntakeFieldProposal" ADD COLUMN "matterLabel" TEXT,
    ADD COLUMN "sourceDocumentId" TEXT;
CREATE INDEX "IntakeFieldProposal_sourceDocumentId_idx" ON "IntakeFieldProposal"("sourceDocumentId");
ALTER TABLE "IntakeFieldProposal" ADD CONSTRAINT "IntakeFieldProposal_sourceDocumentId_fkey"
    FOREIGN KEY ("sourceDocumentId") REFERENCES "Document"("id") ON DELETE SET NULL ON UPDATE CASCADE;

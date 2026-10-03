ALTER TABLE "IntakeDocumentRequest" ALTER COLUMN "intakeId" DROP NOT NULL;
ALTER TABLE "IntakeDocumentRequest" ADD COLUMN "caseId" TEXT, ADD COLUMN "requestedFrom" TEXT;
ALTER TABLE "IntakeDocumentRequest" ADD CONSTRAINT "IntakeDocumentRequest_caseId_fkey"
  FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "IntakeDocumentRequest" ADD CONSTRAINT "IntakeDocumentRequest_scope_check"
  CHECK ("intakeId" IS NOT NULL OR "caseId" IS NOT NULL);
CREATE INDEX "IntakeDocumentRequest_caseId_status_idx" ON "IntakeDocumentRequest"("caseId", "status");

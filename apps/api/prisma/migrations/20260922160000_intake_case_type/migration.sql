-- AlterTable
ALTER TABLE "Intake" ADD COLUMN "caseTypeId" TEXT;

-- CreateIndex
CREATE INDEX "Intake_caseTypeId_idx" ON "Intake"("caseTypeId");

-- AddForeignKey
ALTER TABLE "Intake" ADD CONSTRAINT "Intake_caseTypeId_fkey" FOREIGN KEY ("caseTypeId") REFERENCES "CaseType"("id") ON DELETE SET NULL ON UPDATE CASCADE;

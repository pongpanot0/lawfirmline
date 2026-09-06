-- AlterTable
ALTER TABLE "Document" ADD COLUMN     "intakeId" TEXT,
ALTER COLUMN "caseId" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "Document_intakeId_idx" ON "Document"("intakeId");

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_intakeId_fkey" FOREIGN KEY ("intakeId") REFERENCES "Intake"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- At least one owner: case or intake
ALTER TABLE "Document" ADD CONSTRAINT "Document_owner_check" CHECK (("caseId" IS NOT NULL) OR ("intakeId" IS NOT NULL));

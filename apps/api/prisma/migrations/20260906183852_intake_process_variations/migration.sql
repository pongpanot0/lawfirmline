-- AlterEnum
ALTER TYPE "IntakeStatus" ADD VALUE 'CONSULTED';

-- AlterEnum
ALTER TYPE "IntakeDecision" ADD VALUE 'CONSULTATION_ONLY';

-- AlterTable
ALTER TABLE "Intake" ADD COLUMN "relatedCaseId" TEXT,
ADD COLUMN "isOngoingElsewhere" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "externalCaseNumber" TEXT,
ADD COLUMN "currentStageNote" TEXT;

-- AddForeignKey
ALTER TABLE "Intake" ADD CONSTRAINT "Intake_relatedCaseId_fkey" FOREIGN KEY ("relatedCaseId") REFERENCES "Case"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "Intake_relatedCaseId_idx" ON "Intake"("relatedCaseId");

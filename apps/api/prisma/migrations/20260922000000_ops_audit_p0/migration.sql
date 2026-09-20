-- CreateEnum
CREATE TYPE "OnHoldCategory" AS ENUM ('WAITING_CLIENT', 'WAITING_COURT', 'WAITING_DOCUMENT', 'WAITING_INTERNAL_REVIEW', 'WAITING_EXTERNAL', 'OTHER');



-- AlterTable
ALTER TABLE "DocumentTemplate" ADD COLUMN     "firmId" TEXT;

-- AlterTable
ALTER TABLE "PlaybookRelease" ADD COLUMN     "caseTypeId" TEXT;

-- AlterTable
ALTER TABLE "TaskOnHold" ADD COLUMN     "category" "OnHoldCategory" NOT NULL DEFAULT 'OTHER';

-- CreateTable
CREATE TABLE "CaseStatusLog" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "fromStatus" "CaseStatus" NOT NULL,
    "toStatus" "CaseStatus" NOT NULL,
    "changedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CaseStatusLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IntakeChecklistItem" (
    "id" TEXT NOT NULL,
    "intakeId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "documentId" TEXT,
    "confirmedById" TEXT,
    "confirmedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IntakeChecklistItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CaseStatusLog_caseId_createdAt_idx" ON "CaseStatusLog"("caseId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "IntakeChecklistItem_intakeId_label_key" ON "IntakeChecklistItem"("intakeId", "label");

-- CreateIndex
CREATE INDEX "DocumentTemplate_firmId_idx" ON "DocumentTemplate"("firmId");

-- AddForeignKey
ALTER TABLE "CaseStatusLog" ADD CONSTRAINT "CaseStatusLog_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CaseStatusLog" ADD CONSTRAINT "CaseStatusLog_changedById_fkey" FOREIGN KEY ("changedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntakeChecklistItem" ADD CONSTRAINT "IntakeChecklistItem_intakeId_fkey" FOREIGN KEY ("intakeId") REFERENCES "Intake"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntakeChecklistItem" ADD CONSTRAINT "IntakeChecklistItem_confirmedById_fkey" FOREIGN KEY ("confirmedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;


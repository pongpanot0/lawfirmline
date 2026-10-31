-- CreateEnum
CREATE TYPE "LawyerLicenseType" AS ENUM ('TWO_YEAR', 'LIFETIME');

-- CreateEnum
CREATE TYPE "PaperFileAction" AS ENUM ('CHECK_OUT', 'CHECK_IN', 'MOVE');

-- AlterEnum
ALTER TYPE "NotificationCategory" ADD VALUE 'LICENSE';

-- AlterTable
ALTER TABLE "FirmMember" ADD COLUMN     "defaultHourlyRate" DOUBLE PRECISION,
ADD COLUMN     "monthlyBillableTargetHours" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "lawyerLicenseExpiresAt" DATE,
ADD COLUMN     "lawyerLicenseNo" TEXT,
ADD COLUMN     "lawyerLicenseType" "LawyerLicenseType";

-- AlterTable
ALTER TABLE "Case" ADD COLUMN     "paperFileHolderId" TEXT,
ADD COLUMN     "paperFileLocation" TEXT;

-- AlterTable
ALTER TABLE "TimeEntry" ADD COLUMN     "writeOffReason" TEXT,
ADD COLUMN     "writtenOffAt" TIMESTAMP(3),
ADD COLUMN     "writtenOffById" TEXT;

-- AlterTable
ALTER TABLE "Expense" ADD COLUMN     "officialReceiptNo" TEXT,
ADD COLUMN     "writeOffReason" TEXT,
ADD COLUMN     "writtenOffAt" TIMESTAMP(3),
ADD COLUMN     "writtenOffById" TEXT;

-- AlterTable
ALTER TABLE "CashAdvance" ADD COLUMN     "returnedAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "settledAt" TIMESTAMP(3),
ADD COLUMN     "settledById" TEXT,
ADD COLUMN     "settlementNote" TEXT;

-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN     "discountAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "discountReason" TEXT,
ADD COLUMN     "splitGroupId" TEXT;

-- CreateTable
CREATE TABLE "LawyerLicenseReminderLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" DATE NOT NULL,
    "milestone" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LawyerLicenseReminderLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaperFileMovement" (
    "id" TEXT NOT NULL,
    "firmId" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "action" "PaperFileAction" NOT NULL,
    "holderUserId" TEXT,
    "location" TEXT,
    "note" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaperFileMovement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LawyerLicenseReminderLog_userId_expiresAt_milestone_key" ON "LawyerLicenseReminderLog"("userId", "expiresAt", "milestone");

-- CreateIndex
CREATE INDEX "PaperFileMovement_firmId_caseId_createdAt_idx" ON "PaperFileMovement"("firmId", "caseId", "createdAt");

-- CreateIndex
CREATE INDEX "Case_paperFileHolderId_idx" ON "Case"("paperFileHolderId");

-- CreateIndex
CREATE INDEX "Invoice_firmId_splitGroupId_idx" ON "Invoice"("firmId", "splitGroupId");

-- AddForeignKey
ALTER TABLE "LawyerLicenseReminderLog" ADD CONSTRAINT "LawyerLicenseReminderLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaperFileMovement" ADD CONSTRAINT "PaperFileMovement_firmId_fkey" FOREIGN KEY ("firmId") REFERENCES "Firm"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaperFileMovement" ADD CONSTRAINT "PaperFileMovement_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaperFileMovement" ADD CONSTRAINT "PaperFileMovement_holderUserId_fkey" FOREIGN KEY ("holderUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaperFileMovement" ADD CONSTRAINT "PaperFileMovement_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Case" ADD CONSTRAINT "Case_paperFileHolderId_fkey" FOREIGN KEY ("paperFileHolderId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimeEntry" ADD CONSTRAINT "TimeEntry_writtenOffById_fkey" FOREIGN KEY ("writtenOffById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_writtenOffById_fkey" FOREIGN KEY ("writtenOffById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashAdvance" ADD CONSTRAINT "CashAdvance_settledById_fkey" FOREIGN KEY ("settledById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;


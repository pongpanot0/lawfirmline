/*
  Warnings:

  - You are about to drop the `InsuranceClaim` table. If the table is not empty, all the data it contains will be lost.

*/
-- CreateEnum
CREATE TYPE "ClosingEmailDraftStatus" AS ENUM ('DRAFT', 'APPROVED');

-- DropForeignKey
ALTER TABLE "InsuranceClaim" DROP CONSTRAINT "InsuranceClaim_caseId_fkey";

-- DropForeignKey
ALTER TABLE "InsuranceClaim" DROP CONSTRAINT "InsuranceClaim_createdById_fkey";

-- DropTable
DROP TABLE "InsuranceClaim";

-- DropEnum
DROP TYPE "InsuranceClaimStage";

-- CreateTable
CREATE TABLE "ClosingEmailDraft" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "bodyText" TEXT NOT NULL,
    "selectedActivityIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "missingDataNotes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" "ClosingEmailDraftStatus" NOT NULL DEFAULT 'DRAFT',
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClosingEmailDraft_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ClosingEmailDraft_caseId_createdAt_idx" ON "ClosingEmailDraft"("caseId", "createdAt");

-- AddForeignKey
ALTER TABLE "ClosingEmailDraft" ADD CONSTRAINT "ClosingEmailDraft_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClosingEmailDraft" ADD CONSTRAINT "ClosingEmailDraft_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClosingEmailDraft" ADD CONSTRAINT "ClosingEmailDraft_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

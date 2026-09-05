-- CreateEnum
CREATE TYPE "InsuranceClaimStage" AS ENUM ('CLAIM_FILED', 'DENIED_OR_PARTIAL', 'DEMAND_SENT', 'OIC_COMPLAINT', 'SUIT_FILED');

-- CreateTable
CREATE TABLE "InsuranceClaim" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "insurerName" TEXT NOT NULL,
    "policyNumber" TEXT,
    "claimNumber" TEXT,
    "incidentDate" TIMESTAMP(3) NOT NULL,
    "claimedDate" TIMESTAMP(3),
    "denialReason" TEXT,
    "stage" "InsuranceClaimStage" NOT NULL DEFAULT 'CLAIM_FILED',
    "demandLetterSentAt" TIMESTAMP(3),
    "demandLetterDeadline" TIMESTAMP(3),
    "oicComplaintNumber" TEXT,
    "oicComplaintDate" TIMESTAMP(3),
    "oicOutcome" TEXT,
    "limitationEventId" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InsuranceClaim_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "InsuranceClaim_caseId_key" ON "InsuranceClaim"("caseId");

-- CreateIndex
CREATE INDEX "InsuranceClaim_caseId_idx" ON "InsuranceClaim"("caseId");

-- AddForeignKey
ALTER TABLE "InsuranceClaim" ADD CONSTRAINT "InsuranceClaim_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON UPDATE CASCADE ON DELETE CASCADE;

-- AddForeignKey
ALTER TABLE "InsuranceClaim" ADD CONSTRAINT "InsuranceClaim_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON UPDATE CASCADE ON DELETE RESTRICT;

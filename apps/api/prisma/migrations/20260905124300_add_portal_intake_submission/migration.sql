-- AlterEnum
ALTER TYPE "ReferralChannel" ADD VALUE 'PORTAL';

-- AlterTable
ALTER TABLE "Intake" ADD COLUMN "portalSubmissionId" TEXT;

-- CreateTable
CREATE TABLE "PortalIntakeSubmission" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "clientContactId" TEXT NOT NULL,
    "referenceNumber" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "detail" TEXT NOT NULL,
    "clientRequestedDate" TIMESTAMP(3),
    "urgencyFlag" BOOLEAN NOT NULL DEFAULT false,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "withdrawnByClient" BOOLEAN NOT NULL DEFAULT false,
    "withdrawnAt" TIMESTAMP(3),
    "withdrawnReason" TEXT,
    "intakeId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PortalIntakeSubmission_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PortalIntakeSubmission_referenceNumber_key" ON "PortalIntakeSubmission"("referenceNumber");

-- CreateIndex
CREATE UNIQUE INDEX "PortalIntakeSubmission_intakeId_key" ON "PortalIntakeSubmission"("intakeId");

-- CreateIndex
CREATE INDEX "PortalIntakeSubmission_clientId_submittedAt_idx" ON "PortalIntakeSubmission"("clientId", "submittedAt");

-- CreateIndex
CREATE INDEX "PortalIntakeSubmission_clientContactId_submittedAt_idx" ON "PortalIntakeSubmission"("clientContactId", "submittedAt");

-- CreateIndex
CREATE INDEX "PortalIntakeSubmission_withdrawnByClient_idx" ON "PortalIntakeSubmission"("withdrawnByClient");

-- AddForeignKey
ALTER TABLE "PortalIntakeSubmission" ADD CONSTRAINT "PortalIntakeSubmission_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PortalIntakeSubmission" ADD CONSTRAINT "PortalIntakeSubmission_clientContactId_fkey" FOREIGN KEY ("clientContactId") REFERENCES "ClientContact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PortalIntakeSubmission" ADD CONSTRAINT "PortalIntakeSubmission_intakeId_fkey" FOREIGN KEY ("intakeId") REFERENCES "Intake"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddUniqueConstraint
ALTER TABLE "Intake" ADD CONSTRAINT "Intake_portalSubmissionId_key" UNIQUE ("portalSubmissionId");

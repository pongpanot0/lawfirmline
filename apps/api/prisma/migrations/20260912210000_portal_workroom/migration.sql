ALTER TABLE "PortalIntakeSubmission"
 ADD COLUMN "accessContactIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
 ADD COLUMN "revokedContactIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
 ADD COLUMN "officeOwnerId" TEXT,
 ADD COLUMN "scopeText" TEXT,
 ADD COLUMN "proposedDate" TIMESTAMP(3),
 ADD COLUMN "agreedDate" TIMESTAMP(3),
 ADD COLUMN "commitmentVersion" INTEGER NOT NULL DEFAULT 0,
 ADD COLUMN "acceptedCommitmentVersion" INTEGER,
 ADD COLUMN "agreementAcceptedAt" TIMESTAMP(3),
 ADD COLUMN "deliveredAt" TIMESTAMP(3),
 ADD COLUMN "deliveryAcknowledgedAt" TIMESTAMP(3);
CREATE TABLE "PortalRequestMessage" (
 "id" TEXT PRIMARY KEY NOT NULL, "submissionId" TEXT NOT NULL, "requestKey" TEXT NOT NULL, "contentHash" TEXT NOT NULL,
 "authorId" TEXT NOT NULL, "authorKind" TEXT NOT NULL, "body" TEXT NOT NULL,
 "filename" TEXT, "storagePath" TEXT, "mimeType" TEXT, "size" INTEGER,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY ("submissionId") REFERENCES "PortalIntakeSubmission"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "PortalRequestMessage_submissionId_authorId_requestKey_key" ON "PortalRequestMessage"("submissionId", "authorId", "requestKey");
CREATE INDEX "PortalRequestMessage_submissionId_createdAt_idx" ON "PortalRequestMessage"("submissionId", "createdAt");

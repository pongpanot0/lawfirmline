-- AlterTable
ALTER TABLE "ClientContact" ADD COLUMN     "lastSeenMessagesAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "PortalIntakeAttachment" (
    "id" TEXT NOT NULL,
    "portalIntakeSubmissionId" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "storagePath" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PortalIntakeAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClientPortalInvite" (
    "id" TEXT NOT NULL,
    "clientContactId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "invitedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClientPortalInvite_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PortalIntakeAttachment_portalIntakeSubmissionId_idx" ON "PortalIntakeAttachment"("portalIntakeSubmissionId");

-- CreateIndex
CREATE UNIQUE INDEX "ClientPortalInvite_token_key" ON "ClientPortalInvite"("token");

-- CreateIndex
CREATE INDEX "ClientPortalInvite_clientContactId_idx" ON "ClientPortalInvite"("clientContactId");

-- AddForeignKey
ALTER TABLE "PortalIntakeAttachment" ADD CONSTRAINT "PortalIntakeAttachment_portalIntakeSubmissionId_fkey" FOREIGN KEY ("portalIntakeSubmissionId") REFERENCES "PortalIntakeSubmission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientPortalInvite" ADD CONSTRAINT "ClientPortalInvite_clientContactId_fkey" FOREIGN KEY ("clientContactId") REFERENCES "ClientContact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientPortalInvite" ADD CONSTRAINT "ClientPortalInvite_invitedById_fkey" FOREIGN KEY ("invitedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

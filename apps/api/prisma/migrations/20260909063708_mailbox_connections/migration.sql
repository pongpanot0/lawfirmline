-- CreateEnum
CREATE TYPE "MailboxConnectionStatus" AS ENUM ('ACTIVE', 'EXPIRED', 'REVOKED', 'ERROR');

-- CreateTable
CREATE TABLE "MailboxConnection" (
    "id" TEXT NOT NULL,
    "firmId" TEXT NOT NULL,
    "mailboxAddress" TEXT NOT NULL,
    "connectedByUserId" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'microsoft',
    "accessTokenEnc" TEXT NOT NULL,
    "refreshTokenEnc" TEXT NOT NULL,
    "tokenExpiresAt" TIMESTAMP(3) NOT NULL,
    "webhookSecret" TEXT NOT NULL,
    "graphSubscriptionId" TEXT,
    "subscriptionExpiresAt" TIMESTAMP(3),
    "deltaLink" TEXT,
    "status" "MailboxConnectionStatus" NOT NULL DEFAULT 'ACTIVE',
    "lastError" TEXT,
    "lastSyncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MailboxConnection_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MailboxConnection_firmId_idx" ON "MailboxConnection"("firmId");
CREATE INDEX "MailboxConnection_graphSubscriptionId_idx" ON "MailboxConnection"("graphSubscriptionId");
CREATE UNIQUE INDEX "MailboxConnection_firmId_mailboxAddress_key" ON "MailboxConnection"("firmId", "mailboxAddress");

-- AddForeignKey
ALTER TABLE "MailboxConnection" ADD CONSTRAINT "MailboxConnection_firmId_fkey" FOREIGN KEY ("firmId") REFERENCES "Firm"("id") ON DELETE CASCADE ON UPDATE CASCADE;

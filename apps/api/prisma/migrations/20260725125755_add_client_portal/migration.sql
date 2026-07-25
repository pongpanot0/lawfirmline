-- AlterTable
ALTER TABLE "ClientContact" ADD COLUMN "portalEnabled" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Document" ADD COLUMN "visibleToClient" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "ClientPortalLoginToken" (
    "id" TEXT NOT NULL,
    "clientContactId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClientPortalLoginToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ClientPortalLoginToken_token_key" ON "ClientPortalLoginToken"("token");

-- CreateIndex
CREATE INDEX "ClientPortalLoginToken_clientContactId_idx" ON "ClientPortalLoginToken"("clientContactId");

-- AddForeignKey
ALTER TABLE "ClientPortalLoginToken" ADD CONSTRAINT "ClientPortalLoginToken_clientContactId_fkey" FOREIGN KEY ("clientContactId") REFERENCES "ClientContact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

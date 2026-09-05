/*
  Warnings:

  - A unique constraint covering the columns `[lineUserId]` on the table `ClientContact` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[lineLinkCode]` on the table `ClientContact` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "ClientContact" ADD COLUMN     "lineConnectedAt" TIMESTAMP(3),
ADD COLUMN     "lineLinkCode" TEXT,
ADD COLUMN     "lineLinkCodeExpiresAt" TIMESTAMP(3),
ADD COLUMN     "lineUserId" TEXT;

-- CreateTable
CREATE TABLE "ContactNotificationPreference" (
    "id" TEXT NOT NULL,
    "clientContactId" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "ContactNotificationPreference_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ContactNotificationPreference_clientContactId_channel_key" ON "ContactNotificationPreference"("clientContactId", "channel");

-- CreateIndex
CREATE UNIQUE INDEX "ClientContact_lineUserId_key" ON "ClientContact"("lineUserId");

-- CreateIndex
CREATE UNIQUE INDEX "ClientContact_lineLinkCode_key" ON "ClientContact"("lineLinkCode");

-- AddForeignKey
ALTER TABLE "ContactNotificationPreference" ADD CONSTRAINT "ContactNotificationPreference_clientContactId_fkey" FOREIGN KEY ("clientContactId") REFERENCES "ClientContact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

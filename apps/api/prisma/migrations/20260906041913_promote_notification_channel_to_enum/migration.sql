/*
  Warnings:

  - Changed the type of `channel` on the `ContactNotificationPreference` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.

*/
-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('EMAIL', 'LINE');

-- AlterTable
ALTER TABLE "ContactNotificationPreference" DROP COLUMN "channel",
ADD COLUMN     "channel" "NotificationChannel" NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "ContactNotificationPreference_clientContactId_channel_key" ON "ContactNotificationPreference"("clientContactId", "channel");

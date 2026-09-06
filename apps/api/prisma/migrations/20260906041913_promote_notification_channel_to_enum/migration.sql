-- AlterEnum
CREATE TYPE "NotificationChannel" AS ENUM ('EMAIL', 'LINE');

-- AlterTable
ALTER TABLE "ContactNotificationPreference" ALTER COLUMN "channel" TYPE "NotificationChannel" USING "channel"::"NotificationChannel";

-- CreateIndex
CREATE UNIQUE INDEX "ContactNotificationPreference_clientContactId_channel_key" ON "ContactNotificationPreference"("clientContactId", "channel");

-- AlterEnum
CREATE TYPE "NotificationChannel" AS ENUM ('EMAIL', 'LINE');

-- AlterTable
ALTER TABLE "ContactNotificationPreference" ALTER COLUMN "channel" TYPE "NotificationChannel" USING "channel"::"NotificationChannel";

-- AlterTable
ALTER TABLE "Notification" ADD COLUMN "held" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "Notification_held_userId_idx" ON "Notification"("held", "userId");

-- AlterTable
ALTER TABLE "User" ADD COLUMN "lineUserId" TEXT,
ADD COLUMN "lineLinkCode" TEXT,
ADD COLUMN "lineLinkCodeExpiresAt" TIMESTAMP(3),
ADD COLUMN "lineConnectedAt" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "User_lineUserId_key" ON "User"("lineUserId");

-- CreateIndex
CREATE UNIQUE INDEX "User_lineLinkCode_key" ON "User"("lineLinkCode");

-- AlterTable
ALTER TABLE "CalendarEvent" ALTER COLUMN "reminderMinutes" SET DEFAULT ARRAY[4320, 1440, 60]::INTEGER[];

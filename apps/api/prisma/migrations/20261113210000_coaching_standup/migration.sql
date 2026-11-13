-- CreateEnum
CREATE TYPE "StandupStatus" AS ENUM ('CHECKED_IN', 'SKIPPED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationCategory" ADD VALUE 'COACHING';
ALTER TYPE "NotificationCategory" ADD VALUE 'STANDUP';

-- CreateTable
CREATE TABLE "DailyStandup" (
    "id" TEXT NOT NULL,
    "firmId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "status" "StandupStatus" NOT NULL,
    "yesterdayTaskIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "yesterdayNote" TEXT,
    "todayTaskIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "todayNote" TEXT,
    "blocker" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DailyStandup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StandupPromptLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "day" DATE NOT NULL,

    CONSTRAINT "StandupPromptLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CoachingNote" (
    "id" TEXT NOT NULL,
    "firmId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "praise" TEXT NOT NULL,
    "improve" TEXT NOT NULL,
    "nextStep" TEXT NOT NULL,
    "linkedTaskIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "aiDrafted" BOOLEAN NOT NULL DEFAULT false,
    "acknowledgedAt" TIMESTAMP(3),
    "reply" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CoachingNote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DailyStandup_firmId_day_idx" ON "DailyStandup"("firmId", "day");

-- CreateIndex
CREATE UNIQUE INDEX "DailyStandup_firmId_userId_day_key" ON "DailyStandup"("firmId", "userId", "day");

-- CreateIndex
CREATE UNIQUE INDEX "StandupPromptLog_userId_day_key" ON "StandupPromptLog"("userId", "day");

-- CreateIndex
CREATE INDEX "CoachingNote_firmId_userId_createdAt_idx" ON "CoachingNote"("firmId", "userId", "createdAt");

-- CreateIndex
CREATE INDEX "CoachingNote_firmId_acknowledgedAt_idx" ON "CoachingNote"("firmId", "acknowledgedAt");

-- AddForeignKey
ALTER TABLE "DailyStandup" ADD CONSTRAINT "DailyStandup_firmId_fkey" FOREIGN KEY ("firmId") REFERENCES "Firm"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyStandup" ADD CONSTRAINT "DailyStandup_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoachingNote" ADD CONSTRAINT "CoachingNote_firmId_fkey" FOREIGN KEY ("firmId") REFERENCES "Firm"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoachingNote" ADD CONSTRAINT "CoachingNote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoachingNote" ADD CONSTRAINT "CoachingNote_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- CreateEnum
CREATE TYPE "DateSuggestionSource" AS ENUM ('DOCUMENT', 'RULE');

-- CreateEnum
CREATE TYPE "DeadlineTrigger" AS ENUM ('COURT_DATE', 'JUDGMENT', 'ORDER_RECEIVED', 'COMPLAINT_SERVED');

-- CreateEnum
CREATE TYPE "DeadlineDayBasis" AS ENUM ('CALENDAR', 'BUSINESS');

-- AlterTable
ALTER TABLE "DocumentDateSuggestion"
    ALTER COLUMN "sourceExcerpt" DROP NOT NULL,
    ADD COLUMN "source" "DateSuggestionSource" NOT NULL DEFAULT 'DOCUMENT',
    ADD COLUMN "deadlineRuleId" TEXT,
    ADD COLUMN "triggerEventId" TEXT;

-- CreateTable
CREATE TABLE "DeadlineRule" (
    "id" TEXT NOT NULL,
    "firmId" TEXT NOT NULL,
    "caseTypeId" TEXT,
    "trigger" "DeadlineTrigger" NOT NULL,
    "label" TEXT NOT NULL,
    "offsetDays" INTEGER NOT NULL,
    "dayBasis" "DeadlineDayBasis" NOT NULL DEFAULT 'CALENDAR',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeadlineRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PublicHoliday" (
    "id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "PublicHoliday_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailyDigestLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "digestDate" DATE NOT NULL,
    "channel" TEXT NOT NULL DEFAULT 'line',
    "itemCount" INTEGER NOT NULL DEFAULT 0,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DailyDigestLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DeadlineRule_firmId_trigger_isActive_idx" ON "DeadlineRule"("firmId", "trigger", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "PublicHoliday_date_key" ON "PublicHoliday"("date");

-- CreateIndex
CREATE UNIQUE INDEX "DailyDigestLog_userId_digestDate_channel_key" ON "DailyDigestLog"("userId", "digestDate", "channel");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentDateSuggestion_triggerEventId_deadlineRuleId_key" ON "DocumentDateSuggestion"("triggerEventId", "deadlineRuleId");

-- CreateIndex
CREATE INDEX "CalendarEvent_startAt_idx" ON "CalendarEvent"("startAt");

-- CreateIndex
CREATE INDEX "Task_dueDate_idx" ON "Task"("dueDate");

-- CreateIndex
CREATE INDEX "Task_assigneeId_status_dueDate_idx" ON "Task"("assigneeId", "status", "dueDate");

-- AddForeignKey
ALTER TABLE "DocumentDateSuggestion" ADD CONSTRAINT "DocumentDateSuggestion_deadlineRuleId_fkey" FOREIGN KEY ("deadlineRuleId") REFERENCES "DeadlineRule"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentDateSuggestion" ADD CONSTRAINT "DocumentDateSuggestion_triggerEventId_fkey" FOREIGN KEY ("triggerEventId") REFERENCES "CalendarEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeadlineRule" ADD CONSTRAINT "DeadlineRule_firmId_fkey" FOREIGN KEY ("firmId") REFERENCES "Firm"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeadlineRule" ADD CONSTRAINT "DeadlineRule_caseTypeId_fkey" FOREIGN KEY ("caseTypeId") REFERENCES "CaseType"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyDigestLog" ADD CONSTRAINT "DailyDigestLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

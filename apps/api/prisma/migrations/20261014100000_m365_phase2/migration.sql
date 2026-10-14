-- AlterEnum
ALTER TYPE "NotificationCategory" ADD VALUE 'EMAIL';

-- AlterTable
ALTER TABLE "MailboxConnection" ADD COLUMN "calendarDeltaLink" TEXT,
ADD COLUMN "calendarDeltaStartedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "CalendarEventOutlookCopy" ADD COLUMN "removedInOutlookAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "CalendarEventOutlookChange" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "copyId" TEXT NOT NULL,
    "proposedStartAt" TIMESTAMP(3) NOT NULL,
    "proposedEndAt" TIMESTAMP(3),
    "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "resolvedById" TEXT,
    "resolution" TEXT,

    CONSTRAINT "CalendarEventOutlookChange_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailTemplate" (
    "id" TEXT NOT NULL,
    "firmId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmailTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CalendarEventOutlookChange_eventId_resolvedAt_idx" ON "CalendarEventOutlookChange"("eventId", "resolvedAt");

-- CreateIndex
CREATE INDEX "EmailTemplate_firmId_idx" ON "EmailTemplate"("firmId");

-- AddForeignKey
ALTER TABLE "CalendarEventOutlookChange" ADD CONSTRAINT "CalendarEventOutlookChange_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "CalendarEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailTemplate" ADD CONSTRAINT "EmailTemplate_firmId_fkey" FOREIGN KEY ("firmId") REFERENCES "Firm"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailTemplate" ADD CONSTRAINT "EmailTemplate_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

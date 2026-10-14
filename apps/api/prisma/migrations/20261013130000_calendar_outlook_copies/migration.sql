CREATE TABLE "CalendarEventOutlookCopy" (
  "id" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "connectionId" TEXT NOT NULL,
  "graphEventId" TEXT NOT NULL,
  "syncedAt" TIMESTAMP(3) NOT NULL,
  "lastError" TEXT,
  CONSTRAINT "CalendarEventOutlookCopy_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CalendarEventOutlookCopy_eventId_userId_key" ON "CalendarEventOutlookCopy"("eventId", "userId");
CREATE INDEX "CalendarEventOutlookCopy_connectionId_idx" ON "CalendarEventOutlookCopy"("connectionId");
CREATE INDEX "CalendarEventOutlookCopy_userId_idx" ON "CalendarEventOutlookCopy"("userId");

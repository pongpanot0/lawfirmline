ALTER TABLE "User" ADD COLUMN "primaryMailboxConnectionId" TEXT;
ALTER TABLE "MailboxConnection" ADD COLUMN "showCalendar" BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN "calendarSyncedAt" TIMESTAMP(3);
CREATE UNIQUE INDEX "User_primaryMailboxConnectionId_key" ON "User"("primaryMailboxConnectionId");
ALTER TABLE "User" ADD CONSTRAINT "User_primaryMailboxConnectionId_fkey"
    FOREIGN KEY ("primaryMailboxConnectionId") REFERENCES "MailboxConnection"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "OutlookCalendarItem" (
    "id" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "graphEventId" TEXT NOT NULL,
    "iCalUId" TEXT,
    "subject" TEXT,
    "location" TEXT,
    "startAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3) NOT NULL,
    "isAllDay" BOOLEAN NOT NULL DEFAULT false,
    "showAs" TEXT NOT NULL,
    "webLink" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "OutlookCalendarItem_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "OutlookCalendarItem_connectionId_graphEventId_key" ON "OutlookCalendarItem"("connectionId", "graphEventId");
CREATE INDEX "OutlookCalendarItem_userId_startAt_idx" ON "OutlookCalendarItem"("userId", "startAt");
ALTER TABLE "OutlookCalendarItem" ADD CONSTRAINT "OutlookCalendarItem_connectionId_fkey"
    FOREIGN KEY ("connectionId") REFERENCES "MailboxConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Match the old calendar-copy preference, with a stable tie-break for equal creation times.
UPDATE "User" AS u SET "primaryMailboxConnectionId" = (
    SELECT c."id" FROM "MailboxConnection" AS c
    WHERE c."userId" = u."id" AND c."status" <> 'REVOKED'
    ORDER BY CASE WHEN c."status" = 'ACTIVE' AND c."syncCalendar" THEN 0
                  WHEN c."status" = 'ACTIVE' THEN 1 ELSE 2 END,
             c."createdAt" ASC, c."id" ASC
    LIMIT 1
);

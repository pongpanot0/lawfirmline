-- CreateTable
CREATE TABLE "CalendarEventAssignee" (
    "eventId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CalendarEventAssignee_pkey" PRIMARY KEY ("eventId","userId")
);

-- CreateIndex
CREATE INDEX "CalendarEventAssignee_userId_idx" ON "CalendarEventAssignee"("userId");

-- AddForeignKey
ALTER TABLE "CalendarEventAssignee" ADD CONSTRAINT "CalendarEventAssignee_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "CalendarEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarEventAssignee" ADD CONSTRAINT "CalendarEventAssignee_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: preserve existing single-assignee data as the first assignee row
INSERT INTO "CalendarEventAssignee" ("eventId","userId") SELECT "id","assigneeId" FROM "CalendarEvent" WHERE "assigneeId" IS NOT NULL ON CONFLICT DO NOTHING;


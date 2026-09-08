-- AlterTable
ALTER TABLE "CalendarEvent" ADD COLUMN "assigneeId" TEXT;

-- CreateIndex
CREATE INDEX "CalendarEvent_assigneeId_idx" ON "CalendarEvent"("assigneeId");

-- AddForeignKey
ALTER TABLE "CalendarEvent" ADD CONSTRAINT "CalendarEvent_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

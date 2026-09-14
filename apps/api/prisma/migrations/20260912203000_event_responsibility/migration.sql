CREATE TABLE "EventResponsibility" (
 "eventId" TEXT NOT NULL PRIMARY KEY,
 "eventUpdatedAt" TIMESTAMP(3) NOT NULL,
 "ownerId" TEXT NOT NULL,
 "acceptedAt" TIMESTAMP(3),
 "completedAt" TIMESTAMP(3),
 "updatedAt" TIMESTAMP(3) NOT NULL,
 CONSTRAINT "EventResponsibility_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "CalendarEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

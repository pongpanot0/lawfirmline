ALTER TABLE "CalendarEvent"
  ADD COLUMN "onlineMeeting" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "onlineMeetingUrl" TEXT,
  ADD COLUMN "meetingOrganizerId" TEXT,
  ADD COLUMN "inviteeEmails" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "CalendarEvent" ADD CONSTRAINT "CalendarEvent_meetingOrganizerId_fkey"
  FOREIGN KEY ("meetingOrganizerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

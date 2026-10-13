ALTER TABLE "MailboxConnection"
  ADD COLUMN "userId" TEXT,
  ADD COLUMN "syncInboxToIntake" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "syncCalendar" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "sentDeltaLink" TEXT;

-- Existing rows were connected for inbox intake — keep that behaviour for them.
UPDATE "MailboxConnection" mc SET "userId" = u."id", "syncInboxToIntake" = true
FROM "User" u WHERE u."id" = mc."connectedByUserId";

ALTER TABLE "MailboxConnection" ADD CONSTRAINT "MailboxConnection_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "MailboxConnection_userId_idx" ON "MailboxConnection"("userId");

ALTER TABLE "EmailThread"
  ADD COLUMN "mailboxConnectionId" TEXT,
  ADD COLUMN "caseId" TEXT;
ALTER TABLE "EmailThread" ADD CONSTRAINT "EmailThread_mailboxConnectionId_fkey"
  FOREIGN KEY ("mailboxConnectionId") REFERENCES "MailboxConnection"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "EmailThread" ADD CONSTRAINT "EmailThread_caseId_fkey"
  FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "EmailThread_mailboxConnectionId_idx" ON "EmailThread"("mailboxConnectionId");
CREATE INDEX "EmailThread_caseId_idx" ON "EmailThread"("caseId");

ALTER TABLE "EmailMessage"
  ADD COLUMN "graphMessageId" TEXT,
  ADD COLUMN "toAddresses" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "ccAddresses" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "bodyHtml" TEXT;

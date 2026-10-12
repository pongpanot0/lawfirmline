-- Task: hand-in time, attachment gate, reviewer FK
ALTER TABLE "Task" ADD COLUMN "submittedAt" TIMESTAMP(3);
ALTER TABLE "Task" ADD COLUMN "requiresAttachment" BOOLEAN NOT NULL DEFAULT false;
UPDATE "Task" SET "reviewerId" = NULL
  WHERE "reviewerId" IS NOT NULL AND "reviewerId" NOT IN (SELECT "id" FROM "User");
ALTER TABLE "Task" ADD CONSTRAINT "Task_reviewerId_fkey"
  FOREIGN KEY ("reviewerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "Task_reviewerId_status_idx" ON "Task"("reviewerId", "status");

-- Task comments: @mentions
ALTER TABLE "TaskComment" ADD COLUMN "mentionedUserIds" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- Document review: due-tomorrow reminder claim
ALTER TABLE "ReviewRound" ADD COLUMN "dueReminderSentAt" TIMESTAMP(3);

-- Closing email: delivery record
ALTER TABLE "ClosingEmailDraft" ADD COLUMN "sentAt" TIMESTAMP(3);
ALTER TABLE "ClosingEmailDraft" ADD COLUMN "sentTo" TEXT[] DEFAULT ARRAY[]::TEXT[];

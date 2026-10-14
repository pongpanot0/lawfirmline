-- AlterTable
ALTER TABLE "User" ADD COLUMN "emailSignature" TEXT;

-- AlterTable
ALTER TABLE "EmailThread" ADD COLUMN "replyDismissedAt" TIMESTAMP(3),
ADD COLUMN "replyReminderMessageId" TEXT;

-- CreateIndex
CREATE INDEX "EmailThread_caseId_lastMessageAt_idx" ON "EmailThread"("caseId", "lastMessageAt");

CREATE TYPE "ClosingEmailRecipientKind" AS ENUM ('CLIENT', 'CUSTOMER');

ALTER TABLE "Task" ADD COLUMN "completedAt" TIMESTAMP(3);
CREATE INDEX "Task_completedAt_idx" ON "Task"("completedAt");

ALTER TABLE "ClosingEmailDraft"
ADD COLUMN "recipientKind" "ClosingEmailRecipientKind" NOT NULL DEFAULT 'CLIENT',
ADD COLUMN "recipientClientId" TEXT;

UPDATE "ClosingEmailDraft" AS draft
SET "recipientClientId" = legal_case."clientId"
FROM "Case" AS legal_case
WHERE legal_case."id" = draft."caseId";

CREATE INDEX "ClosingEmailDraft_recipientClientId_idx" ON "ClosingEmailDraft"("recipientClientId");

ALTER TABLE "ClosingEmailDraft"
ADD CONSTRAINT "ClosingEmailDraft_recipientClientId_fkey"
FOREIGN KEY ("recipientClientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

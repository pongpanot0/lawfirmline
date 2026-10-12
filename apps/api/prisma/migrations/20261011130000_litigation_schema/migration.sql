-- Litigation correctness (spec Part L): schema only. Data that uses the new
-- enum values lives in later migrations (a new enum value cannot be used in
-- the transaction that adds it).

ALTER TYPE "PartyRole" ADD VALUE IF NOT EXISTS 'PETITIONER';
ALTER TYPE "PartyRole" ADD VALUE IF NOT EXISTS 'RESPONDENT';
ALTER TYPE "DeadlineTrigger" ADD VALUE IF NOT EXISTS 'FILED';
ALTER TYPE "DeadlineTrigger" ADD VALUE IF NOT EXISTS 'APPEAL_SERVED';
ALTER TYPE "DeadlineDayBasis" ADD VALUE IF NOT EXISTS 'MONTHS';

CREATE TYPE "CourtEventKind" AS ENUM ('PRELIMINARY', 'MEDIATION', 'WITNESS_HEARING', 'JUDGMENT_READING', 'OTHER');
CREATE TYPE "ServiceMethod" AS ENUM ('PERSONAL', 'POSTED');
CREATE TYPE "JudgmentOutcome" AS ENUM ('WON', 'LOST', 'PARTIAL', 'DISMISSED', 'SETTLED');

ALTER TABLE "DeadlineRule"
    ADD COLUMN "firmId" TEXT,
    ADD COLUMN "adjustDays" INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN "courtEventKind" "CourtEventKind",
    ADD COLUMN "courtLevel" "CourtLevel",
    ADD COLUMN "partySide" "PartyRole",
    ADD COLUMN "serviceMethod" "ServiceMethod";
CREATE INDEX "DeadlineRule_firmId_trigger_idx" ON "DeadlineRule"("firmId", "trigger");
ALTER TABLE "DeadlineRule" ADD CONSTRAINT "DeadlineRule_firmId_fkey"
    FOREIGN KEY ("firmId") REFERENCES "Firm"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CalendarEvent" ADD COLUMN "courtEventKind" "CourtEventKind";

ALTER TABLE "CaseStatusLog"
    ADD COLUMN "fromStage" "CaseStage",
    ADD COLUMN "toStage" "CaseStage",
    ADD COLUMN "note" TEXT;

ALTER TABLE "Case" ADD COLUMN "limitationEventId" TEXT;

CREATE TABLE "CaseProceeding" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "courtLevel" "CourtLevel" NOT NULL,
    "courtName" TEXT,
    "blackCaseNumber" TEXT,
    "redCaseNumber" TEXT,
    "filedAt" TIMESTAMP(3),
    "judgmentAt" TIMESTAMP(3),
    "judgmentOutcome" "JudgmentOutcome",
    "judgmentAmount" DECIMAL(15,2),
    "judgmentNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CaseProceeding_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CaseProceeding_caseId_courtLevel_key" ON "CaseProceeding"("caseId", "courtLevel");
ALTER TABLE "CaseProceeding" ADD CONSTRAINT "CaseProceeding_caseId_fkey"
    FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CaseParticipant"
    ADD COLUMN "clientId" TEXT,
    ADD COLUMN "representedByParticipantId" TEXT;
CREATE INDEX "CaseParticipant_clientId_idx" ON "CaseParticipant"("clientId");
ALTER TABLE "CaseParticipant" ADD CONSTRAINT "CaseParticipant_clientId_fkey"
    FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CaseParticipant" ADD CONSTRAINT "CaseParticipant_representedByParticipantId_fkey"
    FOREIGN KEY ("representedByParticipantId") REFERENCES "CaseParticipant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ConflictCheck" ADD COLUMN "caseId" TEXT;
CREATE INDEX "ConflictCheck_caseId_idx" ON "ConflictCheck"("caseId");
ALTER TABLE "ConflictCheck" ADD CONSTRAINT "ConflictCheck_caseId_fkey"
    FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE CASCADE ON UPDATE CASCADE;

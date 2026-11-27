ALTER TYPE "ServiceMethod" ADD VALUE IF NOT EXISTS 'POSTED_ABROAD';
ALTER TYPE "IntakeDecision" ADD VALUE IF NOT EXISTS 'NOT_WORTH_FILING';

-- Every step is guarded so a deploy that stopped half-way can simply be re-run.
DO $$ BEGIN
  CREATE TYPE "CourtFollowUpKind" AS ENUM ('ACCEPTANCE', 'SERVICE', 'ANSWER');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE "AnswerExtensionStatus" AS ENUM ('PENDING', 'GRANTED', 'DENIED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE "Case"
  ADD COLUMN IF NOT EXISTS "answerDueAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "answerDeadlineEventId" TEXT;

ALTER TABLE "InsuranceClaim"
  ADD COLUMN IF NOT EXISTS "assuredName" TEXT,
  ADD COLUMN IF NOT EXISTS "policyType" TEXT,
  ADD COLUMN IF NOT EXISTS "claimAmount" DECIMAL(15, 2),
  ADD COLUMN IF NOT EXISTS "claimCurrency" TEXT NOT NULL DEFAULT 'THB';

CREATE TABLE IF NOT EXISTS "CourtFollowUp" (
  "id" TEXT NOT NULL,
  "caseId" TEXT NOT NULL,
  "kind" "CourtFollowUpKind" NOT NULL,
  "dueAt" TIMESTAMP(3) NOT NULL,
  "doneAt" TIMESTAMP(3),
  "lastResult" TEXT,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "calendarEventId" TEXT,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CourtFollowUp_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CourtFollowUp_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "CourtFollowUp_caseId_kind_key" ON "CourtFollowUp" ("caseId", "kind");
CREATE UNIQUE INDEX IF NOT EXISTS "CourtFollowUp_calendarEventId_key" ON "CourtFollowUp" ("calendarEventId");

CREATE TABLE IF NOT EXISTS "AnswerExtension" (
  "id" TEXT NOT NULL,
  "caseId" TEXT NOT NULL,
  "filedAt" TIMESTAMP(3) NOT NULL,
  "requestedUntil" TIMESTAMP(3) NOT NULL,
  "status" "AnswerExtensionStatus" NOT NULL DEFAULT 'PENDING',
  "grantedUntil" TIMESTAMP(3),
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AnswerExtension_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AnswerExtension_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "AnswerExtension_caseId_idx" ON "AnswerExtension" ("caseId");

INSERT INTO "DeadlineRule" ("id", "trigger", "label", "offsetDays", "dayBasis", "courtEventKind", "updatedAt")
SELECT gen_random_uuid()::text, 'COURT_DATE', rule.label, rule.days, 'CALENDAR', 'WITNESS_HEARING', CURRENT_TIMESTAMP
FROM (VALUES
  ('เริ่มเตรียมพยาน: นัดประชุมลูกความ เลือกพยาน เก็บข้อเท็จจริง', -30),
  ('ยื่นบันทึกถ้อยคำพยานต่อศาลและส่งคู่ความ', -7)
) AS rule(label, days)
WHERE NOT EXISTS (
  SELECT 1 FROM "DeadlineRule" AS existing
  WHERE existing."firmId" IS NULL AND existing."trigger" = 'COURT_DATE' AND existing."label" = rule.label
);

UPDATE "DeadlineRule"
SET "isActive" = false, "updatedAt" = CURRENT_TIMESTAMP
WHERE "firmId" IS NULL AND "isActive" AND "trigger" = 'COMPLAINT_SERVED'
  AND "label" IN (
    'ครบกำหนดยื่นคำให้การ',
    'ครบกำหนดยื่นคำให้การ (ปิดหมาย)',
    'ตรวจขาดนัดยื่นคำให้การ / ขอให้พิพากษาโดยขาดนัด'
  );

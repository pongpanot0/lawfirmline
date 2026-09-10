-- Bind first customer firm slug; keep stable id references.
UPDATE "Firm"
SET
  "name" = 'The Siam Barrister',
  "slug" = 'thesiambarrister',
  "updatedAt" = NOW()
WHERE "slug" IN ('demo-law-firm', 'thesiambarrister')
   OR "id" = 'default-firm';

-- Global courts: dedupe by name, drop firmId.
CREATE TABLE "Court_new" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Court_new_pkey" PRIMARY KEY ("id")
);

INSERT INTO "Court_new" ("id", "name", "address", "isActive", "createdAt", "updatedAt")
SELECT DISTINCT ON ("name")
  "id", "name", "address", "isActive", "createdAt", "updatedAt"
FROM "Court"
ORDER BY "name", "createdAt" ASC;

DROP TABLE "Court";
ALTER TABLE "Court_new" RENAME TO "Court";
CREATE UNIQUE INDEX "Court_name_key" ON "Court"("name");

-- Global deadline rules: clear caseType links, dedupe, drop firmId.
UPDATE "DeadlineRule" SET "caseTypeId" = NULL;

CREATE TABLE "DeadlineRule_new" (
    "id" TEXT NOT NULL,
    "caseTypeId" TEXT,
    "trigger" "DeadlineTrigger" NOT NULL,
    "label" TEXT NOT NULL,
    "offsetDays" INTEGER NOT NULL,
    "dayBasis" "DeadlineDayBasis" NOT NULL DEFAULT 'CALENDAR',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "DeadlineRule_new_pkey" PRIMARY KEY ("id")
);

INSERT INTO "DeadlineRule_new" ("id", "caseTypeId", "trigger", "label", "offsetDays", "dayBasis", "isActive", "createdAt", "updatedAt")
SELECT DISTINCT ON ("trigger", "label", "offsetDays", "dayBasis")
  "id", NULL, "trigger", "label", "offsetDays", "dayBasis", "isActive", "createdAt", "updatedAt"
FROM "DeadlineRule"
ORDER BY "trigger", "label", "offsetDays", "dayBasis", "createdAt" ASC;

-- Repoint suggestions that referenced dropped duplicate rules onto the kept row.
UPDATE "DocumentDateSuggestion" AS d
SET "deadlineRuleId" = kept.id
FROM "DeadlineRule" AS old
JOIN "DeadlineRule_new" AS kept
  ON kept."trigger" = old."trigger"
 AND kept."label" = old."label"
 AND kept."offsetDays" = old."offsetDays"
 AND kept."dayBasis" = old."dayBasis"
WHERE d."deadlineRuleId" = old."id"
  AND d."deadlineRuleId" IS NOT NULL
  AND d."deadlineRuleId" NOT IN (SELECT "id" FROM "DeadlineRule_new");

ALTER TABLE "DocumentDateSuggestion" DROP CONSTRAINT IF EXISTS "DocumentDateSuggestion_deadlineRuleId_fkey";

DROP TABLE "DeadlineRule";
ALTER TABLE "DeadlineRule_new" RENAME TO "DeadlineRule";

ALTER TABLE "DeadlineRule"
  ADD CONSTRAINT "DeadlineRule_caseTypeId_fkey"
  FOREIGN KEY ("caseTypeId") REFERENCES "CaseType"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DocumentDateSuggestion"
  ADD CONSTRAINT "DocumentDateSuggestion_deadlineRuleId_fkey"
  FOREIGN KEY ("deadlineRuleId") REFERENCES "DeadlineRule"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "DeadlineRule_trigger_isActive_idx" ON "DeadlineRule"("trigger", "isActive");

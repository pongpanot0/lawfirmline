-- Spec L3: one proceeding per case that already has a black or red number, at the
-- case's current court level (TRIAL when unset), copied from the case's own fields.
-- Idempotent: re-running skips cases that already have a proceeding at that level.
INSERT INTO "CaseProceeding" ("id", "caseId", "courtLevel", "courtName", "blackCaseNumber", "redCaseNumber", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text,
       c."id",
       COALESCE(c."courtLevel", 'TRIAL'::"CourtLevel"),
       NULLIF(TRIM(c."courtName"), ''),
       NULLIF(TRIM(c."blackCaseNumber"), ''),
       NULLIF(TRIM(c."redCaseNumber"), ''),
       CURRENT_TIMESTAMP,
       CURRENT_TIMESTAMP
  FROM "Case" c
 WHERE NULLIF(TRIM(c."blackCaseNumber"), '') IS NOT NULL
    OR NULLIF(TRIM(c."redCaseNumber"), '') IS NOT NULL
ON CONFLICT ("caseId", "courtLevel") DO NOTHING;

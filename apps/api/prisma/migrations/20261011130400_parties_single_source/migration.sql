-- Spec L5: CaseParticipant is the only home for parties.
-- Runs on every boot until recorded, so every statement is safe to re-run.

-- 1. customFields.opposingParty → an OPPONENT participant (role opposite ours; OTHER when unknown).
INSERT INTO "CaseParticipant" ("id", "caseId", "name", "role", "side", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text,
       c."id",
       TRIM(c."customFields"->>'opposingParty'),
       (CASE c."partyRole"
          WHEN 'PLAINTIFF'  THEN 'DEFENDANT'
          WHEN 'DEFENDANT'  THEN 'PLAINTIFF'
          WHEN 'PETITIONER' THEN 'RESPONDENT'
          WHEN 'RESPONDENT' THEN 'PETITIONER'
          ELSE 'OTHER'
        END)::"ParticipantRole",
       'OPPONENT'::"ParticipantSide",
       CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
  FROM "Case" c
 WHERE jsonb_typeof(c."customFields") = 'object'
   AND NULLIF(TRIM(c."customFields"->>'opposingParty'), '') IS NOT NULL
   AND NOT EXISTS (
     SELECT 1 FROM "CaseParticipant" p
      WHERE p."caseId" = c."id" AND p."side" = 'OPPONENT'
        AND LOWER(TRIM(p."name")) = LOWER(TRIM(c."customFields"->>'opposingParty'))
   );

-- Drop the key only where its text is blank or already sits on an OPPONENT participant,
-- so the name can never be lost.
UPDATE "Case" c SET "customFields" = c."customFields" - 'opposingParty'
 WHERE jsonb_typeof(c."customFields") = 'object'
   AND c."customFields" ? 'opposingParty'
   AND (
     NULLIF(TRIM(c."customFields"->>'opposingParty'), '') IS NULL
     OR EXISTS (
       SELECT 1 FROM "CaseParticipant" p
        WHERE p."caseId" = c."id" AND p."side" = 'OPPONENT'
          AND LOWER(TRIM(p."name")) = LOWER(TRIM(c."customFields"->>'opposingParty'))
     )
   );

-- 2. Our client on side OURS with our role. First link hand-entered OURS rows that carry the
--    client's name, so the insert below does not duplicate them.
UPDATE "CaseParticipant" p
   SET "clientId" = c."clientId"
  FROM "Case" c JOIN "Client" cl ON cl."id" = c."clientId"
 WHERE p."caseId" = c."id" AND p."side" = 'OURS' AND p."clientId" IS NULL
   AND LOWER(TRIM(p."name")) = LOWER(TRIM(cl."name"))
   AND NOT EXISTS (SELECT 1 FROM "CaseParticipant" q WHERE q."caseId" = c."id" AND q."clientId" = c."clientId");

INSERT INTO "CaseParticipant" ("id", "caseId", "clientId", "name", "role", "side", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, c."id", c."clientId", cl."name",
       c."partyRole"::text::"ParticipantRole", 'OURS'::"ParticipantSide",
       CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
  FROM "Case" c
  JOIN "Client" cl ON cl."id" = c."clientId"
 WHERE c."partyRole" IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM "CaseParticipant" p WHERE p."caseId" = c."id" AND p."clientId" = c."clientId");

-- 3. Firms that kept the default "คดีความ" type still show an "opposingParty" custom field; drop it.
--    `@>` never errors on a non-array schema, unlike jsonb_array_elements.
UPDATE "CaseType"
   SET "fieldSchema" = (
     SELECT COALESCE(jsonb_agg(f), '[]'::jsonb)
       FROM jsonb_array_elements("fieldSchema") f
      WHERE f->>'key' IS DISTINCT FROM 'opposingParty'
   )
 WHERE jsonb_typeof("fieldSchema") = 'array'
   AND "fieldSchema" @> '[{"key": "opposingParty"}]'::jsonb;

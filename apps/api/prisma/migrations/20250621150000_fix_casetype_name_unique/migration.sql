-- CaseType originally had a global unique index on name only.
-- SaaS migration tried DROP CONSTRAINT but the object is an INDEX, so it was never removed.
DROP INDEX IF EXISTS "CaseType_name_key";

-- Ensure per-firm uniqueness (idempotent for DBs that already have it).
CREATE UNIQUE INDEX IF NOT EXISTS "CaseType_firmId_name_key" ON "CaseType"("firmId", "name");

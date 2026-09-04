-- Collapse AssignmentType LEAD / CO_COUNSEL / CLERK into a single BUDDY value.
-- The case owner is stored on "Case"."leadLawyerId", so LEAD was redundant here.
-- Written idempotently: safe to run whether or not the column still holds legacy values.

-- 1) Widen the column so existing rows can be rewritten free of the enum constraint.
ALTER TABLE "CaseAssignment"
  ALTER COLUMN "assignmentType" TYPE TEXT USING ("assignmentType"::text);

-- 2) Data migration: every legacy assignment becomes a BUDDY.
UPDATE "CaseAssignment"
  SET "assignmentType" = 'BUDDY'
  WHERE "assignmentType" <> 'BUDDY';

-- 3) Replace the enum type with the single-value version and convert back.
DROP TYPE "AssignmentType";
CREATE TYPE "AssignmentType" AS ENUM ('BUDDY');
ALTER TABLE "CaseAssignment"
  ALTER COLUMN "assignmentType" TYPE "AssignmentType"
  USING ("assignmentType"::"AssignmentType");

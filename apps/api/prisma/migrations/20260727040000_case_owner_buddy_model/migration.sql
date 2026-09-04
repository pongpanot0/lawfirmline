-- Case staffing: everyone is a Lawyer; case helpers are Buddies (not Clerk/Co-counsel).

-- 1) Role: promote clerks → lawyers, then shrink enum
UPDATE "User" SET "role" = 'LAWYER' WHERE "role" = 'CLERK';

CREATE TYPE "Role_new" AS ENUM ('ADMIN', 'LAWYER');
ALTER TABLE "User" ALTER COLUMN "role" DROP DEFAULT;
ALTER TABLE "User" ALTER COLUMN "role" TYPE "Role_new" USING ("role"::text::"Role_new");
DROP TYPE "Role";
ALTER TYPE "Role_new" RENAME TO "Role";

-- 2) AssignmentType: collapse LEAD / CO_COUNSEL / CLERK → BUDDY
ALTER TABLE "CaseAssignment" ALTER COLUMN "assignmentType" TYPE TEXT USING ("assignmentType"::text);
UPDATE "CaseAssignment" SET "assignmentType" = 'BUDDY'
WHERE "assignmentType" IN ('LEAD', 'CO_COUNSEL', 'CLERK');

DROP TYPE "AssignmentType";
CREATE TYPE "AssignmentType" AS ENUM ('BUDDY');
ALTER TABLE "CaseAssignment"
  ALTER COLUMN "assignmentType" TYPE "AssignmentType"
  USING ("assignmentType"::"AssignmentType");

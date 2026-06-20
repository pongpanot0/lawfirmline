-- CreateEnum
CREATE TYPE "ExpenseStatus" AS ENUM ('PENDING', 'APPROVED', 'PAID', 'REJECTED');

-- CreateTable
CREATE TABLE "CaseType" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CaseType_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "Case" ADD COLUMN "caseTypeId" TEXT;

-- AlterTable: add expense reimbursement fields
ALTER TABLE "Expense" ADD COLUMN "userId" TEXT;
ALTER TABLE "Expense" ADD COLUMN "category" TEXT;
ALTER TABLE "Expense" ADD COLUMN "status" "ExpenseStatus" NOT NULL DEFAULT 'PENDING';
ALTER TABLE "Expense" ADD COLUMN "paidAt" TIMESTAMP(3);
ALTER TABLE "Expense" ADD COLUMN "paidById" TEXT;

-- Backfill userId for existing expenses from lead lawyer
UPDATE "Expense" e
SET "userId" = c."leadLawyerId"
FROM "Case" c
WHERE e."caseId" = c."id" AND e."userId" IS NULL;

ALTER TABLE "Expense" ALTER COLUMN "userId" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "CaseType_name_key" ON "CaseType"("name");

-- AddForeignKey
ALTER TABLE "Case" ADD CONSTRAINT "Case_caseTypeId_fkey" FOREIGN KEY ("caseTypeId") REFERENCES "CaseType"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_paidById_fkey" FOREIGN KEY ("paidById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Seed default case types
INSERT INTO "CaseType" ("id", "name", "description", "isActive", "createdAt", "updatedAt") VALUES
  (gen_random_uuid()::text, 'Litigation', 'คดีความ / ฟ้องร้อง', true, NOW(), NOW()),
  (gen_random_uuid()::text, 'Corporate', 'นิติกรรม / บริษัท', true, NOW(), NOW()),
  (gen_random_uuid()::text, 'Family Law', 'ครอบครัว / มรดก', true, NOW(), NOW()),
  (gen_random_uuid()::text, 'Criminal', 'คดีอาญา', true, NOW(), NOW()),
  (gen_random_uuid()::text, 'Intellectual Property', 'ทรัพย์สินทางปัญญา', true, NOW(), NOW());

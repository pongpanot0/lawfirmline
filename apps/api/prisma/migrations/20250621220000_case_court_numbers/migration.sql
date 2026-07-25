-- CreateEnum
CREATE TYPE "CourtLevel" AS ENUM ('TRIAL', 'APPEAL', 'SUPREME');

-- AlterTable
ALTER TABLE "Case" ADD COLUMN "courtLevel" "CourtLevel",
ADD COLUMN "blackCaseNumber" TEXT,
ADD COLUMN "redCaseNumber" TEXT;

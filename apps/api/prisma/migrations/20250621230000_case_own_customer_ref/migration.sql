-- AlterTable
ALTER TABLE "Case" RENAME COLUMN "caseNumber" TO "ownRef";

-- RenameIndex
ALTER INDEX "Case_firmId_caseNumber_key" RENAME TO "Case_firmId_ownRef_key";

-- AlterTable
ALTER TABLE "Case" ADD COLUMN "customerRef" TEXT;

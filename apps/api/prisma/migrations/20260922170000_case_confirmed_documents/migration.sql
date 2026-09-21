-- AlterTable
ALTER TABLE "Case" ADD COLUMN "confirmedDocuments" TEXT[] DEFAULT ARRAY[]::TEXT[];

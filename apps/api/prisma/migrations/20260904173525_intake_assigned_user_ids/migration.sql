-- AlterTable
ALTER TABLE "Intake" ADD COLUMN     "assignedUserIds" TEXT[] DEFAULT ARRAY[]::TEXT[];

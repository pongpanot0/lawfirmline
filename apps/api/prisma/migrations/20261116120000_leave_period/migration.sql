-- CreateEnum
CREATE TYPE "LeavePeriod" AS ENUM ('MORNING', 'AFTERNOON');

-- AlterTable
ALTER TABLE "LeaveRequest" ADD COLUMN "period" "LeavePeriod";

-- AlterTable
ALTER TABLE "Task" ALTER COLUMN "caseId" DROP NOT NULL;

-- CreateEnum
CREATE TYPE "TaskSource" AS ENUM ('WEB', 'LINE');

-- AlterTable
ALTER TABLE "Task" ADD COLUMN "source" "TaskSource" NOT NULL DEFAULT 'WEB';

-- AlterEnum
ALTER TYPE "TaskStatus" ADD VALUE 'PENDING_REVIEW';
ALTER TYPE "TaskStatus" ADD VALUE 'NEEDS_REVISION';

-- AlterEnum
ALTER TYPE "ActivityType" ADD VALUE 'TASK';

-- CreateEnum
CREATE TYPE "TaskLogAction" AS ENUM ('ASSIGNED', 'HANDED_OFF', 'REJECTED');

-- CreateTable
CREATE TABLE "TaskAssignmentLog" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "action" "TaskLogAction" NOT NULL,
    "fromUserId" TEXT,
    "toUserId" TEXT NOT NULL,
    "performedById" TEXT NOT NULL,
    "note" TEXT,
    "stageDueDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaskAssignmentLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TaskAssignmentLog_taskId_createdAt_idx" ON "TaskAssignmentLog"("taskId", "createdAt");

-- AddForeignKey
ALTER TABLE "TaskAssignmentLog" ADD CONSTRAINT "TaskAssignmentLog_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskAssignmentLog" ADD CONSTRAINT "TaskAssignmentLog_fromUserId_fkey" FOREIGN KEY ("fromUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskAssignmentLog" ADD CONSTRAINT "TaskAssignmentLog_toUserId_fkey" FOREIGN KEY ("toUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskAssignmentLog" ADD CONSTRAINT "TaskAssignmentLog_performedById_fkey" FOREIGN KEY ("performedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

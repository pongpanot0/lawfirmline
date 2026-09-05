-- CreateTable
CREATE TABLE "TaskOnHold" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "followerUserId" TEXT,
    "lastFollowUpAt" TIMESTAMP(3),
    "nextFollowUpAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TaskOnHold_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TaskOnHold_taskId_key" ON "TaskOnHold"("taskId");

-- CreateIndex
CREATE INDEX "TaskOnHold_nextFollowUpAt_idx" ON "TaskOnHold"("nextFollowUpAt");

-- CreateIndex
CREATE INDEX "TaskOnHold_endedAt_idx" ON "TaskOnHold"("endedAt");

-- AddForeignKey
ALTER TABLE "TaskOnHold" ADD CONSTRAINT "TaskOnHold_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskOnHold" ADD CONSTRAINT "TaskOnHold_followerUserId_fkey" FOREIGN KEY ("followerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskOnHold" ADD CONSTRAINT "TaskOnHold_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

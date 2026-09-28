-- CreateTable
CREATE TABLE "TaskObserver" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "addedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaskObserver_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TaskObserver_taskId_userId_key" ON "TaskObserver"("taskId", "userId");
CREATE INDEX "TaskObserver_userId_idx" ON "TaskObserver"("userId");

-- AddForeignKey
ALTER TABLE "TaskObserver" ADD CONSTRAINT "TaskObserver_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TaskObserver" ADD CONSTRAINT "TaskObserver_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TaskObserver" ADD CONSTRAINT "TaskObserver_addedById_fkey" FOREIGN KEY ("addedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

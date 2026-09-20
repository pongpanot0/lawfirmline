ALTER TABLE "Task" ADD COLUMN     "blockedById" TEXT,
ADD COLUMN     "recurrenceDays" INTEGER;
-- CreateIndex
CREATE INDEX "Task_blockedById_idx" ON "Task"("blockedById");
-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_blockedById_fkey" FOREIGN KEY ("blockedById") REFERENCES "Task"("id") ON DELETE SET NULL ON UPDATE CASCADE;

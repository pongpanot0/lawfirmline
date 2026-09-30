ALTER TABLE "Task" ADD COLUMN "followUpSourceTaskId" TEXT;
ALTER TABLE "Task" ADD COLUMN "followUpSourceCommentId" TEXT;
ALTER TABLE "Task" ADD COLUMN "followUpSourceQuote" TEXT;
CREATE UNIQUE INDEX "Task_followUpSourceCommentId_key" ON "Task"("followUpSourceCommentId");

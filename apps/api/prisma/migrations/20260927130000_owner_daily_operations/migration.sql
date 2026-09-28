CREATE TYPE "TaskWorkType" AS ENUM ('TRANSCRIPTION', 'DOCUMENTS', 'DRAFTING', 'RESEARCH', 'COURT', 'GENERAL');
ALTER TABLE "FirmMember" ADD COLUMN "taskWorkTypes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "Task"
  ADD COLUMN "firmId" TEXT,
  ADD COLUMN "workType" "TaskWorkType",
  ADD COLUMN "scheduledFor" DATE,
  ADD COLUMN "queuePosition" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "requiresReview" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "reviewerId" TEXT,
  ADD COLUMN "assignedAt" TIMESTAMP(3),
  ADD COLUMN "acknowledgedAt" TIMESTAMP(3);
ALTER TABLE "TaskComment" ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'COMMENT';
CREATE INDEX "Task_firmId_assigneeId_queuePosition_idx" ON "Task"("firmId", "assigneeId", "queuePosition");
CREATE INDEX "Task_scheduledFor_idx" ON "Task"("scheduledFor");
ALTER TABLE "Task" ADD COLUMN "planConfirmedAt" TIMESTAMP(3);

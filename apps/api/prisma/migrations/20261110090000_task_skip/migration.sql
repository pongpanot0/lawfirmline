ALTER TABLE "Task"
  ADD COLUMN "skippedReason" TEXT,
  ADD COLUMN "skippedAt" TIMESTAMP(3),
  ADD COLUMN "skippedById" TEXT;

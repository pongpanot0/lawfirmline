-- Soft delete for cases: hard delete cascades across 20 tables and is unrecoverable.
ALTER TABLE "Case" ADD COLUMN "deletedAt" TIMESTAMP(3);

-- Every case query filters on deletedAt; keep it cheap alongside the tenant scope.
CREATE INDEX "Case_firmId_deletedAt_idx" ON "Case"("firmId", "deletedAt");

ALTER TABLE "IntakePrecedentAnalysis" ALTER COLUMN "intakeId" DROP NOT NULL;
ALTER TABLE "IntakePrecedentAnalysis" ADD COLUMN "firmId" TEXT;
UPDATE "IntakePrecedentAnalysis" a SET "firmId" = i."firmId" FROM "Intake" i WHERE a."intakeId" = i.id;
CREATE INDEX "IntakePrecedentAnalysis_firmId_createdById_createdAt_idx" ON "IntakePrecedentAnalysis"("firmId", "createdById", "createdAt");

-- CreateEnum
CREATE TYPE "AnalysisStatus" AS ENUM ('PENDING', 'COMPLETE', 'FAILED');

-- CreateTable
CREATE TABLE "IntakeAttachment" (
    "id" TEXT NOT NULL,
    "intakeId" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "storagePath" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "uploadedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IntakeAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IntakePrecedentAnalysis" (
    "id" TEXT NOT NULL,
    "intakeId" TEXT NOT NULL,
    "caseId" TEXT,
    "status" "AnalysisStatus" NOT NULL DEFAULT 'PENDING',
    "extractedFacts" JSONB NOT NULL,
    "searchQueries" JSONB NOT NULL,
    "precedents" JSONB NOT NULL,
    "summaryBullets" TEXT NOT NULL,
    "noticeFacts" TEXT NOT NULL,
    "creditsCost" DOUBLE PRECISION NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "errorMessage" TEXT,

    CONSTRAINT "IntakePrecedentAnalysis_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "IntakeAttachment_intakeId_idx" ON "IntakeAttachment"("intakeId");

-- CreateIndex
CREATE INDEX "IntakePrecedentAnalysis_intakeId_createdAt_idx" ON "IntakePrecedentAnalysis"("intakeId", "createdAt");

-- CreateIndex
CREATE INDEX "IntakePrecedentAnalysis_caseId_idx" ON "IntakePrecedentAnalysis"("caseId");

-- AddForeignKey
ALTER TABLE "IntakeAttachment" ADD CONSTRAINT "IntakeAttachment_intakeId_fkey" FOREIGN KEY ("intakeId") REFERENCES "Intake"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntakeAttachment" ADD CONSTRAINT "IntakeAttachment_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntakePrecedentAnalysis" ADD CONSTRAINT "IntakePrecedentAnalysis_intakeId_fkey" FOREIGN KEY ("intakeId") REFERENCES "Intake"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntakePrecedentAnalysis" ADD CONSTRAINT "IntakePrecedentAnalysis_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntakePrecedentAnalysis" ADD CONSTRAINT "IntakePrecedentAnalysis_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

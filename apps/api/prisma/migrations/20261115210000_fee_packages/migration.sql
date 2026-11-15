-- CreateEnum
CREATE TYPE "MilestoneStatus" AS ENUM ('PENDING', 'INVOICED', 'PARTIAL', 'WAIVED');

-- CreateTable
CREATE TABLE "FeePackage" (
    "id" TEXT NOT NULL,
    "firmId" TEXT NOT NULL,
    "caseTypeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "components" JSONB NOT NULL,
    "milestones" JSONB NOT NULL,
    "feeTaxClass" "TaxClass" NOT NULL DEFAULT 'LITIGATION_EXEMPT',
    "version" INTEGER NOT NULL DEFAULT 1,
    "archivedAt" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FeePackage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CaseFee" (
    "id" TEXT NOT NULL,
    "firmId" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "packageId" TEXT,
    "packageSnapshot" JSONB,
    "inputs" JSONB,
    "standardAmount" DOUBLE PRECISION NOT NULL,
    "agreedAmount" DOUBLE PRECISION NOT NULL,
    "overrideReason" TEXT,
    "feeTaxClass" "TaxClass" NOT NULL,
    "updatedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CaseFee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CaseFeeMilestone" (
    "id" TEXT NOT NULL,
    "firmId" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "caseFeeId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "stage" "CaseStage" NOT NULL,
    "percent" DOUBLE PRECISION NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "status" "MilestoneStatus" NOT NULL DEFAULT 'PENDING',
    "invoiceId" TEXT,
    "reachedAt" TIMESTAMP(3),
    "notifiedAt" TIMESTAMP(3),
    "closeAmount" DOUBLE PRECISION,
    "closeReason" TEXT,

    CONSTRAINT "CaseFeeMilestone_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FeePackage_firmId_caseTypeId_idx" ON "FeePackage"("firmId", "caseTypeId");

-- CreateIndex
CREATE UNIQUE INDEX "CaseFee_caseId_key" ON "CaseFee"("caseId");

-- CreateIndex
CREATE INDEX "CaseFeeMilestone_firmId_status_idx" ON "CaseFeeMilestone"("firmId", "status");

-- CreateIndex
CREATE INDEX "CaseFeeMilestone_caseId_idx" ON "CaseFeeMilestone"("caseId");

-- AddForeignKey
ALTER TABLE "FeePackage" ADD CONSTRAINT "FeePackage_firmId_fkey" FOREIGN KEY ("firmId") REFERENCES "Firm"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeePackage" ADD CONSTRAINT "FeePackage_caseTypeId_fkey" FOREIGN KEY ("caseTypeId") REFERENCES "CaseType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CaseFee" ADD CONSTRAINT "CaseFee_firmId_fkey" FOREIGN KEY ("firmId") REFERENCES "Firm"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CaseFee" ADD CONSTRAINT "CaseFee_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CaseFee" ADD CONSTRAINT "CaseFee_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "FeePackage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CaseFeeMilestone" ADD CONSTRAINT "CaseFeeMilestone_firmId_fkey" FOREIGN KEY ("firmId") REFERENCES "Firm"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CaseFeeMilestone" ADD CONSTRAINT "CaseFeeMilestone_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CaseFeeMilestone" ADD CONSTRAINT "CaseFeeMilestone_caseFeeId_fkey" FOREIGN KEY ("caseFeeId") REFERENCES "CaseFee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CaseFeeMilestone" ADD CONSTRAINT "CaseFeeMilestone_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;


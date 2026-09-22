CREATE TYPE "CargoReviewStatus" AS ENUM ('DRAFT', 'CONFIRMED');

CREATE TABLE "CargoClaim" (
    "id" TEXT NOT NULL,
    "firmId" TEXT NOT NULL,
    "intakeId" TEXT,
    "caseId" TEXT,
    "assuredName" TEXT,
    "shipperName" TEXT,
    "consigneeName" TEXT,
    "contractingCarrierName" TEXT,
    "actualCarrierName" TEXT,
    "origin" TEXT,
    "destination" TEXT,
    "transportMode" TEXT,
    "transportDocumentNumber" TEXT,
    "arrivalDate" TIMESTAMP(3),
    "lossDate" TIMESTAMP(3),
    "goodsDescription" TEXT,
    "movementTerm" TEXT,
    "damageDescription" TEXT,
    "damagedWeight" DOUBLE PRECISION,
    "weightUnit" TEXT,
    "claimAmount" DOUBLE PRECISION,
    "currency" TEXT NOT NULL DEFAULT 'THB',
    "applicableLaw" TEXT,
    "jurisdiction" TEXT,
    "liableParty" TEXT,
    "liabilityLimit" TEXT,
    "liabilityExclusion" TEXT,
    "timeBarPeriod" TEXT,
    "timeBarTriggerDate" TIMESTAMP(3),
    "timeBarDeadline" TIMESTAMP(3),
    "timeBarBasis" TEXT,
    "quantumNotes" TEXT,
    "recommendation" TEXT,
    "opinion" TEXT,
    "reviewStatus" "CargoReviewStatus" NOT NULL DEFAULT 'DRAFT',
    "confirmedById" TEXT,
    "confirmedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CargoClaim_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CargoDocumentRequirement" (
    "id" TEXT NOT NULL,
    "cargoClaimId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "required" BOOLEAN NOT NULL DEFAULT false,
    "status" "DocRequestStatus" NOT NULL DEFAULT 'REQUESTED',
    "note" TEXT,
    "documentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CargoDocumentRequirement_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CargoClaim_intakeId_key" ON "CargoClaim"("intakeId");
CREATE UNIQUE INDEX "CargoClaim_caseId_key" ON "CargoClaim"("caseId");
CREATE INDEX "CargoClaim_firmId_idx" ON "CargoClaim"("firmId");
CREATE UNIQUE INDEX "CargoDocumentRequirement_cargoClaimId_code_key" ON "CargoDocumentRequirement"("cargoClaimId", "code");
CREATE INDEX "CargoDocumentRequirement_cargoClaimId_status_idx" ON "CargoDocumentRequirement"("cargoClaimId", "status");
CREATE INDEX "CargoDocumentRequirement_documentId_idx" ON "CargoDocumentRequirement"("documentId");

ALTER TABLE "CargoClaim" ADD CONSTRAINT "CargoClaim_firmId_fkey" FOREIGN KEY ("firmId") REFERENCES "Firm"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CargoClaim" ADD CONSTRAINT "CargoClaim_intakeId_fkey" FOREIGN KEY ("intakeId") REFERENCES "Intake"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CargoClaim" ADD CONSTRAINT "CargoClaim_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CargoClaim" ADD CONSTRAINT "CargoClaim_confirmedById_fkey" FOREIGN KEY ("confirmedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CargoDocumentRequirement" ADD CONSTRAINT "CargoDocumentRequirement_cargoClaimId_fkey" FOREIGN KEY ("cargoClaimId") REFERENCES "CargoClaim"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CargoDocumentRequirement" ADD CONSTRAINT "CargoDocumentRequirement_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE SET NULL ON UPDATE CASCADE;

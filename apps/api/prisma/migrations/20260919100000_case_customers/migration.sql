-- ลูกค้า (ผู้ว่าจ้าง/ผู้จ่าย) แยกจากลูกความ (Case.clientId)
CREATE TABLE "CaseCustomer" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "sharePercent" DOUBLE PRECISION,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CaseCustomer_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "IntakeCustomer" (
    "id" TEXT NOT NULL,
    "intakeId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "sharePercent" DOUBLE PRECISION,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "IntakeCustomer_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CaseCustomer_caseId_customerId_key" ON "CaseCustomer"("caseId", "customerId");
CREATE INDEX "CaseCustomer_customerId_idx" ON "CaseCustomer"("customerId");
CREATE UNIQUE INDEX "IntakeCustomer_intakeId_customerId_key" ON "IntakeCustomer"("intakeId", "customerId");
CREATE INDEX "IntakeCustomer_customerId_idx" ON "IntakeCustomer"("customerId");

ALTER TABLE "CaseCustomer" ADD CONSTRAINT "CaseCustomer_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CaseCustomer" ADD CONSTRAINT "CaseCustomer_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "IntakeCustomer" ADD CONSTRAINT "IntakeCustomer_intakeId_fkey" FOREIGN KEY ("intakeId") REFERENCES "Intake"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "IntakeCustomer" ADD CONSTRAINT "IntakeCustomer_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Invoice" ADD COLUMN "billToCustomerId" TEXT;
CREATE INDEX "Invoice_billToCustomerId_idx" ON "Invoice"("billToCustomerId");
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_billToCustomerId_fkey" FOREIGN KEY ("billToCustomerId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill: ของเดิม clientId ถูกใช้เป็นทั้งลูกความและผู้ว่าจ้าง
INSERT INTO "CaseCustomer" ("id", "caseId", "customerId", "sharePercent", "isPrimary")
SELECT gen_random_uuid()::text, "id", "clientId", 100, true FROM "Case" WHERE "clientId" IS NOT NULL;

INSERT INTO "IntakeCustomer" ("id", "intakeId", "customerId", "sharePercent", "isPrimary")
SELECT gen_random_uuid()::text, "id", "clientId", 100, true FROM "Intake" WHERE "clientId" IS NOT NULL;

UPDATE "Invoice" i SET "billToCustomerId" = c."clientId"
FROM "Case" c WHERE i."caseId" = c."id" AND c."clientId" IS NOT NULL;

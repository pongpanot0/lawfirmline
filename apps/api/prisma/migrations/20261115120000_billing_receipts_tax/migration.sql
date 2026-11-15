BEGIN;

-- CreateEnum
CREATE TYPE "TaxClass" AS ENUM ('LITIGATION_EXEMPT', 'ADVISORY_VAT', 'DISBURSEMENT');

-- AlterTable
ALTER TABLE "Firm" ADD COLUMN     "billingAddress" TEXT,
ADD COLUMN     "legalName" TEXT,
ADD COLUMN     "logoKey" TEXT,
ADD COLUMN     "taxBranch" TEXT,
ADD COLUMN     "taxId" TEXT,
ADD COLUMN     "vatRegistered" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN     "feeTaxClass" "TaxClass" NOT NULL DEFAULT 'LITIGATION_EXEMPT',
ADD COLUMN     "vatAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "vatRate" DOUBLE PRECISION NOT NULL DEFAULT 0.07;

-- AlterTable
ALTER TABLE "InvoicePayment" ADD COLUMN     "clearedAt" DATE,
ADD COLUMN     "whtAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "whtCertificateNo" TEXT,
ADD COLUMN     "whtRate" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "InvoiceLineItem" ADD COLUMN     "taxClass" "TaxClass" NOT NULL DEFAULT 'LITIGATION_EXEMPT';

-- CreateTable
CREATE TABLE "Receipt" (
    "id" TEXT NOT NULL,
    "firmId" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "receiptNumber" TEXT NOT NULL,
    "issuedAt" DATE NOT NULL,
    "isTaxInvoice" BOOLEAN NOT NULL,
    "firmSnapshot" JSONB NOT NULL,
    "templateVersion" TEXT NOT NULL DEFAULT 'standard-v1',
    "sentAt" TIMESTAMP(3),
    "voidedAt" TIMESTAMP(3),
    "voidReason" TEXT,
    "voidedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Receipt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Receipt_paymentId_key" ON "Receipt"("paymentId");

-- CreateIndex
CREATE UNIQUE INDEX "Receipt_receiptNumber_key" ON "Receipt"("receiptNumber");

-- CreateIndex
CREATE INDEX "Receipt_firmId_issuedAt_idx" ON "Receipt"("firmId", "issuedAt");

-- AddForeignKey
ALTER TABLE "Receipt" ADD CONSTRAINT "Receipt_firmId_fkey" FOREIGN KEY ("firmId") REFERENCES "Firm"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Receipt" ADD CONSTRAINT "Receipt_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Receipt" ADD CONSTRAINT "Receipt_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "InvoicePayment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Legacy payments, including cheques, were already treated as received.
UPDATE "InvoicePayment" SET "clearedAt" = "receivedAt";

CREATE SEQUENCE IF NOT EXISTS receipt_number_seq AS BIGINT START WITH 1;
SELECT setval(
  'receipt_number_seq',
  GREATEST(
    (SELECT COUNT(*) FROM "Receipt"),
    COALESCE((SELECT MAX(split_part("receiptNumber", '-', 3)::BIGINT)
      FROM "Receipt" WHERE "receiptNumber" ~ '^RC-[0-9]{4}-[0-9]+$'), 0),
    1
  ),
  EXISTS (SELECT 1 FROM "Receipt")
);

COMMIT;

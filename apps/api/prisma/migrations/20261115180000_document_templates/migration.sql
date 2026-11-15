-- The existing DocumentTemplate table stores legal DOCX templates; keep it intact.
CREATE TYPE "DocumentType" AS ENUM ('INVOICE', 'RECEIPT');
CREATE TABLE "BillingDocumentTemplate" (
  "id" TEXT NOT NULL,
  "firmId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "docType" "DocumentType" NOT NULL,
  "layout" JSONB NOT NULL,
  "logoKey" TEXT,
  "isDefault" BOOLEAN NOT NULL DEFAULT false,
  "version" INTEGER NOT NULL DEFAULT 1,
  "archivedAt" TIMESTAMP(3),
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BillingDocumentTemplate_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "BillingDocumentTemplate_firmId_fkey" FOREIGN KEY ("firmId") REFERENCES "Firm"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "BillingDocumentTemplate_firmId_docType_idx" ON "BillingDocumentTemplate"("firmId", "docType");
CREATE UNIQUE INDEX "BillingDocumentTemplate_one_active_default" ON "BillingDocumentTemplate"("firmId", "docType") WHERE "archivedAt" IS NULL AND "isDefault" = true;
ALTER TABLE "Client" ADD COLUMN "invoiceTemplateId" TEXT, ADD COLUMN "receiptTemplateId" TEXT;
ALTER TABLE "Client" ADD CONSTRAINT "Client_invoiceTemplateId_fkey" FOREIGN KEY ("invoiceTemplateId") REFERENCES "BillingDocumentTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Client" ADD CONSTRAINT "Client_receiptTemplateId_fkey" FOREIGN KEY ("receiptTemplateId") REFERENCES "BillingDocumentTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Invoice" ADD COLUMN "templateSnapshot" JSONB;
ALTER TABLE "Receipt" ADD COLUMN "templateSnapshot" JSONB;
ALTER TABLE "InvoiceLineItem" ADD COLUMN "sortOrder" INTEGER NOT NULL DEFAULT 0;

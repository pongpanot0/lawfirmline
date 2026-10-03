ALTER TABLE "Invoice" ADD COLUMN "collectionOwnerId" TEXT,
  ADD COLUMN "collectionNextAt" DATE,
  ADD COLUMN "collectionNote" TEXT;
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_collectionOwnerId_fkey"
  FOREIGN KEY ("collectionOwnerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "Invoice_firmId_collectionNextAt_idx" ON "Invoice"("firmId", "collectionNextAt");
ALTER TABLE "InvoicePayment" ADD COLUMN "createRequestId" TEXT;
CREATE UNIQUE INDEX "InvoicePayment_firmId_createRequestId_key" ON "InvoicePayment"("firmId", "createRequestId");

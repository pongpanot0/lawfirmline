BEGIN;

ALTER TABLE "Receipt"
  ADD COLUMN "amountExempt" DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN "amountTaxable" DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN "amountVat" DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN "amountDisbursement" DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN "amountReceived" DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN "amountWht" DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN "replacesReceiptId" TEXT;

DROP INDEX "Receipt_paymentId_key";
CREATE INDEX "Receipt_paymentId_idx" ON "Receipt"("paymentId");
CREATE UNIQUE INDEX "Receipt_paymentId_active_key" ON "Receipt"("paymentId") WHERE "voidedAt" IS NULL;
ALTER TABLE "Receipt" ADD CONSTRAINT "Receipt_replacesReceiptId_fkey"
  FOREIGN KEY ("replacesReceiptId") REFERENCES "Receipt"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Replay issuance in creation order; voided rows do not consume the active allocation.
DO $$
DECLARE
  r RECORD;
  fees NUMERIC;
  advisory NUMERIC;
  disbursement NUMERIC;
  taxable NUMERIC;
  exempt NUMERIC;
  share NUMERIC;
  prior RECORD;
  is_last BOOLEAN;
BEGIN
  FOR r IN
    SELECT rc."id", rc."invoiceId", p."amount"::NUMERIC AS received,
      p."whtAmount"::NUMERIC AS wht, i."totalAmount"::NUMERIC AS total,
      i."discountAmount"::NUMERIC AS discount, i."vatAmount"::NUMERIC AS vat
    FROM "Receipt" rc
    JOIN "InvoicePayment" p ON p."id" = rc."paymentId"
    JOIN "Invoice" i ON i."id" = rc."invoiceId"
    ORDER BY rc."createdAt", rc."id"
  LOOP
    SELECT COALESCE(SUM("amount"::NUMERIC) FILTER (WHERE "taxClass" <> 'DISBURSEMENT'), 0),
      COALESCE(SUM("amount"::NUMERIC) FILTER (WHERE "taxClass" = 'ADVISORY_VAT'), 0),
      ROUND(COALESCE(SUM("amount"::NUMERIC) FILTER (WHERE "taxClass" = 'DISBURSEMENT'), 0), 2)
    INTO fees, advisory, disbursement FROM "InvoiceLineItem" WHERE "invoiceId" = r."invoiceId";
    taxable := CASE WHEN fees > 0 THEN ROUND(advisory * (1 - r.discount / fees), 2) ELSE 0 END;
    exempt := ROUND(fees - r.discount - taxable, 2);
    share := CASE WHEN r.total > 0 THEN ROUND(r.received + r.wht, 2) / r.total ELSE 0 END;
    SELECT COALESCE(SUM("amountReceived"::NUMERIC + "amountWht"::NUMERIC), 0) AS gross,
      COALESCE(SUM("amountExempt"::NUMERIC), 0) AS exempt,
      COALESCE(SUM("amountTaxable"::NUMERIC), 0) AS taxable,
      COALESCE(SUM("amountVat"::NUMERIC), 0) AS vat,
      COALESCE(SUM("amountDisbursement"::NUMERIC), 0) AS disbursement
    INTO prior FROM "Receipt" WHERE "invoiceId" = r."invoiceId" AND "voidedAt" IS NULL AND "id" <> r."id";
    is_last := r.total > 0 AND ROUND(prior.gross + r.received + r.wht, 2) >= r.total;
    UPDATE "Receipt" SET
      "amountExempt" = ROUND(CASE WHEN is_last THEN exempt - prior.exempt ELSE exempt * share END, 2),
      "amountTaxable" = ROUND(CASE WHEN is_last THEN taxable - prior.taxable ELSE taxable * share END, 2),
      "amountVat" = ROUND(CASE WHEN is_last THEN r.vat - prior.vat ELSE r.vat * share END, 2),
      "amountDisbursement" = ROUND(CASE WHEN is_last THEN disbursement - prior.disbursement ELSE disbursement * share END, 2),
      "amountReceived" = r.received, "amountWht" = r.wht
    WHERE "id" = r."id";
  END LOOP;
END $$;

UPDATE "Receipt" SET "isTaxInvoice" = COALESCE(("firmSnapshot"->>'vatRegistered')::BOOLEAN, false) AND "amountVat" > 0;

COMMIT;

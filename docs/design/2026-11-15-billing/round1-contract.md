# Billing round 1: contract

Mockups (approved 2026-11-15): `01-billing-hub.png`, `02-record-payment.png`, `03-receipt-tax-invoice.png` in this folder.
Research: `docs/research/2026-11-15-thai-legal-fee-schedules.md` §6 (VAT/WHT/receipt rules).

## Rules (decided with the user)

1. A receipt is issued **automatically when a payment is recorded** (ม.105 + ประกาศอากรแสตมป์ 34: receipt at receipt of money). One receipt per payment, own running number `RC-YYYY-NNNN` (Postgres sequence `receipt_number_seq`, like `invoice_number_seq`). Receipt date = payment `receivedAt` (cheque: `clearedAt`). Printing/sending later is separate (`sentAt`).
2. **Cheque** (`method = CHEQUE`): payment saved with `clearedAt = null`. It does NOT reduce outstanding and gets NO receipt until cleared via the clear endpoint, which sets `clearedAt` (date, not before `receivedAt`, not in the future) and issues the receipt dated `clearedAt`.
3. Receipts are never deleted. Void = `voidedAt`, `voidReason` (required), `voidedById`; number stays. Voiding a receipt does not delete the payment.
4. **VAT per line** via `TaxClass`: `LITIGATION_EXEMPT` (ว่าความ, ม.81(1)(ฌ), default), `ADVISORY_VAT` (ที่ปรึกษา/ร่างสัญญา, 7%), `DISBURSEMENT` (จ่ายแทนลูกความ, no VAT). VAT is charged only when `Firm.vatRegistered = true`. Rate stored on the invoice (`vatRate`, default 0.07) so a future rate change does not alter old documents.
5. **WHT** is recorded on the payment: `whtAmount` (≥ 0), `whtRate` (0.03 / 0.01 / other, nullable), `whtCertificateNo`. A payment settles `amount + whtAmount` of the outstanding balance. WHT base hint = non-disbursement subtotal before VAT (UI computes, server only validates `amount + whtAmount ≤ outstanding`).
6. Firm billing profile: `legalName`, `taxId` (13 digits), `taxBranch` (e.g. `00000` = สำนักงานใหญ่), `billingAddress`, `vatRegistered`, `logoKey` (stored via the existing `FileStorageService`). Only owner/ADMIN may edit (same guard as other firm settings). `vatRegistered = true` requires `taxId` + `legalName` + `billingAddress`.
7. Receipt keeps a frozen `firmSnapshot` JSON (legalName, taxId, taxBranch, address, vatRegistered, logoKey) and `templateVersion` (`"standard-v1"` in round 1) so reprints never change.
8. `isTaxInvoice` on the receipt = firm `vatRegistered` at issue time AND the invoice has VAT > 0. Title: `ใบเสร็จรับเงิน/ใบกำกับภาษี` if true, else `ใบเสร็จรับเงิน`.

## Schema (Prisma, additive only)

```prisma
enum TaxClass { LITIGATION_EXEMPT ADVISORY_VAT DISBURSEMENT }

model Firm {            // add
  legalName      String?
  taxId          String?
  taxBranch      String?
  billingAddress String?
  vatRegistered  Boolean @default(false)
  logoKey        String?
}
model Invoice {         // add
  feeTaxClass TaxClass @default(LITIGATION_EXEMPT) // applies to linked time entries
  vatRate     Float    @default(0.07)
  vatAmount   Float    @default(0)   // totalAmount now INCLUDES vatAmount
  receipts    Receipt[]
}
model InvoiceLineItem { taxClass TaxClass @default(LITIGATION_EXEMPT) }
// linked Expense rows are DISBURSEMENT on the invoice
model InvoicePayment {  // add
  whtAmount        Float     @default(0)
  whtRate          Float?
  whtCertificateNo String?
  clearedAt        DateTime? @db.Date   // null only while a cheque is pending
  receipt          Receipt?
}
model Receipt {
  id              String    @id @default(uuid())
  firmId          String
  invoiceId       String
  paymentId       String    @unique
  receiptNumber   String    @unique
  issuedAt        DateTime  @db.Date
  isTaxInvoice    Boolean
  firmSnapshot    Json
  templateVersion String    @default("standard-v1")
  sentAt          DateTime?
  voidedAt        DateTime?
  voidReason      String?
  voidedById      String?
  createdAt       DateTime  @default(now())
  @@index([firmId, issuedAt])
}
```
Migration backfill: existing non-cheque payments get `clearedAt = receivedAt`; existing cheque payments too (they were treated as received). No receipts are backfilled.

## API (all under the existing billing controller, `manageInvoices` capability unless noted)

| Method | Path | Body / result |
|---|---|---|
| POST | `invoices/:id/payments` | existing DTO + `whtAmount?`, `whtRate?`, `whtCertificateNo?` → `{ invoice, payment, receipt \| null, outstanding }` (receipt null for pending cheque) |
| POST | `invoices/:id/payments/:paymentId/clear` | `{ clearedAt: 'YYYY-MM-DD' }` → `{ payment, receipt, outstanding }` |
| GET | `receipts?status=unsent\|sent\|voided` | list for the hub tab: receipt + invoice number + customer name + amount + wht |
| GET | `receipts/:id/print` | receipt, payment, invoice lines (with taxClass), totals, firmSnapshot, customer |
| PATCH | `receipts/:id/sent` | sets `sentAt = now` |
| POST | `receipts/:id/void` | `{ reason }` (required, ≤ 500) |
| GET / PATCH | `firm/billing-profile` | fields of rule 6; PATCH owner/ADMIN only |
| POST | `firm/billing-profile/logo` | multipart image (png/jpg/svg ≤ 1 MB) → `{ logoKey }` |
| GET | `firm/billing-profile/logo` | streams the logo (for print) |

Outstanding everywhere = `totalAmount − Σ(amount + whtAmount)` over payments with `clearedAt != null`. Every place that sums `payment.amount` (collections, receivables, reports, dashboard, AI/MCP tools) must use this.

Invoice create/compute: `vatAmount = vatRegistered ? round2(vatRate × Σ ADVISORY_VAT amounts after discount share) : 0`. Discount applies to fee lines only (not disbursements); keep existing discount rules otherwise. `totalAmount = fees − discount + vatAmount + disbursements`.

## Web (round 1)

- Sidebar: `ใบแจ้งหนี้ / ใบเสร็จ` becomes a top-level item in the firm group (not a child of ค่าใช้จ่าย).
- `/invoices` hub tabs (full-width, equal columns, icon + count): `ต้องส่ง` (DRAFT) → `รอชำระ` (SENT, outstanding > 0, incl. pending cheques) → `ต้องส่งใบเสร็จ` (receipts unsent) → `เสร็จแล้ว`. The `ต้องออกใบแจ้งหนี้` tab arrives in round 3; do not render it now.
- Record-payment drawer per mockup 02 (method, date, amount, WHT card, ledger summary, receipt preview line, sticky footer).
- Receipt print per mockup 03, rendered by a block-based renderer in `apps/web/src/lib/billing-doc.ts` driven by a `standard-v1` block list (logo, firm header, firm tax, title/meta, customer, items table with tax-class column, totals, amount in Thai words, payment info, signatures). Round 2 makes the block list editable.
- Firm billing profile card in settings (logo upload, legal name, tax id, branch, address, VAT switch).
- Case billing panel: the print buttons move out from behind `ออกใบแจ้งหนี้`.

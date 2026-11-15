# Billing round 1: receipts, VAT/WHT, billing hub (2026-11-15)

Branch `claude/invoice-system-adjustment-f3bc14`. Plan, decisions and mockups: `docs/design/2026-11-15-billing/` (round1-contract.md + 8 approved Stitch screens). Research: `docs/research/2026-11-15-thai-legal-fee-schedules.md`.

## Shipped
- Receipt (`RC-YYYY-NNNN`, `receipt_number_seq`) issued when a payment is recorded; cheques stay pending (`clearedAt` null) until confirmed, then the receipt is dated the clearing date.
- Each receipt freezes its share of exempt / taxable / VAT / disbursement (`amount*` columns). The final receipt absorbs rounding, and each receipt's parts sum to amount + WHT. VAT is never counted twice across partial payments.
- Void keeps the number; reissue creates a new number (`replacesReceiptId`; partial unique index = one active receipt per payment). Reprint balance (`outstandingAfter`) comes from cleared payments up to that payment.
- Outstanding everywhere = total − Σ(amount + whtAmount) of cleared payments (`billing/settlement.ts`), including the case billing panel.
- VAT per line via `TaxClass` (LITIGATION_EXEMPT default, ADVISORY_VAT 7%, DISBURSEMENT); only when `Firm.vatRegistered`.
- Firm billing profile (`firm/billing-profile`, owner edits; logo upload png/jpg/svg ≤1 MB, stream needs manageInvoices/manageSubscription).
- Web: top-level "ใบแจ้งหนี้ / ใบเสร็จ" nav, hub tabs (ต้องส่ง / รอชำระ / ต้องส่งใบเสร็จ / เสร็จแล้ว), payment drawer with WHT, A4 block renderer shared by invoice + receipt.

## Migrations (prod auto-migrates on boot)
`20261115120000_billing_receipts_tax`, `20261115150000_receipt_allocation_reissue`. Additive; backfills `clearedAt = receivedAt`; receipt FKs are RESTRICT (no app code hard-deletes firms/cases/invoices).

## Verification
API + web tsc pass; billing + profile jest 281/281; reports/operations/client-portal/case-close 148/148 (team-digest.spec fails before and after — pre-existing compile error). Browser E2E on local firm: VAT 1,400 on 51,400; partial 25,000 + WHT 729.57; cheque pending → cleared; VAT split 700.81 / 699.19; void + reissue; frozen reprint balance; mobile 375px no horizontal scroll. Cursor review: 2 HIGH + 4 MEDIUM fixed; Bangkok-year finding rejected (issuedAt is date-only UTC midnight).

## Not done / next
- Not tested: payment drawer at 375px, keyboard walk-through, real print-to-PDF pagination.
- Rounds 2–4 (template builder + drag items, fee packages/milestones/mobile, court-fee calculator) not started.
- Open decisions from collection research before round 3: deposits, advance-cost (เงินทดรองจ่าย) reconciliation, client-money ledger.
- Accounting sign-off on WHT base for mixed invoices and disbursement VAT treatment (research marks UNVERIFIED).

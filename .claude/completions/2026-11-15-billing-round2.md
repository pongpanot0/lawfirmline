# Billing round 2: drag-and-drop templates + invoice composer (2026-11-15)

Branch `claude/invoice-system-adjustment-f3bc14`. Contract: `docs/design/2026-11-15-billing/round2-contract.md`; mockups 04/05.

## Shipped
- `BillingDocumentTemplate` (Prisma model; the legal DOCX `DocumentTemplate` is untouched): many per type, one active default (partial unique index), logo override, archive, version bump on layout save. Edit = `manageSubscription`, read/choose = `manageInvoices`.
- Resolution customer binding → firm default → `standard-v1`; `GET document-templates/resolve` accepts `templateId`. VAT-required blocks forced visible (and re-added if missing) server-side for VAT-registered firms.
- Snapshots: invoice `templateSnapshot` (set at create when a template is chosen, re-resolved at send) now also freezes `firm` (legal name, address, tax id, branch, VAT, logo) at send; receipts freeze template at issue.
- `packages/shared`: `TemplateLayout`, `STANDARD_V1_LAYOUT`, `validateTemplateLayout` (ids `[A-Za-z0-9_-]{1,64}`, logo 32–256 px), `computeInvoiceTotals` (API + web share it).
- Create invoice: `timeEntryLines` / `expenseLines` per-line description, tax class, sortOrder; `templateId`; discount ≤ fee subtotal.
- Web: block renderer (left/right/full, PromptPay EMVCo QR, bank, note, stamp, item columns + grouping, font/logo size); `/settings/document-templates` builder (auto-select, live A4 preview scaled to column, outline with move/column/hide/delete, inspector, default + customer binding, read-only for non-owners); `/invoices/new` composer (drag or checkbox add, drag or visible ↑/↓ reorder, per-line tax class, shared totals, template choice, preview via server resolve).

## Verification
API tsc; billing + document-templates + clients jest 360/360. Web tsc; node tests billing-doc 11, composer 3, layout ops 2. Browser E2E (local firm): template create + preview, composer issued INV-00012 (exempt 10,000 / taxable 20,000 / VAT 1,400 / total 31,400) with per-line tax class + order and the chosen template frozen. Fixed during E2E: sandboxed preview blank, preview sizing (callback ref), clipped outline/rows, optional payer when the case has no payer records, empty-string id → 400, template choice not sent.
Cursor review: HIGH (invoice firm data not frozen) + 3 MEDIUM + 2 LOW fixed. Not changed: snapshot at create (send re-resolves the same template, so latest version wins) and data-URL `src` escaping (base64 has no `&`).

## Not done / next
- Real mouse drag was not exercised in the browser pane (checkbox path and ↑/↓ were); builder preview is a scaled iframe, the block toolbar lives in the outline beside/below it rather than floating on the A4 as in mockup 04.
- Round 3 (fee packages, milestones, mobile) and round 4 (court-fee calculator) not started; deposits / advance-cost / client-money decisions still open.

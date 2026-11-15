# Billing round 2: contract

Mockups (approved): `04-template-builder.png`, `05-invoice-composer.png`. Builds on round 1 (`round1-contract.md`).

## Decisions (with the user, 2026-11-15)
- Two drag-and-drop features: (A) block-based document templates, (B) dragging unbilled work into an invoice.
- Templates are blocks, not a free canvas: reorder, place in the left column / right column / full row, hide, per-block settings. Live A4 preview.
- A firm can have **many** templates per document type (INVOICE / RECEIPT) and upload a logo (round 1 profile logo is the default; a template may override it).
- Template chosen at issue: customer's bound template → firm default for that type → built-in `standard-v1`. User can switch per document in the composer / payment drawer.
- An issued document freezes the template it used (snapshot), so reprints never change after a template edit.
- When the firm is VAT-registered, blocks the law requires on a receipt / tax invoice cannot be hidden or removed: `firm` (name/address), `firmTax` (tax id + branch), `title`, `meta` (number + date), `customer`, `items`, `totals`.
- Editing templates = owner (`manageSubscription`, same as the billing profile). Choosing a template when issuing = `manageInvoices`.

## Block model (shared shape; put the type + `STANDARD_V1_LAYOUT` + validator in `packages/shared` so API and web use one definition)
```ts
type BlockType = 'logo' | 'firm' | 'firmTax' | 'title' | 'meta' | 'customer' | 'items' | 'totals'
  | 'words' | 'payment' | 'promptpay' | 'bank' | 'note' | 'signatures' | 'stamp';
interface TemplateBlock { id: string; type: BlockType; column: 'left' | 'right' | 'full'; hidden?: boolean;
  settings?: { text?: string; columns?: string[]; groupByTaxClass?: boolean; fontSize?: 'sm' | 'md' | 'lg';
    bankName?: string; accountName?: string; accountNo?: string; promptpayId?: string; logoSize?: number } }
interface TemplateLayout { version: 1; blocks: TemplateBlock[] }   // order = render order; consecutive left+right blocks share a row
```
Validation: ≤ 30 blocks, known types, text ≤ 1,000 chars, required blocks when VAT (above), promptpay id = 10/13 digits.

## Schema (additive)
```prisma
enum DocumentType { INVOICE RECEIPT }
model DocumentTemplate {
  id String @id @default(uuid())
  firmId String
  name String
  docType DocumentType
  layout Json
  logoKey String?          // null = use firm profile logo
  isDefault Boolean @default(false)   // at most one default per (firmId, docType) — partial unique index
  version Int @default(1)  // ++ on every layout save
  archivedAt DateTime?
  createdById String
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  @@index([firmId, docType])
}
model Client { invoiceTemplateId String?  receiptTemplateId String? }   // FK SetNull
model Invoice { templateSnapshot Json? }   // set when the invoice is sent/issued
model Receipt { templateSnapshot Json? }   // set at issue; templateVersion keeps "standard-v1" when no template
```
Snapshot = `{ templateId, name, version, layout, logoKey }`.

## API
| Method | Path | Notes |
|---|---|---|
| GET | `document-templates?docType=` | manageInvoices; excludes archived |
| GET | `document-templates/:id` | |
| POST | `document-templates` | owner; `{ name, docType, layout?, copyFromId? }` (default layout = STANDARD_V1) |
| PATCH | `document-templates/:id` | owner; name/layout/logoKey/isDefault; bumps version on layout change; setting isDefault clears the other default in one transaction |
| POST | `document-templates/:id/archive` | owner; cannot archive a template that is the firm default (unset first) |
| PUT | `clients/:id/document-templates` | owner; `{ invoiceTemplateId?, receiptTemplateId? }` (must be same firm + right docType) |
| GET | `document-templates/resolve?docType=&customerId=` | returns the template that would be used |
| — | `invoices/:id/send`, `invoices/:id/payments`, `receipts/:id/reissue` | accept optional `templateId`; freeze snapshot via the resolver |
| — | print endpoints | include `templateSnapshot` (null → standard-v1) |

## Invoice composer (B)
Route `/invoices/new?caseId=…` (and the current entry points open it). Left: unbilled work from `getInvoiceDraft` in tabs (ชั่วโมงทำงาน / ค่าใช้จ่าย; the งวดค่าวิชาชีพ tab arrives in round 3). Cards are draggable (native HTML5 DnD as in KanbanBoard) **and** selectable with a checkbox + "เพิ่มที่เลือกทั้งหมด" (keyboard path). Right: invoice lines grouped ค่าวิชาชีพ / เงินจ่ายแทนลูกความ, reorder by drag or ↑/↓ buttons, editable description, tax-class select per line, remove. Sticky summary (exempt / taxable / VAT / disbursement / discount with reason / total), checklist, template select, "ออกใบแจ้งหนี้". Uses existing create-invoice API (timeEntryIds / expenseIds / lineItems with taxClass + order).

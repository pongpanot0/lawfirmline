# Mobile billing simulator test + polish (2026-11-15)

PR #253. Tested on iOS simulator (dev client, Metro 8082, local API 3031, test firm E2E Billing).

## Verified
- Case fee section: package price, milestones, "ออกใบแจ้งหนี้งวดนี้" → draft INV-00014 56,000.
- Invoice: mark sent, payment sheet, WHT 3% → RC-2026-0005 (exempt 56,000 = 54,320 + 1,680 in DB).
- INV-00012 (30,000 fee + 1,400 VAT): WHT auto 900 (3%) / 300 (1%), receipt RC-2026-0006 shows 31,400 · WHT 300.

## Fixed
Fee card margin; waived milestone showed 0 ฿; duplicate stage line; WHT never auto-filled (manual 0 → "01680"); receipts/payments hid WHT. `suggestWht` moved to shared.

## Not done
- Mobile invoice lines don't show the VAT line (lines 30,000 vs total 31,400) — collection API has no vatAmount.
- RN Switch ignores a synthetic simulator tap (slide works); real-device tap not checked.
- Stage-change notification still not observed live.

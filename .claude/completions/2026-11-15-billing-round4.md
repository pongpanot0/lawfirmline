# Billing round 4: court-fee calculator (2026-11-15)

Branch `claude/invoice-system-adjustment-f3bc14` (PR #244). Mockup 08; formula source `docs/research/2026-11-15-thai-legal-fee-schedules.md` §4.

## Shipped
- `packages/shared/src/court-fees.ts` — `estimateCourtFee({ kind, level, claimAmount })` → fee, breakdown lines (never negative, sum = fee), notes, rule version. General 2% capped 200,000 on the first 50 M + 0.1% excess, floor below 1 baht; arbitration domestic 0.5%/50,000, foreign 1%/100,000; mortgage 1%/100,000; non-monetary 200; mixed max(monetary, 200); small claims capped 1,000 at trial only; consumer and labour exempt; bankruptcy 500 + 5,000 deposit note; administrative-court base rounded to the hundred; appeal/supreme note (ม.150, amount still disputed); note when a claim-based kind has no claim amount.
- Web `CourtFeeCalculator` in both expense forms (case billing panel, `/expenses/new`) when the category is ค่าธรรมเนียมศาล: prefilled case `claimedAmount`, level segmented control, "ใช้ยอดนี้" only fills the amount and is disabled for a 0 fee.

## Verification
Shared calculator jest 11/11 (research examples 1 M → 20,000, 20 M → 200,000, 60 M → 210,000, small-claims cap, admin rounding, exemptions). Web tsc + node tests. Browser: case with claim 2,500,000 → ฿50,000, apply fills 50,000; consumer → ฿0, apply disabled, claim field hidden. Cursor: formula confirmed; negative small-claims line fixed; remount key + missing-claim note added.

## Not done
Enforcement fees (ตาราง 5), multi-claim/multi-party splits, refunds — out of scope (research marks parts UNVERIFIED). Rule version must be re-checked when ป.วิ.พ. ตาราง 1 changes.

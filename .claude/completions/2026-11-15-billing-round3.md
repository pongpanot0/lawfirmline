# Billing round 3: fee packages, case fee, milestones, mobile (2026-11-15)

Branch `claude/invoice-system-adjustment-f3bc14`. Contract: `docs/design/2026-11-15-billing/round3-contract.md`; mockups 06/07. Decisions 23–25: no deposit ledger (milestone 1 = retainer), advance costs billed after the fact via expenses, client-money ledger deferred.

## Shipped
- `FeePackage` per case type × firm-named tier; components FIXED / PERCENT_CLAIM (min/max) / TIERED_CLAIM (marginal) / PERCENT_RECOVERY (warning ฎ.3331/2556) / PER_UNIT / HOURLY; fee tax class; optional milestones tied to `CaseStage` (sum 100% when present). Owner edits.
- Shared `computeFeePackage` (asks only required inputs), `splitMilestones`, `validateFeePackage`.
- `CaseFee` + `CaseFeeMilestone`: standard vs agreed price; override requires a reason → AuditLog `CASE_FEE_CHANGED` + case feed; `Case.estimatedFee` synced; re-price regenerates PENDING milestones only (closed/waived slots keep their full share — forgone money is not pushed onto other instalments).
- Stage hook (after the stage tx): marks reached milestones, notifies owners + lead once (at-most-once; one failed delivery no longer skips the rest). Reached is derived from CASE_STAGE_ORDER, so banners/hub stay right even for close/reopen/import paths that skip the hook.
- Close-out per milestone: FULL / PARTIAL (≤ amount) / WAIVE (reason). `billing/milestones-due`. Invoice `milestoneLines` under a case row lock (no double invoicing).
- Web: `/settings/fee-packages` (tiers, components, milestones, simulator); case finance tab (brass banner → composer with the milestone, package card, price override drawer, milestones list, close-out drawer); composer tab "งวดค่าวิชาชีพ" + aligned one-line header (payer / due date / template); hub first tab "ต้องออกใบแจ้งหนี้".
- Mobile: case fee section with milestone invoicing (PENDING or PARTIAL, shows close amount); invoice payment sheet with WHT 3%/1%, cheque pending + clear, receipts list.

## Verification
API tsc; fee-packages + billing jest pass (fee-packages 35, earlier full run 819/819 across 54 suites). Web tsc + node tests; mobile tsc + existing tests 11/11. Browser E2E (local firm): package 80,000 + 3% claim → 155,000 at 2.5 M; milestones 60/40; case fee 155,000 → override to 140,000 (no reason → 400) → milestones 84,000/56,000; stage FILING (set via SQL because the journey gate blocks the test case) → banner + hub due → composer → INV-00013 84,000, milestone INVOICED, due list 0; close-out WAIVE without reason → 400, PARTIAL above amount → 400, WAIVE with reason → saved.
Cursor: notification isolation + mobile PARTIAL fixed; HIGH "PARTIAL slot should only consume closeAmount" rejected (forgone amounts must not be re-billed on other instalments).

## Not done / next
- Mobile not run on a simulator/device; stage-change notification delivery not observed live (unit-tested only).
- Round 4 (court-fee calculator in the expense form) not started.

# Process clarity (Shopee-style "who acts next") — 2026-11-11

PR: pongpanot0/lawfirmline#174 · branch `claude/ui-process-clarity-75acd4` · decisions/plan/mockups in `docs/design/2026-11-10-process-clarity/`.

- API: `GET /cases/progress` (bucket, stage step, next action; batched, same access filter as `GET /cases`); journey INFO gate (required case-type fields + court after filing) with `next.kind`; journey tasks ordered by due date.
- Web: `components/process/*`; case list tabs + phase chips; short create form + `/cases/[id]/opened` success page; case page = tracker + one next-action card + accordion rows; overview edit gains case-type fields; my tasks / expenses / reimbursements / invoices / leave by who acts next.
- Gotchas: `chargeSection` lives in `customFields.chargeSection` (no column). Floating AI button (z-40) covers bottom bars — use `z-[45]`. Codex sandbox cannot launch Chromium; run Playwright from the session.
- Proof: api jest src/cases 370 ✓, web tests 215 ✓, tsc api+web ✓, E2E `--project=process-clarity` 14/14 ✓ (servers on 3021/3026), Cursor review findings fixed.
- Follow-ups: rejected-expense resubmit needs API (reason + reset to DRAFT); paginate `/cases/progress` if firms grow; round-2 Stitch mockups (Stitch was down).

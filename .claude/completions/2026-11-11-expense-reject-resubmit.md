# Rejected expense → fix and resubmit (2026-11-11)

- `Expense.rejectionReason` (migration `20261111120000_expense_rejection_reason`). Written by both reject paths
  (`updateExpenseClaimStatus`, `updateExpenseStatus`) from an optional `reason` (≤500); appended to the LINE/in-app notice.
- `POST /expenses/:id/revise` — author only: REJECTED → DRAFT, `claimId` and reason cleared, audit `expense.revise`
  keeps the old claimId + reason. The rejected claim stays as the record.
- `PATCH /expenses/:id` — author edits an unclaimed DRAFT (multipart, optional new receipt). Full replacement of
  the optional fields; `sourceEventId` cleared when the case changes.
- Web: ต้องทำ tab shows reason in red + "แก้ไขแล้วส่งใหม่ →" (revise then `/expenses/new?edit=<id>`); drafts get
  "แก้ไขรายการ". Approvers get a `window.prompt` for the reason (cancel = abort) on `/expenses` and `/admin/reimbursements`.
- LINE quick-action reject still sends no reason (optional field).

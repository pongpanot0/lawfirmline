# Leave visibility + "who's out today" notices — 2026-11-12

## Decisions (grilled with the user)
- Approvers (OWNER, OFFICE_MANAGER = `approveLeave`) see every leave in full.
- Everyone else: own leave in full; others' leave only when APPROVED, name + dates (type, decision, courtConflicts hidden).
- One rule in `apps/api/src/leave/leave-visibility.ts`, used by `LeaveService.list` (GET /leaves → web, mobile, team calendar) and secretary/MCP `list_leaves`.
- 08:00 "📅 วันนี้ไม่อยู่": all types, names only, LINE + app, working days only (weekend/publicHoliday skipped).
- Leave approved for today after 08:00 → "📅 วันนี้ไม่อยู่เพิ่ม" at once, once per leave per day (`out:<day>:<leaveId>` claim in leaveNoticeLog).
- Weekly (Monday, skipped on holiday) + 3-day digests kept: all types, names + dates, LINE + app.
- Instant "🤒 แจ้งลาป่วย" broadcast and its 10-min resend removed. Cancel notice kept without type.
- LINE approval request is a Flex card with its own postback buttons (quick replies only sit under the newest message, so a tap approved the latest request). The reply names the person and dates.

## Known ceilings (Cursor review)
- A LINE failure or a crash mid-way through the today round is not retried. The in-app copy still goes out unless it crashed.
- `sendOnce` deletes its key if the `sentAt` write fails after a successful push, so that message is sent again. This was already true before this change.
- A cancel that lands in the same instant as the 08:00 round can be followed by a stale "วันนี้ไม่อยู่".

## Verify
`npx jest --runInBand src/leave src/notifications src/secretary` — 299 tests pass. The MCP suites fail to load in this worktree because `@modelcontextprotocol/sdk` is missing from its node_modules; that is a setup problem here, not this change.

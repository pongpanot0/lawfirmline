# Multi-assignee appointments + on-leave flag in assignee pickers: design

Date: 2026-09-26. Owner request: "นัดต่างๆ ต้องมีมากกว่า 1 คน และถ้าเลือกคนที่ลา ต้องขึ้นว่าคนนี้ลา".

## Decisions
- Add a new join table `CalendarEventAssignee(eventId, userId)` that holds **every** person assigned to an event.
  - `CalendarEvent.assigneeId` stays as the **primary** person. It is always the first element of `assigneeIds`, or null when there are no rows.
  - The primary person keeps the existing single-owner flows: `EventResponsibility` acknowledge/complete and the action-center acknowledgement items. Changing those is out of scope.
- The people on an event are its assignee rows when there are any, otherwise the case's lead lawyer. This is the existing fallback, generalised to many people.
- The migration backfills one row for each existing event that has an `assigneeId`.
- Create/update events accept `assigneeIds?: string[]`:
  - At most 10 ids, all UUIDs, all unique, and every id must be a firm member. A non-member gets a Thai 400.
  - The existing `assigneeId?` input is still accepted and treated as `[assigneeId]`.
  - On update, `assigneeIds` replaces the whole set, and `[]` clears it back to the lead-lawyer fallback.
  - The rows and `assigneeId` are written in one transaction.
  - This also fixes the existing gap where the assignee was never checked for firm membership.
- Readers that now use **all** the event's people:
  - agenda/my-day event visibility, plus an `assignees[]` array on the row
  - dashboard workload hearing counts (each person counted)
  - LINE reminders (`getLineUserIdsForEvent`, reminder scheduler)
  - time suggestions (billing)
  - leave `findCourtConflicts`
  - court-day "next hearing" copies every assignee
  - web firm-day clash detection
- **On-leave flag**, computed client-side from `GET leaves?from=d&to=d` (any firm member may call it):
  - APPROVED leave covering date d → label `ลา` plus the leave type.
  - PENDING leave covering date d → `ขอลา (รออนุมัติ)`.
  - REJECTED leave is ignored.
- The flag is **a warning, not a block**. It shows next to each person in every assignee picker. When a flagged person is selected, a warning line appears: `⚠ {ชื่อ} ลาวันที่ {date}`.
  - Event date = the event's start date. Task date = the due date if set, otherwise today.
- Pickers:
  - Event dialog: a multi-select checkbox list.
  - Task pickers: stay single-select, with the flag in the option text and the warning line.
  - Mobile reassign sheet: gets the flag.
  - Mobile event creation has no assignee today and stays unchanged.

## Out of scope
- Per-assignee acknowledgement.
- Server-side blocking of assigning someone who is on leave.
- Multi-assignee tasks.

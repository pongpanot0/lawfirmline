# Owner operations hub — Team Radar, person drawer, task size

**Pain point:** owner can't see what each person is carrying and hesitates to assign work.

## Shipped
- `Task.size` (S/M/L → 1/2/4 points), NOT NULL DEFAULT M. Migrations `20260928120000_task_size` + `20260928130000_task_size_default_m` (backfills M).
- Size editable inline (`TaskSizePicker`) in the person drawer and daily board rows via owner-only `PATCH /operations/tasks/:id/size`.
  Shared: `TaskSize`, `TASK_SIZES`, `taskPoints`, `HEAVY_QUEUE_POINTS=10`, `HEAVY_DAY_POINTS=4`.
- `GET /operations/radar?date=` — 7 Bangkok days × member: points (by scheduledFor, else dueDate), events, leave; totals open/overdue/review/unscheduled.
- `GET /operations/people/:id` — queue, reviews, cases (lead/buddy), events next 7 days, upcoming leave.
- Web: new default tab "ภาพรวมทีม" (`TeamRadar.tsx`), `PersonWorkloadDrawer.tsx` (also opens from names on the daily board),
  size picker + point ranking + heavy-queue warning in `WorkAssignmentForm`.

## Not done (by choice)
- Item 4 (accept/decline assignment) and item 5 (self-claim pool) — user excluded 5; 4 not requested.
- Thresholds are office-wide constants (ponytail note in shared).

## Round 3 — split responsibilities
- Daily tab → "ต้องจัดการวันนี้": only unassigned + follow-ups (blocked, due today/overdue & not submitted, awaiting review, unacknowledged, planned-but-no-update).
  "ถามความคืบหน้า" → `POST /operations/tasks/:id/follow-up` (FOLLOW_UP comment + LINE DM, once per task per Bangkok day).
- Per-person queue management moved into the person drawer (reorder, move to someone else, size, work types) — owner only.
- Radar + person view open to every firm member (`TeamWorkloadController`, no OwnerOnly). Non-owners: titles only for
  cases they can access (CaseAccessService filter), other work shows as "งานที่คุณไม่มีสิทธิ์ดู", leave type hidden.
- Radar day cells open the drawer focused on that day (`?from=` sets the appointment window).

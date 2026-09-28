# Owner operations hub — Team Radar, person drawer, task size

**Pain point:** owner can't see what each person is carrying and hesitates to assign work.

## Shipped
- `Task.size` (S/M/L → 1/2/4 points; null counts as M). Migration `20260928120000_task_size`.
  Shared: `TaskSize`, `TASK_SIZES`, `taskPoints`, `HEAVY_QUEUE_POINTS=10`, `HEAVY_DAY_POINTS=4`.
- `GET /operations/radar?date=` — 7 Bangkok days × member: points (by scheduledFor, else dueDate), events, leave; totals open/overdue/review/unscheduled.
- `GET /operations/people/:id` — queue, reviews, cases (lead/buddy), events next 7 days, upcoming leave.
- Web: new default tab "ภาพรวมทีม" (`TeamRadar.tsx`), `PersonWorkloadDrawer.tsx` (also opens from names on the daily board),
  size picker + point ranking + heavy-queue warning in `WorkAssignmentForm`.

## Not done (by choice)
- Item 4 (accept/decline assignment) and item 5 (self-claim pool) — user excluded 5; 4 not requested.
- Thresholds are office-wide constants (ponytail note in shared).

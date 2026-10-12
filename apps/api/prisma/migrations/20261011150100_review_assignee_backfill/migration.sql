-- Before 2026-10-11 a handoff moved assigneeId to the reviewer. Ownership now
-- stays with the worker: restore the last HANDED_OFF sender as assignee, keep
-- who it was handed to as the reviewer (standalone todos had no reviewerId),
-- and stamp submittedAt with the handoff time. Idempotent; only PENDING_REVIEW.
WITH last_handoff AS (
  SELECT DISTINCT ON ("taskId") "taskId", "fromUserId", "toUserId", "createdAt"
  FROM "TaskAssignmentLog"
  WHERE "action" = 'HANDED_OFF' AND "fromUserId" IS NOT NULL
  ORDER BY "taskId", "createdAt" DESC
)
UPDATE "Task" t
SET "assigneeId"  = h."fromUserId",
    "reviewerId"  = COALESCE(t."reviewerId", CASE WHEN t."caseId" IS NULL THEN h."toUserId" END),
    "submittedAt" = COALESCE(t."submittedAt", h."createdAt")
FROM last_handoff h
WHERE t."id" = h."taskId"
  AND t."status" = 'PENDING_REVIEW';

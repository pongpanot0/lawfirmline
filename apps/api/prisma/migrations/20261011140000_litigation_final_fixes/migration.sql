-- Part L final fixes. Idempotent: every statement only touches rows still in the old shape.

-- 1. The ครบอายุความ event follows the case's CURRENT lead: drop the lead's assignee row and
--    assigneeId so the reminder scheduler falls back to Case.leadLawyerId (eventPeopleIds).
DELETE FROM "CalendarEventAssignee" a
USING "Case" c
WHERE c."limitationEventId" = a."eventId"
  AND a."userId" = c."leadLawyerId";

UPDATE "CalendarEvent" e
SET "assigneeId" = NULL
FROM "Case" c
WHERE c."limitationEventId" = e."id"
  AND e."assigneeId" = c."leadLawyerId";

-- 6. The default ม.173 card (ขอให้ส่งหมายเรียกและสำเนาคำฟ้อง) is for a trial filing only.
UPDATE "DeadlineRule"
SET "courtLevel" = 'TRIAL'
WHERE "firmId" IS NULL
  AND "trigger" = 'FILED'
  AND "label" = 'ขอให้ส่งหมายเรียกและสำเนาคำฟ้อง'
  AND "courtLevel" IS NULL;

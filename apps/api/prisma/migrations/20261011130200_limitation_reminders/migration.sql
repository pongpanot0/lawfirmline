-- Spec L4: one "ครบอายุความ" DEADLINE event per open, unfiled case with a limitationDeadline.
-- Reminders 90/30/7/1 days before; due 16:30 Bangkok (09:30 UTC) on the Bangkok day of the deadline.
-- "Eligible" everywhere below: has a deadline, not deleted, not CLOSED/ARCHIVED, no black case
-- number of its own, and no proceeding that is filed (filedAt / blackCaseNumber / judgmentAt).

-- 1. Insurance claims already created an event; adopt it as the case's.
UPDATE "Case" c
   SET "limitationEventId" = ic."limitationEventId"
  FROM "InsuranceClaim" ic
 WHERE ic."caseId" = c."id"
   AND ic."limitationEventId" IS NOT NULL
   AND c."limitationEventId" IS NULL
   AND c."limitationDeadline" IS NOT NULL
   AND c."blackCaseNumber" IS NULL
   AND c."deletedAt" IS NULL
   AND c."status" NOT IN ('CLOSED', 'ARCHIVED')
   AND NOT EXISTS (
     SELECT 1 FROM "CaseProceeding" p
      WHERE p."caseId" = c."id"
        AND (p."filedAt" IS NOT NULL OR p."blackCaseNumber" IS NOT NULL OR p."judgmentAt" IS NOT NULL))
   AND EXISTS (SELECT 1 FROM "CalendarEvent" e WHERE e."id" = ic."limitationEventId");

-- 2. Create the missing events.
WITH targets AS (
  SELECT c."id" AS case_id, c."leadLawyerId" AS lead_id,
         (((c."limitationDeadline" + INTERVAL '7 hours')::date)::timestamp + INTERVAL '9 hours 30 minutes') AS start_at,
         gen_random_uuid()::text AS event_id
    FROM "Case" c
   WHERE c."limitationDeadline" IS NOT NULL
     AND c."limitationEventId" IS NULL
     AND c."blackCaseNumber" IS NULL
     AND c."deletedAt" IS NULL
     AND c."status" NOT IN ('CLOSED', 'ARCHIVED')
     AND NOT EXISTS (
       SELECT 1 FROM "CaseProceeding" p
        WHERE p."caseId" = c."id"
          AND (p."filedAt" IS NOT NULL OR p."blackCaseNumber" IS NOT NULL OR p."judgmentAt" IS NOT NULL))
), created AS (
  INSERT INTO "CalendarEvent" ("id", "caseId", "assigneeId", "title", "startAt", "type", "reminderMinutes", "createdAt", "updatedAt")
  SELECT event_id, case_id, lead_id, 'ครบอายุความ', start_at, 'DEADLINE'::"EventType", ARRAY[129600, 43200, 10080, 1440],
         CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
    FROM targets
  RETURNING "id", "caseId", "assigneeId"
), people AS (
  INSERT INTO "CalendarEventAssignee" ("eventId", "userId")
  SELECT "id", "assigneeId" FROM created
)
UPDATE "Case" c SET "limitationEventId" = created."id" FROM created WHERE created."caseId" = c."id";

-- 3. Every linked event (adopted or new) of an eligible case gets the shared title, time and reminders.
UPDATE "CalendarEvent" e
   SET "title" = 'ครบอายุความ',
       "reminderMinutes" = ARRAY[129600, 43200, 10080, 1440],
       "startAt" = (((c."limitationDeadline" + INTERVAL '7 hours')::date)::timestamp + INTERVAL '9 hours 30 minutes'),
       "updatedAt" = CURRENT_TIMESTAMP
  FROM "Case" c
 WHERE c."limitationEventId" = e."id"
   AND c."limitationDeadline" IS NOT NULL
   AND c."blackCaseNumber" IS NULL
   AND c."deletedAt" IS NULL
   AND c."status" NOT IN ('CLOSED', 'ARCHIVED')
   AND NOT EXISTS (
     SELECT 1 FROM "CaseProceeding" p
      WHERE p."caseId" = c."id"
        AND (p."filedAt" IS NOT NULL OR p."blackCaseNumber" IS NOT NULL OR p."judgmentAt" IS NOT NULL));

-- 4. No catch-up burst: a lead time that is already past (reminder time <= now) counts as sent,
--    so the scheduler only fires the ones still ahead. A log for a lead time still ahead (an
--    adopted event whose date moved) is dropped so that reminder fires on schedule.
--    ReminderLog is unique on (eventId, minutesBefore); the scheduler writes channel 'console' when nothing was pushed.
DELETE FROM "ReminderLog" r
 USING "Case" c, "CalendarEvent" e
 WHERE c."limitationEventId" = e."id" AND r."eventId" = e."id"
   AND e."title" = 'ครบอายุความ'
   AND r."minutesBefore" IN (129600, 43200, 10080, 1440)
   AND e."startAt" - (r."minutesBefore" * INTERVAL '1 minute') > CURRENT_TIMESTAMP AT TIME ZONE 'UTC';

INSERT INTO "ReminderLog" ("id", "eventId", "sentAt", "channel", "minutesBefore")
SELECT gen_random_uuid()::text, e."id", CURRENT_TIMESTAMP, 'console', m.minutes
  FROM "Case" c
  JOIN "CalendarEvent" e ON e."id" = c."limitationEventId"
 CROSS JOIN (VALUES (129600), (43200), (10080), (1440)) AS m(minutes)
 WHERE e."title" = 'ครบอายุความ'
   AND e."startAt" - (m.minutes * INTERVAL '1 minute') <= CURRENT_TIMESTAMP AT TIME ZONE 'UTC'
ON CONFLICT ("eventId", "minutesBefore") DO NOTHING;

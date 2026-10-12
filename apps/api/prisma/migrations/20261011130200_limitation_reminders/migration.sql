-- Spec L4: one "ครบอายุความ" DEADLINE event per open, unfiled case with a limitationDeadline.
-- Reminders 90/30/7/1 days before; due 16:30 Bangkok (09:30 UTC) on the Bangkok day of the deadline.

-- 1. Insurance claims already created an event; adopt it as the case's.
UPDATE "Case" c
   SET "limitationEventId" = ic."limitationEventId"
  FROM "InsuranceClaim" ic
 WHERE ic."caseId" = c."id"
   AND ic."limitationEventId" IS NOT NULL
   AND c."limitationEventId" IS NULL
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

-- 3. Every linked event (adopted or new) gets the shared title, time and reminders.
UPDATE "CalendarEvent" e
   SET "title" = 'ครบอายุความ',
       "reminderMinutes" = ARRAY[129600, 43200, 10080, 1440],
       "startAt" = (((c."limitationDeadline" + INTERVAL '7 hours')::date)::timestamp + INTERVAL '9 hours 30 minutes'),
       "updatedAt" = CURRENT_TIMESTAMP
  FROM "Case" c
 WHERE c."limitationEventId" = e."id" AND c."limitationDeadline" IS NOT NULL;

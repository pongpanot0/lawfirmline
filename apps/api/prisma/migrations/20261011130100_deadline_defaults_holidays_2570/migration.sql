-- Spec L1: platform default deadline rules and the 2570 (2027) holiday calendar.
-- Runs after 20261011130000, so the new enum values are committed and usable.

-- 1. Upgrade the two old global rows in place (PENDING suggestions keep pointing at them).
UPDATE "DeadlineRule"
   SET "label" = 'ครบกำหนดยื่นคำให้การ', "serviceMethod" = 'PERSONAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "firmId" IS NULL AND "caseTypeId" IS NULL AND "trigger" = 'COMPLAINT_SERVED' AND "label" = 'ยื่นคำให้การ';

UPDATE "DeadlineRule"
   SET "label" = 'ครบกำหนดยื่นอุทธรณ์', "offsetDays" = 1, "dayBasis" = 'MONTHS', "courtLevel" = 'TRIAL',
       "updatedAt" = CURRENT_TIMESTAMP
 WHERE "firmId" IS NULL AND "caseTypeId" IS NULL AND "trigger" = 'JUDGMENT' AND "label" = 'ยื่นอุทธรณ์';

-- 2. Insert every default that is not there yet (keyed by trigger + label, as firm overrides are).
INSERT INTO "DeadlineRule" ("id", "trigger", "label", "offsetDays", "dayBasis", "adjustDays",
                            "courtEventKind", "courtLevel", "partySide", "serviceMethod",
                            "isActive", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, v.trigger::"DeadlineTrigger", v.label, v.offset_days, v.basis::"DeadlineDayBasis",
       v.adjust, v.kind::"CourtEventKind", v.level::"CourtLevel", v.side::"PartyRole", v.method::"ServiceMethod",
       true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM (VALUES
  ('FILED',            'ขอให้ส่งหมายเรียกและสำเนาคำฟ้อง',                 7,   'CALENDAR', 0,   NULL::text,        NULL::text, NULL::text,  NULL::text),
  ('COMPLAINT_SERVED', 'ครบกำหนดยื่นคำให้การ',                            15,  'CALENDAR', 0,   NULL,              NULL,       NULL,        'PERSONAL'),
  ('COMPLAINT_SERVED', 'ครบกำหนดยื่นคำให้การ (ปิดหมาย)',                   30,  'CALENDAR', 0,   NULL,              NULL,       NULL,        'POSTED'),
  ('COMPLAINT_SERVED', 'ตรวจขาดนัดยื่นคำให้การ / ขอให้พิพากษาโดยขาดนัด',    30,  'CALENDAR', 0,   NULL,              NULL,       'PLAINTIFF', NULL),
  ('COURT_DATE',       'ยื่นบัญชีระบุพยาน',                                -7,  'CALENDAR', 0,   'WITNESS_HEARING', NULL,       NULL,        NULL),
  ('COURT_DATE',       'สรุปผลนัดและรายงานลูกความ',                         3,   'BUSINESS', 0,   NULL,              NULL,       NULL,        NULL),
  ('JUDGMENT',         'ครบกำหนดยื่นอุทธรณ์',                              1,   'MONTHS',   0,   NULL,              'TRIAL',    NULL,        NULL),
  ('JUDGMENT',         'ครบกำหนดยื่นคำร้องขออนุญาตฎีกาและฎีกา',             1,   'MONTHS',   0,   NULL,              'APPEAL',   NULL,        NULL),
  ('APPEAL_SERVED',    'ครบกำหนดยื่นคำแก้อุทธรณ์',                          15,  'CALENDAR', 0,   NULL,              NULL,       NULL,        NULL),
  ('ORDER_RECEIVED',   'โต้แย้งคำสั่งศาล',                                  15,  'CALENDAR', 0,   NULL,              NULL,       NULL,        NULL),
  ('JUDGMENT',         'ใกล้ครบระยะบังคับคดี 10 ปี',                        120, 'MONTHS',   -90, NULL,              NULL,       NULL,        NULL)
) AS v(trigger, label, offset_days, basis, adjust, kind, level, side, method)
WHERE NOT EXISTS (
  SELECT 1 FROM "DeadlineRule" r
   WHERE r."firmId" IS NULL AND r."trigger" = v.trigger::"DeadlineTrigger" AND r."label" = v.label
);

-- 3. Thai government holidays B.E. 2570 (2027) — fixed dates only.
-- Source: the recurring Cabinet-approved annual government holiday list (same set as
-- 20260907190000 for 2569); substitution days follow the standing Cabinet rule that a
-- holiday on Sat/Sun is compensated on the next working day (23 Oct 2027 = Sat → Mon 25 Oct;
-- 5 Dec 2027 = Sun → Mon 6 Dec).
-- NOT seeded: มาฆบูชา, วิสาขบูชา, อาสาฬหบูชา, เข้าพรรษา, พืชมงคล. As of 2026-10-12 no Cabinet
-- resolution / Royal Gazette notice fixing them for 2570 was found (soc.go.th, ratchakitcha.soc.go.th,
-- thaigov.go.th). BOT notice สนส. 37/2569 (27 Aug 2569) covers financial-institution holidays only.
-- Enter them at /admin/holidays once announced. 1 May (วันแรงงาน) is a private-sector holiday.
INSERT INTO "PublicHoliday" ("id", "date", "name") VALUES
  (gen_random_uuid()::text, DATE '2027-01-01', 'วันขึ้นปีใหม่'),
  (gen_random_uuid()::text, DATE '2027-04-06', 'วันจักรี'),
  (gen_random_uuid()::text, DATE '2027-04-13', 'วันสงกรานต์'),
  (gen_random_uuid()::text, DATE '2027-04-14', 'วันสงกรานต์'),
  (gen_random_uuid()::text, DATE '2027-04-15', 'วันสงกรานต์'),
  (gen_random_uuid()::text, DATE '2027-05-04', 'วันฉัตรมงคล'),
  (gen_random_uuid()::text, DATE '2027-06-03', 'วันเฉลิมพระชนมพรรษาสมเด็จพระนางเจ้าฯ พระบรมราชินี'),
  (gen_random_uuid()::text, DATE '2027-07-28', 'วันเฉลิมพระชนมพรรษาพระบาทสมเด็จพระเจ้าอยู่หัว'),
  (gen_random_uuid()::text, DATE '2027-08-12', 'วันเฉลิมพระชนมพรรษาสมเด็จพระบรมราชชนนีพันปีหลวง'),
  (gen_random_uuid()::text, DATE '2027-10-13', 'วันคล้ายวันสวรรคตพระบาทสมเด็จพระบรมชนกาธิเบศรฯ'),
  (gen_random_uuid()::text, DATE '2027-10-23', 'วันปิยมหาราช'),
  (gen_random_uuid()::text, DATE '2027-10-25', 'ชดเชยวันปิยมหาราช'),
  (gen_random_uuid()::text, DATE '2027-12-05', 'วันคล้ายวันพระบรมราชสมภพพระบาทสมเด็จพระบรมชนกาธิเบศรฯ'),
  (gen_random_uuid()::text, DATE '2027-12-06', 'ชดเชยวันคล้ายวันพระบรมราชสมภพฯ'),
  (gen_random_uuid()::text, DATE '2027-12-10', 'วันรัฐธรรมนูญ'),
  (gen_random_uuid()::text, DATE '2027-12-31', 'วันสิ้นปี')
ON CONFLICT ("date") DO NOTHING;

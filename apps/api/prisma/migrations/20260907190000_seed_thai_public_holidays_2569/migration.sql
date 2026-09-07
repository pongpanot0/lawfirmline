-- Thai public holidays for B.E. 2569 (2026), used by the deadline engine when a
-- rule counts business days or a computed deadline lands on a non-working day.
--
-- This is reference data, not schema: it is a starting point that a firm admin
-- can correct from /admin/holidays. Cabinet announcements are revised, and
-- 1 May (วันแรงงาน) is deliberately absent because it is a private-sector
-- holiday rather than a court/government one.
--
-- Idempotent: the unique index on "date" makes a re-run a no-op.
INSERT INTO "PublicHoliday" ("id", "date", "name") VALUES
  (gen_random_uuid()::text, DATE '2026-01-01', 'วันขึ้นปีใหม่'),
  (gen_random_uuid()::text, DATE '2026-03-03', 'วันมาฆบูชา'),
  (gen_random_uuid()::text, DATE '2026-04-06', 'วันจักรี'),
  (gen_random_uuid()::text, DATE '2026-04-13', 'วันสงกรานต์'),
  (gen_random_uuid()::text, DATE '2026-04-14', 'วันสงกรานต์'),
  (gen_random_uuid()::text, DATE '2026-04-15', 'วันสงกรานต์'),
  (gen_random_uuid()::text, DATE '2026-05-04', 'วันฉัตรมงคล'),
  (gen_random_uuid()::text, DATE '2026-05-13', 'วันพืชมงคล'),
  (gen_random_uuid()::text, DATE '2026-05-31', 'วันวิสาขบูชา'),
  (gen_random_uuid()::text, DATE '2026-06-01', 'ชดเชยวันวิสาขบูชา'),
  (gen_random_uuid()::text, DATE '2026-06-03', 'วันเฉลิมพระชนมพรรษาสมเด็จพระนางเจ้าฯ พระบรมราชินี'),
  (gen_random_uuid()::text, DATE '2026-07-28', 'วันเฉลิมพระชนมพรรษาพระบาทสมเด็จพระเจ้าอยู่หัว'),
  (gen_random_uuid()::text, DATE '2026-07-29', 'วันอาสาฬหบูชา'),
  (gen_random_uuid()::text, DATE '2026-07-30', 'วันเข้าพรรษา'),
  (gen_random_uuid()::text, DATE '2026-08-12', 'วันเฉลิมพระชนมพรรษาสมเด็จพระบรมราชชนนีพันปีหลวง'),
  (gen_random_uuid()::text, DATE '2026-10-13', 'วันคล้ายวันสวรรคตพระบาทสมเด็จพระบรมชนกาธิเบศรฯ'),
  (gen_random_uuid()::text, DATE '2026-10-23', 'วันปิยมหาราช'),
  (gen_random_uuid()::text, DATE '2026-12-05', 'วันคล้ายวันพระบรมราชสมภพพระบาทสมเด็จพระบรมชนกาธิเบศรฯ'),
  (gen_random_uuid()::text, DATE '2026-12-07', 'ชดเชยวันคล้ายวันพระบรมราชสมภพฯ'),
  (gen_random_uuid()::text, DATE '2026-12-10', 'วันรัฐธรรมนูญ'),
  (gen_random_uuid()::text, DATE '2026-12-31', 'วันสิ้นปี')
ON CONFLICT ("date") DO NOTHING;

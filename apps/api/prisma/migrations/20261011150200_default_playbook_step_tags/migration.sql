-- Adds side/requiresAttachment to the default SOP steps firms already hold.
-- Only the platform-seeded release (version 1; a firm's own edit publishes version 2+)
-- is touched, matched by templateKey + exact step title. Re-running is a no-op (jsonb merge).
WITH tags(template_key, title, patch) AS (VALUES
  ('DEFAULT_CIVIL',    'ร่างคำฟ้องและบัญชีท้ายฟ้อง',                         '{"requiresAttachment": true}'::jsonb),
  ('DEFAULT_CIVIL',    'ยื่นคำให้การ (กรณีเป็นฝ่ายจำเลย)',                    '{"side": "DEFENDANT", "requiresAttachment": true}'::jsonb),
  ('DEFAULT_CIVIL',    'ขอให้ศาลพิพากษาโดยขาดนัดยื่นคำให้การ (ฝ่ายโจทก์)',     '{"side": "PLAINTIFF"}'::jsonb),
  ('DEFAULT_CIVIL',    'ยื่นบัญชีระบุพยานและสำเนาเอกสาร',                     '{"requiresAttachment": true}'::jsonb),
  ('DEFAULT_CIVIL',    'ร่างและยื่นอุทธรณ์',                                  '{"requiresAttachment": true}'::jsonb),
  ('DEFAULT_CRIMINAL', 'ยื่นคำร้องขอปล่อยชั่วคราว (ถ้าลูกความถูกควบคุม)',       '{"side": "DEFENDANT"}'::jsonb),
  ('DEFAULT_CRIMINAL', 'ร่างและยื่นฟ้อง/คำร้องเข้าเป็นโจทก์ร่วม',              '{"side": "PLAINTIFF"}'::jsonb),
  ('DEFAULT_CRIMINAL', 'ยื่นคำร้องขอค่าสินไหมทดแทน (ผู้เสียหาย)',              '{"side": "PLAINTIFF"}'::jsonb),
  ('DEFAULT_CRIMINAL', 'เตรียมคำให้การจำเลยและนัดพร้อม/ตรวจพยานหลักฐาน',       '{"side": "DEFENDANT"}'::jsonb),
  ('DEFAULT_FAMILY',   'ยื่นคำให้การ (กรณีเป็นฝ่ายจำเลย)',                    '{"side": "DEFENDANT"}'::jsonb)
)
UPDATE "PlaybookRelease" r
SET "steps" = (
  SELECT jsonb_agg(
    s.step || COALESCE((SELECT t.patch FROM tags t WHERE t.template_key = r."templateKey" AND t.title = s.step->>'title'), '{}'::jsonb)
    ORDER BY s.ord)
  FROM jsonb_array_elements(r."steps") WITH ORDINALITY AS s(step, ord)
)
WHERE r."templateKey" IN ('DEFAULT_CIVIL', 'DEFAULT_CRIMINAL', 'DEFAULT_FAMILY')
  AND r."version" = 1
  AND jsonb_typeof(r."steps") = 'array'
  AND jsonb_array_length(r."steps") > 0;

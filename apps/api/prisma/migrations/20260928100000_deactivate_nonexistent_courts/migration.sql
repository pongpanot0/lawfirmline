-- These three names were in the old default court list but are not real courts
-- (COJ structure, 1 เม.ย. 2568). Deactivate rather than delete: Case.courtName
-- stores the name as text, so existing cases keep reading correctly.
UPDATE "Court"
SET "isActive" = false, "updatedAt" = NOW()
WHERE "name" IN ('ศาลแพ่งกรุงเทพเหนือ', 'ศาลแพ่งกรุงเทพกลาง', 'ศาลอาญากรุงเทพเหนือ');

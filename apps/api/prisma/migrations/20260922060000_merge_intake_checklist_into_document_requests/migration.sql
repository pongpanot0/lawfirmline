-- ยุบ checklist สองชุดเป็นชุดเดียว
--
-- `IntakeChecklistItem` (ย้ายผลยืนยันออกจาก sessionStorage) กับ
-- `IntakeDocumentRequest` (รายการเอกสารที่ขอ + สถานะ + ด่านก่อนออกหนังสือ)
-- ตอบคำถามเดียวกันคือ "เอกสารครบหรือยัง" ตารางหลังครอบของแรกได้ทั้งหมด
-- (documentId มีอยู่แล้ว, __manual__ → RECEIVED, __skipped__ → NOT_APPLICABLE)
-- จึงย้ายข้อมูลเข้าตารางเดียวแล้วทิ้งอีกตาราง

-- ผลยืนยันที่ผูกไฟล์ไว้ และที่ยืนยันด้วยมือ → RECEIVED
INSERT INTO "IntakeDocumentRequest" ("id", "intakeId", "name", "required", "status", "documentId", "requestedAt", "receivedAt", "createdById", "updatedAt")
SELECT gen_random_uuid(), c."intakeId", c."label", true, 'RECEIVED',
       CASE WHEN c."documentId" IN ('__manual__', '__skipped__') THEN NULL ELSE c."documentId" END,
       c."createdAt", COALESCE(c."confirmedAt", c."createdAt"),
       COALESCE(c."confirmedById", (SELECT "leadLawyerId" FROM "Case" LIMIT 1), (SELECT "id" FROM "User" LIMIT 1)),
       c."updatedAt"
FROM "IntakeChecklistItem" c
WHERE c."documentId" IS NOT NULL
  AND c."documentId" <> '__skipped__'
  AND NOT EXISTS (
    SELECT 1 FROM "IntakeDocumentRequest" r WHERE r."intakeId" = c."intakeId" AND r."name" = c."label"
  )
  AND COALESCE(c."confirmedById", (SELECT "id" FROM "User" LIMIT 1)) IS NOT NULL;

-- ที่ทำเครื่องหมายว่าไม่เกี่ยวข้อง → NOT_APPLICABLE
INSERT INTO "IntakeDocumentRequest" ("id", "intakeId", "name", "required", "status", "requestedAt", "createdById", "updatedAt")
SELECT gen_random_uuid(), c."intakeId", c."label", true, 'NOT_APPLICABLE', c."createdAt",
       COALESCE(c."confirmedById", (SELECT "id" FROM "User" LIMIT 1)), c."updatedAt"
FROM "IntakeChecklistItem" c
WHERE c."documentId" = '__skipped__'
  AND NOT EXISTS (
    SELECT 1 FROM "IntakeDocumentRequest" r WHERE r."intakeId" = c."intakeId" AND r."name" = c."label"
  )
  AND COALESCE(c."confirmedById", (SELECT "id" FROM "User" LIMIT 1)) IS NOT NULL;

DROP TABLE "IntakeChecklistItem";

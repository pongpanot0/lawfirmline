-- ใบแจ้งหนี้คือเอกสารที่ส่งให้ลูกค้า ไม่จำเป็นต้องมีคดีเสมอไป
-- ออกจากเรื่องที่รับเข้ามา (intake) หรือออกเปล่าให้ลูกค้าดูก่อนก็ได้ แต่ต้องสังกัดสำนักงานเสมอ
ALTER TABLE "Invoice" ADD COLUMN "firmId" TEXT;
ALTER TABLE "Invoice" ADD COLUMN "intakeId" TEXT;

UPDATE "Invoice" i SET "firmId" = c."firmId" FROM "Case" c WHERE i."caseId" = c."id";
-- ใบที่หาสำนักงานไม่เจอไม่ควรมี แต่ถ้ามี ให้ตกไปที่สำนักงานเดียวที่มีอยู่
UPDATE "Invoice" SET "firmId" = (SELECT id FROM "Firm" ORDER BY "createdAt" LIMIT 1) WHERE "firmId" IS NULL;

ALTER TABLE "Invoice" ALTER COLUMN "firmId" SET NOT NULL;
ALTER TABLE "Invoice" ALTER COLUMN "caseId" DROP NOT NULL;

CREATE INDEX "Invoice_firmId_idx" ON "Invoice"("firmId");
CREATE INDEX "Invoice_caseId_idx" ON "Invoice"("caseId");
CREATE INDEX "Invoice_intakeId_idx" ON "Invoice"("intakeId");

ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_firmId_fkey" FOREIGN KEY ("firmId") REFERENCES "Firm"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_intakeId_fkey" FOREIGN KEY ("intakeId") REFERENCES "Intake"("id") ON DELETE CASCADE ON UPDATE CASCADE;

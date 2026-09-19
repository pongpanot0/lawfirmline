-- ลูกความส่งเอกสารเพิ่มเข้ามาในสายข้อความของคดีได้ ไม่ต้องแยกช่องทาง
ALTER TABLE "CaseMessage" ADD COLUMN "filename" TEXT;
ALTER TABLE "CaseMessage" ADD COLUMN "storagePath" TEXT;
ALTER TABLE "CaseMessage" ADD COLUMN "mimeType" TEXT;
ALTER TABLE "CaseMessage" ADD COLUMN "size" INTEGER;

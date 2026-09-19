-- งานประกันรู้บริษัท/กรมธรรม์/เลขเคลมตั้งแต่รับเรื่อง ไม่ต้องรอเปิดคดีก่อนถึงจะกรอกได้
ALTER TABLE "Intake" ADD COLUMN "insurerName" TEXT;
ALTER TABLE "Intake" ADD COLUMN "policyNumber" TEXT;
ALTER TABLE "Intake" ADD COLUMN "claimNumber" TEXT;

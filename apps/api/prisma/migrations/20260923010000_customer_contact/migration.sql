-- คนติดต่อฝั่งลูกค้า (ผู้มอบหมาย) แต่ละราย — ทั้ง intake และ case
ALTER TABLE "IntakeCustomer" ADD COLUMN "contactId" TEXT;
ALTER TABLE "CaseCustomer" ADD COLUMN "contactId" TEXT;
ALTER TABLE "IntakeCustomer" ADD CONSTRAINT "IntakeCustomer_contactId_fkey"
  FOREIGN KEY ("contactId") REFERENCES "ClientContact"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CaseCustomer" ADD CONSTRAINT "CaseCustomer_contactId_fkey"
  FOREIGN KEY ("contactId") REFERENCES "ClientContact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

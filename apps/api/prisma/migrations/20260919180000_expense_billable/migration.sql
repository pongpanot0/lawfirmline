-- ค่าใช้จ่ายบางรายการสำนักงานออกเอง ไม่ผลักไปเก็บกับลูกค้า
-- ของเดิมทั้งหมดเคยถูกผลักเก็บได้ จึงตั้งเป็น true
ALTER TABLE "Expense" ADD COLUMN "billable" BOOLEAN NOT NULL DEFAULT true;

-- บันทึกเวลาและค่าใช้จ่ายที่ถูกเก็บเงินไปแล้ว ผูกกับใบแจ้งหนี้ เพื่อไม่ให้ถูกดึงมาออกบิลซ้ำ
ALTER TABLE "TimeEntry" ADD COLUMN "invoiceId" TEXT;
ALTER TABLE "Expense" ADD COLUMN "invoiceId" TEXT;

CREATE INDEX "TimeEntry_invoiceId_idx" ON "TimeEntry"("invoiceId");
CREATE INDEX "Expense_invoiceId_idx" ON "Expense"("invoiceId");

ALTER TABLE "TimeEntry" ADD CONSTRAINT "TimeEntry_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

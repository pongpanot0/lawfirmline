-- เลขใบแจ้งหนี้เคยมาจาก count() ซึ่งชนกันเมื่อออกหลายใบพร้อมกัน (invoiceNumber เป็น unique)
-- ย้ายไปใช้ sequence ของ Postgres เริ่มต่อจากเลขสูงสุดที่ออกไปแล้ว
CREATE SEQUENCE IF NOT EXISTS invoice_number_seq AS BIGINT START WITH 1;

SELECT setval(
  'invoice_number_seq',
  GREATEST(
    (SELECT COUNT(*) FROM "Invoice"),
    COALESCE(
      (SELECT MAX(NULLIF(regexp_replace("invoiceNumber", '\D', '', 'g'), '')::BIGINT)
       FROM "Invoice" WHERE "invoiceNumber" ~ '^INV-\d+$'),
      0
    ),
    1
  ),
  true
);

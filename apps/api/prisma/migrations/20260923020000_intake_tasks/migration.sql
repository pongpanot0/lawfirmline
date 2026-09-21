-- งาน (Task) ผูกกับเรื่องรับเข้าได้ — เปิดคดีแล้วย้ายไปเป็นงานคดี
ALTER TABLE "Task" ADD COLUMN "intakeId" TEXT;
ALTER TABLE "Task" ADD CONSTRAINT "Task_intakeId_fkey"
  FOREIGN KEY ("intakeId") REFERENCES "Intake"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE INDEX "Task_intakeId_idx" ON "Task"("intakeId");

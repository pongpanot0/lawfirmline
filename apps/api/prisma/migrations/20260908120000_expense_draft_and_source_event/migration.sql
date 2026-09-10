-- A cost drafted off a hearing is not yet a claim: DRAFT commits no money and
-- is excluded from the approved/paid sums, so existing rows keep their meaning.
ALTER TYPE "ExpenseStatus" ADD VALUE IF NOT EXISTS 'DRAFT' BEFORE 'PENDING';

-- AlterTable
ALTER TABLE "Expense" ADD COLUMN "sourceEventId" TEXT;

-- CreateIndex
CREATE INDEX "Expense_sourceEventId_idx" ON "Expense"("sourceEventId");

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_sourceEventId_fkey" FOREIGN KEY ("sourceEventId") REFERENCES "CalendarEvent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Optional reason an approver gives when rejecting an expense or claim.
ALTER TABLE "Expense" ADD COLUMN "rejectionReason" TEXT;

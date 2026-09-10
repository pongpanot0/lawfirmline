-- CreateTable
CREATE TYPE "ExpenseClaimStatus" AS ENUM ('PENDING', 'APPROVED', 'PAID', 'REJECTED');

CREATE TABLE "ExpenseClaim" (
    "id" TEXT NOT NULL,
    "firmId" TEXT NOT NULL,
    "submittedById" TEXT NOT NULL,
    "status" "ExpenseClaimStatus" NOT NULL DEFAULT 'PENDING',
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),
    "reviewedById" TEXT,
    "paidAt" TIMESTAMP(3),
    "paidById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExpenseClaim_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "Expense" ADD COLUMN "claimId" TEXT;

-- CreateIndex
CREATE INDEX "Expense_claimId_idx" ON "Expense"("claimId");
CREATE INDEX "ExpenseClaim_firmId_status_idx" ON "ExpenseClaim"("firmId", "status");
CREATE INDEX "ExpenseClaim_submittedById_idx" ON "ExpenseClaim"("submittedById");

-- AddForeignKey
ALTER TABLE "ExpenseClaim" ADD CONSTRAINT "ExpenseClaim_firmId_fkey" FOREIGN KEY ("firmId") REFERENCES "Firm"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ExpenseClaim" ADD CONSTRAINT "ExpenseClaim_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ExpenseClaim" ADD CONSTRAINT "ExpenseClaim_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ExpenseClaim" ADD CONSTRAINT "ExpenseClaim_paidById_fkey" FOREIGN KEY ("paidById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_claimId_fkey" FOREIGN KEY ("claimId") REFERENCES "ExpenseClaim"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill: one claim per already-submitted expense (legacy line items → rounds).
CREATE TEMP TABLE "_expense_claim_backfill" AS
SELECT
  e."id" AS expense_id,
  gen_random_uuid()::text AS claim_id,
  COALESCE(c."firmId", fm."firmId") AS firm_id,
  e."userId" AS submitted_by_id,
  CASE e."status"::text
    WHEN 'APPROVED' THEN 'APPROVED'::"ExpenseClaimStatus"
    WHEN 'PAID' THEN 'PAID'::"ExpenseClaimStatus"
    WHEN 'REJECTED' THEN 'REJECTED'::"ExpenseClaimStatus"
    ELSE 'PENDING'::"ExpenseClaimStatus"
  END AS status,
  e."createdAt" AS submitted_at,
  CASE WHEN e."status"::text IN ('APPROVED', 'PAID', 'REJECTED') THEN e."updatedAt" ELSE NULL END AS reviewed_at,
  e."paidAt" AS paid_at,
  e."paidById" AS paid_by_id,
  e."createdAt" AS created_at,
  e."updatedAt" AS updated_at
FROM "Expense" e
LEFT JOIN "Case" c ON c."id" = e."caseId"
LEFT JOIN LATERAL (
  SELECT m."firmId"
  FROM "FirmMember" m
  WHERE m."userId" = e."userId"
  ORDER BY m."createdAt" ASC
  LIMIT 1
) fm ON true
WHERE e."status"::text <> 'DRAFT'
  AND e."claimId" IS NULL
  AND COALESCE(c."firmId", fm."firmId") IS NOT NULL;

INSERT INTO "ExpenseClaim" (
  "id", "firmId", "submittedById", "status", "submittedAt",
  "reviewedAt", "reviewedById", "paidAt", "paidById", "createdAt", "updatedAt"
)
SELECT
  claim_id,
  firm_id,
  submitted_by_id,
  status,
  submitted_at,
  reviewed_at,
  paid_by_id,
  paid_at,
  paid_by_id,
  created_at,
  updated_at
FROM "_expense_claim_backfill";

UPDATE "Expense" e
SET "claimId" = b.claim_id
FROM "_expense_claim_backfill" b
WHERE e."id" = b.expense_id;

DROP TABLE "_expense_claim_backfill";

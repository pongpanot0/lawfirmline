-- AlterTable
ALTER TABLE "Firm" ADD COLUMN     "quotaExempt" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "AiQuotaUse" ADD COLUMN     "credits" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "packCredits" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "PlanAddOn" (
    "id" TEXT NOT NULL,
    "firmId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "credits" INTEGER NOT NULL DEFAULT 0,
    "storageGb" INTEGER NOT NULL DEFAULT 0,
    "amountThb" INTEGER NOT NULL,
    "stripeSessionId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlanAddOn_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PlanAddOn_stripeSessionId_key" ON "PlanAddOn"("stripeSessionId");

-- CreateIndex
CREATE INDEX "PlanAddOn_firmId_idx" ON "PlanAddOn"("firmId");

-- AddForeignKey
ALTER TABLE "PlanAddOn" ADD CONSTRAINT "PlanAddOn_firmId_fkey" FOREIGN KEY ("firmId") REFERENCES "Firm"("id") ON DELETE CASCADE ON UPDATE CASCADE;

UPDATE "Firm" SET "quotaExempt" = true WHERE slug = 'thesiambarristers';

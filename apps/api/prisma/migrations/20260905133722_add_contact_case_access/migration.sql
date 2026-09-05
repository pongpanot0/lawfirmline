-- CreateTable
CREATE TABLE "ContactCaseAccess" (
    "id" TEXT NOT NULL,
    "clientContactId" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endDate" TIMESTAMP(3),
    "grantedById" TEXT NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "revokedById" TEXT,
    "notes" TEXT,

    CONSTRAINT "ContactCaseAccess_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ContactCaseAccess_clientContactId_idx" ON "ContactCaseAccess"("clientContactId");

-- CreateIndex
CREATE INDEX "ContactCaseAccess_startDate_endDate_idx" ON "ContactCaseAccess"("startDate", "endDate");

-- CreateIndex
CREATE UNIQUE INDEX "ContactCaseAccess_clientContactId_caseId_key" ON "ContactCaseAccess"("clientContactId", "caseId");

-- AddForeignKey
ALTER TABLE "ContactCaseAccess" ADD CONSTRAINT "ContactCaseAccess_clientContactId_fkey" FOREIGN KEY ("clientContactId") REFERENCES "ClientContact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContactCaseAccess" ADD CONSTRAINT "ContactCaseAccess_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContactCaseAccess" ADD CONSTRAINT "ContactCaseAccess_grantedById_fkey" FOREIGN KEY ("grantedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContactCaseAccess" ADD CONSTRAINT "ContactCaseAccess_revokedById_fkey" FOREIGN KEY ("revokedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

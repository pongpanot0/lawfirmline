-- CreateTable
CREATE TABLE "CaseClient" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CaseClient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IntakeClient" (
    "id" TEXT NOT NULL,
    "intakeId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IntakeClient_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CaseClient_clientId_idx" ON "CaseClient"("clientId");

-- CreateIndex
CREATE UNIQUE INDEX "CaseClient_caseId_clientId_key" ON "CaseClient"("caseId", "clientId");

-- CreateIndex
CREATE INDEX "IntakeClient_clientId_idx" ON "IntakeClient"("clientId");

-- CreateIndex
CREATE UNIQUE INDEX "IntakeClient_intakeId_clientId_key" ON "IntakeClient"("intakeId", "clientId");

-- AddForeignKey
ALTER TABLE "CaseClient" ADD CONSTRAINT "CaseClient_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CaseClient" ADD CONSTRAINT "CaseClient_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntakeClient" ADD CONSTRAINT "IntakeClient_intakeId_fkey" FOREIGN KEY ("intakeId") REFERENCES "Intake"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntakeClient" ADD CONSTRAINT "IntakeClient_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

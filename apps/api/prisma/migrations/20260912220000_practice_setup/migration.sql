CREATE TABLE "PlaybookRelease" (
 "id" TEXT PRIMARY KEY NOT NULL, "firmId" TEXT NOT NULL, "name" TEXT NOT NULL, "workType" TEXT NOT NULL, "version" INTEGER NOT NULL, "steps" JSONB NOT NULL, "publishedById" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY ("firmId") REFERENCES "Firm"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "PlaybookRelease_firmId_name_version_key" ON "PlaybookRelease"("firmId", "name", "version");
CREATE TABLE "AppliedPlaybook" (
 "id" TEXT PRIMARY KEY NOT NULL, "caseId" TEXT NOT NULL, "releaseId" TEXT NOT NULL, "taskIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[], "appliedById" TEXT NOT NULL, "startDate" TIMESTAMP(3) NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 FOREIGN KEY ("releaseId") REFERENCES "PlaybookRelease"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "AppliedPlaybook_caseId_releaseId_key" ON "AppliedPlaybook"("caseId", "releaseId");
CREATE TABLE "DataImportBatch" (
 "id" TEXT PRIMARY KEY NOT NULL, "firmId" TEXT NOT NULL, "createdById" TEXT NOT NULL, "rows" JSONB NOT NULL, "ledger" JSONB, "status" TEXT NOT NULL DEFAULT 'PREVIEW', "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "committedAt" TIMESTAMP(3), "undoneAt" TIMESTAMP(3),
 FOREIGN KEY ("firmId") REFERENCES "Firm"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "DataImportBatch_firmId_createdAt_idx" ON "DataImportBatch"("firmId", "createdAt");

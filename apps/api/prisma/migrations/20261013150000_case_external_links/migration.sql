CREATE TYPE "CaseExternalLinkKind" AS ENUM ('OUTLOOK_FOLDER', 'DRIVE_FOLDER');

CREATE TABLE "CaseExternalLink" (
    "id" TEXT NOT NULL,
    "firmId" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "kind" "CaseExternalLinkKind" NOT NULL,
    "externalId" TEXT NOT NULL,
    "driveId" TEXT,
    "displayPath" TEXT NOT NULL,
    "deltaLink" TEXT,
    "linkedById" TEXT NOT NULL,
    "lastSyncedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CaseExternalLink_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CaseExternalLink_connectionId_kind_externalId_key" ON "CaseExternalLink"("connectionId", "kind", "externalId");
CREATE INDEX "CaseExternalLink_caseId_idx" ON "CaseExternalLink"("caseId");

ALTER TABLE "CaseExternalLink" ADD CONSTRAINT "CaseExternalLink_caseId_fkey"
    FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CaseExternalLink" ADD CONSTRAINT "CaseExternalLink_connectionId_fkey"
    FOREIGN KEY ("connectionId") REFERENCES "MailboxConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

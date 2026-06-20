-- AlterEnum: CaseStatus
ALTER TYPE "CaseStatus" ADD VALUE IF NOT EXISTS 'DRAFTING';
ALTER TYPE "CaseStatus" ADD VALUE IF NOT EXISTS 'COURT_DATE';

-- CreateEnum
CREATE TYPE "KnowledgeCategory" AS ENUM ('SUMMARY', 'CONTRACT', 'COURT_ORDER', 'CORRESPONDENCE', 'OTHER');

-- AlterTable: User
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "aiCredits" INTEGER NOT NULL DEFAULT 100;

-- AlterTable: CaseType
ALTER TABLE "CaseType" ADD COLUMN IF NOT EXISTS "fieldSchema" JSONB;

-- AlterTable: Case
ALTER TABLE "Case" ADD COLUMN IF NOT EXISTS "folderId" TEXT;
ALTER TABLE "Case" ADD COLUMN IF NOT EXISTS "courtName" TEXT;
ALTER TABLE "Case" ADD COLUMN IF NOT EXISTS "customFields" JSONB;

UPDATE "Case" SET "folderId" = 'LF-' || EXTRACT(YEAR FROM "openedAt")::text || '-' || SUBSTRING("id" FROM 1 FOR 8)
WHERE "folderId" IS NULL;

ALTER TABLE "Case" ALTER COLUMN "folderId" SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "Case_folderId_key" ON "Case"("folderId");

-- AlterTable: CalendarEvent
ALTER TABLE "CalendarEvent" ADD COLUMN IF NOT EXISTS "courtName" TEXT;
ALTER TABLE "CalendarEvent" ADD COLUMN IF NOT EXISTS "travelLogId" TEXT;

-- AlterTable: Expense
ALTER TABLE "Expense" ALTER COLUMN "caseId" DROP NOT NULL;
ALTER TABLE "Expense" ADD COLUMN IF NOT EXISTS "expensePurpose" TEXT;

-- CreateTable: PettyCashFund
CREATE TABLE IF NOT EXISTS "PettyCashFund" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "balance" DOUBLE PRECISION NOT NULL DEFAULT 50000,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PettyCashFund_pkey" PRIMARY KEY ("id")
);

INSERT INTO "PettyCashFund" ("id", "balance", "updatedAt")
VALUES ('default', 50000, NOW())
ON CONFLICT ("id") DO NOTHING;

-- CreateTable: TravelLog
CREATE TABLE IF NOT EXISTS "TravelLog" (
    "id" TEXT NOT NULL,
    "origin" TEXT NOT NULL,
    "destination" TEXT NOT NULL,
    "distanceMeters" INTEGER NOT NULL,
    "durationSeconds" INTEGER NOT NULL,
    "mapsUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TravelLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "TravelLog_origin_destination_createdAt_idx" ON "TravelLog"("origin", "destination", "createdAt");

-- CreateTable: CaseKnowledge
CREATE TABLE IF NOT EXISTS "CaseKnowledge" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "documentId" TEXT,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "category" "KnowledgeCategory" NOT NULL DEFAULT 'SUMMARY',
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CaseKnowledge_pkey" PRIMARY KEY ("id")
);

-- CreateTable: DocumentTemplate
CREATE TABLE IF NOT EXISTS "DocumentTemplate" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "templateBody" TEXT NOT NULL,
    "caseTypeId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DocumentTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable: FirmSettings
CREATE TABLE IF NOT EXISTS "FirmSettings" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "officeAddress" TEXT NOT NULL DEFAULT 'Bangkok, Thailand',
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "FirmSettings_pkey" PRIMARY KEY ("id")
);

INSERT INTO "FirmSettings" ("id", "officeAddress", "updatedAt")
VALUES ('default', 'Bangkok, Thailand', NOW())
ON CONFLICT ("id") DO NOTHING;

-- AddForeignKey
ALTER TABLE "CalendarEvent" ADD CONSTRAINT "CalendarEvent_travelLogId_fkey"
    FOREIGN KEY ("travelLogId") REFERENCES "TravelLog"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "CaseKnowledge" ADD CONSTRAINT "CaseKnowledge_caseId_fkey"
    FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CaseKnowledge" ADD CONSTRAINT "CaseKnowledge_documentId_fkey"
    FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "CaseKnowledge" ADD CONSTRAINT "CaseKnowledge_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "DocumentTemplate" ADD CONSTRAINT "DocumentTemplate_caseTypeId_fkey"
    FOREIGN KEY ("caseTypeId") REFERENCES "CaseType"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Seed field schemas for case types
UPDATE "CaseType" SET "fieldSchema" = '[
  {"key":"policyNo","label":"Policy Number / เลขกรมธรรม์","type":"text","required":true},
  {"key":"insurer","label":"Insurance Company","type":"text","required":false}
]'::jsonb WHERE "name" = 'Insurance';

UPDATE "CaseType" SET "fieldSchema" = '[
  {"key":"salary","label":"Salary / เงินเดือน","type":"number","required":true},
  {"key":"employer","label":"Employer / นายจ้าง","type":"text","required":false}
]'::jsonb WHERE "name" = 'Labor';

UPDATE "CaseType" SET "fieldSchema" = '[
  {"key":"chargeSection","label":"Charge Section / ข้อหา","type":"text","required":true},
  {"key":"prosecutor","label":"Prosecutor","type":"text","required":false}
]'::jsonb WHERE "name" = 'Criminal';

UPDATE "CaseType" SET "fieldSchema" = '[
  {"key":"claimAmount","label":"Claim Amount / มูลค่าความเสียหาย","type":"number","required":false},
  {"key":"opposingParty","label":"Opposing Party","type":"text","required":false}
]'::jsonb WHERE "name" = 'Civil';

-- Seed document templates
INSERT INTO "DocumentTemplate" ("id", "name", "description", "templateBody", "createdAt")
SELECT gen_random_uuid()::text, 'Retainer Agreement', 'Standard retainer template',
'RETAINER AGREEMENT

Case: {{caseNumber}}
Client: {{clientName}}
Court: {{courtName}}
Date: {{date}}

This agreement is entered into between the client and the law firm...',
NOW()
WHERE NOT EXISTS (SELECT 1 FROM "DocumentTemplate" WHERE "name" = 'Retainer Agreement');

INSERT INTO "DocumentTemplate" ("id", "name", "description", "templateBody", "createdAt")
SELECT gen_random_uuid()::text, 'Court Filing Cover', 'Cover sheet for court filings',
'COURT FILING

Case No: {{caseNumber}}
Court: {{courtName}}
Client: {{clientName}}
Folder ID: {{folderId}}',
NOW()
WHERE NOT EXISTS (SELECT 1 FROM "DocumentTemplate" WHERE "name" = 'Court Filing Cover');

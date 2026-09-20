-- ปิด P0 gaps ของ audit 2026-09-19:
--   1. Case.stage แยกจาก status   2. Conflict check   3. หมวดเอกสาร
--   4. activity feed อัตโนมัติ (ActivityType ใหม่)   5. intake aging + follow-up

-- 1. ขั้นตอนของคดี แยกจากสถานะงาน
CREATE TYPE "CaseStage" AS ENUM ('INTAKE_REVIEW', 'FACT_GATHERING', 'PRE_LITIGATION', 'FILING', 'MEDIATION', 'HEARING', 'AWAITING_JUDGMENT', 'ENFORCEMENT', 'CLOSING');
ALTER TABLE "Case" ADD COLUMN "stage" "CaseStage" NOT NULL DEFAULT 'INTAKE_REVIEW';
ALTER TABLE "Case" ADD COLUMN "stageChangedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
-- คดีที่ปิดแล้วอยู่ขั้นปิดคดี ส่วนคดีที่เดินอยู่เริ่มจากรวบรวมข้อเท็จจริง —
-- ค่า default INTAKE_REVIEW ใช้กับคดีที่เพิ่งเปิดเท่านั้น
UPDATE "Case" SET "stage" = 'CLOSING', "stageChangedAt" = COALESCE("closedAt", "updatedAt") WHERE "status" = 'CLOSED';
UPDATE "Case" SET "stage" = 'FACT_GATHERING', "stageChangedAt" = "openedAt" WHERE "status" <> 'CLOSED';
CREATE INDEX "Case_firmId_stage_idx" ON "Case"("firmId", "stage");

ALTER TYPE "CaseStatus" ADD VALUE 'ARCHIVED';

-- 2. activity feed อัตโนมัติ
ALTER TYPE "ActivityType" ADD VALUE 'STATUS_CHANGE';
ALTER TYPE "ActivityType" ADD VALUE 'STAGE_CHANGE';
ALTER TYPE "ActivityType" ADD VALUE 'ASSIGNMENT';
ALTER TYPE "ActivityType" ADD VALUE 'DOCUMENT';

-- 3. หมวด / วันที่ / tag ของเอกสาร
CREATE TYPE "DocumentCategory" AS ENUM ('PLEADING', 'EVIDENCE', 'CONTRACT', 'CORRESPONDENCE', 'COURT_ORDER', 'IDENTITY', 'MEDICAL', 'FINANCIAL', 'INTERNAL', 'OTHER');
-- ops_audit_p1 (20260922010000) added category as TEXT; this migration supersedes it with the enum.
ALTER TABLE "Document" DROP COLUMN IF EXISTS "category";
ALTER TABLE "Document" ADD COLUMN "category" "DocumentCategory" NOT NULL DEFAULT 'OTHER';
ALTER TABLE "Document" ADD COLUMN "documentDate" TIMESTAMP(3);
ALTER TABLE "Document" ADD COLUMN "tags" TEXT[] DEFAULT ARRAY[]::TEXT[];
CREATE INDEX "Document_caseId_category_idx" ON "Document"("caseId", "category");

-- 4. intake: aging + follow-up
ALTER TYPE "IntakeStatus" ADD VALUE 'NO_RESPONSE';
ALTER TABLE "Intake" ADD COLUMN "statusChangedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "Intake" ADD COLUMN "nextFollowUpAt" TIMESTAMP(3);
ALTER TABLE "Intake" ADD COLUMN "followUpOwnerId" TEXT;
ALTER TABLE "Intake" ADD COLUMN "lastFollowUpAt" TIMESTAMP(3);
-- เรื่องที่มีอยู่แล้วไม่รู้ว่าเปลี่ยนสถานะเมื่อไร ใช้ updatedAt เป็นค่าที่ใกล้ที่สุด
UPDATE "Intake" SET "statusChangedAt" = "updatedAt";
CREATE INDEX "Intake_firmId_status_statusChangedAt_idx" ON "Intake"("firmId", "status", "statusChangedAt");
CREATE INDEX "Intake_nextFollowUpAt_idx" ON "Intake"("nextFollowUpAt");
ALTER TABLE "Intake" ADD CONSTRAINT "Intake_followUpOwnerId_fkey" FOREIGN KEY ("followUpOwnerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "IntakeFollowUp" (
    "id" TEXT NOT NULL,
    "intakeId" TEXT NOT NULL,
    "note" TEXT NOT NULL,
    "contacted" BOOLEAN NOT NULL DEFAULT true,
    "nextDueAt" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "IntakeFollowUp_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "IntakeFollowUp_intakeId_createdAt_idx" ON "IntakeFollowUp"("intakeId", "createdAt");
ALTER TABLE "IntakeFollowUp" ADD CONSTRAINT "IntakeFollowUp_intakeId_fkey" FOREIGN KEY ("intakeId") REFERENCES "Intake"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "IntakeFollowUp" ADD CONSTRAINT "IntakeFollowUp_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- 5. conflict check
CREATE TYPE "ConflictResult" AS ENUM ('CLEAR', 'POTENTIAL_CONFLICT', 'CONFLICT', 'NEEDS_REVIEW');
CREATE TABLE "ConflictCheck" (
    "id" TEXT NOT NULL,
    "firmId" TEXT NOT NULL,
    "intakeId" TEXT,
    "searchTerms" TEXT[],
    "matches" JSONB NOT NULL,
    "matchCount" INTEGER NOT NULL DEFAULT 0,
    "result" "ConflictResult" NOT NULL DEFAULT 'NEEDS_REVIEW',
    "notes" TEXT,
    "checkedById" TEXT NOT NULL,
    "checkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ConflictCheck_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ConflictCheck_firmId_checkedAt_idx" ON "ConflictCheck"("firmId", "checkedAt");
CREATE INDEX "ConflictCheck_intakeId_idx" ON "ConflictCheck"("intakeId");
ALTER TABLE "ConflictCheck" ADD CONSTRAINT "ConflictCheck_firmId_fkey" FOREIGN KEY ("firmId") REFERENCES "Firm"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ConflictCheck" ADD CONSTRAINT "ConflictCheck_intakeId_fkey" FOREIGN KEY ("intakeId") REFERENCES "Intake"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ConflictCheck" ADD CONSTRAINT "ConflictCheck_checkedById_fkey" FOREIGN KEY ("checkedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ค้นชื่อคู่กรณี/ลูกความแบบ fuzzy สำหรับ conflict check
CREATE INDEX IF NOT EXISTS "CaseParticipant_name_trgm_idx" ON "CaseParticipant" USING gin ("name" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "Client_name_trgm_idx" ON "Client" USING gin ("name" gin_trgm_ops);

-- 6. ขั้นตอนของงานรับเรื่อง (แยกจาก status) + เอกสารที่ต้องขอก่อนออกหนังสือ/เปิดคดี
CREATE TYPE "IntakeStage" AS ENUM ('NEW_INQUIRY', 'CONTACTED', 'SCREENING', 'CONFLICT_CHECK', 'CONSULT_SCHEDULED', 'CONSULTED', 'WAITING_DOCUMENTS', 'PRE_LITIGATION_NOTICE', 'PROPOSAL', 'CLOSED');
ALTER TABLE "Intake" ADD COLUMN "stage" "IntakeStage" NOT NULL DEFAULT 'NEW_INQUIRY';
ALTER TABLE "Intake" ADD COLUMN "stageChangedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
-- เรื่องที่มีอยู่แล้ว: เดาขั้นตอนจากร่องรอยที่ทิ้งไว้ ไล่จากหลังมาหน้า
UPDATE "Intake" SET "stage" = 'CONTACTED' WHERE "stage" = 'NEW_INQUIRY';
UPDATE "Intake" SET "stage" = 'SCREENING' WHERE "assessedAt" IS NOT NULL;
UPDATE "Intake" SET "stage" = 'CONSULTED' WHERE "status" = 'CONSULTED';
UPDATE "Intake" SET "stage" = 'PRE_LITIGATION_NOTICE' WHERE "noticeIssuedAt" IS NOT NULL;
UPDATE "Intake" SET "stage" = 'PROPOSAL' WHERE "status" = 'ACCEPTED';
UPDATE "Intake" SET "stage" = 'CLOSED' WHERE "status" IN ('REJECTED', 'CONVERTED');
UPDATE "Intake" SET "stageChangedAt" = "updatedAt";
CREATE INDEX "Intake_firmId_stage_stageChangedAt_idx" ON "Intake"("firmId", "stage", "stageChangedAt");

CREATE TYPE "DocRequestStatus" AS ENUM ('REQUESTED', 'RECEIVED', 'MISSING', 'NOT_APPLICABLE');
CREATE TABLE "IntakeDocumentRequest" (
    "id" TEXT NOT NULL,
    "intakeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "required" BOOLEAN NOT NULL DEFAULT true,
    "status" "DocRequestStatus" NOT NULL DEFAULT 'REQUESTED',
    "note" TEXT,
    "dueDate" TIMESTAMP(3),
    "documentId" TEXT,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "receivedAt" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "IntakeDocumentRequest_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "IntakeDocumentRequest_intakeId_status_idx" ON "IntakeDocumentRequest"("intakeId", "status");
ALTER TABLE "IntakeDocumentRequest" ADD CONSTRAINT "IntakeDocumentRequest_intakeId_fkey" FOREIGN KEY ("intakeId") REFERENCES "Intake"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "IntakeDocumentRequest" ADD CONSTRAINT "IntakeDocumentRequest_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "IntakeDocumentRequest" ADD CONSTRAINT "IntakeDocumentRequest_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

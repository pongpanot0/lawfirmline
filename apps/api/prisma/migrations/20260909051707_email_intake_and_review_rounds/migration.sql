-- CreateEnum
CREATE TYPE "EmailThreadStatus" AS ENUM ('PENDING_INTAKE', 'LINKED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "EmailDirection" AS ENUM ('INBOUND', 'OUTBOUND');

-- CreateEnum
CREATE TYPE "FieldProposalSourceType" AS ENUM ('EMAIL_BODY', 'ATTACHMENT', 'EXISTING_CLIENT', 'MANUAL');

-- CreateEnum
CREATE TYPE "FieldProposalStatus" AS ENUM ('SUGGESTED', 'REQUIRES_CONFIRMATION', 'CONFIRMED', 'REJECTED', 'CONFLICT');

-- CreateEnum
CREATE TYPE "DocumentVersionStatus" AS ENUM ('DRAFT', 'WAITING_REVIEW', 'RETURNED_FOR_CHANGES', 'APPROVED', 'SUPERSEDED');

-- CreateEnum
CREATE TYPE "ReviewApprovalRule" AS ENUM ('ALL', 'ANY_ONE');

-- CreateEnum
CREATE TYPE "ReviewRoundStatus" AS ENUM ('WAITING_REVIEW', 'RETURNED', 'APPROVED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ReviewDecisionType" AS ENUM ('APPROVED', 'RETURNED');

-- AlterTable
ALTER TABLE "DocumentVersion"
  ADD COLUMN "status" "DocumentVersionStatus" NOT NULL DEFAULT 'DRAFT',
  ADD COLUMN "notes" TEXT,
  ADD COLUMN "contentHash" TEXT,
  ADD COLUMN "createdById" TEXT;

-- CreateTable
CREATE TABLE "EmailThread" (
    "id" TEXT NOT NULL,
    "firmId" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'mock',
    "threadKey" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "fromName" TEXT,
    "fromAddress" TEXT,
    "lastMessageAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "intakeId" TEXT,
    "status" "EmailThreadStatus" NOT NULL DEFAULT 'PENDING_INTAKE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmailThread_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailMessage" (
    "id" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'mock',
    "messageKey" TEXT NOT NULL,
    "direction" "EmailDirection" NOT NULL DEFAULT 'INBOUND',
    "fromName" TEXT,
    "fromAddress" TEXT,
    "bodyText" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailAttachment" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "storagePath" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "contentHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IntakeFieldProposal" (
    "id" TEXT NOT NULL,
    "intakeId" TEXT NOT NULL,
    "field" TEXT NOT NULL,
    "proposedValue" TEXT,
    "previousValue" TEXT,
    "sourceType" "FieldProposalSourceType" NOT NULL DEFAULT 'EMAIL_BODY',
    "sourceDetail" TEXT,
    "sourceEmailMessageId" TEXT,
    "status" "FieldProposalStatus" NOT NULL DEFAULT 'SUGGESTED',
    "confirmedById" TEXT,
    "confirmedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IntakeFieldProposal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReviewRound" (
    "id" TEXT NOT NULL,
    "documentVersionId" TEXT NOT NULL,
    "reviewerIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "editorIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "approvalRule" "ReviewApprovalRule" NOT NULL DEFAULT 'ALL',
    "scope" TEXT,
    "dueAt" TIMESTAMP(3),
    "status" "ReviewRoundStatus" NOT NULL DEFAULT 'WAITING_REVIEW',
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReviewRound_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReviewDecision" (
    "id" TEXT NOT NULL,
    "reviewRoundId" TEXT NOT NULL,
    "reviewerId" TEXT NOT NULL,
    "decision" "ReviewDecisionType" NOT NULL,
    "reason" TEXT,
    "decidedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReviewDecision_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EmailThread_firmId_idx" ON "EmailThread"("firmId");
CREATE INDEX "EmailThread_intakeId_idx" ON "EmailThread"("intakeId");
CREATE UNIQUE INDEX "EmailThread_firmId_provider_threadKey_key" ON "EmailThread"("firmId", "provider", "threadKey");

CREATE INDEX "EmailMessage_threadId_idx" ON "EmailMessage"("threadId");
CREATE UNIQUE INDEX "EmailMessage_threadId_messageKey_key" ON "EmailMessage"("threadId", "messageKey");

CREATE INDEX "EmailAttachment_messageId_idx" ON "EmailAttachment"("messageId");

CREATE INDEX "IntakeFieldProposal_intakeId_idx" ON "IntakeFieldProposal"("intakeId");
CREATE INDEX "IntakeFieldProposal_sourceEmailMessageId_idx" ON "IntakeFieldProposal"("sourceEmailMessageId");

CREATE INDEX "ReviewRound_documentVersionId_idx" ON "ReviewRound"("documentVersionId");

CREATE INDEX "ReviewDecision_reviewRoundId_idx" ON "ReviewDecision"("reviewRoundId");
CREATE UNIQUE INDEX "ReviewDecision_reviewRoundId_reviewerId_key" ON "ReviewDecision"("reviewRoundId", "reviewerId");

-- AddForeignKey
ALTER TABLE "EmailThread" ADD CONSTRAINT "EmailThread_firmId_fkey" FOREIGN KEY ("firmId") REFERENCES "Firm"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EmailThread" ADD CONSTRAINT "EmailThread_intakeId_fkey" FOREIGN KEY ("intakeId") REFERENCES "Intake"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "EmailMessage" ADD CONSTRAINT "EmailMessage_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "EmailThread"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "EmailAttachment" ADD CONSTRAINT "EmailAttachment_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "EmailMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "IntakeFieldProposal" ADD CONSTRAINT "IntakeFieldProposal_intakeId_fkey" FOREIGN KEY ("intakeId") REFERENCES "Intake"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "IntakeFieldProposal" ADD CONSTRAINT "IntakeFieldProposal_sourceEmailMessageId_fkey" FOREIGN KEY ("sourceEmailMessageId") REFERENCES "EmailMessage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ReviewRound" ADD CONSTRAINT "ReviewRound_documentVersionId_fkey" FOREIGN KEY ("documentVersionId") REFERENCES "DocumentVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ReviewDecision" ADD CONSTRAINT "ReviewDecision_reviewRoundId_fkey" FOREIGN KEY ("reviewRoundId") REFERENCES "ReviewRound"("id") ON DELETE CASCADE ON UPDATE CASCADE;

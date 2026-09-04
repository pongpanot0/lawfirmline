-- CreateEnum
CREATE TYPE "CaseOutcome" AS ENUM ('WON', 'LOST', 'SETTLED', 'WITHDRAWN', 'IN_PROGRESS');

-- CreateEnum
CREATE TYPE "IntakeStatus" AS ENUM ('RECEIVED', 'ASSESSING', 'ACCEPTED', 'REJECTED', 'CONVERTED');

-- CreateEnum
CREATE TYPE "IntakeDecision" AS ENUM ('FILE_SUIT', 'DO_NOT_FILE', 'NEGOTIATE_FIRST', 'SEND_NOTICE', 'COMPLAIN_TO_AUTHORITY', 'PENDING');

-- CreateEnum
CREATE TYPE "ReferralType" AS ENUM ('INDIVIDUAL', 'LAWYER', 'HOSPITAL', 'COMPANY', 'GOVERNMENT', 'OTHER');

-- CreateEnum
CREATE TYPE "ReferralChannel" AS ENUM ('WALK_IN', 'PHONE', 'EMAIL', 'LINE', 'REFERRAL', 'OTHER');

-- CreateEnum
CREATE TYPE "ParticipantRole" AS ENUM ('PLAINTIFF', 'DEFENDANT', 'PETITIONER', 'RESPONDENT', 'WITNESS', 'EXPERT', 'OPPOSING_LAWYER', 'OPPOSING_INSURER', 'OTHER');

-- CreateEnum
CREATE TYPE "ParticipantSide" AS ENUM ('OURS', 'OPPONENT', 'NEUTRAL');

-- DropForeignKey
ALTER TABLE "Expense" DROP CONSTRAINT "Expense_caseId_fkey";

-- DropIndex
DROP INDEX "Case_caseNumber_key";

-- DropIndex
DROP INDEX "Case_folderId_key";

-- AlterTable
ALTER TABLE "Case" ADD COLUMN     "actualFee" DOUBLE PRECISION,
ADD COLUMN     "claimedAmount" DOUBLE PRECISION,
ADD COLUMN     "intakeId" TEXT,
ADD COLUMN     "limitationDeadline" TIMESTAMP(3),
ADD COLUMN     "outcome" "CaseOutcome" NOT NULL DEFAULT 'IN_PROGRESS',
ADD COLUMN     "referralSource" TEXT,
ADD COLUMN     "subType" TEXT;

-- AlterTable
ALTER TABLE "ClientContact" ADD COLUMN     "dateAdded" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "nickname" TEXT,
ADD COLUMN     "notes" TEXT;

-- AlterTable
ALTER TABLE "PettyCashFund" ALTER COLUMN "firmId" SET NOT NULL,
ALTER COLUMN "id" DROP DEFAULT;

-- CreateTable
CREATE TABLE "Intake" (
    "id" TEXT NOT NULL,
    "firmId" TEXT NOT NULL,
    "receivedById" TEXT NOT NULL,
    "receivedDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "referralType" "ReferralType" NOT NULL DEFAULT 'INDIVIDUAL',
    "referralChannel" "ReferralChannel" NOT NULL DEFAULT 'WALK_IN',
    "referralName" TEXT,
    "clientId" TEXT,
    "clientName" TEXT,
    "matterType" TEXT,
    "opposingParty" TEXT,
    "incidentDate" TIMESTAMP(3),
    "description" TEXT,
    "estimatedDamage" DOUBLE PRECISION,
    "status" "IntakeStatus" NOT NULL DEFAULT 'RECEIVED',
    "assessorId" TEXT,
    "assessedAt" TIMESTAMP(3),
    "assessmentNotes" TEXT,
    "caseStrength" TEXT,
    "decision" "IntakeDecision" NOT NULL DEFAULT 'PENDING',
    "decisionNotes" TEXT,
    "decidedAt" TIMESTAMP(3),
    "clientDecision" TEXT,
    "noticeIssuedAt" TIMESTAMP(3),
    "noticeRecipient" TEXT,
    "noticeDeadline" TIMESTAMP(3),
    "noticeResult" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Intake_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CaseParticipant" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nickname" TEXT,
    "role" "ParticipantRole" NOT NULL DEFAULT 'OTHER',
    "side" "ParticipantSide" NOT NULL DEFAULT 'OPPONENT',
    "personType" TEXT,
    "idNumber" TEXT,
    "address" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "opposingLawyer" TEXT,
    "opposingInsurer" TEXT,
    "medicalLicenseNo" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CaseParticipant_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Intake_firmId_idx" ON "Intake"("firmId");

-- CreateIndex
CREATE INDEX "Intake_clientId_idx" ON "Intake"("clientId");

-- CreateIndex
CREATE INDEX "CaseParticipant_caseId_idx" ON "CaseParticipant"("caseId");

-- CreateIndex
CREATE UNIQUE INDEX "Case_intakeId_key" ON "Case"("intakeId");

-- AddForeignKey
ALTER TABLE "Case" ADD CONSTRAINT "Case_intakeId_fkey" FOREIGN KEY ("intakeId") REFERENCES "Intake"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Intake" ADD CONSTRAINT "Intake_firmId_fkey" FOREIGN KEY ("firmId") REFERENCES "Firm"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Intake" ADD CONSTRAINT "Intake_receivedById_fkey" FOREIGN KEY ("receivedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Intake" ADD CONSTRAINT "Intake_assessorId_fkey" FOREIGN KEY ("assessorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Intake" ADD CONSTRAINT "Intake_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CaseParticipant" ADD CONSTRAINT "CaseParticipant_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE SET NULL ON UPDATE CASCADE;


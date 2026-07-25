-- SaaS foundation: multi-tenant firms, subscriptions, billing

-- CreateEnum
CREATE TYPE "FirmRole" AS ENUM ('OWNER', 'ASSISTANT');
CREATE TYPE "SubscriptionPlan" AS ENUM ('SOLO', 'FIRM', 'PROFESSIONAL');
CREATE TYPE "SubscriptionStatus" AS ENUM ('TRIAL', 'ACTIVE', 'PAST_DUE', 'CANCELED', 'EXPIRED');
CREATE TYPE "BillingPaymentStatus" AS ENUM ('PENDING', 'PAID', 'FAILED');

-- Firm
CREATE TABLE "Firm" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "subscriptionStatus" "SubscriptionStatus" NOT NULL DEFAULT 'TRIAL',
    "subscriptionPlan" "SubscriptionPlan",
    "trialStartAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "trialEndAt" TIMESTAMP(3) NOT NULL,
    "currentPeriodEnd" TIMESTAMP(3),
    "omiseCustomerId" TEXT,
    "maxUsers" INTEGER NOT NULL DEFAULT 2,
    "officeAddress" TEXT NOT NULL DEFAULT 'Bangkok, Thailand',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Firm_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Firm_slug_key" ON "Firm"("slug");

-- Default firm for existing data
INSERT INTO "Firm" ("id", "name", "slug", "subscriptionStatus", "trialStartAt", "trialEndAt", "maxUsers", "updatedAt")
VALUES ('default-firm', 'Demo Law Firm', 'demo-law-firm', 'TRIAL', NOW(), NOW() + INTERVAL '30 days', 20, NOW());

-- FirmMember
CREATE TABLE "FirmMember" (
    "id" TEXT NOT NULL,
    "firmId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "FirmRole" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FirmMember_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "FirmMember_firmId_userId_key" ON "FirmMember"("firmId", "userId");
CREATE INDEX "FirmMember_userId_idx" ON "FirmMember"("userId");
ALTER TABLE "FirmMember" ADD CONSTRAINT "FirmMember_firmId_fkey" FOREIGN KEY ("firmId") REFERENCES "Firm"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FirmMember" ADD CONSTRAINT "FirmMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "FirmMember" ("id", "firmId", "userId", "role")
SELECT gen_random_uuid()::text, 'default-firm', "id",
  CASE WHEN "role" = 'ADMIN' THEN 'OWNER'::"FirmRole" ELSE 'ASSISTANT'::"FirmRole" END
FROM "User";

-- Invitation
CREATE TABLE "Invitation" (
    "id" TEXT NOT NULL,
    "firmId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" "FirmRole" NOT NULL DEFAULT 'ASSISTANT',
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "invitedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Invitation_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Invitation_token_key" ON "Invitation"("token");
CREATE UNIQUE INDEX "Invitation_firmId_email_key" ON "Invitation"("firmId", "email");
ALTER TABLE "Invitation" ADD CONSTRAINT "Invitation_firmId_fkey" FOREIGN KEY ("firmId") REFERENCES "Firm"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Invitation" ADD CONSTRAINT "Invitation_invitedById_fkey" FOREIGN KEY ("invitedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Subscription
CREATE TABLE "Subscription" (
    "id" TEXT NOT NULL,
    "firmId" TEXT NOT NULL,
    "plan" "SubscriptionPlan" NOT NULL,
    "status" "SubscriptionStatus" NOT NULL,
    "omiseSubscriptionId" TEXT,
    "currentPeriodStart" TIMESTAMP(3) NOT NULL,
    "currentPeriodEnd" TIMESTAMP(3) NOT NULL,
    "canceledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Subscription_firmId_createdAt_idx" ON "Subscription"("firmId", "createdAt");
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_firmId_fkey" FOREIGN KEY ("firmId") REFERENCES "Firm"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- BillingInvoice
CREATE TABLE "BillingInvoice" (
    "id" TEXT NOT NULL,
    "firmId" TEXT NOT NULL,
    "invoiceNumber" TEXT NOT NULL,
    "plan" "SubscriptionPlan" NOT NULL,
    "amount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'THB',
    "status" "BillingPaymentStatus" NOT NULL DEFAULT 'PENDING',
    "omiseChargeId" TEXT,
    "paidAt" TIMESTAMP(3),
    "periodStart" TIMESTAMP(3),
    "periodEnd" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BillingInvoice_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "BillingInvoice_invoiceNumber_key" ON "BillingInvoice"("invoiceNumber");
ALTER TABLE "BillingInvoice" ADD CONSTRAINT "BillingInvoice_firmId_fkey" FOREIGN KEY ("firmId") REFERENCES "Firm"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Payment
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "billingInvoiceId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "status" "BillingPaymentStatus" NOT NULL,
    "omiseChargeId" TEXT,
    "failureCode" TEXT,
    "failureMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_billingInvoiceId_fkey" FOREIGN KEY ("billingInvoiceId") REFERENCES "BillingInvoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AuditLog
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "firmId" TEXT NOT NULL,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "AuditLog_firmId_createdAt_idx" ON "AuditLog"("firmId", "createdAt");
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_firmId_fkey" FOREIGN KEY ("firmId") REFERENCES "Firm"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- PasswordResetToken
CREATE TABLE "PasswordResetToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PasswordResetToken_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PasswordResetToken_token_key" ON "PasswordResetToken"("token");
ALTER TABLE "PasswordResetToken" ADD CONSTRAINT "PasswordResetToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Add firmId to Case
ALTER TABLE "Case" ADD COLUMN "firmId" TEXT;
UPDATE "Case" SET "firmId" = 'default-firm';
ALTER TABLE "Case" ALTER COLUMN "firmId" SET NOT NULL;
ALTER TABLE "Case" DROP CONSTRAINT IF EXISTS "Case_caseNumber_key";
ALTER TABLE "Case" DROP CONSTRAINT IF EXISTS "Case_folderId_key";
CREATE UNIQUE INDEX "Case_firmId_caseNumber_key" ON "Case"("firmId", "caseNumber");
CREATE UNIQUE INDEX "Case_firmId_folderId_key" ON "Case"("firmId", "folderId");
CREATE INDEX "Case_firmId_idx" ON "Case"("firmId");
ALTER TABLE "Case" ADD CONSTRAINT "Case_firmId_fkey" FOREIGN KEY ("firmId") REFERENCES "Firm"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Add firmId to CaseType
ALTER TABLE "CaseType" ADD COLUMN "firmId" TEXT;
UPDATE "CaseType" SET "firmId" = 'default-firm';
ALTER TABLE "CaseType" ALTER COLUMN "firmId" SET NOT NULL;
ALTER TABLE "CaseType" DROP CONSTRAINT IF EXISTS "CaseType_name_key";
CREATE UNIQUE INDEX "CaseType_firmId_name_key" ON "CaseType"("firmId", "name");
ALTER TABLE "CaseType" ADD CONSTRAINT "CaseType_firmId_fkey" FOREIGN KEY ("firmId") REFERENCES "Firm"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Migrate PettyCashFund
ALTER TABLE "PettyCashFund" ADD COLUMN "firmId" TEXT;
UPDATE "PettyCashFund" SET "firmId" = 'default-firm' WHERE "id" = 'default';
ALTER TABLE "PettyCashFund" DROP CONSTRAINT IF EXISTS "PettyCashFund_pkey";
ALTER TABLE "PettyCashFund" DROP COLUMN IF EXISTS "id";
ALTER TABLE "PettyCashFund" ADD COLUMN "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text;
ALTER TABLE "PettyCashFund" ADD CONSTRAINT "PettyCashFund_pkey" PRIMARY KEY ("id");
CREATE UNIQUE INDEX "PettyCashFund_firmId_key" ON "PettyCashFund"("firmId");
ALTER TABLE "PettyCashFund" ADD CONSTRAINT "PettyCashFund_firmId_fkey" FOREIGN KEY ("firmId") REFERENCES "Firm"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Drop legacy FirmSettings
DROP TABLE IF EXISTS "FirmSettings";

-- CreateEnum
CREATE TYPE "MfaPurpose" AS ENUM ('ENABLE', 'LOGIN');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "mfaEnabled" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "MfaCode" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "purpose" "MfaPurpose" NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MfaCode_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MfaCode_userId_purpose_idx" ON "MfaCode"("userId", "purpose");

-- AddForeignKey
ALTER TABLE "MfaCode" ADD CONSTRAINT "MfaCode_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

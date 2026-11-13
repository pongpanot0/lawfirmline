-- CreateEnum
CREATE TYPE "AppFeedbackKind" AS ENUM ('BUG', 'SUGGESTION', 'OTHER', 'RATING');
CREATE TYPE "AppFeedbackSource" AS ENUM ('WEB', 'MOBILE', 'LINE');

-- CreateTable
CREATE TABLE "AppFeedback" (
    "id" TEXT NOT NULL,
    "kind" "AppFeedbackKind" NOT NULL,
    "source" "AppFeedbackSource" NOT NULL,
    "rating" INTEGER,
    "message" TEXT,
    "route" TEXT,
    "platform" TEXT,
    "appVersion" TEXT,
    "screenshotPath" TEXT,
    "screenshotMime" TEXT,
    "lineRoundId" TEXT,
    "userId" TEXT NOT NULL,
    "firmId" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "resolvedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AppFeedback_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AppFeedbackLineRound" (
    "id" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentById" TEXT NOT NULL,
    "recipientCount" INTEGER NOT NULL,
    CONSTRAINT "AppFeedbackLineRound_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AppFeedback_lineRoundId_userId_key" ON "AppFeedback"("lineRoundId", "userId");
CREATE INDEX "AppFeedback_createdAt_idx" ON "AppFeedback"("createdAt");
CREATE INDEX "AppFeedback_kind_createdAt_idx" ON "AppFeedback"("kind", "createdAt");
CREATE INDEX "AppFeedback_route_platform_idx" ON "AppFeedback"("route", "platform");

-- AddForeignKey
ALTER TABLE "AppFeedback" ADD CONSTRAINT "AppFeedback_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AppFeedback" ADD CONSTRAINT "AppFeedback_firmId_fkey" FOREIGN KEY ("firmId") REFERENCES "Firm"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AppFeedback" ADD CONSTRAINT "AppFeedback_lineRoundId_fkey" FOREIGN KEY ("lineRoundId") REFERENCES "AppFeedbackLineRound"("id") ON DELETE CASCADE ON UPDATE CASCADE;

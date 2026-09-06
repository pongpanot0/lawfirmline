-- CreateEnum
CREATE TYPE "DateSuggestionStatus" AS ENUM ('PENDING', 'CONFIRMED', 'DISMISSED');

-- CreateTable
CREATE TABLE "DocumentDateSuggestion" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "documentId" TEXT,
    "label" TEXT NOT NULL,
    "suggestedDate" TIMESTAMP(3) NOT NULL,
    "eventType" "EventType" NOT NULL DEFAULT 'DEADLINE',
    "sourceExcerpt" TEXT NOT NULL,
    "status" "DateSuggestionStatus" NOT NULL DEFAULT 'PENDING',
    "calendarEventId" TEXT,
    "createdById" TEXT NOT NULL,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DocumentDateSuggestion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DocumentDateSuggestion_calendarEventId_key" ON "DocumentDateSuggestion"("calendarEventId");

-- CreateIndex
CREATE INDEX "DocumentDateSuggestion_caseId_status_idx" ON "DocumentDateSuggestion"("caseId", "status");

-- AddForeignKey
ALTER TABLE "DocumentDateSuggestion" ADD CONSTRAINT "DocumentDateSuggestion_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentDateSuggestion" ADD CONSTRAINT "DocumentDateSuggestion_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentDateSuggestion" ADD CONSTRAINT "DocumentDateSuggestion_calendarEventId_fkey" FOREIGN KEY ("calendarEventId") REFERENCES "CalendarEvent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentDateSuggestion" ADD CONSTRAINT "DocumentDateSuggestion_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentDateSuggestion" ADD CONSTRAINT "DocumentDateSuggestion_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterEnum
ALTER TYPE "DateSuggestionSource" ADD VALUE 'EMAIL';

-- AlterTable
ALTER TABLE "DocumentDateSuggestion" ADD COLUMN "emailMessageId" TEXT;

-- CreateIndex
CREATE INDEX "DocumentDateSuggestion_emailMessageId_idx" ON "DocumentDateSuggestion"("emailMessageId");

-- AddForeignKey
ALTER TABLE "DocumentDateSuggestion" ADD CONSTRAINT "DocumentDateSuggestion_emailMessageId_fkey" FOREIGN KEY ("emailMessageId") REFERENCES "EmailMessage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

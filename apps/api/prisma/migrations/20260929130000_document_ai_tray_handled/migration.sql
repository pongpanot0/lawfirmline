-- Existing documents are treated as handled so only uploads after deploy enter the AI tray.
ALTER TABLE "Document" ADD COLUMN "aiTrayHandledAt" TIMESTAMP(3);
UPDATE "Document" SET "aiTrayHandledAt" = NOW();

-- Who wrote the handbook: that person may edit or delete it (content managers still may edit any).
-- Existing rows stay NULL, so only content managers manage them, as before.
ALTER TABLE "Sop" ADD COLUMN "createdById" TEXT;

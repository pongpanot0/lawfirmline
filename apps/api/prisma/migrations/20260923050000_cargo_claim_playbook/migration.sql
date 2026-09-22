ALTER TABLE "PlaybookRelease"
  ADD COLUMN "templateKey" TEXT,
  ADD COLUMN "cargoTemplate" JSONB;

ALTER TABLE "CargoClaim"
  ADD COLUMN "playbookReleaseId" TEXT;

CREATE INDEX "PlaybookRelease_firmId_templateKey_version_idx"
  ON "PlaybookRelease"("firmId", "templateKey", "version");

CREATE INDEX "CargoClaim_playbookReleaseId_idx"
  ON "CargoClaim"("playbookReleaseId");

ALTER TABLE "CargoClaim"
  ADD CONSTRAINT "CargoClaim_playbookReleaseId_fkey"
  FOREIGN KEY ("playbookReleaseId") REFERENCES "PlaybookRelease"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

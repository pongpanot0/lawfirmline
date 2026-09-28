-- Existing cases are treated as handled so the banner doesn't appear on every old case after deploy.
ALTER TABLE "Case" ADD COLUMN "stageTasksHandledFor" "CaseStage";
UPDATE "Case" SET "stageTasksHandledFor" = "stage";

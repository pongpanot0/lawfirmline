-- Every task is medium until someone says otherwise.
UPDATE "Task" SET "size" = 'M' WHERE "size" IS NULL;
ALTER TABLE "Task" ALTER COLUMN "size" SET DEFAULT 'M', ALTER COLUMN "size" SET NOT NULL;

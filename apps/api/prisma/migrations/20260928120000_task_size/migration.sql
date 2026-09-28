CREATE TYPE "TaskSize" AS ENUM ('S', 'M', 'L');
ALTER TABLE "Task" ADD COLUMN "size" "TaskSize";

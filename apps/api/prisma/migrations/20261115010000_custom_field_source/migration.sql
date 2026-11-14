CREATE TYPE "CustomFieldSource" AS ENUM ('WEB', 'MCP', 'AI');
ALTER TABLE "CustomFieldDefinition" ADD COLUMN "source" "CustomFieldSource" NOT NULL DEFAULT 'WEB';

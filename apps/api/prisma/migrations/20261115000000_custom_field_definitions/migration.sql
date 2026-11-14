CREATE TYPE "CustomFieldEntity" AS ENUM ('CASE', 'CLIENT');
CREATE TYPE "CustomFieldVisibility" AS ENUM ('FIRM', 'PERSONAL');
CREATE TYPE "CustomFieldType" AS ENUM ('TEXT', 'LONG_TEXT', 'NUMBER', 'DATE', 'SELECT', 'BOOLEAN');

CREATE TABLE "CustomFieldDefinition" (
    "id" TEXT NOT NULL,
    "firmId" TEXT NOT NULL,
    "entityKind" "CustomFieldEntity" NOT NULL,
    "visibility" "CustomFieldVisibility" NOT NULL,
    "ownerUserId" TEXT,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "type" "CustomFieldType" NOT NULL,
    "options" JSONB,
    "required" BOOLEAN NOT NULL DEFAULT false,
    "caseTypeIds" TEXT[],
    "section" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "helpText" TEXT,
    "isSensitive" BOOLEAN NOT NULL DEFAULT false,
    "archivedAt" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CustomFieldDefinition_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CustomFieldDefinition_firmId_key_key" ON "CustomFieldDefinition"("firmId", "key");
CREATE INDEX "CustomFieldDefinition_firmId_entityKind_idx" ON "CustomFieldDefinition"("firmId", "entityKind");
ALTER TABLE "CustomFieldDefinition" ADD CONSTRAINT "CustomFieldDefinition_firmId_fkey" FOREIGN KEY ("firmId") REFERENCES "Firm"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CustomFieldDefinition" ADD CONSTRAINT "CustomFieldDefinition_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CustomFieldDefinition" ADD CONSTRAINT "CustomFieldDefinition_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Client" ADD COLUMN "customFields" JSONB;

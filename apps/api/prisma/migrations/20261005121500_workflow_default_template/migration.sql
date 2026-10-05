ALTER TABLE "WorkflowTemplate" ADD COLUMN "isDefault" BOOLEAN NOT NULL DEFAULT false;

CREATE UNIQUE INDEX "WorkflowTemplate_one_active_default_per_firm"
ON "WorkflowTemplate" ("firmId") WHERE "isDefault" AND "isActive";

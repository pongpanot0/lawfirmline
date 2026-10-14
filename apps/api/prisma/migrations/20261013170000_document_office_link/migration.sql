-- M365 ส่วน D: system documents opened for editing in Office online
CREATE TABLE "DocumentOfficeLink" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "driveId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "webUrl" TEXT NOT NULL,
    "uploadedVersion" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DocumentOfficeLink_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DocumentOfficeLink_documentId_key" ON "DocumentOfficeLink"("documentId");
CREATE INDEX "DocumentOfficeLink_connectionId_idx" ON "DocumentOfficeLink"("connectionId");

ALTER TABLE "DocumentOfficeLink" ADD CONSTRAINT "DocumentOfficeLink_documentId_fkey"
    FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

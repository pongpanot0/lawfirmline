-- CreateTable
CREATE TABLE "SecretaryMessage" (
    "id" TEXT NOT NULL,
    "firmId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "cards" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SecretaryMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SecretaryMessage_firmId_userId_createdAt_idx" ON "SecretaryMessage"("firmId", "userId", "createdAt");

-- AddForeignKey
ALTER TABLE "SecretaryMessage" ADD CONSTRAINT "SecretaryMessage_firmId_fkey" FOREIGN KEY ("firmId") REFERENCES "Firm"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SecretaryMessage" ADD CONSTRAINT "SecretaryMessage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

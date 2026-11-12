-- CreateTable
CREATE TABLE "McpUsedRefreshToken" (
    "hash" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "usedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "McpUsedRefreshToken_pkey" PRIMARY KEY ("hash")
);

-- CreateIndex
CREATE INDEX "McpUsedRefreshToken_connectionId_idx" ON "McpUsedRefreshToken"("connectionId");

-- AddForeignKey
ALTER TABLE "McpUsedRefreshToken" ADD CONSTRAINT "McpUsedRefreshToken_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "McpConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;


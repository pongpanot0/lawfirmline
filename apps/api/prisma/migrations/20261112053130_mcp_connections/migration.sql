-- AlterEnum
ALTER TYPE "TaskSource" ADD VALUE 'MCP';

-- AlterEnum
ALTER TYPE "DateSuggestionSource" ADD VALUE 'MCP';

-- AlterTable
ALTER TABLE "Firm" ADD COLUMN     "mcpEnabled" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "CaseComment" ADD COLUMN     "viaAi" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "TimeEntry" ADD COLUMN     "viaAi" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "McpClient" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "clientName" TEXT NOT NULL,
    "redirectUris" TEXT[],
    "metadata" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "McpClient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "McpConnection" (
    "id" TEXT NOT NULL,
    "firmId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "clientName" TEXT NOT NULL,
    "accessTokenHash" TEXT,
    "accessExpiresAt" TIMESTAMP(3),
    "refreshTokenHash" TEXT,
    "refreshExpiresAt" TIMESTAMP(3),
    "lastUsedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "McpConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "McpAuthCode" (
    "id" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "redirectUri" TEXT NOT NULL,
    "codeChallenge" TEXT NOT NULL,
    "resource" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),

    CONSTRAINT "McpAuthCode_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "McpClient_clientId_key" ON "McpClient"("clientId");

-- CreateIndex
CREATE UNIQUE INDEX "McpConnection_accessTokenHash_key" ON "McpConnection"("accessTokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "McpConnection_refreshTokenHash_key" ON "McpConnection"("refreshTokenHash");

-- CreateIndex
CREATE INDEX "McpConnection_firmId_idx" ON "McpConnection"("firmId");

-- CreateIndex
CREATE INDEX "McpConnection_userId_idx" ON "McpConnection"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "McpAuthCode_codeHash_key" ON "McpAuthCode"("codeHash");

-- AddForeignKey
ALTER TABLE "McpConnection" ADD CONSTRAINT "McpConnection_firmId_fkey" FOREIGN KEY ("firmId") REFERENCES "Firm"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "McpConnection" ADD CONSTRAINT "McpConnection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "McpConnection" ADD CONSTRAINT "McpConnection_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "McpClient"("clientId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "McpAuthCode" ADD CONSTRAINT "McpAuthCode_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "McpConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;


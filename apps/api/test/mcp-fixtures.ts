import { ConfigService } from '@nestjs/config';
import type { OAuthClientInformationFull } from '@modelcontextprotocol/sdk/shared/auth.js';
import { PrismaService } from '../src/prisma/prisma.module';
import { TenantService } from '../src/saas/tenant.service';
import { McpOAuthProvider } from '../src/mcp/mcp-oauth.provider';
import { tokenHash } from '../src/mcp/mcp-config';

export function oauthFixture() {
  const connection = { id: 'conn', clientId: 'client', clientName: 'Claude', firmId: 'firm', userId: 'user', revokedAt: null as Date | null,
    accessTokenHash: tokenHash('access'), accessExpiresAt: new Date(Date.now() + 3600_000),
    refreshTokenHash: tokenHash('refresh'), refreshExpiresAt: new Date(Date.now() + 90 * 86400_000), lastUsedAt: new Date(), firm: { mcpEnabled: true } };
  const code = { id: 'code', codeHash: tokenHash('code'), clientId: 'client', connectionId: 'conn', redirectUri: 'https://app.test/cb', codeChallenge: 'x'.repeat(43), resource: 'http://localhost:3001/mcp', expiresAt: new Date(Date.now() + 600_000), usedAt: null as Date | null };
  const prisma = {
    mcpClient: { findUnique: jest.fn(), create: jest.fn() },
    mcpConnection: { findUnique: jest.fn(), findFirst: jest.fn(), updateMany: jest.fn() },
    mcpAuthCode: { findUnique: jest.fn(), updateMany: jest.fn() },
    firm: { findUnique: jest.fn().mockResolvedValue({ mcpEnabled: true }) },
    firmMember: { findUnique: jest.fn().mockResolvedValue({ id: 'member' }) },
    auditLog: { create: jest.fn() },
    $transaction: jest.fn(),
  };
  const tenant = { buildAuthUser: jest.fn().mockResolvedValue({ id: 'user', firmId: 'firm' }) };
  prisma.$transaction.mockImplementation(async callback => callback(prisma));
  prisma.mcpAuthCode.findUnique.mockImplementation(async ({ where }) => where.codeHash === code.codeHash ? code : null);
  prisma.mcpAuthCode.updateMany.mockImplementation(async () => {
    if (code.usedAt) return { count: 0 };
    code.usedAt = new Date(); return { count: 1 };
  });
  prisma.mcpConnection.findUnique.mockImplementation(async ({ where }) => (
    where.id === connection.id || (where.accessTokenHash && where.accessTokenHash === connection.accessTokenHash) || (where.refreshTokenHash && where.refreshTokenHash === connection.refreshTokenHash) ? connection : null));
  prisma.mcpConnection.updateMany.mockImplementation(async ({ where, data }) => {
    if (connection.revokedAt || (where.refreshTokenHash && where.refreshTokenHash !== connection.refreshTokenHash)) return { count: 0 };
    Object.assign(connection, data); return { count: 1 };
  });
  const config = { get: jest.fn() } as unknown as ConfigService;
  const provider = new McpOAuthProvider(prisma as unknown as PrismaService, config, tenant as unknown as TenantService);
  const client = { client_id: 'client', redirect_uris: ['https://app.test/cb'], token_endpoint_auth_method: 'none' } as OAuthClientInformationFull;
  return { provider, prisma, tenant, connection, code, client };
}


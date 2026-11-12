import { BadRequestException, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { AuthUser, FirmRole } from '@lawfirm/shared';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { McpConsentController, McpConnectionsController } from './mcp.controller';
import { McpConsentDto } from './mcp.dto';
import { McpService } from './mcp.service';
import { McpOAuthProvider } from './mcp-oauth.provider';
import { PrismaService } from '../prisma/prisma.module';
import { tokenHash } from './mcp-config';

const user = { id: 'user', firmId: 'firm', firmRole: FirmRole.OWNER, firstName: 'A', lastName: 'B', email: 'user@test.invalid', firmName: 'Firm' } as AuthUser;
const request = { mcpSessionJti: 'session' } as import('./mcp-consent.guard').McpConsentRequest;
const dto: McpConsentDto = { client_id: 'client', redirect_uri: 'https://app.test/cb', code_challenge: 'x'.repeat(43), code_challenge_method: 'S256', state: 'a&b' };
function build() {
  const prisma = {
    mcpClient: { findUnique: jest.fn().mockResolvedValue({ clientId: 'client', clientName: 'Claude', redirectUris: ['https://app.test/cb'] }) },
    mcpConnection: { create: jest.fn().mockResolvedValue({ id: 'conn' }), updateMany: jest.fn(), findMany: jest.fn().mockResolvedValue([]), findFirst: jest.fn() },
    mcpAuthCode: { create: jest.fn() }, firm: { updateMany: jest.fn().mockResolvedValue({ count: 1 }), findUnique: jest.fn().mockResolvedValue({ mcpEnabled: true }), findUniqueOrThrow: jest.fn().mockResolvedValue({ mcpEnabled: true }), update: jest.fn() },
    session: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    firmMember: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) }, auditLog: { create: jest.fn() }, $transaction: jest.fn(),
  };
  prisma.$transaction.mockImplementation(async cb => cb(prisma));
  const provider = { issuerUrl: new URL('https://api.test'), resourceUrl: new URL('https://api.test/mcp'), validateResource: jest.fn(), validateScopes: jest.fn() };
  const service = new McpService(prisma as unknown as PrismaService, provider as unknown as McpOAuthProvider);
  return { prisma, provider, service, consent: new McpConsentController(service), connections: new McpConnectionsController(service) };
}

describe('MCP consent controller', () => {
  it('firm off returns 403 and creates nothing', async () => {
    const { prisma, consent } = build(); prisma.firm.updateMany.mockResolvedValue({ count: 0 });
    await expect(consent.approve(user, dto, request)).rejects.toThrow(ForbiddenException);
    expect(prisma.mcpConnection.create).not.toHaveBeenCalled();
  });
  it('rejects unknown clients, redirect tampering and removed membership', async () => {
    const { prisma, consent } = build();
    await expect(consent.approve(user, { ...dto, redirect_uri: 'https://evil.test' }, request)).rejects.toThrow(BadRequestException);
    prisma.mcpClient.findUnique.mockResolvedValue(null);
    await expect(consent.info(user, dto)).rejects.toThrow(BadRequestException);
    await expect(consent.deny(user, dto)).rejects.toThrow(BadRequestException);
  });
  it('creates a consent connection and hashed 10-minute single-use code, audits and returns state and issuer', async () => {
    const { prisma, consent } = build();
    const { redirectUrl } = await consent.approve(user, dto, request);
    const url = new URL(redirectUrl);
    expect(url.origin + url.pathname).toBe(dto.redirect_uri);
    expect(url.searchParams.get('state')).toBe(dto.state);
    expect(url.searchParams.get('iss')).toBe('https://api.test/');
    const data = prisma.mcpAuthCode.create.mock.calls[0][0].data;
    expect(data.codeHash).toBe(tokenHash(url.searchParams.get('code')!));
    expect(data.codeHash).not.toBe(url.searchParams.get('code'));
    expect(data.expiresAt.getTime() - Date.now()).toBeGreaterThan(599_000);
    expect(data).toEqual(expect.objectContaining({ connectionId: 'conn', clientId: 'client', redirectUri: dto.redirect_uri, codeChallenge: dto.code_challenge }));
    expect(prisma.auditLog.create).toHaveBeenCalledWith({ data: { firmId: 'firm', userId: 'user', action: 'mcp.connect', metadata: { connectionId: 'conn', clientName: 'Claude' } } });
  });
  it('rejects a pre-reset JWT session already revoked before approval creates a connection', async () => {
    const { prisma, consent } = build();
    prisma.session.updateMany.mockResolvedValue({ count: 0 });
    await expect(consent.approve(user, dto, request)).rejects.toThrow(UnauthorizedException);
    expect(prisma.mcpConnection.create).not.toHaveBeenCalled();
  });
  it('locks the live session, enabled firm and internal membership before creating a connection', async () => {
    const { prisma, consent } = build();
    await consent.approve(user, dto, request);
    expect(prisma.session.updateMany).toHaveBeenCalledWith({ where: { jti: 'session', userId: user.id, revokedAt: null, expiresAt: { gt: expect.any(Date) } }, data: { lastUsedAt: expect.any(Date) } });
    expect(prisma.firm.updateMany).toHaveBeenCalledWith({ where: { id: user.firmId, mcpEnabled: true }, data: { mcpEnabled: true } });
    expect(prisma.firmMember.updateMany).toHaveBeenCalledWith({ where: { firmId: user.firmId, userId: user.id, role: { not: 'EXTERNAL' } }, data: { userId: user.id } });
    expect(prisma.session.updateMany.mock.invocationCallOrder[0]).toBeLessThan(prisma.mcpConnection.create.mock.invocationCallOrder[0]);
    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: 'Serializable' });
  });
  it('rejects removed or external membership without creating a grant', async () => {
    const { prisma, consent } = build();
    prisma.firmMember.updateMany.mockResolvedValue({ count: 0 });
    await expect(consent.approve(user, dto, request)).rejects.toThrow(ForbiddenException);
    expect(prisma.mcpConnection.create).not.toHaveBeenCalled();
  });
  it('deny validates redirect then returns access_denied and state without storing anything', async () => {
    const { prisma, consent } = build(); const url = new URL((await consent.deny(user, dto)).redirectUrl);
    expect(url.searchParams.get('error')).toBe('access_denied'); expect(url.searchParams.get('state')).toBe(dto.state);
    expect(prisma.mcpConnection.create).not.toHaveBeenCalled(); expect(prisma.mcpAuthCode.create).not.toHaveBeenCalled();
  });
  it('allows only S256 and rejects extra fields with the app ValidationPipe conventions', async () => {
    const { consent } = build();
    await expect(consent.approve(user, { ...dto, code_challenge_method: 'plain' } as unknown as McpConsentDto, request)).rejects.toThrow(BadRequestException);
    expect(await validate(plainToInstance(McpConsentDto, dto))).toHaveLength(0);
    const errors = await validate(plainToInstance(McpConsentDto, { ...dto, firmId: 'evil' }), { whitelist: true, forbidNonWhitelisted: true });
    expect(errors.some(e => e.property === 'firmId')).toBe(true);
  });
});

describe('MCP connection ownership and settings', () => {
  it('switch off revokes every firm connection in the same transaction and audits', async () => {
    const { prisma, connections } = build();
    await expect(connections.updateSettings(user, { enabled: false })).resolves.toEqual({ enabled: false });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.mcpConnection.updateMany).toHaveBeenCalledWith({ where: { firmId: 'firm', revokedAt: null }, data: { revokedAt: expect.any(Date) } });
    expect(prisma.auditLog.create).toHaveBeenCalledWith({ data: { firmId: 'firm', userId: 'user', action: 'mcp.settings', metadata: { enabled: false } } });
  });
  it('only OWNER can manage settings or firm connections', async () => {
    const { service } = build(); const manager = { ...user, firmRole: FirmRole.OFFICE_MANAGER };
    await expect(service.updateSettings(manager, true)).rejects.toThrow(ForbiddenException);
    expect(() => service.list(manager)).toThrow(ForbiddenException);
  });
  it('connection deletes always scope by firm and personal deletes also by user', async () => {
    const { service, prisma } = build();
    prisma.mcpConnection.findFirst.mockResolvedValue({ id: 'conn', clientName: 'Claude' });
    await service.disconnect(user, 'conn', true);
    expect(prisma.mcpConnection.findFirst).toHaveBeenLastCalledWith({ where: { id: 'conn', firmId: 'firm', userId: 'user', revokedAt: null } });
    await service.disconnect(user, 'conn', false);
    expect(prisma.mcpConnection.findFirst).toHaveBeenLastCalledWith({ where: { id: 'conn', firmId: 'firm', revokedAt: null } });
  });
  it('lists only active own connections with public MCP URL and excludes token fields', async () => {
    const { service, prisma } = build();
    expect(await service.mine(user)).toEqual({ enabled: true, mcpUrl: 'https://api.test/mcp', connections: [] });
    const query = prisma.mcpConnection.findMany.mock.calls[0][0];
    expect(query.where).toEqual({ firmId: 'firm', userId: 'user', revokedAt: null });
    expect(Object.keys(query.select).sort()).toEqual(['clientName', 'createdAt', 'id', 'lastUsedAt']);
  });
});

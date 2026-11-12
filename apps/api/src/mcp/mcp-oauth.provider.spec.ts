import { InvalidGrantError, InvalidTokenError } from '@modelcontextprotocol/sdk/server/auth/errors.js';
import { tokenHash } from './mcp-config';
import { oauthFixture } from '../../test/mcp-fixtures';

describe('MCP OAuth provider', () => {
  it('returns the bound PKCE challenge and atomically consumes a code once, storing only hashes', async () => {
    const { provider, prisma, client, connection, code } = oauthFixture();
    expect(await provider.challengeForAuthorizationCode(client, 'code')).toBe(code.codeChallenge);
    const token = await provider.exchangeAuthorizationCode(client, 'code', undefined, code.redirectUri);
    expect(token.expires_in).toBe(3600);
    expect(connection.accessTokenHash).toBe(tokenHash(token.access_token));
    expect(connection.refreshTokenHash).toBe(tokenHash(token.refresh_token!));
    expect(prisma.mcpAuthCode.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ usedAt: null }) }));
    await expect(provider.exchangeAuthorizationCode(client, 'code', undefined, code.redirectUri)).rejects.toThrow(InvalidGrantError);
  });

  it('only one concurrent exchange may claim a code', async () => {
    const { provider, client, code } = oauthFixture();
    const results = await Promise.allSettled([provider.exchangeAuthorizationCode(client, 'code', undefined, code.redirectUri), provider.exchangeAuthorizationCode(client, 'code', undefined, code.redirectUri)]);
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
  });

  it('binds both challenge lookup and exchange to the registered client, redirect, resource and expiry', async () => {
    const { provider, client, code } = oauthFixture();
    await expect(provider.challengeForAuthorizationCode({ ...client, client_id: 'other' }, 'code')).rejects.toThrow(InvalidGrantError);
    await expect(provider.exchangeAuthorizationCode(client, 'code', undefined, 'https://evil.test')).rejects.toThrow(InvalidGrantError);
    await expect(provider.exchangeAuthorizationCode({ ...client, client_id: 'other' }, 'code', undefined, code.redirectUri)).rejects.toThrow(InvalidGrantError);
    code.expiresAt = new Date(0);
    await expect(provider.challengeForAuthorizationCode(client, 'code')).rejects.toThrow(InvalidGrantError);
    await expect(provider.exchangeAuthorizationCode(client, 'code', undefined, code.redirectUri)).rejects.toThrow(InvalidGrantError);
  });

  it('refresh rotates both tokens, making the old access and refresh pair unusable', async () => {
    const { provider, client } = oauthFixture();
    const issued = await provider.exchangeRefreshToken(client, 'refresh');
    await expect(provider.verifyAccessToken('access')).rejects.toThrow(InvalidTokenError);
    expect((await provider.verifyAccessToken(issued.access_token)).clientId).toBe(client.client_id);
    expect((await provider.exchangeRefreshToken(client, issued.refresh_token!)).access_token).not.toBe(issued.access_token);
    // the old refresh token is now a replay (covered below) — it must not be accepted
    await expect(provider.exchangeRefreshToken(client, 'refresh')).rejects.toThrow(InvalidGrantError);
  });

  it('replaying a rotated refresh token revokes the connection, so the thief loses the new pair too', async () => {
    const { provider, prisma, client, connection } = oauthFixture();
    const stolen = await provider.exchangeRefreshToken(client, 'refresh'); // attacker rotates first
    await expect(provider.exchangeRefreshToken(client, 'refresh')).rejects.toThrow(InvalidGrantError); // victim replays
    expect(connection.revokedAt).toBeInstanceOf(Date);
    expect(prisma.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ action: 'mcp.disconnect' }) }));
    await expect(provider.exchangeRefreshToken(client, stolen.refresh_token!)).rejects.toThrow(InvalidGrantError);
    await expect(provider.verifyAccessToken(stolen.access_token)).rejects.toThrow(InvalidTokenError);
  });

  it('rejects expired access and refresh tokens and a refresh belonging to another client', async () => {
    const { provider, client, connection } = oauthFixture();
    await expect(provider.exchangeRefreshToken({ ...client, client_id: 'other' }, 'refresh')).rejects.toThrow(InvalidGrantError);
    connection.refreshExpiresAt = new Date(0); connection.accessExpiresAt = new Date(0);
    await expect(provider.exchangeRefreshToken(client, 'refresh')).rejects.toThrow(InvalidGrantError);
    await expect(provider.verifyAccessToken('access')).rejects.toThrow(InvalidTokenError);
  });

  it.each(['off', 'revoked', 'removed', 'external'])('%s blocks code exchange, refresh and bearer verification', async condition => {
    const { provider, client, code, connection, prisma, tenant } = oauthFixture();
    if (condition === 'off') { prisma.firm.findUnique.mockResolvedValue({ mcpEnabled: false }); connection.firm.mcpEnabled = false; }
    if (condition === 'revoked') connection.revokedAt = new Date();
    if (condition === 'removed') { prisma.firmMember.findUnique.mockResolvedValue(null); tenant.buildAuthUser.mockResolvedValue(null); }
    if (condition === 'external') { prisma.firmMember.findUnique.mockResolvedValue({ id: 'member', role: 'EXTERNAL' }); tenant.buildAuthUser.mockResolvedValue({ id: 'user', firmId: 'firm', firmRole: 'EXTERNAL' } as never); }
    await expect(provider.exchangeAuthorizationCode(client, 'code', undefined, code.redirectUri)).rejects.toThrow(InvalidGrantError);
    await expect(provider.exchangeRefreshToken(client, 'refresh')).rejects.toThrow(InvalidGrantError);
    await expect(provider.verifyAccessToken('access')).rejects.toThrow(InvalidTokenError);
  });

  it('checks current membership and throttles lastUsedAt updates to five minutes', async () => {
    const { provider, prisma, connection, tenant } = oauthFixture();
    await provider.verifyAccessToken('access');
    expect(tenant.buildAuthUser).toHaveBeenCalledWith('user', 'firm');
    expect(prisma.mcpConnection.updateMany).not.toHaveBeenCalled();
    connection.lastUsedAt = new Date(Date.now() - 301_000);
    await provider.verifyAccessToken('access'); await provider.verifyAccessToken('access');
    expect(prisma.mcpConnection.updateMany).toHaveBeenCalledTimes(1);
  });

  it('revokes and audits the owning connection without revealing invalid tokens', async () => {
    const { provider, prisma, client, connection } = oauthFixture();
    prisma.mcpConnection.findFirst.mockResolvedValue(connection);
    await provider.revokeToken(client, { token: 'refresh' });
    expect(connection.revokedAt).toBeInstanceOf(Date);
    expect(prisma.mcpConnection.findFirst).toHaveBeenCalledWith({ where: { clientId: client.client_id, OR: [{ accessTokenHash: tokenHash('refresh') }, { refreshTokenHash: tokenHash('refresh') }], revokedAt: null } });
    expect(prisma.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ action: 'mcp.disconnect' }) }));
    prisma.mcpConnection.findFirst.mockResolvedValue(null);
    await expect(provider.revokeToken(client, { token: 'unknown' })).resolves.toBeUndefined();
  });
});

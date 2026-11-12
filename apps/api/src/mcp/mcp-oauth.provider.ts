import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import type { Response } from 'express';
import type { OAuthServerProvider, AuthorizationParams } from '@modelcontextprotocol/sdk/server/auth/provider.js';
import type { OAuthRegisteredClientsStore } from '@modelcontextprotocol/sdk/server/auth/clients.js';
import type { OAuthClientInformationFull, OAuthTokenRevocationRequest, OAuthTokens } from '@modelcontextprotocol/sdk/shared/auth.js';
import { InvalidClientMetadataError, InvalidGrantError, InvalidRequestError, InvalidScopeError, InvalidTokenError } from '@modelcontextprotocol/sdk/server/auth/errors.js';
import { redirectUriMatches } from '@modelcontextprotocol/sdk/server/auth/handlers/authorize.js';
import { McpConnection, Prisma } from '../generated/prisma';
import { PrismaService } from '../prisma/prisma.module';
import { TenantService } from '../saas/tenant.service';
import { FirmRole } from '@lawfirm/shared';
import { ACCESS_SECONDS, publicApiUrl, randomToken, REFRESH_SECONDS, tokenHash } from './mcp-config';

@Injectable()
export class McpOAuthProvider implements OAuthServerProvider {
  readonly issuerUrl: URL;
  readonly resourceUrl: URL;
  readonly clientsStore: OAuthRegisteredClientsStore;

  constructor(private readonly prisma: PrismaService, private readonly config: ConfigService, private readonly tenant: TenantService) {
    this.issuerUrl = new URL(publicApiUrl(config));
    this.resourceUrl = new URL('/mcp', this.issuerUrl);
    this.clientsStore = {
      getClient: async (clientId) => {
        const row = await this.prisma.mcpClient.findUnique({ where: { clientId } });
        return row ? row.metadata as unknown as OAuthClientInformationFull : undefined;
      },
      registerClient: async (client) => {
        if (!client.redirect_uris.length || client.redirect_uris.length > 20) throw new InvalidClientMetadataError('Register 1-20 redirect URIs');
        for (const value of client.redirect_uris) {
          let url: URL;
          try { url = new URL(value); } catch { throw new InvalidClientMetadataError('Invalid redirect URI'); }
          const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
          if (value.length > 2048 || url.hash || url.username || url.password || (url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback))) {
            throw new InvalidClientMetadataError('Redirect URI must be HTTPS or HTTP loopback');
          }
        }
        const name = client.client_name?.trim() || 'AI app';
        if (name.length > 200) throw new InvalidClientMetadataError('Client name must be at most 200 characters');
        if (client.token_endpoint_auth_method && !['none', 'client_secret_post'].includes(client.token_endpoint_auth_method)) {
          throw new InvalidClientMetadataError('Unsupported client authentication method');
        }
        const full: OAuthClientInformationFull = { ...client, client_id: randomUUID(), client_id_issued_at: Math.floor(Date.now() / 1000), client_name: name };
        await this.prisma.mcpClient.create({ data: {
          clientId: full.client_id, clientName: name, redirectUris: full.redirect_uris,
          metadata: JSON.parse(JSON.stringify(full)) as Prisma.InputJsonValue,
        } });
        return full;
      },
    };
  }

  validateResource(resource?: URL) {
    if (resource && resource.href !== this.resourceUrl.href) throw new InvalidRequestError('Invalid resource');
  }

  validateScopes(scopes?: string[]) {
    if (scopes?.some(s => s && s !== 'mcp')) throw new InvalidScopeError('Unsupported scope');
  }

  async authorize(client: OAuthClientInformationFull, params: AuthorizationParams, res: Response): Promise<void> {
    this.validateResource(params.resource);
    this.validateScopes(params.scopes);
    if (!/^[A-Za-z0-9_-]{43}$/.test(params.codeChallenge)) throw new InvalidRequestError('Invalid S256 challenge');
    if (!client.redirect_uris.some(uri => redirectUriMatches(params.redirectUri, uri))) throw new InvalidRequestError('Unregistered redirect URI');
    const url = new URL('/oauth/consent', this.config.get<string>('APP_URL') ?? 'http://localhost:3005');
    url.searchParams.set('client_id', client.client_id);
    url.searchParams.set('redirect_uri', params.redirectUri);
    url.searchParams.set('code_challenge', params.codeChallenge);
    url.searchParams.set('code_challenge_method', 'S256');
    if (params.state !== undefined) url.searchParams.set('state', params.state);
    if (params.scopes?.length) url.searchParams.set('scope', params.scopes.join(' '));
    if (params.resource) url.searchParams.set('resource', params.resource.href);
    res.redirect(302, url.href);
  }

  private async active(tx: Prisma.TransactionClient, connection: McpConnection | null) {
    if (!connection || connection.revokedAt) throw new InvalidGrantError('Connection is no longer active');
    const [firm, member] = await Promise.all([
      tx.firm.findUnique({ where: { id: connection.firmId }, select: { mcpEnabled: true } }),
      tx.firmMember.findUnique({ where: { firmId_userId: { firmId: connection.firmId, userId: connection.userId } }, select: { id: true, role: true } }),
    ]);
    if (!firm?.mcpEnabled || !member || member.role === FirmRole.EXTERNAL) throw new InvalidGrantError('Connection is no longer active');
    return connection;
  }

  async challengeForAuthorizationCode(client: OAuthClientInformationFull, code: string): Promise<string> {
    const record = await this.prisma.mcpAuthCode.findUnique({ where: { codeHash: tokenHash(code) } });
    if (!record || record.clientId !== client.client_id || record.usedAt || record.expiresAt <= new Date()) throw new InvalidGrantError('Invalid authorization code');
    return record.codeChallenge;
  }

  async exchangeAuthorizationCode(client: OAuthClientInformationFull, code: string, _verifier?: string, redirectUri?: string, resource?: URL): Promise<OAuthTokens> {
    this.validateResource(resource);
    return this.prisma.$transaction(async tx => {
      const record = await tx.mcpAuthCode.findUnique({ where: { codeHash: tokenHash(code) } });
      if (!record || record.clientId !== client.client_id || record.redirectUri !== redirectUri || record.usedAt || record.expiresAt <= new Date()
        || (record.resource && record.resource !== (resource?.href ?? this.resourceUrl.href))) throw new InvalidGrantError('Invalid authorization code');
      const connection = await this.active(tx, await tx.mcpConnection.findUnique({ where: { id: record.connectionId } }));
      if (connection.clientId !== client.client_id) throw new InvalidGrantError('Invalid client');
      const claimed = await tx.mcpAuthCode.updateMany({ where: { id: record.id, usedAt: null, expiresAt: { gt: new Date() } }, data: { usedAt: new Date() } });
      if (claimed.count !== 1) throw new InvalidGrantError('Authorization code already used');
      return this.issue(tx, connection);
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }).catch(error => this.grantError(error));
  }

  async exchangeRefreshToken(client: OAuthClientInformationFull, refreshToken: string, scopes?: string[], resource?: URL): Promise<OAuthTokens> {
    this.validateResource(resource);
    this.validateScopes(scopes);
    const hash = tokenHash(refreshToken);
    // A rotated-away refresh token coming back means it leaked: kill the connection (committed before we answer).
    const replayed = await this.prisma.mcpUsedRefreshToken.findUnique({ where: { hash }, include: { connection: true } });
    if (replayed) {
      const { connection } = replayed;
      const revoked = await this.prisma.mcpConnection.updateMany({ where: { id: connection.id, revokedAt: null }, data: { revokedAt: new Date() } });
      if (revoked.count) await this.prisma.auditLog.create({ data: { firmId: connection.firmId, userId: connection.userId, action: 'mcp.disconnect',
        metadata: { connectionId: connection.id, clientName: connection.clientName, reason: 'refresh_token_reuse' } } });
      throw new InvalidGrantError('Refresh token was already used; reconnect');
    }
    return this.prisma.$transaction(async tx => {
      const connection = await this.active(tx, await tx.mcpConnection.findUnique({ where: { refreshTokenHash: hash } }));
      if (connection.clientId !== client.client_id || !connection.refreshExpiresAt || connection.refreshExpiresAt <= new Date()) throw new InvalidGrantError('Invalid refresh token');
      return this.issue(tx, connection, hash);
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }).catch(error => this.grantError(error));
  }

  private grantError(error: unknown): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034') throw new InvalidGrantError('Grant was used or revoked concurrently');
    throw error;
  }

  private async issue(tx: Prisma.TransactionClient, connection: McpConnection, refreshHash?: string): Promise<OAuthTokens> {
    const access = randomToken();
    const refresh = randomToken();
    const changed = await tx.mcpConnection.updateMany({
      where: { id: connection.id, revokedAt: null, ...(refreshHash ? { refreshTokenHash: refreshHash, refreshExpiresAt: { gt: new Date() } } : {}) },
      data: {
        accessTokenHash: tokenHash(access), accessExpiresAt: new Date(Date.now() + ACCESS_SECONDS * 1000),
        refreshTokenHash: tokenHash(refresh), refreshExpiresAt: new Date(Date.now() + REFRESH_SECONDS * 1000),
      },
    });
    if (changed.count !== 1) throw new InvalidGrantError('Connection was revoked or refreshed');
    // ponytail: rows live until the connection is deleted; prune by usedAt > 90 d if the table grows.
    if (refreshHash) await tx.mcpUsedRefreshToken.create({ data: { hash: refreshHash, connectionId: connection.id } });
    return { access_token: access, token_type: 'Bearer', expires_in: ACCESS_SECONDS, refresh_token: refresh, scope: 'mcp' };
  }

  async verifyAccessToken(token: string) {
    const connection = await this.prisma.mcpConnection.findUnique({ where: { accessTokenHash: tokenHash(token) }, include: { firm: { select: { mcpEnabled: true } } } });
    if (!connection || connection.revokedAt || !connection.firm.mcpEnabled || !connection.accessExpiresAt || connection.accessExpiresAt <= new Date()) throw new InvalidTokenError('Connection expired or revoked; reconnect');
    const user = await this.tenant.buildAuthUser(connection.userId, connection.firmId);
    if (!user || user.firmRole === FirmRole.EXTERNAL) throw new InvalidTokenError('Membership is no longer active');
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    if (!connection.lastUsedAt || connection.lastUsedAt < fiveMinutesAgo) {
      await this.prisma.mcpConnection.updateMany({
        where: { id: connection.id, revokedAt: null, accessTokenHash: tokenHash(token), OR: [{ lastUsedAt: null }, { lastUsedAt: { lt: fiveMinutesAgo } }] },
        data: { lastUsedAt: new Date() },
      });
    }
    return { token, clientId: connection.clientId, scopes: ['mcp'], expiresAt: connection.accessExpiresAt.getTime() / 1000, resource: this.resourceUrl, extra: { user, connectionId: connection.id, clientName: connection.clientName } };
  }

  async revokeToken(client: OAuthClientInformationFull, request: OAuthTokenRevocationRequest): Promise<void> {
    const hash = tokenHash(request.token);
    await this.prisma.$transaction(async tx => {
      const connection = await tx.mcpConnection.findFirst({ where: { clientId: client.client_id, OR: [{ accessTokenHash: hash }, { refreshTokenHash: hash }], revokedAt: null } });
      if (!connection) return;
      await tx.mcpConnection.updateMany({ where: { id: connection.id, revokedAt: null }, data: { revokedAt: new Date() } });
      await tx.auditLog.create({ data: { firmId: connection.firmId, userId: connection.userId, action: 'mcp.disconnect', metadata: { connectionId: connection.id, clientName: connection.clientName } } });
    });
  }
}

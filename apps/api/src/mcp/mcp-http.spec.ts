import express = require('express');
import { injectHttp } from '../../test/http-inject';
import { createHash } from 'node:crypto';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { mcpHttpRouter } from './mcp-http';
import { oauthFixture } from '../../test/mcp-fixtures';

function httpFixture() {
  const fixture = oauthFixture();
  const tools = { createServer: jest.fn(() => new McpServer({ name: 'test', version: '1.0.0' })) };
  const app = express();
  app.use(mcpHttpRouter(fixture.provider, tools));
  app.use((_req, res) => res.status(500).json({ error: 'Strict app CORS callback reached' }));
  return { ...fixture, tools, app };
}

const base = 'http://localhost';
const origin = 'https://external-ai.test';

describe('MCP SDK HTTP mounting before strict app CORS', () => {
  it('serves public metadata and OAuth endpoints with an arbitrary Origin', async () => {
    const { app } = httpFixture();
    for (const path of ['/.well-known/oauth-authorization-server', '/.well-known/oauth-protected-resource/mcp']) {
      const result = await injectHttp(app, base + path, { headers: { Origin: origin } });
      expect(result.status).toBe(200); expect(result.headers.get('access-control-allow-origin')).toBe('*');
    }
    const registration = await injectHttp(app, base + '/register', { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify({ redirect_uris: ['https://app.test/cb'], token_endpoint_auth_method: 'none', client_name: 'Test' }) });
    expect(registration.status).toBe(201);
    const token = await injectHttp(app, base + '/token', { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'client_id=missing&grant_type=refresh_token&refresh_token=bad' });
    expect(token.status).toBe(400); expect((await token.json() as { error: string }).error).toBe('invalid_client');
    const authorize = await injectHttp(app, base + '/authorize?client_id=missing', { headers: { Origin: origin } }); expect(authorize.status).toBe(400);
    const revoke = await injectHttp(app, base + '/revoke', { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'client_id=missing&token=bad' }); expect(revoke.status).toBe(400);
  });

  it('SDK verifies S256 before exchange, then enforces the exact bound redirect', async () => {
    const { app, prisma, client, code } = httpFixture();
    const verifier = 'a'.repeat(43); code.codeChallenge = createHash('sha256').update(verifier).digest('base64url');
    prisma.mcpClient.findUnique.mockResolvedValue({ metadata: client });
    const post = (values: Record<string, string>) => injectHttp(app, base + '/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Origin: origin }, body: new URLSearchParams({ client_id: client.client_id, grant_type: 'authorization_code', code: 'code', redirect_uri: code.redirectUri, ...values }) });
    const wrongPkce = await post({ code_verifier: 'b'.repeat(43) }); expect(wrongPkce.status).toBe(400);
    expect((await wrongPkce.json() as { error: string }).error).toBe('invalid_grant'); expect(code.usedAt).toBeNull();
    const wrongRedirect = await post({ code_verifier: verifier, redirect_uri: 'https://evil.test/cb' }); expect(wrongRedirect.status).toBe(400); expect(code.usedAt).toBeNull();
    const success = await post({ code_verifier: verifier }); expect(success.status).toBe(200);
    const again = await post({ code_verifier: verifier }); expect(again.status).toBe(400);
  });

  it('forwards validated consent params to the web without storing a code or connection', async () => {
    const { app, prisma, client } = httpFixture();
    prisma.mcpClient.findUnique.mockResolvedValue({ metadata: client });
    const result = await injectHttp(app, base + '/authorize?' + new URLSearchParams({ client_id: client.client_id, redirect_uri: client.redirect_uris[0], response_type: 'code', code_challenge: 'x'.repeat(43), code_challenge_method: 'S256', state: 'opaque' }), { redirect: 'manual', headers: { Origin: origin } });
    expect(result.status).toBe(302);
    const location = new URL(result.headers.get('location')!); expect(location.pathname).toBe('/oauth/consent'); expect(location.searchParams.get('state')).toBe('opaque');
    expect(prisma.mcpAuthCode.updateMany).not.toHaveBeenCalled(); expect(prisma.mcpConnection.updateMany).not.toHaveBeenCalled();
  });

  it('returns metadata challenge on missing, expired, revoked, firm-off and removed-member bearer requests', async () => {
    const fixture = httpFixture(); const app = fixture.app;
    const call = (token?: string) => injectHttp(app, base + '/mcp', { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: '{}' });
    for (const state of ['missing', 'expired', 'revoked', 'off', 'removed']) {
      fixture.connection.revokedAt = null; fixture.connection.accessExpiresAt = new Date(Date.now() + 60_000); fixture.connection.firm.mcpEnabled = true;
      if (state === 'expired') fixture.connection.accessExpiresAt = new Date(0);
      if (state === 'revoked') fixture.connection.revokedAt = new Date();
      if (state === 'off') fixture.connection.firm.mcpEnabled = false;
      if (state === 'removed') fixture.tenant.buildAuthUser.mockResolvedValue(null);
      const result = await call(state === 'missing' ? undefined : 'access');
      expect(result.status).toBe(401); expect(result.headers.get('www-authenticate')).toContain('/.well-known/oauth-protected-resource/mcp');
      expect(result.headers.get('access-control-allow-origin')).toBe('*');
    }
    expect(fixture.tools.createServer).not.toHaveBeenCalled();
  });

  it('runs stateless MCP, answers GET/DELETE with 405 and handles external preflights', async () => {
    const { app } = httpFixture();
    for (const method of ['GET', 'DELETE']) {
      const result = await injectHttp(app, base + '/mcp', { method, headers: { Origin: origin } });
      expect(result.status).toBe(405); expect((await result.json() as { jsonrpc: string }).jsonrpc).toBe('2.0');
    }
    const preflight = await injectHttp(app, base + '/mcp', { method: 'OPTIONS', headers: { Origin: origin, 'Access-Control-Request-Headers': 'authorization,mcp-protocol-version', 'Access-Control-Request-Method': 'POST' } });
    expect(preflight.status).toBe(204); expect(preflight.headers.get('access-control-allow-headers')).toContain('MCP-Protocol-Version');
    const init = await injectHttp(app, base + '/mcp', { method: 'POST', headers: { Origin: origin, Authorization: 'Bearer access', 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'test', version: '1' } } }) });
    expect(init.status).toBe(200); expect(init.headers.get('mcp-session-id')).toBeNull();
    expect((await init.json() as { result: { serverInfo: { name: string } } }).result.serverInfo.name).toBe('test');
  });

  it('limits each connection to 120 requests per minute', async () => {
    const { app } = httpFixture();
    for (let i = 0; i < 121; i++) {
      const response = await injectHttp(app, base + '/mcp', { method: 'POST', headers: { Authorization: 'Bearer access', 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' }, body: JSON.stringify({ jsonrpc: '2.0', id: i, method: 'ping' }) });
      expect(response.status).toBe(i < 120 ? 200 : 429); await response.text();
    }
  });
});

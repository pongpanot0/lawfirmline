import { json, Router } from 'express';
import type { Request, Response } from 'express';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { mcpAuthRouter, getOAuthProtectedResourceMetadataUrl } from '@modelcontextprotocol/sdk/server/auth/router.js';
import { requireBearerAuth } from '@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js';
import type { AuthUser } from '@lawfirm/shared';
import { McpOAuthProvider } from './mcp-oauth.provider';

export interface McpServerFactory {
  createServer(user: AuthUser, connection: { id: string; clientName: string }): McpServer;
}

export function mcpHttpRouter(provider: McpOAuthProvider, tools: McpServerFactory) {
  const router = Router();
  const publicPaths = new Set(['/mcp', '/authorize', '/token', '/register', '/revoke', '/.well-known/oauth-authorization-server', '/.well-known/oauth-protected-resource/mcp']);
  // These token-authenticated SDK endpoints are intentionally available to external AI apps.
  // End the request here so the app's credentialed CORS callback never sees these origins.
  router.use((req, res, next) => {
    if (!publicPaths.has(req.path.replace(/\/$/, ''))) return next();
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Accept, MCP-Protocol-Version, MCP-Session-Id, Last-Event-ID');
    res.setHeader('Access-Control-Expose-Headers', 'WWW-Authenticate, MCP-Session-Id, MCP-Protocol-Version, Retry-After');
    res.setHeader('Cache-Control', 'no-store');
    if (req.method === 'OPTIONS') { res.sendStatus(204); return; }
    next();
  });
  router.use(mcpAuthRouter({ provider, issuerUrl: provider.issuerUrl, resourceServerUrl: provider.resourceUrl, scopesSupported: ['mcp'], resourceName: 'Samnuan' }));
  const methodNotAllowed = (_req: Request, res: Response) => {
    res.setHeader('Allow', 'POST');
    res.status(405).json({ jsonrpc: '2.0', error: { code: -32000, message: 'Method not allowed' }, id: null });
  };
  router.get('/mcp', methodNotAllowed);
  router.delete('/mcp', methodNotAllowed);
  // ponytail: one in-memory limiter per API container; move to shared storage before scaling replicas.
  const windows = new Map<string, { start: number; count: number }>();
  router.post('/mcp', requireBearerAuth({ verifier: provider, resourceMetadataUrl: getOAuthProtectedResourceMetadataUrl(provider.resourceUrl), expectedResource: provider.resourceUrl }),
    json({ limit: '256kb' }), async (req, res) => {
      const auth = req.auth!;
      const connectionId = auth.extra!.connectionId as string;
      const now = Date.now();
      // Expire inactive keys as well, so registrations cannot grow the map forever.
      for (const [key, value] of windows) if (now - value.start >= 60_000) windows.delete(key);
      let window = windows.get(connectionId);
      if (!window) { window = { start: now, count: 0 }; windows.set(connectionId, window); }
      if (++window.count > 120) {
        res.setHeader('Retry-After', String(Math.max(1, Math.ceil((60_000 - now + window.start) / 1000))));
        res.status(429).json({ jsonrpc: '2.0', error: { code: -32000, message: 'คำขอมากเกินไป กรุณารอสักครู่' }, id: null });
        return;
      }
      const server = tools.createServer(auth.extra!.user as AuthUser, { id: connectionId, clientName: auth.extra!.clientName as string });
      const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
      res.on('close', () => { void server.close().catch(() => undefined); });
      try {
        await server.connect(transport);
        await transport.handleRequest(req, res, req.body);
      } catch {
        if (!res.headersSent) res.status(500).json({ jsonrpc: '2.0', error: { code: -32603, message: 'ทำรายการไม่สำเร็จ กรุณาลองใหม่' }, id: null });
        await server.close().catch(() => undefined);
      }
    });
  return router;
}

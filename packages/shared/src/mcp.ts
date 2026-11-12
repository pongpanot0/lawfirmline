/**
 * Contract between api and web for "AI ของคุณ" — lawyers connecting Claude / Codex
 * to Samnuan through the remote MCP server (OAuth). The MCP protocol itself is not here.
 */

/** One app (Claude, Codex, …) a person connected. Never carries tokens. */
export interface McpConnectionSummary {
  id: string;
  /** Name the app registered with (untrusted, display only). */
  clientName: string;
  createdAt: string;
  lastUsedAt: string | null;
}

/** GET /mcp/connections/mine */
export interface MyMcpConnections {
  /** Firm owner switch. When false nobody in the firm can connect. */
  enabled: boolean;
  /** The URL lawyers paste into their AI app, e.g. https://api.samnuan.com/mcp */
  mcpUrl: string;
  connections: McpConnectionSummary[];
}

/** GET /mcp/connections (needs manageAiConnections) */
export interface FirmMcpConnection extends McpConnectionSummary {
  user: { id: string; firstName: string; lastName: string; email: string };
}

/** GET /mcp/settings, PUT /mcp/settings (needs manageAiConnections) */
export interface McpFirmSettings {
  enabled: boolean;
}

/** Query params the API forwards to the web consent page (/oauth/consent). Passed back unchanged. */
export interface McpConsentParams {
  client_id: string;
  redirect_uri: string;
  code_challenge: string;
  code_challenge_method: 'S256';
  state?: string;
  scope?: string;
  resource?: string;
}

/** GET /mcp-oauth/consent?…McpConsentParams */
export interface McpConsentInfo {
  clientName: string;
  /** Host of the validated redirect_uri, e.g. "claude.ai" or "localhost". Show this, not clientName, as where the user returns. */
  redirectHost: string;
  firmEnabled: boolean;
  user: { firstName: string; lastName: string; email: string; firmName: string };
}

/** POST /mcp-oauth/consent/approve and /deny → browser goes to redirectUrl. */
export interface McpConsentResult {
  redirectUrl: string;
}

/** AuditLog.action values written by the MCP layer (web shows Thai labels). */
export const MCP_AUDIT_ACTIONS = [
  'mcp.connect',
  'mcp.disconnect',
  'mcp.settings',
  'mcp.create_task',
  'mcp.complete_task',
  'mcp.add_case_note',
  'mcp.log_time',
  'mcp.propose_court_date',
  'mcp.draft_expense',
] as const;
export type McpAuditAction = (typeof MCP_AUDIT_ACTIONS)[number];

/**
 * Which cases a person's AI may see through MCP. 'app' = exactly what the app shows them
 * (owner: every case; senior lawyer: own + junior lawyers' cases). 'own' = only cases they lead,
 * are assigned to or have a task in. Office managers stay 'own' until the owner decides otherwise.
 */
export function mcpCaseScope(role: string | null | undefined): 'app' | 'own' {
  return role === 'OWNER' || role === 'SENIOR_LAWYER' ? 'app' : 'own';
}

/** Thai phrase for what the AI sees, used in settings and consent copy. */
export function mcpVisibilityText(role: string | null | undefined): string {
  if (role === 'OWNER') return 'ทุกคดีในสำนักงาน';
  if (role === 'SENIOR_LAWYER') return 'คดีของคุณและคดีของทนายในทีม';
  return 'เฉพาะคดีที่คุณรับผิดชอบหรือมีงานอยู่';
}

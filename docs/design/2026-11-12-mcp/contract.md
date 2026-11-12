# AI ของคุณ (remote MCP) — contract

Approved by the owner 2026-11-12. Mockups: `s1-connect.png`, `s2-consent.png`, `s3-owner.png`; copy: `copy-deck.md`.
Shared types: `packages/shared/src/mcp.ts`; new capability `manageAiConnections` (OWNER only).

## Rules that must hold

1. **Own work only.** Every MCP read and write sees only cases where the caller is lead lawyer, is assigned, or has a task — for every role, including OWNER / OFFICE_MANAGER (never `viewAllCases`, never the SENIOR_LAWYER widening). Firm isolation as always.
2. Office tools: `list_leaves` as today; `lawyer_licenses` only the caller's own licence; `receivables` only with `manageInvoices`; `petty_cash_balance` only with `viewPettyCash`.
3. **Firm switch** `Firm.mcpEnabled` (default false). Off → no consent, no token issue/refresh, every MCP request 401, and turning it off revokes all firm connections.
4. **Revocation is immediate** (checked on every request): connection revoked, firm switch off, membership gone, password changed/reset.
5. Tokens: opaque random strings, stored only as SHA-256 hashes. Access 1 h, refresh 90 d, rotated on every refresh (old pair dies). Auth code single use, 10 min, PKCE S256 required.
6. Writes are create-only (plus closing your own task), audited in `AuditLog` (`mcp.*` actions, metadata `{ connectionId, clientName, tool, caseId, entityId }`, never note text), and marked "ผ่าน AI" in the app.
7. Court dates are never written to the calendar by AI: they become `DocumentDateSuggestion` (source `MCP`, PENDING) that a person accepts in the case page.
8. Everything the AI reads goes through `redactForAi` like the secretary.

## Data model (Prisma, additive)

- `Firm.mcpEnabled Boolean @default(false)`
- `McpClient` — DCR registrations: `clientId @unique`, `clientName`, `redirectUris String[]`, `metadata Json`, `createdAt`.
- `McpConnection` — one per consent: `firmId`, `userId`, `clientId`, `clientName` (snapshot), `accessTokenHash @unique?`, `accessExpiresAt?`, `refreshTokenHash @unique?`, `refreshExpiresAt?`, `lastUsedAt?`, `revokedAt?`, `createdAt`; indexes on firmId, userId.
- `McpAuthCode` — `codeHash @unique`, `connectionId`, `clientId`, `redirectUri`, `codeChallenge`, `resource?`, `expiresAt`, `usedAt?`.
- `TaskSource` += `MCP`; `DateSuggestionSource` += `MCP`.
- `CaseComment.viaAi Boolean @default(false)`, `TimeEntry.viaAi Boolean @default(false)` (the "note" is a CaseComment — CaseActivity would also create a calendar event).

## HTTP surface (API, https://api.{domain})

OAuth (SDK `mcpAuthRouter` + our `OAuthServerProvider`):
- `/.well-known/oauth-authorization-server`, `/.well-known/oauth-protected-resource/mcp`
- `POST /register` (DCR; redirect URIs must be https, or http on localhost / 127.0.0.1 only)
- `GET /authorize` → validates, then 302 to `{APP_URL}/oauth/consent?<McpConsentParams>`
- `POST /token` (authorization_code, refresh_token), `POST /revoke`

MCP: `POST /mcp` Streamable HTTP, stateless, Bearer token (401 carries `WWW-Authenticate` with resource metadata). `GET`/`DELETE /mcp` → 405. Per-connection limit ~120 req/min.

App endpoints (normal web JWT):
| Method | Path | Who | Returns |
|---|---|---|---|
| GET | `/mcp-oauth/consent?…` | logged-in member | `McpConsentInfo` (400 bad client/redirect) |
| POST | `/mcp-oauth/consent/approve` body `McpConsentParams` | member, firm enabled | `McpConsentResult` (403 if firm off) |
| POST | `/mcp-oauth/consent/deny` body `McpConsentParams` | member | `McpConsentResult` with `error=access_denied` |
| GET | `/mcp/connections/mine` | member | `MyMcpConnections` |
| DELETE | `/mcp/connections/mine/:id` | owner of row | 204 |
| GET | `/mcp/settings` / PUT `{enabled}` | `manageAiConnections` | `McpFirmSettings` |
| GET | `/mcp/connections` | `manageAiConnections` | `FirmMcpConnection[]` |
| DELETE | `/mcp/connections/:id` | `manageAiConnections`, same firm | 204 |

Task, case comment and time entry responses the web already uses must carry `source` / `viaAi` so the badge can show.

## MCP tools

Reads (from `SecretaryToolsService`, own-work scope): `find_matters`, `case_overview`, `search_documents`, `read_document`, `list_events`, `list_leaves`, `search_sops`, `lawyer_licenses`, `receivables`*, `petty_cash_balance`*, `my_work` (rows now include `id`, `kind`, `caseId`). Results add `url` links into the web app where a case/task id is present. *capability-gated: not listed when the caller lacks it.

Writes:
| Tool | Input | Effect |
|---|---|---|
| `create_task` | caseId, title, description?, dueDate? (YYYY-MM-DD) | Task assigned to the caller, `source: MCP` |
| `complete_task` | taskId | only a task assigned to the caller in an own case; tasks needing review → error telling them to submit in the app |
| `add_case_note` | caseId, text (≤ 5000) | CaseComment, `viaAi: true`, no mentions |
| `log_time` | caseId, hours (0.1–24), description, date? (YYYY-MM-DD), billable? | TimeEntry, `viaAi: true`, default rate as today |
| `propose_court_date` | caseId, title, startAt (ISO datetime, Asia/Bangkok if no offset), courtName?, note? | DocumentDateSuggestion source MCP, eventType COURT_DATE, PENDING; reply says it waits for acceptance in the case page |

Tool descriptions in English for the model; error strings Thai, plain, saying what to do.

## Web

- `/settings?view=integrations`: new "AI ของคุณ" section above LINE / Microsoft — S1.
- `/settings?view=office`: "AI ของทนาย" card for `manageAiConnections` — S3 (table → record rows < 768px; switch-off confirm).
- `/oauth/consent`: S2. Not logged in → `/login?next=<this url>`; firm off → plain message to ask the owner; bad request → message + no buttons.
- "ผ่าน AI" badge (lucide `Sparkles` + text) on tasks with `source === 'MCP'`, case comments and time entries with `viaAi`.
- Date suggestions lists include `MCP` with label "เสนอโดย AI".
- Audit log labels for `mcp.*`.

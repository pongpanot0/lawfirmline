# LINE AI: same tools as MCP, every write confirmed first

Owner request 2026-11-12: LINE AI reads like MCP and creates work. Mockup: Stitch project 1381272357008818108 (staff confirm screen).

- `secretary/ai-write-tools.service.ts` = the MCP write logic moved out of `mcp-tools.service.ts` (schemas, descriptions, `run`), plus `check()` (validate + own-scope via `mcpCaseScope`, no save), `aiWriteDefinitions()` (OpenAI schemas from the same zod), `describeAiWrite()` (Thai confirm text). MCP tool output and `mcp.*` audits unchanged.
- `team_workload` moved into `SecretaryToolsService` (gated by `runOperations`), so LINE and the web panel have it; MCP keeps its own registration and output. `OperationsModule` now imports `TasksModule` via `forwardRef` (app.module.spec caught the load-order hole).
- `create_sop` / `create_workflow` (from 95c484ca on the #205 branch) live in the shared service too: open to every member, audited `mcp.*` / `line_ai.*`; Thai labels for every `line_ai.*` action in `apps/web/src/lib/audit-actions.ts`.
- `SecretaryChatService.chat(user, history, { writeTools })`: LINE passes all 10 MCP writes. The loop stops at the first valid write and returns `proposal`; refusals go back to the model. Web panel calls without writeTools → still read-only.
- `LineAiWriteService`: holds the proposal (`FlowType.AI_WRITE`, 1:1 chat, 10-min TTL); "ยืนยัน" takes-and-clears synchronously then runs → saved once on a double tap; "ยกเลิก" or any other text drops it. Audit `line_ai.<tool>` `{channel:'line'}`; tasks/court suggestions `source MCP` (the web's AI badge); outcome written to secretary history.
- LINE reads keep the app scope (same as before / the web panel); writes use MCP's own-work scope, so the AI can see a case it may not write to — it then explains the refusal.
- Client message → AI summary: built, then put on hold by the owner. Patch kept in the session notes folder (`client-line-summary-on-hold.patch`), not in this branch.

Verified: full api jest; local API with a fake LINE channel + real OpenAI — create_task proposal → confirm (two concurrent taps → one task, `line_ai.create_task` audit), out-of-scope log_time refused, team_workload answered for the owner, request_leave proposal cancelled with nothing saved. Test rows removed.

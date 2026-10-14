# Microsoft 365 status page for admins — Design + Plan

Branch `claude/m365-status-page` from main `76071eed`. No migration. No new Microsoft scope. No AI.

**Goal:** when someone says "ทำไมอีเมลไม่เข้า", an admin opens one page and sees right away whose Microsoft 365 is disconnected, when each account last synced, which case folder links are failing and why, in plain Thai, plus one-click "ขอให้เชื่อมต่อใหม่". The owner of a connection that breaks is also told automatically.

## Global constraints
- Worktree `/Users/pongpanot_s/Documents/dev/lawfirm/.claude/worktrees/microsoft-outlook-integration-dd90a4`, branch `claude/m365-status-page`.
- **LOW RAM host**: jest only on touched spec files with `--runInBand` (`pnpm --filter api exec jest --config jest.config.js --runInBand <paths>`), run `src/app.module.spec.ts` once if you add a provider/module, one api tsc and one web tsc, sequential; web lib tests `cd apps/web && node --test --experimental-strip-types <file>`. No full suites, no next build, no dev server, nothing in background.
- Firm-scoped by `user.firmId`. Admin routes: `FirmRoleGuard` + `@RequireCapability('runOperations')` (OWNER + OFFICE_MANAGER) — same pattern as `apps/api/src/operations/operations.controller.ts`.
- Never expose tokens, webhook secrets or delta links in responses.
- Thai UI, easy: one page, problems first, everything readable without technical knowledge.
- Commit with `/usr/bin/git`, stage only your files (never `apps/web/tsconfig.tsbuildinfo`), message ends with the Co-Authored-By line your session specifies.

## API (Task 1)
**`GET /outlook/admin/status`** →
```
{
  generatedAt: ISO,
  summary: { members: n, connected: n, problems: n, notConnected: n },
  connections: [{
    id, mailboxAddress, user: { id, name } | null,
    status: 'ACTIVE'|'EXPIRED'|'ERROR'|'REVOKED',
    health: 'OK' | 'WARN' | 'BROKEN',
    healthReason: string | null,        // Thai, e.g. 'สิทธิ์หมดอายุ — ต้องเชื่อมต่อใหม่'
    lastSyncedAt: ISO | null,
    lastError: string | null,           // raw, truncated to 300 chars
    lastErrorThai: string | null,       // humanized
    syncInboxToIntake, syncCalendar,
    subscriptionExpiresAt: ISO | null,
    folderLinks: { total, failing },    // OUTLOOK_FOLDER links on this connection (case not deleted)
    driveLinks: total,
    calendarCopyErrors: n,              // CalendarEventOutlookCopy with lastError on this connection
  }],
  failingLinks: [{ linkId, kind: 'OUTLOOK_FOLDER'|'DRIVE_FOLDER', caseId, ownRef, caseTitle, displayPath, mailboxAddress, lastSyncedAt, lastError, lastErrorThai }],  // max 50, newest first
  notConnected: [{ userId, name, email }]   // firm members (excluding EXTERNAL role if such role exists) with no ACTIVE connection
}
```
- **Health rules** (pure function `connectionHealth(conn, now)` with unit tests):
  - BROKEN: status ≠ ACTIVE (`EXPIRED`/`ERROR` → `สิทธิ์หมดอายุหรือถูกยกเลิก — เจ้าของบัญชีต้องเชื่อมต่อใหม่`, `REVOKED` → `ตัดการเชื่อมต่อแล้ว`).
  - WARN (ACTIVE): any folder link failing; or `syncInboxToIntake` and (`lastSyncedAt` null or older than 2 h); or `syncInboxToIntake` and subscription expired (`subscriptionExpiresAt < now`); or `lastError` set and updated within the last 24 h (use `updatedAt` as proxy). Reason = first matching rule in Thai.
  - OK otherwise.
- **`humanizeGraphError(raw: string | null): string | null`** pure function with tests: map common texts (case-insensitive substring) → Thai: token refresh failed / invalid_grant / 401 → `สิทธิ์หมดอายุ ต้องเชื่อมต่อใหม่`; 403 / Forbidden / accessDenied → `ไม่มีสิทธิ์เข้าถึง (ผู้ดูแล Microsoft ขององค์กรอาจยังไม่อนุมัติสิทธิ์)`; 404 / ErrorItemNotFound / not found → `ไม่พบ folder/ไฟล์ใน Microsoft แล้ว (อาจถูกลบหรือย้าย) — ผูกใหม่`; 429 / throttl → `Microsoft จำกัดการเรียกชั่วคราว ระบบจะลองใหม่เอง`; 5xx / timeout / ECONN / fetch failed → `เชื่อมต่อ Microsoft ไม่ได้ชั่วคราว ระบบจะลองใหม่เอง`; subscription → `การแจ้งเตือนอีเมลใหม่จาก Microsoft มีปัญหา — ระบบยังดึงอีเมลตามรอบได้`; otherwise `เกิดข้อผิดพลาด: {first 120 chars}`.
- Bounded queries: a handful of findMany/groupBy for the firm — no per-connection loops of queries.
- **`POST /outlook/admin/connections/:id/remind`** → notify the connection's user (`userId ?? connectedByUserId`) via `AssignmentNotifierService.notifyAssigned` (category `EMAIL`, actor = caller, `summaryText` `🔌 กรุณาเชื่อมต่อ Microsoft 365 ใหม่\nบัญชี {mailboxAddress} หลุดการเชื่อมต่อ — เข้า ตั้งค่า → Microsoft 365 แล้วกด "เชื่อมต่อ"`, `entityPath: '/settings'`, `appPath: '/settings'`). 404 if not in firm. Audit `M365_RECONNECT_REQUESTED`. Returns `{ notified: true }`. Simple per-process rate limit: same connection at most once per 10 minutes (409 Thai otherwise).
- **Auto-alert on break:** in `OutlookConnectionsService.markError`, when the status changes from `ACTIVE` to `EXPIRED`/`ERROR` (do the update with `updateMany({ where: { id, status: ACTIVE } })` to detect the transition atomically; if count 0, fall back to the plain update), notify the owner once with the same text as `remind` (actor `''`). Notification failure must never break markError. Watch for DI/module cycles (`OutlookIntegrationModule` already imports NotificationsModule via forwardRef — check how `CaseEmailNotifier` gets `AssignmentNotifierService`).
- Controller: new `OutlookAdminController` (`@Controller('outlook/admin')`, `JwtAuthGuard` + `FirmRoleGuard` + `RequireCapability('runOperations')`), service `OutlookAdminStatusService` in `apps/api/src/outlook-integration/`.
- Tests: health rules, humanizer, status shape + firm scoping + no secrets in output, remind (404, audit, rate limit), markError transition notifies once and only on ACTIVE→broken.

## Web (Task 2)
- New page `apps/web/src/app/(dashboard)/settings/microsoft-status/page.tsx`, linked from the settings `OFFICE_LINKS` card (label `สถานะ Microsoft 365`, capability `runOperations`, i18n keys th+en) and from `MicrosoftAccountsSection` as a small link for users who have `runOperations`.
- Layout (top → bottom):
  1. Summary row of 4 stat tiles: `เชื่อมต่อแล้ว {connected}/{members}`, `มีปัญหา {problems}` (red when > 0), `ยังไม่เชื่อมต่อ {notConnected}`, `อัปเดตล่าสุด {time}` + `รีเฟรช` button.
  2. **ต้องแก้ไข** (only when there are BROKEN/WARN connections or failing links): cards sorted BROKEN first: name + mailbox, red/amber badge, Thai reason, `ซิงก์ล่าสุด {relative time}`, `lastErrorThai`, raw error under a `รายละเอียด` disclosure, button `แจ้งให้เชื่อมต่อใหม่` (BROKEN only; in-flight disabled; success → `ส่งแจ้งเตือนถึง {name} แล้ว`; 409 → show the Thai message). Failing links listed under their connection (or a separate section) with `ownRef · caseTitle`, folder path, Thai error, and a link to the case email/documents tab (`/cases/{id}?tab=email` for OUTLOOK_FOLDER, documents tab for DRIVE_FOLDER — check `apps/web/src/lib/case-tabs.ts` keys).
  3. **ทุกบัญชี** table (mobile: stacked cards): name, mailbox, status badge (`ปกติ` green / `ควรตรวจ` amber / `หลุด` red), last sync, inbox-to-intake on/off, calendar on/off, folder links `n (ผิดพลาด m)`, OneDrive links n.
  4. **ยังไม่ได้เชื่อมต่อ** list of members (name, email) with a hint `ให้เข้า ตั้งค่า → Microsoft 365 → เชื่อมต่อ`.
  5. Footer help box `อีเมลไม่เข้า? ตรวจตามนี้`: 1) บัญชีของคนนั้นขึ้น "หลุด" ไหม → กดแจ้งให้เชื่อมต่อใหม่ 2) folder ผูกกับคดีหรือยัง (หน้า จับคู่ folder) 3) ซิงก์ล่าสุดนานเกิน 2 ชม. → กด ซิงก์ตอนนี้ ในหน้าตั้งค่าของเจ้าของบัญชี 4) ถ้า error ว่า "ไม่มีสิทธิ์เข้าถึง" → ผู้ดูแล Microsoft ขององค์กรต้องกด admin consent.
- States: loading skeleton, error + retry, 403 → `เฉพาะเจ้าของสำนักงานหรือผู้จัดการสำนักงาน`, all-good → green banner `ทุกบัญชีทำงานปกติ`.
- Relative times in Thai (`5 นาทีที่แล้ว`, `3 ชม.ที่แล้ว`, `2 วันที่แล้ว`, `ยังไม่เคยซิงก์`) — pure helper with a node test unless one already exists (grep first, reuse).

## Order
1. API (Task 1) → 2. Web (Task 2) → 3. review, focused tests, PR.

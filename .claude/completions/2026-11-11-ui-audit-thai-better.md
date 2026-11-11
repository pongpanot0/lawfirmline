# UI audit of the remaining pages (thai-translate + better-*) — 2026-11-11

Branch `claude/check-session-thai-ui-c52f0e` (uncommitted). Report + 31 Stitch mockups: https://claude.ai/artifact/9hEVtQzN58K4nUJVqHnBtV (Stitch project 394194744767221958, light design system `assets/566f2754…`; `assets/ae66…` renders dark).

- Scope: every web page PR #174 did not touch (~70 routes; cases/[id] and cases/new excluded — owned by the case-page-v2 session). Playwright captured 4 roles × desktop/mobile × every non-mutating action (~550 shots); 6 review batches → 73 HIGH / 167 MEDIUM / 101 LOW.
- Fixed (no layout change): Thai API errors at the root (`lib/api-error-message.ts`, `ApiError.serverMessage` keeps the raw text for code checks), shared `NoAccess` for permission-denied pages, confirms on firm-wide/AI actions (deadline-rule toggle, role change, AI re-read, reject proposal, merge email, accept portal submission), expired-link recovery, portal LINE toggle/success copy/submit validation, overdue + clash shown as text+icon, keyboard rows on /operations, timesheet labels, holidays/courts edit UI only for platform admins (API is PlatformAdminGuard), Outlook add-in no longer hangs outside Outlook, SearchHint, Lightbulb, "ผู้ช่วย AI".
- Proof: web tsc ✓, web tests 218/218 ✓ (3 new). Not run: E2E (court-day spec updated for the new "กลับไปวันของฉัน" link), live click-through of the fixes.
- Gotchas: the capture clicker mutated the shared local DB (10 deadline-rule overrides, 4 follow-ups + notifications — removed; e2e thread `e2e-thread-case-first` proposals changed + 1 OpenAI call — reseed before E2E). Local `.env` has a live LINE token and OpenAI key: skip-list any "ถาม/ส่ง/อ่านใหม่/ปิดสำหรับ" button in future crawlers. Agent tool: a hook appends a context block to prompts, so send the prompt without it and re-issue the hook's version once.
- Pending user decisions: approve mockups; ลูกความ vs ลูกค้า; merge dashboard+my-day / court-schedule+calendar / playbooks→sops; Thai names for SOP/Playbook/Handoff/v1; 8 vs 11 portal steps; in-app confirm dialog; PR #175 is not on main.

## Round 2 — mockups implemented (same day)
- All 31 approved Stitch mockups built (Terra per batch, Claude screenshot-diffed each page against its mockup at 1440/390 and sent fix rounds). Commits: team workload, งานวันนี้+ตารางนัด, portal, email/clients/docs/timesheet, manuals/task sets/handoff/portal requests, settings/admin, team/reports/brief/court-day, term pass (ลูกความ / ผู้ว่าจ้าง).
- API: `GET /clients` returns `openCaseCount`/`openTaskCount` (2 queries) — replaced a per-client overview fetch loop on /clients.
- E2E gotchas: specs hardcode web port 3005 (run the worktree web on 3005 and add it to API CORS_ORIGIN); `register` uses MailThrottle (5/10 min) and login AuthThrottle (10/min), so a multi-project run hits 429 — relax both locally for the run and revert. sop-ui spec had drifted on main since 2026-10-25 (labels) — fixed here.
- Not done before deploy (user asked to deploy first): the final full E2E rerun and the Cursor review.

## Round 3 — checks, follow-up PR, prod deploy
- #178 merged; follow-up #179 (Cursor findings: client backlog counts only open cases and unskipped steps; portal login 401 copy; e2e specs aligned to the new UI) merged as 56547e59 and deployed with `prod-20261111-thai-ui-mockups` (run 42998764012, success, no pending migrations).
- E2E: all branch-owned tests pass. Still failing, owned by other sessions: cases/[id] 'บันทึกผลหลังขึ้นศาล' + SOP combobox, cases/new 'สร้างคดี'/charge, practice-setup playbook apply (0 tasks).
- Not filed (outside this branch): portal 401 doesn't clear the session, CaseEmailPanel undo hidden after thread switch, UndoToast state carry-over, clients search race.
- Prod speed test blocked: the office FortiGate returns its 403 page for every samnuan.com path. Script: `.claude/prod-speed.mjs` (run on a hotspot).

## Round 4 — case info, clickable case cards, email back link, Thai copy pass
- Case page "ข้อมูลคดี" shows every field (empty ones say ยังไม่ได้กรอก + one "กรอกอีก n ช่อง" button; เปิดคดี uses the case's openedAt). Case list cards open the case anywhere (stretched title link; "ทำเลย" still goes to the next task). Email thread page: the queue dropdown is now "← กลับไปรายการอีเมล (n)".
- Thai copy review of the whole web app (5,598 unique strings, 4 chunks + a clarity pass) and 505 API error messages, with the thai-translate skill: ~880 replacements. Glossary decisions: SOP/Playbook → ชุดงานอัตโนมัติ, Notice → หนังสือทวงถาม, folder → โฟลเดอร์, ซิงก์ → ดึงอีเมล, Admin → ผู้ดูแลสำนักงาน, Owner → เจ้าของสำนักงาน, Own/Customer Ref → เลขอ้างอิงสำนักงาน/ผู้ว่าจ้าง; fallback errors end with "ลองใหม่อีกครั้ง"/"ลองโหลดหน้าใหม่". Kept หมายเลขคดีดำ/แดง, เลขา AI, เทมเพลต, แม่แบบ.
- Tool: SCRATCH/thai/apply.py replaces exact literals across web src, API src and e2e specs (keeps specs in step). Watch: substring assertions (toContainText) get the full new string — revert those to the shared prefix.

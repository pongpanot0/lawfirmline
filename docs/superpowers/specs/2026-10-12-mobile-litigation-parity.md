# Mobile litigation parity — requirements (2026-10-12)

Source: gap analysis after PR pongpanot0/lawfirmline#99 (office manager role, litigation correctness, task flow). The API endpoints already exist and are reviewed. This work is the Expo app (`apps/mobile`) only, plus tiny API tweaks if a mobile screen genuinely needs a field the API does not return.

## Who and where
Thai lawyers who use the phone INSTEAD of a computer at court (court-phone-first). Speed-first: 1–2 taps for the main action, cache-first load, optimistic updates where safe, one-hand use, readable outdoors, works on a flaky connection (show cached data; never lose typed input). All UI text Thai.

## Scope (all eight)
1. **Record court events from the phone** — filing (ยื่นฟ้อง), service (ส่งหมาย), judgment read (อ่านคำพิพากษา), appeal copy received (ได้รับสำเนาอุทธรณ์) via `POST /cases/:caseId/proceedings/{filing|service|judgment|appeal-served}`. Entry points: the case screen (per court level), and the court-day screen ("ศาลอ่านคำพิพากษาวันนี้" as a structured choice next to the free-text outcome). After recording, show what the system did (stage moved, deadlines suggested) in plain Thai.
2. **Confirm / dismiss deadline suggestions** (`/cases/:caseId/date-suggestions` list + confirm + dismiss). The push "วันครบกำหนดรอยืนยัน N รายการ" opens the case screen — that screen must show a "รอยืนยัน" section with one-tap ✓ / ✕ per item (date in Thai Buddhist calendar, rule label, legal basis, holiday-incomplete warning when present). Also surface the pending count where the lawyer looks first (home).
3. **"งานรอคุณตรวจ" on home for every eligible reviewer** — today only OWNER sees it (apps/mobile/app/(tabs)/index.tsx ~:220). Use the reviewer rule (named reviewer, else case lead; owner backstop) — the API `view=review` already returns the right list.
4. **Case screen shows limitation date and court numbers per level** — limitation deadline with days-left countdown and urgency colour; per court level (ศาลชั้นต้น / อุทธรณ์ / ฎีกา) black/red numbers and court name, current level highlighted. Must be readable offline from cache.
5. **Set / edit the limitation date on create and edit** — Thai date entry that blocks a half-typed or impossible date (same rule as web: all three parts or none; 31 Apr invalid), clear = intentional removal with confirmation.
6. **Approve / return document review rounds** — reviewers can see rounds waiting for them on a case (and from the notice), open the document version, approve or return with a reason.
7. **@mention in task comments** — pick people from a list while typing `@`; the API keeps only people who can open the task; show the hint 'แจ้งเตือนเฉพาะคนที่เปิดงานนี้ได้'.
8. **Court-fee and interest calculator** — uses `courtFee`, `simpleInterest`, `interestDays`, `DEFAULT_INTEREST_RATE` from `@lawfirm/shared`; prefilled from the case's claimed amount; labelled as an estimate with the items it does not cover.

## Rules that bind
- Reuse the mobile design system and components already in `apps/mobile/src` (theme tokens, FormSection, Dropdown, Disclosure, ErrorNote, Loading, etc.). No new UI dependencies unless one is truly needed.
- Permissions mirror the API: who may record proceedings, confirm suggestions, decide review rounds — hide actions the API would refuse (read the API guards).
- Mutations: disable the button while sending, refetch/invalidate the affected queries (case, my-day, todos, notifications), show API errors in Thai. Never optimistic-update a legal deadline.
- Dates: Bangkok calendar day; display Thai Buddhist year; deadlines due 16:30.
- Offline: case screen sections render from cached queries; actions that need the network say so instead of failing silently.
- Accessibility: touch targets ≥ 44pt, accessibilityLabel on icon buttons, readable contrast.
- Checks: `cd apps/mobile && pnpm exec tsc --noEmit` and the static checks in `apps/mobile/scripts/*.cjs`; pure logic goes in `apps/mobile/src/*.ts` (or `packages/shared`) with a static check. Memory limit: one tsc/test process at a time, no simulator unless the controller runs it.

## Decisions after mapping (binding) — answers to the design doc's open questions
Facts: docs/superpowers/specs/2026-10-12-mobile-parity-map.md. Screens: docs/design/2026-10-12-mobile-litigation-parity.md.
- D1 Home deadline count: add to the MyDay response (`GET` my-day, packages/shared/src/agenda.ts `MyDayResponse`) a `pendingDeadlineConfirms: { caseId, ownRef, title, count, nearestDate }[]` for PENDING date suggestions on live cases where the user is the case lead (firm-scoped; same visibility as the suggestion list). No new endpoint.
- D2 Document review rounds: add `GET /document-review/mine` (rounds in WAITING_REVIEW where the caller is a reviewer who has not decided; firm-scoped; returns round id, caseId, case ownRef/title, document id/filename, version number, dueAt, createdBy name) and a case filter `GET /cases/:caseId/review-rounds` (rounds on that case's documents, newest first, with my decision state). Decisions use the existing route. Mobile opens the reviewed version with the existing `download?version=<n>` (extend the mobile document opener to pass `version`).
- D3 Proceedings response stays `{ proceeding, suggestions: <count> }`; the mobile success message uses the count, then refetches case + suggestions and scrolls/highlights the new "รอยืนยัน" items. No stage text in the success message unless the refetched case stage changed (compare before/after).
- D4 Dismiss has no undo route → confirm before dismiss (Alert), no undo. Confirm is one tap (it only accepts the system date into the calendar) but the button is disabled while sending.
- D5 Date-suggestion API error messages → Thai (small API change, keep codes).
- D6 Notification deep links: `toAppRoute` keeps a section hint — `/cases/:id?tab=calendar` → `/case/:id?section=deadlines`, `?tab=documents` → `/case/:id?section=documents`, `?tab=comments` → `/case/:id?section=comments`; the case screen scrolls to / opens that section. Add a unit test in apps/api for toAppRoute.
- D7 Case screen offline: when a refetch fails but cached data exists, render the cached case with an "ออฟไลน์ · ข้อมูลล่าสุด <time>" note instead of the error state (fix case/[id].tsx:105 behaviour).
- D8 Proceeding/suggestion actions are allowed for anyone with case access (API has no role gate); mobile shows them to case members, hides them on CLOSED/ARCHIVED cases (API refuses with 'คดีปิดแล้ว').
- D9 Mention API does not report dropped people → keep the static hint 'แจ้งเตือนเฉพาะคนที่เปิดงานนี้ได้'; the picker lists only firm members with access to the task where the mobile already knows them (case team), else firm members.
- D10 No new dependencies (no expo-haptics, no toast lib); feedback via inline status + Alert per the design doc.

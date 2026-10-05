# Samnuan redesign — Stitch × Hallmark

Status: implemented shared system, locked in root `design.md` and `tokens.css`.
Date: 2026-10-05 (Asia/Bangkok).

## Product and audience

Samnuan is an existing Thai legal office operations product. Owners review work and assignments; lawyers handle matters, tasks, documents and court appointments; assistants coordinate work; clients submit information and follow progress in a separate portal. The public website explains the product and starts registration or a demo request.

The redesign covers the existing web routes and native mobile screens. Keep route ownership, authorization, actual data, validation, translation and submission behavior. Reuse the existing Next.js, Tailwind 3, shared controls, native theme and installed icons.

## Proposed shared visual system

- User direction: options 2 + 3 — a restrained luxury legal-office identity plus a compact dark working environment. One system with cream-light and navy-dark variants.
- Genre: modern-minimal for working screens; restrained editorial typography for the public product narrative.
- App family: functional Workbench — left navigation, compact page header, one action lane, task/case lists, optional detail panel. No marketing hero inside authenticated pages.
- Marketing family: product-led Long Document — explain the work using genuine product captures, varied sections and clear registration/demo actions.
- Content family: Long Document — readable measure, anchored contents and upright headings.
- Existing Samnuan Balance identity stays the anchor: navy `#142E43`.
- Light paper `#F7F4ED`; surface `#FFFDFA`; ink `#142E43`; secondary ink `#52616B`; rule `#DFE0DC`; quiet navy selection `#E8EDF0`.
- Dark paper `#101D2A`; surface `#172737`; ink `#F4F0E7`; secondary ink `#B1BEC9`; rule `#334657`; selection `#243C50`. Light cream primary buttons on dark surfaces; optional restrained brass `#8B6D32` is limited to small identity/rule details.
- Text-bearing semantic colors: overdue/error `#A83232`, complete `#227050`, review/court `#73520C`. Every status has a text label.
- Dark semantic text equivalents: error `#F1AAA5`, complete `#95D0AD`, review/court `#E3C790`. Proposed text/background pairs were calculated at 5.46:1 or greater; actual generated screens still require their own audit.
- App display and body: Noto Sans Thai plus Inter fallback on web, Anuphan headings and Thai-supporting system body on native. Public display and brand: existing Trirong, upright and moderately sized. No ornamental serif in dense tables or forms.
- 4-point spacing; small 8–12 px radii; 44 px/pt tap targets; hairline borders; little or no shadow; immediate visible keyboard focus.
- Navy filled primary button and quiet bordered secondary button; only one dominant primary action per action group. Specific Thai verbs, e.g. เพิ่มงาน, เปิดคดี, ส่งข้อมูล, ดูนัดศาล.
- Prefer row composition to repeated statistic cards. Counts are sourced from the app; unavailable counts show `—`.
- Motion: short color/opacity feedback; no screen entrance animation; respect reduced motion and native font scaling.
- The existing web dark-mode control switches complete light/dark semantic tokens. Show the dark desktop workbench and cream-light portal/public pages in the proposal. Native remains cream-light in initial mockups; a full native theme switch is a separate implementation decision, not an assumed new feature.

## Representative screens to generate in Stitch

Generate one coherent set, with the same typography, spacing, buttons and status language across the set. Use Thai labels. Any displayed cases, people, dates and counts are explicitly sample data; use generic placeholders, not real customers or legal records. Mark the presentation as a design preview.

1. **Desktop งานวันนี้** — date and compact page title; a flat summary strip; prioritized work queue with overdue and awaiting review groups; today's court/meeting agenda on the right; a small เพิ่มงาน action. Avoid a tile wall.
2. **Desktop คดีทั้งหมด** — grouped search/filter toolbar, visible active filters and a readable register. First scan shows own reference, title/client, stage/status, responsible lawyer and next action; secondary identifiers stay available through existing column controls or detail. A single เปิดคดี action.
3. **Desktop รายละเอียดคดี** — case identity and status; existing summary/tasks/calendar/documents/messages/billing sections as contextual tabs; main next-action/tasks area; optional facts/people rail. Existing case and intake boundaries remain.
4. **Desktop งานและการตรวจงาน** — task list with status groups, clear owners/deadlines/blockers, optional details pane. Reviewer actions are contextual. Optional assignment and date fields fold on task creation.
5. **Desktop นัดศาลและปฏิทิน** — date controls and month/week/list switching; court agenda rows with place, time, responsible people and preparation state. Do not invent location tracking.
6. **Client Portal** — client-specific shell, progress list and explicit next request. Show ส่งเอกสาร and ดูความคืบหน้า; do not expose internal staff notes, fees, or review discussions.
7. **Desktop authentication / short form** — clear identity, named fields, helper/error slot, one submit action and recovery link. No fake testimonial or invented security claim.
8. **Public product website** — Samnuan identity, a specific Thai product statement, genuine product screenshot space, legal office workflow explanation, existing pricing/registration/demo actions. Do not invent prices, logos or claims.
9. **Native วันนี้** — compact day header, critical tasks first, court appointments, optional owner decisions; stable five bottom tabs: วันนี้ / คดี / นัดหมาย / งาน / ทีม.
10. **Native คดี** — search and current filter; readable rows with reference, title, status and next step; no sideways table.
11. **Native วันขึ้นศาล** — event identity, time/court, existing preparation checklist, documents and contextual check-in/actions.

## Layout acceptance

- Web widths: 320, 375, 414, 768 and desktop. No root horizontal scroll; long Thai and reference strings wrap; clickable labels stay on one line.
- Native: corresponding narrow layouts and enlarged OS text. Do not confuse browser mockups with device proof.
- Table overflow stays inside its table region, or rows become mobile summaries while details remain reachable.
- Full keyboard operation, visible focus, labelled fields/icon buttons, text status labels, restrained contrast-safe colors.
- Loading, retry, empty, denied and submitting states remain explicit. Preserve validation and API error paths.
- No fake browser/phone frames, stock legal photography, gradients, invented metrics or ornament in app pages.

## Implementation mapping after system review

1. Lock the reviewed system in root `design.md` and portable `tokens.css`; map it to the existing HSL Tailwind 3 variables instead of changing frameworks.
2. Redesign `AppShell`, `SamnuanSidebar`, `TopNavbar`, `PortalShell`, `PortalSidebar`, `PageHeader` and existing UI primitives in place.
3. Apply the reviewed composition to daily work, case list/detail, tasks, calendars and forms, then all remaining staff routes. Review page-specific colors and CSS, not just inherited tokens.
4. Apply the same system to client portal and authentication; then adapt public landing styles within its existing ownership boundaries.
5. Update the native `src/theme.ts`, shared components and screen composition within the native app's existing system.
6. Verify type checks and existing relevant tests; visually inspect representative real flows and each narrow width. Do not report production deployment from design previews or local checks.

## Review boundary

The user authorized a full redesign using Stitch and Hallmark, selected directions 2 + 3, then explicitly confirmed every page. Those instructions authorize the shared cream/navy system and its implementation throughout the app. Existing route and component ownership are retained.

## Stitch provenance

- Project: [Samnuan Legal Operations Redesign](https://stitch.withgoogle.com/projects/394194744767221958).
- Generated directly in the user's signed-in Stitch editor from the screen brief above, with the user's selected direction 2 + 3.
- Scope inventory verified: 79 web page files and 41 native screen files; all 120 listed source paths exist.
- Generated composition set: six initial web screens plus desktop calendar/login and three native mobile references, with a separate wordmark. Twelve PNG/HTML screen exports and the generated design document were downloaded through Stitch.
- Preview data is generated and fictional. Rendered screens are proposals, not proof of connected APIs, responsive implementation, native-device behavior or deployment.

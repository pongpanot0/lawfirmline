# App feedback collector (ตัวเก็บ feedback การใช้งาน)

Decided in a grilling session on 2026-11-13. Goal: hear from staff how Samnuan works for them, per page and overall.

Out of scope: staff performance feedback, NPS, replying to/notifying the sender, client-portal feedback, trend charts, alerts to the dev team.

## Data

One table, `AppFeedback`:

| field | notes |
|---|---|
| `kind` | `BUG` · `SUGGESTION` · `OTHER` · `RATING` |
| `source` | `WEB` · `MOBILE` · `LINE` |
| `rating` | 1–3 (😞 😐 😊), only for `RATING` |
| `message` | required for BUG/SUGGESTION/OTHER, optional for RATING |
| `route` | route pattern (`/cases/[id]`), never a real id; null for LINE |
| `platform`, `appVersion` | captured automatically |
| `screenshot` | optional, one image, reuse the task-attachment upload path and `TASK_ATTACHMENT_MAX_BYTES` |
| `lineRoundId` | set for answers to a LINE round |
| `userId`, `firmId`, `createdAt` | automatic |
| `resolvedAt`, `resolvedBy` | same pattern as `ErrorLog` |

`AppFeedbackLineRound`: `sentAt`, `sentById`, `recipientCount`.

## 1. Report button (web + mobile)

- Web: profile (avatar) menu. Mobile: Me/Settings screen.
- Any logged-in firm member, any role.
- Form: type (บั๊ก / ข้อเสนอแนะ / อื่นๆ), message (required), one optional screenshot.
- Submit → toast "ได้รับแล้ว ขอบคุณครับ". Nothing further for the sender.
- `@Throttle` ~10/min per user, like the error-log ingest endpoint.

## 2. Per-page bar (web + mobile)

- Bottom bar, not a popup: "หน้านี้ใช้งานเป็นยังไง?" 😞 😐 😊 + close.
- Tapping a face opens the detail box at once, prompt by face:
  😞 "ตรงไหนที่ใช้ยาก หรือติดขัดอะไร?" · 😐 "อะไรที่ควรดีกว่านี้?" · 😊 "ชอบตรงไหน?". Optional.
- Shown from the 3rd visit to a page; same page at most once per 90 days per user (closing counts); at most one bar per day across the app. Counters live client-side (localStorage / AsyncStorage).
- All staff working pages (`(dashboard)` on web, main tabs/screens on mobile). Never on auth, onboarding, client portal, superadmin, or while a form/edit drawer is open.

## 3. LINE survey round

- A platform admin presses "ส่งแบบสอบถามทาง LINE" in superadmin, confirms the recipient count.
- Recipients: staff `User`s with `lineUserId`. Never `ClientContact`. Push per user via `LineMessagingService` (not the LINE Broadcast API, which would reach clients and lose who answered).
- Message: "การใช้งาน Samnuan ช่วงนี้เป็นยังไงบ้างครับ?" with quick-reply 😞 😐 😊 (postback carries the round id).
- After a tap: bot asks "อยากเล่ารายละเอียดเพิ่มไหม? พิมพ์ตอบได้เลย"; the next text within the 10-minute conversation session becomes that answer's message (new flow in `line-conversation-store`). After expiry, text goes back to the normal bot.

## API contract

Codebase facts this relies on: `ErrorLog` (`apps/api/src/error-log/`) is the pattern to copy; `PlatformAdminGuard` + `@SkipSubscription()` guard platform routes; `FileStorageService.put/openDownloadStream` stores files; LINE postbacks reach `LineBotRouterService.route()` as text; multi-step LINE state lives in `LineConversationStoreService` (10-minute in-memory sessions). The web superadmin page has no Error Log UI today, so its top tabs are **สำนักงาน** (the existing firm console) and **Feedback**.

Prisma:

```prisma
enum AppFeedbackKind { BUG SUGGESTION OTHER RATING }
enum AppFeedbackSource { WEB MOBILE LINE }

model AppFeedback {
  id             String            @id @default(uuid())
  kind           AppFeedbackKind
  source         AppFeedbackSource
  rating         Int?              /// 1 ใช้ยาก · 2 พอใช้ · 3 ใช้ง่าย — RATING only
  message        String?           @db.Text
  route          String?           /// pattern, e.g. /cases/[id]; null for LINE
  platform       String?           /// web | ios | android
  appVersion     String?
  screenshotPath String?
  screenshotMime String?
  lineRoundId    String?
  userId         String
  firmId         String?
  resolvedAt     DateTime?
  resolvedBy     String?
  createdAt      DateTime          @default(now())
  updatedAt      DateTime          @updatedAt
  user      User                  @relation(fields: [userId], references: [id], onDelete: Cascade)
  firm      Firm?                 @relation(fields: [firmId], references: [id], onDelete: SetNull)
  lineRound AppFeedbackLineRound? @relation(fields: [lineRoundId], references: [id], onDelete: Cascade)
  @@unique([lineRoundId, userId])
  @@index([createdAt])
  @@index([kind, createdAt])
  @@index([route, platform])
}

model AppFeedbackLineRound {
  id             String        @id @default(uuid())
  sentAt         DateTime      @default(now())
  sentById       String
  recipientCount Int
  answers        AppFeedback[]
}
```

Staff endpoint (`JwtAuthGuard`, `@SkipSubscription()`, any firm member):

- `POST /app-feedback` multipart: `kind`, `message?`, `rating?`, `route?`, `platform` (`web|ios|android`), `appVersion?`, file `screenshot?`. Rules: BUG/SUGGESTION/OTHER need a non-blank `message` ≤500; RATING needs `rating` 1–3, `message` optional ≤500, no screenshot; screenshot is png/jpeg/webp ≤10MB (no HEIC: most browsers can't show it in the admin drawer). `@Throttle` 10/min. Returns `{ id }`.

Platform endpoints (`JwtAuthGuard` + `PlatformAdminGuard`, `@SkipSubscription()`), prefix `/platform/feedback`:

- `GET /` `?status=open|resolved|all&kind=&firmId=&q=&cursor=&limit=` → `{ items: FeedbackItem[], nextCursor }`; RATING rows without a message are excluded. `FeedbackItem = { id, kind, source, rating, message, route, platform, appVersion, hasScreenshot, createdAt, resolvedAt, user: { id, name }, firm: { id, name } | null }`.
- `GET /summary` → `{ open }` (open = unresolved rows the list would show).
- `PATCH /resolve` `{ ids: string[], resolved: boolean }` → `{ count }`.
- `GET /:id/screenshot` → the image stream (`nosniff`, safe content type).
- `GET /pages` `?platform=&days=90` → `[{ route, platform, responses, bad, ok, good, comments }]`, RATING rows with a route, sorted by `bad/responses` desc then responses desc.
- `GET /pages/comments` `?route=&platform=&days=90` → latest 20 `{ id, rating, message, createdAt, user, firm }` with a message.
- `GET /line-rounds` → `{ recipients: { users, firms }, lastSentAt, rounds: [{ id, sentAt, recipientCount, answered, bad, ok, good, comments }] }`.
- `POST /line-rounds` → creates the round, pushes to every recipient, returns `{ id, recipientCount, delivered }`.

Recipients: `User` with `lineUserId` and at least one non-EXTERNAL `FirmMember`. Never `ClientContact`.

LINE: push text "การใช้งาน Samnuan ช่วงนี้เป็นยังไงบ้างครับ?" with quick-reply postbacks `fbk:<roundId>:<1|2|3>` labelled "😞 ใช้ยาก" / "😐 พอใช้" / "😊 ใช้ง่าย". A tap (any chat state, like the AI-confirm button) upserts the RATING row on `(lineRoundId, userId)`; unknown round → ignore. If the user has no other flow in progress, start an `APP_FEEDBACK` session and reply "ขอบคุณครับ 🙏 อยากเล่ารายละเอียดเพิ่มไหม? พิมพ์ตอบได้เลย หรือข้ามก็ได้ครับ"; the next text in that session becomes the row's message (≤500) and the bot replies "บันทึกแล้ว ขอบคุณครับ". With another flow in progress, save the rating and reply only "ขอบคุณครับ 🙏". Menu/cancel commands still win over the step.

## Mockups

Stitch project 394194744767221958; PNGs in `docs/design/2026-11-13-app-feedback/` (01–07). Background page content in the PNGs (nav names, sample rows, dates) is filler; only the feedback UI is the target.

Implementation notes from the mockup review (these override the PNGs):
- The per-page bar must never cover page controls: reserve bottom space while it is shown (02 overlaps the row "ทำเลย" buttons).
- Dismiss label is "ข้าม" on web and mobile; submit label is "ส่ง" on the bar/sheet, "ส่งความเห็น" on the full report form.
- Message limit 500 characters with the counter shown (01, 04).
- List filters (06): status segment · "ทุกประเภท" · "ทุกสำนักงาน" · search. The PNG shows two "ทุกสำนักงาน" selects by mistake.
- Muted hint text uses the existing muted token (6.30:1), not the lighter grey Stitch rendered.

## Superadmin — Feedback tab (next to Error Log)

1. **รายการ**: reports + ratings that have a message (bare ratings hidden). open/resolved with bulk mark, filter by kind and firm, open count.
2. **สรุปรายหน้า**: route · responses · 😞/😐/😊 share · platform, sorted by 😞 share; a row opens that page's comments.
3. **รอบ LINE**: send button with recipient-count confirm; per round: sent date · sent to · answered · 😞/😐/😊 share.

# Mobile litigation parity: code map (2026-10-12)

Read-only mapping for `docs/superpowers/specs/2026-10-12-mobile-litigation-parity.md`. Facts only, with `file:line`.
Paths: `API` = `apps/api/src`, `M` = `apps/mobile`, `S` = `packages/shared/src`, `WEB` = `apps/web/src`.
Branch/worktree: `claude/casefox-clio-features-35183a`. A design draft exists untracked at `docs/design/2026-10-12-mobile-litigation-parity.md` (answers to its open questions are in section C).

## 0. Facts that change the build (read first)

1. **Record endpoints return a count, not a description.** `POST .../proceedings/{filing|service|judgment|appeal-served}` return `{ proceeding, suggestions: number }` (`API/cases/case-proceedings.service.ts:204,221,287,316,327`). No stage, no suggestion labels. To show "what the system did", refetch `['case', id]` (stage, `stageChangedAt`) and `GET /cases/:id/date-suggestions`.
2. **Stage only moves forward, and only two events move it**: filing to `FILING`, judgment to `AWAITING_JUDGMENT`, both only when the case is earlier (`case-proceedings.service.ts:129-142,200,274`). Judgment never sets `APPEAL`/`SUPREME`. Service, appeal-served, PATCH numbers never change stage. Labels: `CASE_STAGE_LABELS_TH` (`S/index.ts:282`): `FILING`=ยื่นฟ้อง, `AWAITING_JUDGMENT`=รอคำพิพากษา, `APPEAL`=อุทธรณ์.
3. **No permission rule beyond case access.** Proceedings and date-suggestion routes use only `JwtAuthGuard + CaseAccessGuard` (`case-proceedings.controller.ts:16`, `date-suggestions.controller.ts:10`). Record routes additionally refuse CLOSED/ARCHIVED cases with `คดีปิดแล้ว` (`case-proceedings.service.ts:73-75`). "Hide what the API would refuse" therefore means: user can open the case (always true if the screen loads) and case status is not CLOSED/ARCHIVED.
4. **No legal-basis/citation field exists** on a suggestion. List rows carry `deadlineRule: { label, trigger }` only (`date-suggestions.service.ts:22`; schema `DeadlineRule` `apps/api/prisma/schema.prisma:1996-2022` has no citation column). Section numbers (ม.177, ม.229, ม.247, ม.237, ม.274) exist only as code comments in `S/agenda.ts:263-274`. RULE suggestions have `sourceExcerpt = null` (`deadline-rules.service.ts:249`).
5. **Date-suggestion errors are English** (see A2); mobile must map by status code. Proceeding errors: only `คดีปิดแล้ว` and the case-number DTO messages are Thai.
6. **No "rounds for a case" or "rounds for me" endpoint.** Only `GET /cases/:caseId/documents/:documentId/review-rounds` (per document). Case-wide path: `GET /cases/:id/documents` (each doc has `versions[]` with `status`) then per-doc rounds. User-wide path: `GET /agenda/actions` rows `kind=DOCUMENT_REVIEW` give `review:<roundId>`, filename, scope, due, url `/cases/<caseId>/documents` but **no documentId/versionId** (`API/agenda/action-center.service.ts:32-36,70`).
7. **Opening the reviewed version needs `?version=<int>`**; `openCaseDocument` (`M/src/api/files.ts:116-125`) has no version arg and caches to `${documentId}-${name}` (a newer download overwrites). `Document.storagePath` is the latest upload; a round pins `documentVersionId` (`documents.service.ts:618-643`, `document-review.service.ts:90-100`).
8. **Notifications do not carry sections.** `toAppRoute` drops the query, so `/cases/<id>?tab=calendar` becomes `/case/<id>` (`API/notifications/app-route.ts:6-9`). Deadline and doc-review notices all open plain `/case/<id>`. `notifyAssigned` accepts an explicit `appPath` override (`assignment-notifier.service.ts:24,140-141`) if an API tweak is wanted. The case screen only understands `?section=documents` (`M/app/case/[id].tsx:79,82`).
9. **Home review gating is three separate `isOwner` checks** in `M/app/(tabs)/index.tsx`: focus refetch `:137`, tile `:220` (inside a section gated `:216` by `isOwner || canLeave || canClaim`), and the tile routes to `/owner-decisions?view=review` whose review filter is also owner-only (`M/app/owner-decisions.tsx:21,24,27`). Non-owner reviewers already get an "รอฉันตรวจ" chip + up to 3 rows in "งานที่ต้องจัดการ" (`index.tsx:269-290`, rows shown only when `!owner` i.e. not OWNER/OFFICE_MANAGER, `:284`), and `useTodos('review')` is fetched unconditionally (`:123`).
10. **Mobile `CaseDetail` type lacks** `limitationDeadline`, `stage` and `proceedings`; it already types `courtLevel`, `courtName`, `blackCaseNumber`, `redCaseNumber`, `claimedAmount`, `participants`, `leadLawyer` (`M/src/api/types.ts:61-97`). The API already returns all of them on `GET /cases/:id` (full Case row + includes), so persisted caches may or may not have them depending on the API version at cache time; treat as optional.
11. **Task comments never send `mentionedUserIds` today** and there are two post sites (A6/B2). Members list for the picker already exists: `useMembers()` -> `GET /users/members` (id, firstName, lastName; non-EXTERNAL; no role filter).
12. **`CourtDayStateDto` is whitelisted** (`main.ts:66-70` `forbidNonWhitelisted`), so a judgment choice cannot be added to the court-day state without an API change. Use the separate `POST .../proceedings/judgment` call (`API/calendar/dto/court-day.dto.ts:33-68`). Court-day `complete` does not touch proceedings or the JUDGMENT trigger (grep of `court-day.service.ts` finds no JUDGMENT/proceeding use; it only fires `COURT_DATE` for a created next hearing).
13. **No NetInfo/onlineManager** is wired (`grep` in `M/app M/src` finds none). Offline = failed `fetch` (`TypeError: Network request failed`, English, thrown by `authenticatedFetch`, not wrapped by `api()` `M/src/api/client.ts:74-115`). Only `postMultipart` wraps it into Thai (`files.ts:33-36`).

## A. API contracts

Global: `ValidationPipe({ whitelist, transform, forbidNonWhitelisted })` (`API/main.ts:66-70`) - unknown body keys give 400. `SubscriptionGuard` always allows (`API/saas/guards/subscription.guard.ts`). `JwtAuthGuard` denies FirmRole.EXTERNAL unless `@AllowExternal` (`common/guards/jwt-auth.guard.ts:21-22`); mobile already blocks EXTERNAL (`M/app/_layout.tsx:104`). `CaseAccessGuard` (`common/guards/case-access.guard.ts:19-43`) reads `params.caseId ?? params.id ?? body.caseId`; 404 `Case not found`, 403 `You do not have access to this case` (both English). Case access rule `common/services/case-access.service.ts:24-61`: `viewAllCases` (OWNER, OFFICE_MANAGER) sees all; else lead or assignment or task assignee; SENIOR_LAWYER also cases led/assisted by LAWYERs; EXTERNAL none. Client `api()` joins array messages with ", " (`M/src/api/client.ts:105-107`).

### A1. Proceedings (`API/cases/case-proceedings.controller.ts`, `@Controller('cases/:caseId/proceedings')`, guards `JwtAuthGuard, CaseAccessGuard` `:15-16`)

| Route | Method | Handler | Body DTO (`dto/proceeding.dto.ts`) | Returns |
|---|---|---|---|---|
| `/cases/:caseId/proceedings` `:20` | GET | `list` `service:153` (works on closed cases, `openCase(...,true)`) | - | `CaseProceeding[]` sorted TRIAL, APPEAL, SUPREME (`proceeding-mirror.ts:101-105`) |
| `.../filing` `:25` | POST | `recordFiling` `service:170-205` | `RecordFilingDto :20-34` | `{ proceeding, suggestions:number }` |
| `.../service` `:30` | POST | `recordService` `service:207-222` | `RecordServiceDto :36-42` | `{ proceeding (current level row or null), suggestions }` |
| `.../judgment` `:35` | POST | `recordJudgment` `service:224-317` | `RecordJudgmentDto :44-63` | `{ proceeding, suggestions }`; repeat of same level+date returns `suggestions: 0` (`:287`) |
| `.../appeal-served` `:40` | POST | `recordAppealServed` `service:319-328` | `RecordAppealServedDto :65-68` | `{ proceeding: null, suggestions }` |
| `.../:courtLevel` `:45` | PATCH | `update` `service:158-168` | `UpdateProceedingDto :7-18`; path uses `ParseEnumPipe(CourtLevel)` | the `CaseProceeding` row |

DTO fields (class-validator):
- `RecordFilingDto`: `filedAt` `@IsDateString` required; `blackCaseNumber?` trim + `Matches(CASE_NUMBER_REGEX)` unless `''` (msg `หมายเลขคดีดำ: ${CASE_NUMBER_HINT}`); `courtName?` string max 200; `courtLevel?` enum (default = case current level, TRIAL if unset, `service:172`).
- `RecordServiceDto`: `servedAt` IsDateString; `method` enum `ServiceMethod` = `PERSONAL` รับเอง | `POSTED` ปิดหมาย (`S/agenda.ts:157-168`).
- `RecordJudgmentDto`: `courtLevel` enum required; `judgmentAt` IsDateString; `outcome` enum `JudgmentOutcome` WON ชนะคดี, LOST แพ้คดี, PARTIAL ชนะบางส่วน, DISMISSED ยกฟ้อง, SETTLED พิพากษาตามยอม (`S/litigation.ts:20-34`); `amount?` number max 2 decimals min 0; `redCaseNumber?` regex (msg `หมายเลขคดีแดง: ...`); `note?` string max 5000.
- `RecordAppealServedDto`: `servedAt` IsDateString.
- `UpdateProceedingDto`: `courtName?` max 200; `blackCaseNumber?`; `redCaseNumber?` (empty string allowed to clear).
- `CASE_NUMBER_REGEX = /^[ก-ฮ]{0,5}(?:\.|\s)?[0-9]{1,6}\/[0-9]{4}$/`, hint `รูปแบบต้องเป็น (ตัวอักษร)เลขที่/ปีพ.ศ. เช่น 123/2567 หรือ ผบ.1234/2567` (`S/validation.ts:16-18`).
- Date convention used by web: `new Date(\`${day}T00:00:00+07:00\`).toISOString()` (`WEB/components/cases/CaseProceedingsCard.tsx:32`).

Side effects: each record fires a deadline trigger BEFORE the save, outside the transaction (`service:44-52,179,212,248,323`): FILED (trial only rule), COMPLAINT_SERVED, JUDGMENT (`notify:false`), APPEAL_SERVED. They only create PENDING `DocumentDateSuggestion` rows. Filing/judgment with a changed date first delete the old PENDING RULE rows (`clearPending :116-126`); service and appeal-served never clear. Filing logs `FILING` activity and may advance stage; judgment logs `COURT_DATE` activity, may advance stage, and sends the lead a notice `บันทึกคำพิพากษาแล้ว — ครบกำหนดอุทธรณ์|ครบกำหนดฎีกา <date>` (`:303-315`, entityPath `/cases/<id>?tab=calendar`). The trigger notice for suggestions: `วันครบกำหนดรอยืนยัน N รายการ — คดี <ownRef>` + one line per label/date (`deadline-rules.service.ts:264-283`), sent to `leadLawyerId` only.
Default rules (`S/agenda.ts:263-274`): FILED(TRIAL) ขอให้ส่งหมายเรียกและสำเนาคำฟ้อง +7d; COMPLAINT_SERVED ครบกำหนดยื่นคำให้การ +15d (PERSONAL) / +30d (POSTED); JUDGMENT(TRIAL) ครบกำหนดยื่นอุทธรณ์ +1 month; JUDGMENT(APPEAL) ครบกำหนดยื่นคำร้องขออนุญาตฎีกาและฎีกา +1 month; APPEAL_SERVED ครบกำหนดยื่นคำแก้อุทธรณ์ +15d. Due time 16:30 Bangkok (`API/common/utils/bangkok-time.ts:126`).

`CaseProceeding` row (`schema.prisma:1303-1321`): `id, caseId, courtLevel, courtName, blackCaseNumber, redCaseNumber, filedAt, judgmentAt, judgmentOutcome, judgmentAmount (Decimal -> JSON string), judgmentNote, createdAt, updatedAt`. Web type notes the string (`WEB/lib/proceedings.ts:3-18`).

Errors: closed case 400 `คดีปิดแล้ว` (`service:74`); missing case 404 `Case not found` (`:72`); validation messages English except the two case-number messages; bad `:courtLevel` 400 from ParseEnumPipe.
Web reference UI: `WEB/components/cases/CaseProceedingsCard.tsx` (success copy `บันทึกแล้ว — เสนอวันครบกำหนด N รายการ ตรวจและยืนยันที่แท็บไทม์ไลน์` `:91-93`).

### A2. Date suggestions (`API/intelligence/date-suggestions.controller.ts`, `@Controller('cases/:caseId/date-suggestions')`, guards `JwtAuthGuard, CaseAccessGuard` `:9-10`)

| Route | Method | Notes |
|---|---|---|
| `/cases/:caseId/date-suggestions?status=` `:14-17` | GET | `listForCase` `service:17-42`; `status` default `PENDING`; value is NOT validated (a non-enum value would hit Prisma); order `createdAt desc` (not by date) |
| `.../:id/confirm` `:19-27` | POST | body `ConfirmDateSuggestionDto` (`dto/date-suggestion.dto.ts:4-29`); returns the updated suggestion row (status CONFIRMED, `calendarEventId`, `reviewedById`, `reviewedAt`) |
| `.../:id/dismiss` `:29-36` | POST | no body; returns updated row (status DISMISSED). Not reversible: only PENDING rows can be actioned (`service:44-53`) and no restore route exists |

Row shape (`DocumentDateSuggestion`, `schema.prisma:1959-1990`) plus extras added by list: `id, caseId, documentId, label, suggestedDate (ISO instant), eventType (default DEADLINE), sourceExcerpt (null for RULE), source ('DOCUMENT'|'RULE'), deadlineRuleId, triggerEventId, status, calendarEventId, createdById, reviewedById, reviewedAt, createdAt, updatedAt, deadlineRule:{label,trigger}|null, dueYear:number, holidayDataIncomplete:boolean`. `holidayDataIncomplete` = RULE source AND due year (Bangkok) <= next year AND that year has < 19 holidays in `PublicHoliday` (`service:25-41`, `API/holidays/holiday-coverage.ts:5-40`). Web type: `WEB/lib/api.ts:3396-3415`.

Confirm DTO: `expectedUpdatedAt?` IsDateString; `label?` string; `date?` IsDateString; `eventType?` enum; `assigneeId?` UUID; `reminderMinutes?` int[]. Rules in `service:55-100`: if `triggerEventId` is set (calendar-triggered) `expectedUpdatedAt` is REQUIRED and must equal `suggestion.updatedAt.toISOString()` else 409; manual/proceeding-derived rows (`triggerEventId` null) need nothing. Safe default for mobile: always send `expectedUpdatedAt: item.updatedAt`. `source==='DOCUMENT'` requires `assigneeId` (400). If `assigneeId` is sent it must be an ADMIN/LAWYER user who is OWNER/SENIOR_LAWYER/LAWYER in the firm (`:70-81`). Confirm creates a calendar event via `CalendarService.createInternal(..., tx)` (type = suggestion eventType, title = label, start = `date ?? suggestedDate`, default reminders `[4320,1440,60]` minutes `calendar.service.ts:149`).

**Who may confirm/dismiss**: any user passing `CaseAccessGuard` (no role or lead check). Pending list covers every pending row in the case regardless of who it was addressed to; only the lead gets the push (`deadline-rules.service.ts:272`).

Errors (all English): 404 `Date suggestion not found` (`:47`); 409 `Date suggestion is no longer pending` (`:50`); 409 `Date suggestion changed; review it again` (`:65`); 409 `Date suggestion source changed; review it again` (`:111`); 400 `Select a responsible lawyer for this date` (`:68`); 400 `Responsible lawyer is not in this firm` (`:80`).

Home count: no per-user endpoint. `GET /agenda/actions` returns `DATE_REVIEW` rows (id `date:<suggestionId>`, title=label, `detail`=sourceExcerpt, `dueAt`=suggestedDate, url `/cases/<caseId>/calendar`) for every PENDING suggestion on active cases the caller can access, cap 50 (`action-center.service.ts:28-31,69,76`; `limited` flag true when any group hits 50). `GET /ai-tray` `PENDING_DATES` counts only `source=DOCUMENT` (`API/ai-tray/ai-tray.service.ts:38-42`). Mobile already loads actions on home (`M/app/(tabs)/index.tsx:112`, `useActions` `hooks.ts:194-199`).

### A3. Review queue, MyDay, dashboard

| Endpoint | Guard | Returns |
|---|---|---|
| `GET /todos?view=all|mine|created|review` (`API/tasks/todos.controller.ts:9-17`, service `tasks.service.ts:437-470`) | `JwtAuthGuard`; other `view` -> 400 `Unknown task view` | array of board items |
| `GET /agenda/my-day` (`API/agenda/agenda.controller.ts:19-24`, `agenda.service.ts:91-119`) | `JwtAuthGuard`, `@SkipSubscription` | `MyDayResponse` `{ today, overdue, todayItems, tomorrow, upcoming, warnings, reviewQueue }` (`S/agenda.ts:86-95`) |
| `GET /dashboard/stats` (`API/dashboard/dashboard.controller.ts:17-21`, `dashboard.service.ts:201-214`) | `JwtAuthGuard` | `{ firmId, firmName, role, stats:{totalCases, openCases, upcomingEvents, overdueTasks, myTasks, pendingExpenses, approvedExpenses, monthlyRevenue, totalNetProfit}, caseProfits, activeTasks, reviewQueue (take 8), recentCases, upcomingHearings, pendingReimbursements }` |
| `GET /agenda/actions` (`agenda.controller.ts:15-17`) | `JwtAuthGuard` | `{ items: ActionItem[], limited }` kinds incl. `DATE_REVIEW`, `DOCUMENT_REVIEW`, `TASK` (`action-center.service.ts:66-76`) |

Reviewer rule for the queue (`API/tasks/review-queue.ts:4-19`): status `PENDING_REVIEW`, in my firm, assignee is not me, AND (`reviewerId = me` [case not deleted] OR (`reviewerId IS NULL` AND `case.leadLawyerId = me`)). **No owner backstop in the list.** The act rule (`assertReviewer` `tasks.service.ts:241-247`, mirrored by `S/task-review.ts:27-35 canActOnReview`) does have it: OWNER may act on a case task with no named reviewer; OFFICE_MANAGER never; assignee never. Thai errors: `ผู้ทำงานตรวจงานของตัวเองไม่ได้`, `เฉพาะผู้ตรวจของงานนี้เท่านั้น`.
`view=review` item fields: Task scalars + `assignee{id,firstName,lastName,email}`, `createdBy`, `reviewer`, `onHold{reason,endedAt}`, `comments[0]` (latest: id, body, createdAt, author), `case{id, ownRef, title, blackCaseNumber, redCaseNumber, leadLawyerId, leadLawyer}`, `handedOffById`, `subtaskCount`, `subtaskDoneCount`, `attachmentCount`, `commentCount` (`tasks.service.ts:103-118,437-470`). Mobile type `TaskItem` (`M/src/api/types.ts:99-133`).
`ReviewQueueItem` (`S/agenda.ts:98-107`): `id, title, caseId, caseRef (=case.ownRef), caseTitle, workerName, submittedAt, dueDate`; ordered oldest `submittedAt` first (`review-queue.ts:46-47`); my-day take 20 (`agenda.service.ts:100`). Mobile does not read `myDay.reviewQueue` anywhere.

### A4. Case detail, create, update

`GET /cases/:id` (`API/cases/cases.controller.ts:47-51`, guards `JwtAuthGuard, RolesGuard, CaseAccessGuard`; `cases.service.ts:193-236`). Returns the full Case row plus includes (`caseInclude :75-124` + `:201-232`): `leadLawyer{id,firstName,lastName,email}`, `caseType{id,name}`, `client{id,name,contacts[]}`, `cargoClaim{id}`, `participants[]` (all CaseParticipant scalars incl. idNumber, address, phone, email), `proceedings[]` ordered TRIAL, APPEAL, SUPREME (`:84`, detail only; list `GET /cases` strips it `:179`), `intake{...}`, `relatedIntakes`, `customers[]`, `additionalClients[]`, `assignments[{ ..., user{id,firstName,lastName,email,role} }]`, `_count{tasks,documents}`, `tasks[]`, `calendarEvents[10]`, `activities[20]`, `insuranceClaim`.
Scalar fields the UI needs (`schema.prisma:904` Case model): `limitationDeadline DateTime?` (:935), `courtName` (:922), `courtLevel CourtLevel?` (:923), `blackCaseNumber` (:924), `redCaseNumber` (:925), **`claimedAmount Float?` (:932)**, `stage` (:913), `stageChangedAt`, `partyRole`, `status`, `leadLawyerId` (:944), `limitationEventId`. Case-level court/numbers are a mirror of the current level's proceeding (`currentLevel = courtLevel ?? TRIAL`, `proceeding-mirror.ts:11-15`; spec comment `schema.prisma:1302`). Proceeding rows exist only for levels that were snapshotted/recorded, so the list can be empty while `courtName/blackCaseNumber` on the case are set.

`limitationDeadline` semantics:
- Stored as an instant. Web sends `YYYY-MM-DDT00:00:00+07:00` ISO (`WEB/lib/case-create.ts:8-10`), i.e. 00:00 Bangkok. Server derives the Bangkok day with `bangkokDayKey` and schedules the reminder at 16:30 that day (`API/common/limitation-reminder.ts:72-73`, `courtCloseAt`). Display with `thDate`/`bangkokDay` (both +7h shift) to get the right day.
- Create: `CreateCaseDto.limitationDeadline?` `@IsOptional @IsDateString` (`dto/case.dto.ts:187-190`); falsy -> not stored (`cases.service.ts:450`); reminder synced `:470`.
- Update: `UpdateCaseDto.limitationDeadline?: string | null` `@IsOptional @IsDateString` (`:315-318`). `undefined` = untouched; **`null` clears** and deletes the reminder; `''` fails IsDateString (400, English). Service `cases.service.ts:576-581`; reminder re-sync whenever the key is present `:663-665` (resets already-sent reminders), so send it only when changed (web `limitationPatch` `WEB/lib/case-overview.ts:7-10`).
- The reminder event is auto-removed once the case counts as filed (black number, or a proceeding with filedAt/black/judgment) or is closed (`limitation-reminder.ts:57-67`); the stored deadline stays.
- Web countdown: `max(0, ceil((deadline - now)/86400000))` (`WEB/lib/case-workbench.ts:53-58`), which hides overdue; server day helpers `bangkokDayDiff` (`bangkok-time.ts:51-56`).

`POST /cases` (`cases.controller.ts:59-63`): `@Roles(ADMIN, LAWYER)`; RolesGuard lets firmRole OWNER pass the ADMIN requirement (`common/guards/roles.guard.ts:19-20`). `CreateCaseDto` (`dto/case.dto.ts:72-205`): required `title`, `courtLevel` (`@IsEnum(CourtLevel)` `:135-136`), `leadLawyerId` (UUID `:159-160`); optional `claimedAmount` (number, 2 decimals, 0..FEE_MAX `:181-185`), `blackCaseNumber/redCaseNumber` (regex or ''), `courtName`, `partyRole`, `opponents[]`, `buddyIds[]`, `caseTypeId`, `clientId`, `conflictOverrideReason` (409 `CONFLICT_FOUND` flow). Mobile already always sends `courtLevel` (default 'TRIAL', `M/app/case/new.tsx:40,75`).
`PATCH /cases/:id` (`:65-73`): only `CaseAccessGuard` (no role gate). `UpdateCaseDto` (`:207-323`): everything optional; `courtLevel?` enum (`:253-255`); `claimedAmount?: number|null` (`:309-313`); `blackCaseNumber/redCaseNumber?: string|null` regex unless ''; `leadLawyerId` needs capability `reassignCaseLead` (OWNER) else 403 English `Only owners can reassign the case lead lawyer` (`cases.service.ts:542-543`). Thai errors: `เลขคดีนี้ถูกใช้กับคดีอื่นในสำนักงานแล้ว กรุณาใช้เลขอื่น` (`:46`), `เปลี่ยนระดับศาลแล้วบันทึกก่อน แล้วจึงแก้เลขคดีของศาลชั้นนั้น` (`:59`, numbers typed while switching level), `ใช้ปุ่มปิดคดี`, `ใช้ปุ่มเปิดคดีอีกครั้ง`, `ย้ายขั้นตอนย้อนกลับต้องระบุเหตุผล`. Response: `updated` row with `caseInclude` (no tasks etc.), or a full `findOne` re-read when proceedings/parties synced (`:666-669`).
Per-level numbers should be edited with `PATCH /cases/:caseId/proceedings/:courtLevel` (A1), not `PATCH /cases/:id`.

### A5. Document review rounds (`API/document-review/document-review.controller.ts`, `@Controller('cases/:caseId/documents/:documentId/review-rounds')`, guards `JwtAuthGuard, CaseAccessGuard` `:9-10`)

| Route | Method | Notes |
|---|---|---|
| `.../eligible-members` `:14` | GET | `{id,firstName,lastName,email}[]`: lead + case assignees + OWNERs (`service:35-56`) |
| `.../` `:19` | GET | `listForDocument` `service:68-74`: all rounds of that document, `createdAt desc`, include `decisions` + `documentVersion{...,document{filename}}`; **no per-case or per-user list exists** |
| `.../` `:24` | POST | create round: `CreateReviewRoundDto` (`documentVersionId`, `reviewerIds[]` non-empty, `editorIds?`, `approvalRule?` ALL|ANY_ONE, `scope?`, `dueAt?`); reviewers must be eligible members (`service:58-66`) |
| `.../:roundId` `:34` | GET | `getReviewRound` `service:125-132`; 404 `ไม่พบรอบตรวจนี้` |
| `.../:roundId/decision` `:43` | POST | `recordDecision` `service:140-207` |

Round shape (`schema.prisma:2539-2558`): `id, documentVersionId, reviewerIds[], editorIds[], approvalRule, scope, dueAt, status (WAITING_REVIEW|RETURNED|APPROVED|CANCELLED), createdById, createdAt, decisions[{id, reviewRoundId, reviewerId, decision APPROVED|RETURNED, reason, decidedAt}], documentVersion{id, documentId, version:int, filename, mimeType, status DRAFT|WAITING_REVIEW|RETURNED_FOR_CHANGES|APPROVED|SUPERSEDED, notes, createdAt, document{filename}}`. Reviewer names are not included (use `useMembers()` or eligible-members). Web type `WEB/lib/api.ts:1168-1190`.
Decision DTO `ReviewDecisionDto` (`dto/document-review.dto.ts:27-41`): `action` `'approve'|'return'`; `reason?` string (required for return, trimmed check `service:169`); `reviewedDocumentVersionId` required string (send `round.documentVersionId`). Order of checks (`service:147-171`): not in `reviewerIds` -> 403 `คุณไม่ได้อยู่ในรายชื่อผู้ตรวจของรอบนี้`; I already decided -> returns the round unchanged (idempotent, even if I now send the opposite action); round not WAITING_REVIEW -> 400 `รอบตรวจนี้ปิดแล้ว`; version id mismatch -> 400 `เอกสารถูกแก้เป็นฉบับใหม่ระหว่างที่เปิดหน้านี้ กรุณาเปิดฉบับล่าสุดก่อนตรวจ` (web matches on the substring `ฉบับใหม่` `WEB/app/(dashboard)/cases/[id]/documents/[documentId]/review/page.tsx:167`); return without reason -> 400 `กรุณาระบุเหตุผลที่ส่งกลับแก้ไข`. Return closes the round (RETURNED) at once; approve closes when `ANY_ONE` or all reviewers approved (`:192-204`). Returns the refreshed round. The round creator is notified (`notifyRoundClosed :209-226`).
**Who may decide**: only user ids in `round.reviewerIds` who also pass `CaseAccessGuard`. Mobile test = `round.status==='WAITING_REVIEW' && round.reviewerIds.includes(user.id) && !round.decisions.some(d=>d.reviewerId===user.id)`; the Action Center uses the same filter (`action-center.service.ts:32-36`).
Open the document: `GET /cases/:caseId/documents/:documentId/download?version=<int>` (`API/documents/documents.controller.ts:113-132`; `version` is the integer `DocumentVersion.version`, parsed with `parseInt`; omitted = latest). Guard: case access. Streams bytes with `Content-Disposition`. List: `GET /cases/:caseId/documents` (`:39-42`, `documents.service.ts:148-168`) -> `Document` + `uploadedBy` + `versions[]` (desc by version; each has `id, version, filename, mimeType, status`). Mobile fetches this already for the documents tab as `['case-documents', id]` (`M/app/case/[id].tsx:98-102`) typed only `{id, filename, version, updatedAt}`.
Notices: round created -> `📝 ขอให้ตรวจเอกสาร: <filename>` (+ `กำหนด: <date>`) to reviewers, entityPath `/cases/<id>` (`service:114-121`), appPath derived -> `/case/<id>`.

### A6. Task comments

- `POST /tasks/:taskId/comments` (`API/tasks/task-detail.controller.ts:74-81`; class `@Controller('tasks/:taskId')`, `JwtAuthGuard` only `:33-34`; access decided by `TasksService.assertAccess` `tasks.service.ts:188-215`).
- `CreateTaskCommentDto` (`dto/task-detail.dto.ts:22-33`): `body` string length 1..4000; `mentionedUserIds?` array max 20 of UUID (`IsUUID('all')`).
- Server keeps only mentioned users that are firm members (non-EXTERNAL) who pass the same `assertAccess` as opening the task, dedupes, drops the author, caps 20 (`task-detail.service.ts:373-375`, `tasks.service.ts:147-162`). Result stored in `TaskComment.mentionedUserIds` (`schema.prisma:1471-1485`) and **the created comment is returned** (`:377-380,413`) with `author`. So dropped mentions are detectable client-side: `requested.filter(id => !response.mentionedUserIds.includes(id))`. Mentioned users get a COMMENT notice `💬 มีคนกล่าวถึงคุณในงาน "<title>"\n<first 200 chars>` with `appPath /task/new?id=<taskId>` (`:389-399`).
- Comments are listed in `GET /tasks/:id` (`task-detail.service.ts:55-95`, `comments` asc with `author`); `kind` is `COMMENT` or `DAILY_UPDATE`.
- Web reference: `WEB/lib/mentions.ts:1-13` (`getMentionContext`, `mentionedIdsIn` - keeps ids whose `@FirstName` is still in the body), picker in `WEB/components/tasks/TaskDetailDrawer.tsx:307-310,742-758`.
- Mobile posts today at two sites, both `body` only: `M/src/components/TaskWorkView.tsx:243` (button "บันทึกข้อความ", field "บันทึกเพิ่มเติม" `:241-242`) and `M/app/task/new.tsx:329-337` (field "เพิ่มความคิดเห็น", button "ส่งความคิดเห็น"; invalidates `['task',id]`, `['todos']`, `['daily-workboard']`).
- People list: `GET /users/members` (`API/users/users.controller.ts:37-40`, `users.service.ts:97-103`): `{id, firstName, lastName}[]`, non-EXTERNAL members of the firm, any role; mobile hook `useMembers` `M/src/api/hooks.ts:538-540` (key `['members']`). `/users/lawyers` (`useLawyers`, key `['lawyers']`, staleTime 10 min `hooks.ts:208-214`) includes `firmRole` but only ADMIN/LAWYER legacy roles.

### A7. Shared calculators and date helpers

`S/litigation.ts` (exported via `S/index.ts:1055`; `packages/shared/dist/litigation.js` is built in this worktree):

| Export | Signature | Doc/behaviour |
|---|---|---|
| `COURT_FEE_NON_MONEY` `:64` | `const = 200` | คดีไม่มีทุนทรัพย์ 200 บาท |
| `courtFee` `:72-80` | `(amount: number \| null): number` | baht; `null` = non-money claim -> 200; non-finite -> `0` (callers show "—"); integer-satang math; first 50,000,000 at 2% capped 200,000; excess at 0.1%; fractions of a satang round up |
| `DEFAULT_INTEREST_RATE` `:83` | `const = 5` | percent per year; ป.พ.พ. ม.224 (แก้ไข 2564): 3% ตาม ม.7 + 2% |
| `simpleInterest` `:86-88` | `(principal, ratePercent, days): number` | `round(principal*rate/100*(days/365)*100)/100` |
| `interestDays` `:91-94` | `(fromDay: string, toDay: string): number` | `YYYY-MM-DD` to `YYYY-MM-DD`, UTC-midnight difference, `0` when `toDay` earlier or unparsable |

Doc comment `:53-63`: table 1 ป.วิ.พ. (พ.ร.บ. ฉบับที่ 24 พ.ศ. 2551), appeal and ฎีกา use the same table on the amount in dispute; "Not covered: mortgage/arbitral-award items and คดีมโนสาเร่" and note that the official krisdika.go.th source was unreachable on 2026-10-12 and must be re-verified. Web copy to reuse for the "estimate/not covered" label: `WEB/components/cases/LitigationCalculatorsCard.tsx:36-41,58-62` (prefill from `claimedAmount` `:14-15`, default rate `:16`, end day defaults to today `:19`).
**Shared has no Thai/Buddhist/Bangkok date helpers.** Only inline `Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Bangkok'})` inside `S/task-operations.ts:73,77,91,115` (not exported). Web has pure helpers: `WEB/lib/thai-date.ts` (`partsToIso`, `isInvalidParts`, `isPartialParts`, `parseIsoParts`, `daysInMonth`, `MIN_BE_YEAR=2500`) and `WEB/lib/bangkok.ts` (`bangkokDateInputToIso` etc.); API has `API/common/utils/bangkok-time.ts` (`bangkokDayKey :22`, `bangkokDayDiff :51`, `courtCloseAt :126`, `formatBangkokDateThai :80`).

## B. Mobile app (`apps/mobile`, Expo SDK 56, expo-router, React Query 5)

### B1. Data layer

- Path alias `@/*` -> `src/*` (`M/tsconfig.json`). Only one hooks file: `M/src/api/hooks.ts` (658 lines). Types: `M/src/api/types.ts` (290 lines).
- `api<T>(path, init)` `M/src/api/client.ts:88-115`: JSON in/out, adds `Content-Type`, bearer token, one refresh on 401 (`authenticatedFetch :74-86`, single-flight `:50-72`). Error: `ApiError(status, message, body)` `:17-25`; message = `body.message` string, or array joined with ", ", else `HTTP <status>` (`:100-111`); 204 returns undefined `:113`. Network failure throws a raw `TypeError` (not an `ApiError`). Base URL `EXPO_PUBLIC_API_URL ?? https://api.samnuan.com` `:10-11`. Binary/multipart helpers in `M/src/api/files.ts` (`postMultipart :22-48` maps failures to Thai; `downloadFile :50-58`; `openCaseDocument :116-125`; `openTaskAttachment :77-81`).
- Types in play: `CaseListItem :61-71`, `CaseParticipant :73-82`, `CaseDetail :84-97` (has `courtLevel`, `claimedAmount`, `redCaseNumber`, `partyRole`, `participants`, `leadLawyerId`, `assignments`; **missing** `limitationDeadline`, `stage`, `proceedings`), `TaskItem :99-133` (has `comments[]`, `reviewer`, `case.leadLawyerId`), `CalendarEventItem :135-149` (`courtEventKind`), `CourtDayState :173-191`, `CourtDayResponse :193-205`, `DashboardStats :44-59` (no `reviewQueue`), `AppNotification :275-284`. `MyDayResponse`, `AgendaItem` re-exported from shared `:6`. No types exist yet for proceedings, date suggestions, review rounds, comment responses.
- Hooks (key -> endpoint): `useMyDay ['my-day']` `:27-32`; `useDashboardStats ['dashboard-stats']` `:34-39`; `useCases ['cases', search]` `:41-49`; **`useCase ['case', id]` -> `GET /cases/:id`** `:51-57` (enabled when id); `useCaseTasks ['case-tasks', caseId]` `:59-65`; `useCalendarRange ['calendar', from, to]` `:67-73`; **`useTodos(view, enabled) ['todos', view]` -> `GET /todos?view=` (views all|mine|created|review)** `:75-81`; `useDailyWorkboard ['daily-workboard', date]` `:83-89`; `useToggleTask` (optimistic on `['todos']`, rollback, invalidates todos/daily-workboard/my-day) `:96-127`; `useActions ['actions']` -> `GET /agenda/actions` `:194-199`; `useLawyers ['lawyers']` `:208-214`; `useReassignTask` `:216-244`; `useMembers ['members']` -> `GET /users/members` `:538-540`; `useCourtDay ['court-day', eventId]` `:459-465`; `useSaveCourtDay` (PATCH, invalidates court-day) `:467-478`; `useCompleteCourtDay` (invalidates court-day, my-day, calendar, case-events, case-tasks, expenses) `:564-576`; notifications `useNotificationInbox ['notifications']` (infinite, cursor) `:579-589`, `useUnreadNotifications ['notifications-unread']` (60 s poll) `:591-597`, `invalidateNotifications` (notifications, notifications-unread, actions) `:600-604`; optimistic-with-rollback example `useUpdateNotificationPreference :629-657`.
- Query keys used directly in screens: `['case-events', id]` (`GET /calendar/events` then filter by caseId client-side, enabled only on the "นัดหมาย" tab) `M/app/case/[id].tsx:90-97`; `['case-documents', id]` (`GET /cases/:id/documents`, enabled only on the "เอกสาร" tab) `:98-102` (same key reused with other generics in `court-day/[eventId].tsx:48-52`, `TaskWorkView.tsx:59-60`, invalidated in `case/new.tsx:88`); `['task', id]` (`GET /tasks/:id`) `app/task/new.tsx:34`; `['insurance-claim', caseId]` `hooks.ts:380-386`.
- Typical mutation invalidation: `todos`, `my-day`, `daily-workboard`, `workload`, `actions`, `case`, `case-tasks` (see `TaskWorkView.refresh :69-74`, `case/new.tsx:86-89`, `useCompleteCourtDay`).
- Cache/offline setup `M/app/_layout.tsx:22-46`: `QueryClient` defaults `staleTime 60 s`, `gcTime 7 d`, `retry 1` (`:26-34`); `PersistQueryClientProvider` with `createAsyncStoragePersister` key `mobile-cache:${firmId}:${userId}:${firmRole}` and `maxAge 7 d` (`:36-44`), no `buster`, default dehydrate (successful queries, all keys, infinite queries too). Session subtree remounts on user/firm/role change (`:143-147`). Local-only query uses `networkMode:'always'` (`app/(tabs)/index.tsx:130`). No NetInfo/onlineManager/focusManager wiring (`grep` finds only AppState in `settings.tsx:60`, `LockGate.tsx:63`).
- **Cached-data gotcha**: `app/case/[id].tsx:105` renders `ErrorNote` whenever `caseQuery.isError`, even when cached `data` exists (React Query keeps data on a failed refetch), so an offline refetch hides the cache. Same shape at `app/case/new.tsx:98`. Court-day does it correctly (`court-day/[eventId].tsx:75,158`: gate on `!data`, show inline ErrorNote).
- Push tap routing: `url` in the push payload is pushed as-is (`_layout.tsx:93-99`); inbox rows use `AppNotification.appPath` (`notifications.tsx:90-93`); action rows use `actionAppRoute` (B6).

### B2. Screens to change

**`M/app/case/[id].tsx` (486 lines)** - single `ScrollView` (`:118-411`) + `ReassignSheet` (`:412`).
- Order: `Stack.Screen` title = `ownRef` `:117`; case title `:128`; `Disclosure "จัดการคดีและผู้รับผิดชอบ"` (edit button `/case/new?id=`, close/reopen/archive for OWNER|ADMIN|LAWYER) `:129-138`; segmented tabs `TABS = ['ภาพรวม','นัดหมาย','งาน','เอกสาร']` as local state (no routes) `:33,82,139-153`; overview `Card` with `InfoRow`s: สถานะ `Tag` `:157-161`, คนหลัก `:163-171`, คนรอง `:172-175`, ลูกความ `:176`, เราเป็น `:177`, ศาล `:178`, เลขคดี (black / red of the case mirror, joined) `:179-184`, ทุนทรัพย์ `claimedAmount` `:185-192`, เปิดคดี `:193`, description `:194-201`; participants `Card` `:203-217` (routes `/case/${id}/party`); insurance `Card` `:221-241`; นัดหมาย tab `:243-283`; งาน tab `:285-342`; เอกสาร tab `:344-410` (template, waiting list, scan, documents list opening via `openCaseDocument` `:373-385`).
- Private `InfoRow({label,value,onPress?})` `:64-76`; local `STATUS_LABEL` `:44-53`; `section=documents` search param selects the documents tab `:79,82`. No limitation date, no per-level numbers, no pending-suggestion list, no review rounds. Back-navigation targets already exist: `/case/[id]/party`, `/case/[id]/close`.
- Nothing is gated per role except the manage-case block (`:131`) and task checkbox via `canToggleTask` (`:309-310`).

**`M/app/court-day/[eventId].tsx` (230 lines)** - own `SafeAreaView`+`ScrollView` (header hidden `_layout.tsx:200-203`).
- Local draft `{version, eventUpdatedAt, state}` in AsyncStorage key `${draftScope(user)}court:${eventId}` (`:23,47,53-74`); `sync()` saves local then `PATCH` workspace `:90-98`; `record()` = sync then `POST .../court-day/complete`, clears draft, `Alert` `ยืนยันผลนัดแล้ว` `:99-108`; `review()` validates and shows `Alert` summary `ตรวจทานก่อนยืนยันผลนัด` `:109-121`; `stale` guard `:88`; `writer = OWNER|SENIOR_LAWYER|OFFICE_MANAGER|LAWYER` `:86`; `editable = writer && !done && !busy` `:87`.
- Phases `PHASES = ['ก่อนไป','ที่ศาล','เติมที่สำนักงาน']` `:25,150-155`: phase 0 prep/documents `:164-187`; phases 1+2 notes + **"ผลนัด · เติมภายหลังได้" free-text `TextInput` (`state.outcome`, max 10000) `:192-194`**, expense shortcut `:195`; phase 2 toggles (next hearing, follow-up task, expense, client draft) and the confirm button `:197-220`; draft buttons `:221-226`.
- Event data: `court.data.event` has `caseId, title, courtName, startAt, courtEventKind, case{id, ownRef, title, courtName}` (`types.ts:193-196`). Add the judgment choice beside `:192-194`; it must call the proceedings endpoint itself (see 0.12).

**`M/app/(tabs)/index.tsx` (551 lines)** - home ("วันนี้").
- Flags `:114-117`: `owner = runOperations` (OWNER, OFFICE_MANAGER), `canClaim = approveExpenses` (OWNER), `canLeave = approveLeave`, `canFinance = manageInvoices`, `isOwner = firmRole === OWNER`. Data: `myDay :110`, `stats :111`, `actions :112`, `reviews = useTodos('review') :123` (**not** gated), `daily :124`.
- Focus refetch `:134-140` (reviews only `if (isOwner)` `:137`); pull-to-refresh `:173-187` (reviews always `:180`); `pendingActions` = ids of `actions.items` + review tasks `:147` (drives the bell dot `:212`).
- "คิวตัดสินใจวันนี้" card: section gate `:216`; tiles array `:219-222` with the owner-only review tile at `:220` (`router.push('/owner-decisions?view=...')` `:224`); link `:227`.
- "งานที่ต้องจัดการ" `:269-289`: chips created / review / follow-up / unassigned (`:272-281`, review chip `:274` shown to everyone with `reviews.data?.length`), error `:282`, inline first 3 review rows for non-`owner` roles `:284-288`.
- Other sections: finance Disclosure `:230-239`, owner help/compare blocks `:240-268`, local drafts `:291-296`, owner workforce `:308-363`, due today `:365-380`, appointments `:382-398`, claims `:400-416`, StatCards `:418-426`, overdue `:428-440`, warnings `:442-`. `styles` at `:476`.
- `owner-decisions.tsx`: `canReview = firmRole === 'OWNER'` `:21`, filter list `:24`, `useTodos('review', canReview)` `:27`, section "รอ Owner ตรวจ" `:40-41`. `tasks.tsx`: `views` includes `{value:'review', label:'รอฉันตรวจ'}` `:21`, `useTodos(...)` `:38` - the reviewer-neutral destination for a home tile (`router.push({pathname:'/(tabs)/tasks', params:{view}})` as the existing chips do, `index.tsx:277-278`).

**`M/app/case/new.tsx` (154 lines)** - create + edit in one screen (`?id=` = edit).
- State `:30-48`; seeds from `useCase` once `:49-60`; `levelSwitching` `:62`; `save` `:63-96`: builds body `:69-76`, `PATCH /cases/:id` or `POST /cases` `:77-78`, then `PUT /cases/:id/assignments` if allowed `:81`, uploads `:82-85`, invalidates `cases`, `case`, `case-documents`, `workload` `:86-89`, `router.replace('/case/<id>')` `:90`. Conflict flow 409 `CONFLICT_FOUND` `:92-93`.
- Fields: title `:103`, `ClientPicker` `:105`, `Dropdown` เราเป็น `:107`, opponents (create only) `:109-114`, status (edit only) `:115-119`, case type `:120-123`, `TeamFields` `:126`, `Disclosure "ศาลและรายละเอียดเพิ่มเติม"` with court `Dropdown` `:131` and ชั้นศาล `Dropdown` (`COURT_LEVEL_LABELS`, default `'TRIAL'`, always sent) `:137-138`, description `:139`, `Attachments` `:142`.
- **No** black/red number, claimedAmount, or limitation fields; no Thai typed-date input (the only date control is the modal `DatePicker`, which cannot express "partial" or "cleared", B3). Sent keys must stay inside `UpdateCaseDto`/`CreateCaseDto` (whitelist).

**`M/src/components/TaskWorkView.tsx` (258 lines)** - comment UI: `showNote` toggle + `FormField "บันทึกเพิ่มเติม"` `:241-242`, send button `:243` (`POST /tasks/:id/comments {body}`; wrapped in `perform` which persists the local task draft, runs, then `refresh()` `:69-81`). Draft state includes `note` (`:61,63`). Latest DAILY_UPDATE shown `:212`; earlier comments are not listed here. The second comment surface is `app/task/new.tsx:325-337`. `useTaskDraft` (`src/hooks/useTaskDraft.ts:5`) keeps typed text across crashes/offline.

**`M/app/notifications.tsx` (213 lines)** - two tabs `inbox` / `pending` `:42-74`. Inbox rows open `item.appPath` `:90-93`. Pending = `useActions()` rows + review tasks `:136-145`; `KIND_META` already has `DATE_REVIEW` ("วันที่รอยืนยัน") and `DOCUMENT_REVIEW` ("เอกสารรอรีวิว") `:36-37`; row press goes through `actionAppRoute(item)` `:170-176` which only returns `/case/<id>` (no section). `CATEGORY_META` icons `M/src/notification-categories.ts:6-14`.

### B3. Design system

`M/src/theme.ts`: `colors` `:4-22` (bg #F7F4ED, surface #FFFDFA, ink/text #142E43, muted/faint #52616B, line #DFE0DC, soft #EDEAE3, accent #8B6D32, accentInk #73520C, accentSoft #F7F3EB, good #227050/goodSoft #EAF3ED, warn #A83232/warnSoft #FAEDEB, info #36566B/infoSoft #E8EDF0); `fonts` Anuphan `semibold`/`bold` `:28-31`; `radius {card:8, pill:4, button:8}` `:33`; `spacing {xs:4, sm:8, md:12, lg:16, xl:24}` `:34`; `pageContent` (maxWidth 1080, padding lg/xl) `:36-43`; `formLabelSpacing` `:46`; `TOUCH = 44` `:49`. Rule: no one-off colors/fonts (`M/design.md:20`).

Components (`M/src/components`):

| Component | Props / behaviour (file:line) |
|---|---|
| `ui.tsx`: `Card` `:7` | `{children, style?}` bordered surface, padding md |
| `SectionLabel` `:17` | `{children, style?}` 15pt Anuphan, top margin lg |
| `PageIntro` `:22` | `{title, detail?}` 24pt header + divider |
| `ActionRow` `:29` | `{title, detail?, onPress, destructive?}` 60pt row with chevron |
| `SearchBox` `:42` | `{value,onChange,onSearch,onClear?,placeholder}` |
| `FilterTabs` `:57` | `{items:{value,label}[], value, onChange}` horizontal chips 44pt (usable as a 3-way court-level switch) |
| `Tag` `:78` + `TagTone` `:68` | `{tone?: 'court'|'due'|'ok'|'info'|'plain', children}` small pill (warn/good/info/accent soft fills) - the only chip/badge component |
| `StatCard` `:87` | `{label, value, tone?, hint?}` |
| `Button` `:112` | `{title, onPress, ghost?, disabled?, busy?}` 48pt min, ink fill or ghost outline; `busy` shows spinner and disables |
| `Loading` `:148` | full-area spinner |
| `ErrorNote` `:156` | `{message, onRetry?}` warn card with 44pt "ลองใหม่" |
| `EmptyNote` `:169` | `{children}` centered faint text |
| `Form.tsx`: `FormPage` `:8` | `{children}` keyboard-aware ScrollView, maxWidth 760, iOS "เสร็จสิ้น" accessory |
| `FormField` `:38` | `{label,value,onChange,multiline?,disabled?,placeholder?}` |
| `FormSection` `:50` | `{title, detail?, children}` Card with bordered header |
| `Disclosure.tsx` `:8` | `{title, summary?, children}` collapsed by default, 56pt header, `accessibilityState.expanded` |
| `Dropdown.tsx` `:10` | `{label,value,options:{value,label}[],onChange,disabled?}` full-screen slide Modal, search box when > 8 options, cancel button, 52pt rows |
| `DatePicker.tsx` `:28` | `{value: 'YYYY-MM-DD', onChange(iso)}` field + centered Modal calendar, Mon-first, header "เดือน พ.ศ." `:77-79`, field text via `thDate`; **no clear, no typing**, "today" from device-local `isoDay(new Date())` `:44` |
| `CasePicker.tsx` `:21` | `{value:CaseRef|null,onChange,allowNone?}` searchable full-screen picker over `useCases` |
| `ClientPicker.tsx` `:19` | `{value,onChange,disabled?,allowClear?}` search/create client |
| `TeamFields.tsx` `:10` | `{ids,onChange,primaryLabel?,secondaryLabel?,disabled?,max?}` primary Dropdown + checkbox chips from `useMembers` |
| `Attachments.tsx` `:11` | `{files,onChange,disabled?}` pick file/photo/camera, 30 MB cap alert |
| `ReassignSheet.tsx` `:16` | `{caseId?, task, onClose}`; **the only bottom-sheet pattern**: transparent `Modal` slide, backdrop Pressable `rgba(14,20,32,0.45)`, sheet `maxWidth 760`, top radius 18, handle bar, `useSafeAreaInsets` bottom padding, `ScrollView` inside (`:56-60,151-170`) |
| `QuickAdd.tsx` `:8` | `{placeholder,onSubmit,busy?}` one-line add row |
| `AppText.tsx` | `Text` `:31`, `TextInput` `:39` (scale with `DisplayPreferences` `TEXT_SIZES [1,1.2,1.4,1.6]` `:6`, 15/16pt defaults, iOS accessory id); always import these, not RN's |
| `LockGate.tsx` `:20`, `WorkloadSummary.tsx` `:10`, `PersonWorkloadView.tsx` `:23`, `OwnerFinanceSummary.tsx` `:10` | domain-specific; not reusable for this work |
| `hooks/useKeyboardHeight.ts:10` | Android keyboard height padding (used by Dropdown, CasePicker, court-day, TaskWorkView via FormPage) |

Conventions seen: gap-based layouts; 44pt `minHeight` on touch rows; `accessibilityRole="button"` + `accessibilityLabel` on Pressables; `Alert.alert` for confirmations/errors; counts show `—` while unavailable (`M/design.md:28`); icons from `lucide-react-native`. No toast/snackbar and no SectionCard/ActionSheet/ThaiDateField yet (the untracked design doc proposes them).

### B4. Date utilities (`M/src/format.ts`)

| Function | Line | Behaviour |
|---|---|---|
| `thDate(iso\|Date)` | `:8` | `"16 ก.ย. 2569"`: +7h shift then UTC fields, year +543, short Thai month |
| `thDateLong` | `:14` | with Thai weekday prefix |
| `thTime` | `:20` | `"09:30"` Bangkok |
| `isoDay(Date)` | `:26` | `YYYY-MM-DD` from the DEVICE-local fields (not Bangkok) |
| `bangkokDay(iso)` | `:36` | `YYYY-MM-DD` Bangkok day of an ISO instant; "today" idiom `bangkokDay(new Date().toISOString())` (`index.tsx:122`) |
| `formatMoney`, `formatMoneyInput` | `:46,54` | western digits, comma groups, `—` for non-finite; money input mask (null when invalid) |
| `calendarRangeQuery` | `:63` | day keys -> `T00:00:00+07:00` / `T23:59:59.999+07:00` |
| `timeAgo` | `:70` | inbox relative time |

Missing on mobile: days-between-Bangkok-days / countdown, 16:30 deadline formatting, Thai typed-date parts (day/month/Buddhist year), "all three or none" validator, Bangkok-midnight ISO builder (the `new Date(\`${day}T${time}:00+07:00\`).toISOString()` idiom is used inline at `court-day/[eventId].tsx:131,136`). Pure web equivalents to port: `WEB/lib/thai-date.ts` (`partsToIso` requires d, m and a 4-digit B.E. year >= 2500 and rejects impossible days like 31 เม.ย.; `isInvalidParts`, `isPartialParts`), `WEB/lib/case-overview.ts:7-10 limitationPatch`, `WEB/components/ui/ThaiDateInput.tsx` (alerts: `วันที่ไม่ถูกต้อง — เดือนนี้ไม่มีวันที่ดังกล่าว`, `กรอกวัน/เดือน/ปี พ.ศ. ให้ครบ หรือเว้นว่างทั้งหมด — ...`; page-level block `WEB/app/(dashboard)/cases/new/page.tsx:219`, `.../cases/[id]/page.tsx:638`). There is **no** Thai typed-date input component on mobile.

### B5. Static check scripts (`M/scripts/*.cjs`)

| Script | Pattern |
|---|---|
| `check-court-workflow.cjs` (165 lines) | **Pure-logic template.** `load(file, mocks)` `:8-19`: transpiles a `src/*.ts` file with `ts.transpileModule` (CommonJS, esModuleInterop) into a `Module`, resolves `require` from the file's folder and substitutes `mocks[id]` when present. Loads `workflow.ts :22`, `format.ts :41,82`, `api/drafts.ts :112`, `api/files.ts :136`. Sets `process.env.TZ='America/Los_Angeles'` before loading date code `:86`. Ends with `console.log('PASS: ...')` and `main().catch(... process.exitCode = 1)` |
| `check-routine-workflow.cjs` (41 lines) | requires `../../../packages/shared/dist` directly `:3` (needs `pnpm --filter @lawfirm/shared build`) |
| `check-person-detail.cjs` (89 lines) | component test: `load` with `jsx: ts.JsxEmit.React` `:14-21`, fake `react`/`react-native`/`lucide-react-native` `:9-13` and `@/theme`/`@/components/AppText`/`@/format` mocks `:23-24`, `render`/`flatten` tree helpers `:25-31`, calls `onPress` props directly |
| `check-account-auth.cjs`, `check-offline-session.cjs`, `check-task-drafts.cjs`, `check-account-deletion.cjs` | same transpile loader with SecureStore/AsyncStorage/FileSystem mocks |
| `check-mobile-forms.cjs`, `check-task-assignment.cjs`, `seed-e2e.cjs`, `verify-e2e.cjs` | live integration against a local API `http://127.0.0.1:3101` with a fixture JSON argument (not for pure logic) |

Run as `node apps/mobile/scripts/<name>.cjs` (repo root) or `node scripts/<name>.cjs` (apps/mobile). Not in `apps/mobile/package.json` scripts (only `typecheck` `:5-10`) and not in `.github/workflows` (only `backup.yml`, `deploy.yml`); documented in `docs/2026-09-27-samnuan-mobile-forms.md:23-27`. `typescript` resolves from hoisted `node_modules`. The loader does not resolve the `@/` alias: pure modules should import relatively (as `workflow.ts` does with `./api/types`, type-only and erased) and runtime imports of `@lawfirm/shared` resolve through `apps/mobile/node_modules/@lawfirm/shared -> packages/shared` to `dist/` (present in this worktree, includes `litigation.js`). A new `scripts/check-<x>.cjs` can copy `check-court-workflow.cjs:1-19`.

### B6. Role/permission helpers

- `S/firm-capabilities.ts:7-22,24-39`: `FirmCapability` map - `viewAllCases`, `manageInvoices`, `viewPettyCash`, `approveLeave`, `inviteMembers`, `runOperations`, `viewFirmReports`, `manageFirmContent` = OWNER+OFFICE_MANAGER; `approveExpenses`, `issueCashAdvance`, `manageMembers`, `manageSubscription`, `deleteCase`, `reassignCaseLead` = OWNER only. `hasFirmCapability(role, cap)` `:41-43`. FirmRole: OWNER, SENIOR_LAWYER, OFFICE_MANAGER, LAWYER, ASSISTANT, EXTERNAL (`S/firm-role.ts:1-8`). Legacy `Role` ADMIN|LAWYER (`S/index.ts:7-10`) is on `user.role`.
- Mobile usage: `hasFirmCapability` in `index.tsx:115-117`, `tasks.tsx:34`, `reports.tsx:17`, `more.tsx:86`, `team.tsx:104`, `person/[id].tsx:20`, `case/new.tsx:24` (`reassignCaseLead`), `ReassignSheet.tsx:31`, `TaskWorkView.tsx:215`, expenses/invoice screens. Direct role compares: `case/[id].tsx:131` and `case/[id]/close.tsx:32` (`OWNER || role ADMIN|LAWYER`), `court-day:86` (writer list), `owner-decisions.tsx:21`, `index.tsx:117`.
- `M/src/workflow.ts`: `canReviewTask(task, user, leadLawyerId?)` `:5-7` -> shared `canActOnReview` (`S/task-review.ts:27-35`: PENDING_REVIEW, not the assignee, not OFFICE_MANAGER, named reviewer = me, else case lead = me, else OWNER on a case task); `canToggleTask(task, user)` `:9-12`; `actionAppRoute({id,kind,url})` `:14-19` (task rows -> `/task/new?id=`, any `/cases/<uuid>` url -> `/case/<uuid>`); `agendaCompanionNames`, `agendaIncludesPerson` `:21-29`; `expenseError`, `claimActions` `:31-46`.
- Other shared role helpers: `awaitsReviewBy`, `effectiveReviewerId` (`S/task-review.ts:16-24`), `isEligibleReviewer :37-42`, `canDelegateTask :45-48`, `canAssignFirmRole`, `canInviteFirmRole`.
- Auth user on mobile: `useAuth().user: AuthUserInfo {id, email, firstName, lastName, role, firmRole?, firmId?, firmName?}` (`types.ts:8-17`, `api/auth.tsx:67,144`).

## C. Answers to the open questions in the untracked design draft (`docs/design/2026-10-12-mobile-litigation-parity.md:261-265`)

1. **Per-user pending date-suggestion count for home?** No dedicated field. Closest existing: `GET /agenda/actions` rows `kind === 'DATE_REVIEW'` (all PENDING on accessible active cases, any source, capped at 50 with `limited`) - already fetched on home (`useActions`). The `ai-tray` `PENDING_DATES` card counts only `DOCUMENT`-sourced rows. A true count would need a small API field.
2. **Can a dismissed suggestion be restored?** No. `confirm`/`dismiss` both require `PENDING` (`date-suggestions.service.ts:44-53`) and there is no restore route. A dismissed row is still listable with `?status=DISMISSED` but cannot be re-actioned.
3. **Do proceeding endpoints return the stage plus created suggestions?** No: `{ proceeding, suggestions: number }` only (A1). Stage is derivable by refetching the case. Per 0.2, the only stage moves are to `FILING` and `AWAITING_JUDGMENT`, so copy such as "ขั้นตอนคดีเป็น รออุทธรณ์" cannot occur (no stage is labelled that way; `APPEAL`='อุทธรณ์' is never set by these routes). Suggestion labels/dates come from `GET /cases/:id/date-suggestions` after the call.
4. **Does the mention API report dropped mentions?** Not explicitly; the response is the created comment whose `mentionedUserIds` already excludes dropped ids, so mobile can diff against what it sent (A6).

## D. Reusable pieces already in the repo (summary)

- Shared (built in `packages/shared/dist`): `courtFee`, `simpleInterest`, `interestDays`, `DEFAULT_INTEREST_RATE`, `COURT_FEE_NON_MONEY`, `COURT_LEVEL_LABELS`, `JUDGMENT_OUTCOME_LABELS`, `SERVICE_METHOD_LABELS`, `CASE_STAGE_LABELS_TH`, `CASE_NUMBER_REGEX/HINT`, `canActOnReview`, `hasFirmCapability`, `DeadlineTrigger`, `ServiceMethod`, `JudgmentOutcome`, `CourtLevel`.
- Mobile: `FilterTabs` (level switch), `Dropdown`, `FormSection`, `Disclosure`, `ErrorNote`, `Loading`, `Tag` tones (`due`/`court`/`ok`/`info`/`plain`), `ReassignSheet` bottom-sheet pattern, `useMembers`, `useActions`, `useTodos('review')`, `openCaseDocument`, `useTaskDraft` (typed-input safety), `canReviewTask`, `bangkokDay`/`thDate`.
- Web references to mirror: `CaseProceedingsCard.tsx`, `LitigationCalculatorsCard.tsx`, `ThaiDateInput.tsx` + `lib/thai-date.ts`, `lib/mentions.ts`, `.../documents/[documentId]/review/page.tsx`, `lib/case-overview.ts`.

# OneDrive Case Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** From the existing "จับคู่ folder OneDrive" settings tab, turn unlinked case folders into new cases in one pass, each case linked to its folder, files staying in OneDrive.

**Architecture:** A pure folder-name parser runs in the API and its result rides on the existing `folder-suggestions` response. A new `POST /outlook/drive/case-import` creates one case + one `CaseExternalLink` per row in a single transaction per row, through a new `CasesService.createForImport` (sibling of `createForPortal`). The web tab gets a second table under the existing match table for unlinked folders.

**Tech Stack:** NestJS + Prisma (apps/api, jest), Next.js (apps/web, `node --test`), shared enums/regex in `packages/shared`.

**Spec:** `docs/superpowers/specs/2026-10-31-onedrive-case-import-design.md`

## Global Constraints

- Nothing in OneDrive is written, renamed or moved; only Graph reads (`getItem`, `listChildren`).
- No AI; parsing is fixed rules in a pure function.
- No case is created without the person pressing the create button; every pre-filled field is editable.
- Files are not copied/imported.
- Case numbers must pass `CASE_NUMBER_REGEX` (already accepts English prefix letters, e.g. `พE291/2569`); if normalisation fails → leave `blackCaseNumber` empty and show the raw text.
- Closed rows require `outcome` ∈ {WON, LOST, SETTLED, MEDIATED, WITHDRAWN} and `closingSummary` ≥ 10 chars; default summary `นำเข้าจาก OneDrive: <ชื่อโฟลเดอร์>`.
- No per-case assignment notifications during import.
- Duplicate guard is firm-wide on `driveId` + `externalId`, regardless of connection.
- Endpoint roles: `Role.ADMIN`, `Role.LAWYER`. Max 200 rows per request.
- Plan quota checked up front with `assertCanOpenCases(prisma, firmId, <open rows>)`.
- Every row ends fully done (case + link [+ closed fields]) or not at all.
- User-facing copy in Thai, matching the existing tab.

## Review Focus

1. Re-running the import on the same parent after a partial failure → already-created rows show as linked and are not created again (Task 3 test `skips a folder another user already linked`).
2. A folder name with two case numbers (`กค.35,40-2564`) or a typo year (`กค.152-25655`) → number left empty, raw text kept (Task 1 tests).
3. Free-plan firm at its limit importing only closed rows → allowed, because closed cases don't count (Task 2 test `does not count a closed import against the plan`).
4. A row whose `itemId` is a file, or not in the given drive → that row FAILED with a message; other rows still created (Task 3 test).
5. Lead lawyer from another firm / an EXTERNAL member in any row → whole request rejected before anything is created (Task 3 test).

---

### Task 1: Folder-name parser

**Files:**
- Create: `apps/api/src/outlook-integration/drive/case-folder-name.ts`
- Test: `apps/api/src/outlook-integration/drive/case-folder-name.spec.ts`

**Interfaces:**
- Produces:
```ts
export interface ParsedCaseFolder {
  title: string;
  blackCaseNumber: string | null;   // normalised, passes CASE_NUMBER_REGEX, else null
  caseNumberRaw: string | null;     // first case-number-looking text found, as written
  courtName: string | null;         // as written, e.g. 'ศ.แพ่งใต้'
  courtLevel: CourtLevel;           // from @lawfirm/shared
  closed: boolean;
  outcome: CaseOutcome | null;      // WITHDRAWN when ถอนฟ้อง, else null
  teamHint: string | null;          // text of the last (...) group at the end of the name
}
export function parseCaseFolderName(name: string): ParsedCaseFolder;
```

- [ ] **Step 1: Commit what is already in the tree** (spec + case-number regex change)

```bash
git add docs/superpowers/specs/2026-10-31-onedrive-case-import-design.md docs/superpowers/plans/2026-10-31-onedrive-case-import.md packages/shared/src/validation.ts apps/api/src/cases/case-numbers.spec.ts
git commit -m "feat(cases): accept English letters in case-number prefix; spec+plan for OneDrive case import"
```

- [ ] **Step 2: Write the failing tests** — `it.each` over real names:

| input | title | blackCaseNumber | caseNumberRaw | courtName | courtLevel | closed | outcome | teamHint |
|---|---|---|---|---|---|---|---|---|
| `89. คำให้การ - พ264.69 - ศ.แพ่ง - แฟมมิลี่ & เมเจอร์ ซินีเพล็กซ์ (โบ, พี่ปิง)` | `คำให้การ - พ264.69 - ศ.แพ่ง - แฟมมิลี่ & เมเจอร์ ซินีเพล็กซ์ (โบ, พี่ปิง)` | `พ264/2569` | `พ264.69` | `ศ.แพ่ง` | TRIAL | false | null | `โบ, พี่ปิง` |
| `86. คำฟ้อง - พE291.69 - ศจ.สมุทรปราการ - TMSTH & นายแสงเพชร (ยักยอก) (โบ)` | … | `พE291/2569` | `พE291.69` | `ศจ.สมุทรปราการ` | TRIAL | false | null | `โบ` |
| `36. จำเลย - ผบE6635-65 -ศาลจ.บุรีรัมย์ - น.ส.วาสนา - อลิอันซ์` | … | `ผบE6635/2565` | `ผบE6635-65` | `ศาลจ.บุรีรัมย์` | TRIAL | false | null | null |
| `21. คำฟ้อง - TMSTH - Dextrans, พงษ์ศิริ, E.H - กค.187.65` | … | `กค187/2565` | `กค.187.65` | null | TRIAL | false | null | null |
| `47. คำเบิกความ - ศาลแขวงระยอง -มE399.2566` | … | `มE399/2566` | `มE399.2566` | `ศาลแขวงระยอง` | TRIAL | false | null | null |
| `12. ฟังคำพิพากษา - กค.35,40-2564` | … | null | `กค.35,40-2564` | null | TRIAL | false | null | null |
| `32. คำให้การ - มิตซุย & อลิอันซ์ จำเลยที่ 7 - กค.152-25655` | … | null | `กค.152-25655` | null | TRIAL | false | null | null |
| `20. แก้อุทธรณ์- N.K. Siam & Excell Transport - กค186.64` | … | `กค186/2564` | `กค186.64` | null | APPEAL | false | null | null |
| `4. คัดค้านฎีกา-บจ.ชอคโก้ฮอลิค - บจ.ซิลเวอร์ ไลน์` | … | null | null | null | SUPREME | false | null | null |
| `24. ฟ้อง - TMNF - การท่า - close` | `ฟ้อง - TMNF - การท่า - close` | null | null | null | TRIAL | true | null | null |
| `76. คำให้การ - กค50.68 - AIG ประกันภัย & Nippon TH, Nippon, SQ Air (ถอนฟ้อง)` | … | `กค50/2568` | `กค50.68` | null | TRIAL | true | WITHDRAWN | `ถอนฟ้อง` |
| `14. เตรียมฟ้อง - TMSTH & บจ.วีฮิเคิล (รถยนต์ มาสด้า2)` | … | null | null | null | TRIAL | false | null | `รถยนต์ มาสด้า2` |
| `45. (2-6-66) claim ใหม่ วิริยะ (Close)` | `(2-6-66) claim ใหม่ วิริยะ (Close)` | null | null | null | TRIAL | true | null | `Close` |
| `B. คดีทางการแพทย์` | `คดีทางการแพทย์` | null | null | null | TRIAL | false | null | null |
| `แบบฟอร์มศาล` | `แบบฟอร์มศาล` | null | null | null | TRIAL | false | null | null |

`…` = the input minus its leading `NN. `. Add one assertion: every non-null `blackCaseNumber` matches `CASE_NUMBER_REGEX`.

- [ ] **Step 3: Run** `cd apps/api && npx jest src/outlook-integration/drive/case-folder-name.spec.ts` — Expected: FAIL (module not found).

- [ ] **Step 4: Implement `parseCaseFolderName`** — rules (NFC-normalise first):
  - title: strip `/^\s*(?:\d{1,3}|[A-Za-z])\.\s*/`; if result empty use the trimmed name.
  - case number: a Thai prefix is required (avoids dates like `2-6-66`). Raw candidates: `/[ก-ฮ]{1,3}E?\.?\s*\d[\d,\s.\-\/]*\d/gu`. The first one found becomes `caseNumberRaw`. To normalise it, it must fully match `/^([ก-ฮ]{1,3}E?)\.?\s*(\d{1,6})\s*[.\-\/]\s*(\d{2}|\d{4})$/u`, then year = 2 digits ? `25${yy}` : yyyy, giving `${prefix}${no}/${year}`. Normalise only when exactly one distinct candidate exists and the result passes `CASE_NUMBER_REGEX`; otherwise null.
  - court: first match of `/(?:ศาล|ศ[ก-ฮ]{0,2}\.)[^\s\-()]+/u`.
  - courtLevel: name contains `ฎีกา` → SUPREME; else `อุทธรณ์` → APPEAL; else TRIAL.
  - closed: `/close/i` or `ถอนฟ้อง`. outcome: `ถอนฟ้อง` → `CaseOutcome.WITHDRAWN`, else null.
  - teamHint: content of `/\(([^()]*)\)\s*$/`, trimmed, else null.

- [ ] **Step 5: Run the test again** — Expected: PASS. Adjust only the regexes, not the table, if a row fails.

- [ ] **Step 6: Commit** `git commit -m "feat(drive): parse case folder names for import"`

---

### Task 2: `CasesService.createForImport`

**Files:**
- Modify: `apps/api/src/cases/cases.service.ts` (`insertCase` ~L319, add method next to `createForPortal` ~L358)
- Test: `apps/api/src/cases/cases-import.spec.ts` (copy the module setup from `cases-close-gate.spec.ts`)

**Interfaces:**
- Produces:
```ts
export interface CaseImportParams {
  title: string;
  blackCaseNumber: string | null;
  courtName: string | null;
  courtLevel: CourtLevel;
  leadLawyerId: string;
  buddyIds: string[];
  closed: { outcome: CaseOutcome; closingSummary: string } | null;
}
createForImport(tx: Prisma.TransactionClient, user: AuthUser, params: CaseImportParams): Promise<{ id: string; ownRef: string }>
```
Caller has already checked firm membership and the plan quota. This method sends no notifications and runs no conflict check.

- [ ] **Step 1: Write failing tests**
  - `creates an open case at PRE_LITIGATION with buddies as BUDDY assignments and a เปิดคดี feed entry in the tx`: `tx.case.create` called with `status` absent/OPEN, `assignments.create` = buddies minus the lead; `caseActivity.create` on **tx** with title `เปิดคดี`.
  - `creates a closed case with outcome, closingSummary, closedAt, stage CLOSING`: after create, `tx.case.update` sets `stage: 'CLOSING'`, `stageChangedAt`, and the create data has `status: 'CLOSED'`, `outcome`, `closingSummary` trimmed, `closedAt`. There is a second feed entry, `ปิดคดี / Case Closed`.
  - `does not count a closed import against the plan`: with a firm at its limit (`firm.findUnique` → plan with `maxActiveCases` reached, `case.count` = limit), a closed import does not throw, and an open import throws `PLAN_LIMIT_CASES`.
  - `snapshots the proceeding when court or number present`: `tx.caseProceeding.upsert` called once when `blackCaseNumber` set, not called when both null.
  - `sends no assignment notification`: `assignmentNotifier.notifyAssigned` not called.

- [ ] **Step 2: Run** `cd apps/api && npx jest src/cases/cases-import.spec.ts` — Expected: FAIL.

- [ ] **Step 3: Implement**
  - In `insertCase`, call `assertCanOpenCases` only when `data.status` is not `CLOSED`/`ARCHIVED`. Closed cases are excluded from the count anyway.
  - `createForImport`: call `insertCase(tx, user.firmId, undefined, {...})`. For a closed row, put `status: CLOSED, outcome, closingSummary, closedAt: now` in the data, then `tx.case.update({ stage: CaseStage.CLOSING, stageChangedAt: now })`. Write the feed via `this.caseFeed.log(..., tx)`: `เปิดคดี` (NOTE), plus for a closed row the close entry with the same shape as `close()`, including `statusTransition` and `stageTransition`. Call `snapshotCurrentLevel(tx, created)` when the court or the number is present.

- [ ] **Step 4: Run** the new spec plus `cases-close-gate.spec.ts cases.service.spec.ts` — Expected: PASS.

- [ ] **Step 5: Commit** `git commit -m "feat(cases): createForImport for bulk OneDrive import"`

---

### Task 3: Import endpoint + suggestions carry parsed data

**Files:**
- Create: `apps/api/src/outlook-integration/drive/drive-case-import.service.ts`, `drive-case-import.dto.ts`
- Modify: `case-drive.service.ts` (`folderSuggestions` L292–312), `drive-picker.controller.ts`, `case-drive.module.ts` (import `CasesModule` via `forwardRef` if a cycle shows up; add the provider)
- Test: `apps/api/src/outlook-integration/drive/drive-case-import.service.spec.ts`; extend `case-drive.service.spec.ts`

**Interfaces:**
- Consumes: `parseCaseFolderName` (Task 1), `CasesService.createForImport` (Task 2), `CaseDriveService.ownToken`, `.audit`, `driveDisplayPath`, `GraphDriveClient.getItem`.
- Produces:
  - `GET /outlook/drive/folder-suggestions`: each row gains `parsed: ParsedCaseFolder | null`, which is null when linked. `link` is now looked up firm-wide: `where: { firmId, kind: DRIVE_FOLDER, externalId: { in } }`, no longer by connectionId. The import's per-row check uses `{ firmId, kind: DRIVE_FOLDER, driveId, externalId }`.
  - `POST /outlook/drive/case-import` (roles ADMIN, LAWYER). Body:
```ts
class ImportDriveCaseRowDto { itemId: string; title: string /*1..300*/; blackCaseNumber?: string /*CASE_NUMBER_REGEX*/; courtName?: string;
  courtLevel: CourtLevel; leadLawyerId: string /*uuid*/; buddyIds?: string[] /*uuid*/; closed: boolean;
  outcome?: CaseOutcome /*required, not IN_PROGRESS, when closed*/; closingSummary?: string /*>=10 trimmed, required when closed*/ }
class ImportDriveCasesDto { driveId: string; rows: ImportDriveCaseRowDto[] /*1..200, unique itemId*/ }
```
  Returns `{ results: Array<{ itemId: string; status: 'CREATED' | 'ALREADY_LINKED' | 'FAILED'; caseId?: string; ownRef?: string; message?: string }> }`, in input order.
  - `DriveCaseImportService.importCases(user: AuthUser, dto: ImportDriveCasesDto)`.

- [ ] **Step 1: Write failing tests** (`drive-case-import.service.spec.ts`)
  - `creates a case and a DRIVE_FOLDER link per row in one transaction` → `CREATED`, `caseExternalLink.create` gets `connectionId` = the importer's, `externalId`, `driveId`, `displayPath`, and `linkedById`; audit `DRIVE_FOLDER_LINKED` with `source: 'IMPORT'`.
  - `skips a folder another user already linked` → `caseExternalLink.findFirst` returns a link from another connection → `ALREADY_LINKED` with that caseId; `createForImport` not called.
  - `reports P2002 inside the transaction as ALREADY_LINKED`.
  - `fails only the row whose item is a file or unreadable` → `getItem` returns no `folder` for row 2 → row 2 `FAILED` `เลือกได้เฉพาะ folder`; rows 1 and 3 `CREATED`.
  - `rejects the whole request when a lead or buddy is not a firm member` → `firmMember.count` short → `BadRequestException`; nothing created.
  - `checks the plan once for the open rows only` → `assertCanOpenCases` (mock `common/plan-limits`) called once with `(prisma, firmId, 2)` for 2 open + 1 closed rows; when it throws, nothing is created.
  - DTO test: closed row with no outcome, outcome `IN_PROGRESS`, or a 5-char summary → validation errors; duplicate itemIds → rejected.
  - In `case-drive.service.spec.ts`: `folderSuggestions returns parsed for unlinked rows and finds links firm-wide`.

- [ ] **Step 2: Run** `cd apps/api && npx jest src/outlook-integration/drive` — Expected: new tests FAIL.

- [ ] **Step 3: Implement**
  - The service flow: get `ownToken`, check membership once with the same `firmMember.count` rule as `CasesService.create` (excluding EXTERNAL), call `assertCanOpenCases(prisma, firmId, openRowCount)`, then process the rows **sequentially**. For each row: `getItem(token, dto.driveId, itemId)` (catch → FAILED via `driveErrorMessage`), require `item.folder`, resolve `driveId` as `linkFolder` does, check the firm-wide existing link, then `prisma.$transaction(tx => createForImport + caseExternalLink.create)`, then audit. Any other error goes to that row's FAILED with its message.
  - `closed` comes from `row.closed`. Pass `closingSummary.trim()`.
  - Controller: `@Post('case-import') @UseGuards(RolesGuard) @Roles(Role.ADMIN, Role.LAWYER)` on `DrivePickerController`.

- [ ] **Step 4: Run** `npx jest src/outlook-integration src/cases` — Expected: PASS. Then run `npx tsc --noEmit -p apps/api` and expect it clean.

- [ ] **Step 5: Commit** `git commit -m "feat(drive): bulk-create cases from OneDrive folders"`

---

### Task 4: Web client + row rules

**Files:**
- Modify: `apps/web/src/lib/api.ts` (near `getDriveFolderSuggestions` ~L3070)
- Create: `apps/web/src/lib/drive-case-import.ts`, `apps/web/src/lib/drive-case-import.test.ts`

**Interfaces:**
- Produces:
```ts
// api.ts
export interface ParsedCaseFolder { /* same fields as Task 1, enums as string unions */ }
// getDriveFolderSuggestions row type gains `parsed: ParsedCaseFolder | null`
export type ImportCaseRow = { itemId: string; title: string; blackCaseNumber?: string; courtName?: string; courtLevel: 'TRIAL' | 'APPEAL' | 'SUPREME';
  leadLawyerId: string; buddyIds?: string[]; closed: boolean; outcome?: 'WON' | 'LOST' | 'SETTLED' | 'MEDIATED' | 'WITHDRAWN'; closingSummary?: string };
export type ImportCaseResult = { itemId: string; status: 'CREATED' | 'ALREADY_LINKED' | 'FAILED'; caseId?: string; ownRef?: string; message?: string };
importDriveCases(token, body: { driveId: string; rows: ImportCaseRow[] }): Promise<{ results: ImportCaseResult[] }>
// drive-case-import.ts
export interface ImportCaseDraft extends ImportCaseRow { selected: boolean; folderName: string; caseNumberRaw: string | null; teamHint: string | null }
export function draftFromSuggestion(row: { folder: { id: string; name: string }; parsed: ParsedCaseFolder; suggestions: unknown[] }): ImportCaseDraft
export function draftProblem(d: ImportCaseDraft): string | null   // Thai message or null
```

- [ ] **Step 1: Write failing tests** (`node --test`)
  - `draftFromSuggestion` gives `selected: true` only when the name starts with `/^\d+\./` **and** `suggestions` is empty. So `B. คดีทางการแพทย์`, `แบบฟอร์มศาล`, and a numbered row with a suggestion all start unchecked. The `closingSummary` default is `นำเข้าจาก OneDrive: ${folder.name}` and `leadLawyerId: ''`.
  - `draftProblem` messages: `ยังไม่ได้เลือกทนายหลัก` for an empty lead; `ชื่อคดีว่าง` for an empty title; `เลขคดีไม่ถูกรูปแบบ` for a number failing `CASE_NUMBER_REGEX`; `เลือกผลคดี` for a closed row without an outcome; `สรุปตอนปิดต้องยาวอย่างน้อย 10 ตัวอักษร`. A valid draft returns null.

- [ ] **Step 2: Run** `cd apps/web && node --test --experimental-strip-types src/lib/drive-case-import.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement both files.**
- [ ] **Step 4: Run** the test again. Expected: PASS. Also run `npx tsc --noEmit -p apps/web` and expect it clean.
- [ ] **Step 5: Commit** `git commit -m "feat(web): drive case import client and row rules"`

---

### Task 5: Import table in the OneDrive matching tab

**Files:**
- Create: `apps/web/src/components/settings/DriveCaseImportTable.tsx`
- Modify: `apps/web/src/components/settings/DriveFolderMatchingTab.tsx`

**Interfaces:**
- Consumes: Task 4 (`draftFromSuggestion`, `draftProblem`, `api.importDriveCases`), `api.getLawyers`, `COURT_LEVEL_LABELS`.
- Produces: `<DriveCaseImportTable driveId items onDone />`. `items` holds the unlinked suggestion rows with `parsed`. `onDone()` reloads the parent.

- [ ] **Step 1: Build the component.** Section heading: `สร้างคดีใหม่จาก folder ที่ยังไม่ผูก (N)`. Note under it: `ไฟล์ยังอยู่ใน OneDrive ที่เดิม — ระบบผูก folder ด้วยบัญชี Microsoft ของคุณ ควรให้เจ้าของ folder เป็นคนนำเข้า`.
  - Each row: a checkbox, the folder name (read-only), and the editable fields title, เลขคดีดำ (with `caseNumberRaw` shown beneath when it differs or the number is empty), ศาล, ชั้นศาล, ทนายหลัก select, ทีม multi-select (with `teamHint` shown as muted text), and a "ปิดแล้ว" toggle. When the toggle is on, it reveals ผลคดี and สรุปตอนปิด.
  - The `draftProblem` message shows inline.
  - Bulk bar for selected rows: `ตั้งทนายหลักให้ที่เลือก`.
  - Button `สร้าง N คดี`, disabled while any selected row has a problem.
  - After the response, each row shows `สร้างแล้ว <ownRef>` as a link to `/cases/:id`, `ผูกไว้แล้ว`, or the error. Then call `onDone`.
- [ ] **Step 2: Wire it into the tab** below `FolderMatchTable`, passing `items.filter(r => !r.link && r.parsed)`.
- [ ] **Step 3: Verify in the browser.** Use worktree ports 3011/3015 with a seeded firm and a mocked or real Microsoft connection.
  - Pick a parent folder; see both tables.
  - Set the lead on 2 rows, mark one closed with outcome WITHDRAWN, and create.
  - Both rows flip to `สร้างแล้ว`. The case pages show the OneDrive section listing the folder, and the closed case shows status ปิด with its outcome.
  - Reload: those rows now appear as linked in the top table and no longer in the import table.
  - Take a screenshot as proof.
- [ ] **Step 4: Run** `cd apps/web && npm test && npx tsc --noEmit -p .` — Expected: PASS.
- [ ] **Step 5: Commit** `git commit -m "feat(web): import OneDrive folders as new cases"`

---

### Task 6: Create a new OneDrive folder from the case page (added mid-run at the user's request)

The user asked for this: when a case is created, help create its folder too. A lawyer presses the button and picks where the folder goes; nothing is automatic.

**Files:**
- Modify: `apps/api/src/outlook-integration/graph/graph-drive.client.ts`, `drive/case-drive.service.ts`, `drive/case-drive.controller.ts`, `drive/drive.dto.ts`
- Modify: `apps/web/src/lib/api.ts`, `apps/web/src/components/cases/CaseDriveSection.tsx`
- Test: `graph-drive.client.spec.ts`, `case-drive.service.spec.ts`

**Interfaces:**
- `GraphDriveClient.createFolder(token, driveId: string, parentId: string, name: string): Promise<DriveItem>` → `POST {itemPath(driveId,parentId)}/children` with body `{ name: safeDriveName(name), folder: {}, '@microsoft.graph.conflictBehavior': 'rename' }`.
- `CaseDriveService.createAndLinkFolder(user, caseId, dto: { driveId: string; parentId: string; name: string })`: check case access the same way `linkFolder` does, then `createFolder` with the caller's own token, then `linkFolder(user, caseId, { driveId, itemId: created.id })`. Returns the link.
- `POST /cases/:id/drive-folder` with roles ADMIN and LAWYER. Body `CreateDriveFolderDto { driveId: string; parentId: string; name: string /*1..200*/ }`.
- Web: `api.createCaseDriveFolder(token, caseId, driveId, parentId, name)`.

- [ ] **Step 1: Write failing tests.**
  - `createFolder posts to the parent's children with rename on conflict`.
  - `createAndLinkFolder creates in the chosen parent then links it to the case`.
  - `createAndLinkFolder does not create anything without a Microsoft connection`.
- [ ] **Step 2: Run** `npx jest src/outlook-integration` — Expected: FAIL.
- [ ] **Step 3: Implement** the API pieces.
- [ ] **Step 4: Build the UI in CaseDriveSection.** Add a button `สร้าง folder ใหม่` next to `ผูก folder OneDrive`; it is shown only when the case has no linked folder.
  - The button opens `DriveFolderPicker` titled `เลือกที่เก็บ folder ใหม่`.
  - After a pick, show an inline name field prefilled `${ownRef} - ${title}` with the buttons `สร้างและผูก` and `ยกเลิก`.
  - On success, reload the listing.
- [ ] **Step 5: Run** the api tests and `tsc` for api and web — Expected: PASS. Then check in the browser together with Task 5.
- [ ] **Step 6: Commit** `git commit -m "feat(drive): create and link a new OneDrive folder from the case page"`

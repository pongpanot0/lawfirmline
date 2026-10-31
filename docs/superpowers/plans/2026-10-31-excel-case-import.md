# Excel Case Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Download a firm-specific `.xlsx` case template, upload it filled, review each row, and create one case per row.

**Architecture:** The API owns everything Excel-related, using `exceljs`. A pure template builder produces the file, and a pure reader turns sheet rows into resolved drafts with Thai problems. A service loads the firm's lookups, checks duplicates, and creates cases through the existing `CasesService.createForImport` (widened), one transaction per row. The web gets one page at `/cases/import` with download, upload, review and create.

**Tech Stack:** NestJS + Prisma + jest (apps/api), `exceljs@4.4.0` (new, apps/api only), Next.js + `node --test` (apps/web).

**Spec:** `docs/superpowers/specs/2026-10-31-excel-case-import-design.md`

## Global Constraints

- Nothing is created before the person presses `สร้าง N คดี`. The preview endpoint writes nothing.
- Every query is scoped to `user.firmId`. No cross-firm data, including lookups in the template.
- Roles: `Role.ADMIN`, `Role.LAWYER` on every endpoint.
- Max 300 data rows; max file size 2 MB; `.xlsx` only. Columns are read by header text, not position.
- No assignment notifications and no conflict gate. Parties are still written: OURS client row (by `clientId`, or name-only) and opponents via `addOpponents`.
- Plan quota is checked once, for open rows only (`assertCanOpenCases(prisma, firmId, openRows)`).
- Closed rows: `status CLOSED`, `outcome` ∈ {WON, LOST, SETTLED, MEDIATED, WITHDRAWN}, `closingSummary` ≥ 10 chars (blank → `นำเข้าจาก Excel: <ชื่อคดี>`), `closedAt` (blank → now), stage `CLOSING`.
- No client is created. An exact client-name match (trimmed, case-insensitive) sets `clientId`; otherwise the text goes to `clientName`.
- The lead must be in the `GET /users/lawyers` set (User.role ADMIN/LAWYER, not EXTERNAL). Team members must be non-EXTERNAL firm members.
- User-facing copy is Thai.

## Template columns (sheet `คดี`, header row 1, in this order)

`ชื่อคดี *`, `ทนายหลัก (อีเมล) *`, `ชั้นศาล *`, `ทีม (อีเมล คั่นด้วย ;)`, `เลขอ้างอิงภายใน`, `เลขอ้างอิงลูกค้า`, `ลูกความ`, `ฐานะลูกความ`, `คู่ความฝ่ายตรงข้าม (คั่นด้วย ;)`, `ประเภทคดี`, `ศาล`, `เลขคดีดำ`, `เลขคดีแดง`, `ทุนทรัพย์ (บาท)`, `ค่าวิชาชีพประมาณการ (บาท)`, `วันครบอายุความ`, `ขั้นตอนคดี`, `วันเปิดคดี`, `สถานะ`, `ผลคดี`, `วันปิดคดี`, `สรุปตอนปิด`, `รายละเอียด`

Dropdown labels:
- **ชั้นศาล:** `COURT_LEVEL_LABELS`
- **ฐานะลูกความ:** โจทก์ / จำเลย / ผู้ร้อง / ผู้คัดค้าน → PLAINTIFF / DEFENDANT / PETITIONER / RESPONDENT
- **ขั้นตอนคดี:** `CASE_STAGE_LABELS_TH` without CLOSING
- **สถานะ:** เปิดอยู่ / ปิดแล้ว
- **ผลคดี:** ชนะคดี / ตกลงกันได้ / ไกล่เกลี่ยสำเร็จ / แพ้คดี / ถอนฟ้อง-ยุติ → WON / SETTLED / MEDIATED / LOST / WITHDRAWN
- **ประเภทคดี:** the firm's active case type names

## Review Focus

1. A Thai date typed as text with a Buddhist year (`15/03/2569`) and a real Excel date cell must both become the same day (Task 2 test `reads Excel dates and dd/mm/yyyy in BE or CE`).
2. A header renamed or moved by the user: a missing required header must be one clear file-level error, not 300 row errors (Task 2 test `rejects a sheet missing a required header`).
3. The same black number + court on two rows, or matching an existing case/proceeding, must be blocked (Task 3 test `flags duplicates against the firm and inside the file`).
4. Another firm's lawyer email, client name or case type must never resolve (Task 3 test `resolves lookups only inside the caller's firm`).
5. A trailing block of formatted-but-empty rows must not count toward the 300 limit or show as rows (Task 2 test `skips empty rows`).

---

### Task 1: Template builder (+ exceljs)

**Files:**
- Modify: `apps/api/package.json` (add `"exceljs": "4.4.0"`), `pnpm-lock.yaml`
- Create: `apps/api/src/case-import/case-import-columns.ts`, `apps/api/src/case-import/case-import-template.ts`
- Test: `apps/api/src/case-import/case-import-template.spec.ts`

**Interfaces:**
- Produces, in `case-import-columns.ts`:
  - `CASE_IMPORT_SHEET = 'คดี'`
  - `CASE_IMPORT_HEADERS` (readonly tuple, in the order above)
  - `REQUIRED_HEADERS`
  - The label↔value maps `PARTY_ROLE_BY_LABEL`, `OUTCOME_BY_LABEL`, `STATUS_LABELS = { open: 'เปิดอยู่', closed: 'ปิดแล้ว' }`, `stageByLabel()`, `courtLevelByLabel()`
  - `MAX_IMPORT_ROWS = 300`
- Produces, in `case-import-template.ts`: `buildCaseImportTemplate(input: { caseTypes: string[]; lawyers: { name: string; email: string }[] }): Promise<Buffer>`

- [ ] **Step 1:** Run `cd apps/api && pnpm add exceljs@4.4.0`. Expected: the lockfile is updated and `import ExcelJS from 'exceljs'` compiles.
- [ ] **Step 2: Write failing tests.** Load the returned buffer with `new ExcelJS.Workbook().xlsx.load(buf)` and check:
  - `writes the headers in order on sheet คดี`: row 1 values === `CASE_IMPORT_HEADERS`.
  - `adds list dropdowns for choice columns`: `sheet.getCell('C2').dataValidation` has type `list`, and the same holds for ฐานะลูกความ, ประเภทคดี, ขั้นตอนคดี, สถานะ and ผลคดี (check row 2 and row 301).
  - `explains every column and lists the firm's lawyers`: sheet `วิธีกรอก` contains every header text and every lawyer email passed in, plus 2 example rows (one with `ปิดแล้ว`).
  - `keeps lists on a hidden sheet`: sheet `lists` has `state === 'veryHidden'` or `'hidden'` and contains the case type names.
- [ ] **Step 3: Run** `npx jest src/case-import/case-import-template.spec.ts` — Expected: FAIL.
- [ ] **Step 4: Implement.** Data validation formulae reference ranges on `lists`, e.g. `lists!$A$1:$A$3`, applied to rows 2..301. Format the date columns as `dd/mm/yyyy`.
- [ ] **Step 5: Run** the spec — Expected: PASS. Commit `feat(case-import): Excel template with dropdowns`.

---

### Task 2: Sheet reader

**Files:**
- Create: `apps/api/src/case-import/case-import-reader.ts`
- Test: `apps/api/src/case-import/case-import-reader.spec.ts` (build input workbooks in the test with exceljs)

**Interfaces:**
- Produces:
```ts
export interface RawCaseRow { rowNumber: number; values: Partial<Record<CaseImportHeader, string | Date | number>> }
export function readCaseImportSheet(buf: Buffer): Promise<{ rows: RawCaseRow[] }>  // throws BadRequestException (Thai) on file-level errors
export function parseImportDate(v: unknown): Date | null | 'INVALID'
export function parseAmount(v: unknown): number | null | 'INVALID'
export const splitList: (v: unknown) => string[]   // ';' or newline, trimmed, empties dropped
```

- [ ] **Step 1: Write failing tests.**
  - `reads values by header text even when columns are reordered`.
  - `rejects a sheet missing a required header`: message `ไม่พบคอลัมน์ "ทนายหลัก (อีเมล) *" — ใช้ template ของระบบ`.
  - `rejects a file without sheet คดี`: message `ไม่พบแผ่นงาน "คดี" — ใช้ template ของระบบ`.
  - `skips empty rows`: 3 data rows plus 50 blank-but-formatted rows → 3 rows, with `rowNumber` 2, 3, 5 when row 4 is blank.
  - `rejects more than 300 rows`: message `ไฟล์มีคดีเกิน 300 แถว — แบ่งเป็นหลายไฟล์`.
  - `reads Excel dates and dd/mm/yyyy in BE or CE`: a Date cell 2026-03-15, `'15/03/2569'` and `'15/03/2026'` all give the same day; `'31/02/2569'` → `'INVALID'`; blank → `null`.
  - `parses amounts`: `'1,250,000.50'` → 1250000.5; a numeric cell is passed through; `'-5'`, `'abc'` and `'1.234'` → `'INVALID'`.
  - `splitList`: `'a@x.co; b@x.co\nc@x.co;'` → 3 items.
  - Rich-text and formula cells are read as their text/result.
- [ ] **Step 2: Run** `npx jest src/case-import/case-import-reader.spec.ts` — Expected: FAIL.
- [ ] **Step 3: Implement.** BE year = a 4-digit year > 2400, minus 543. Build dates in Bangkok calendar terms as UTC midnight of that day (`Date.UTC(y, m-1, d)`).
- [ ] **Step 4: Run** — Expected: PASS. Commit `feat(case-import): read the case sheet`.

---

### Task 3: Resolve rows + preview endpoint

**Files:**
- Create: `apps/api/src/case-import/case-import-resolve.ts` (pure), `case-import.service.ts`, `case-import.controller.ts`, `case-import.module.ts`, `case-import.dto.ts`
- Modify: `apps/api/src/app.module.ts` (register module)
- Test: `case-import-resolve.spec.ts`, `case-import.service.spec.ts`

**Interfaces:**
- Produces:
```ts
export interface ImportLookups {
  lawyersByEmail: Map<string, string>; membersByEmail: Map<string, string>;   // lowercased email → userId
  clientsByName: Map<string, string>;                                          // lowercased trimmed name → clientId
  caseTypesByName: Map<string, string>;                                        // lowercased name → id
  existingOwnRefs: Map<string, string>;                                        // ownRef → ownRef
  existingNumbers: { number: string; court: string | null; ownRef: string }[]; // case + proceeding black numbers
}
export interface ExcelCaseDraft {   // also the create row shape (minus rowNumber/problems)
  rowNumber: number; problems: string[];
  title: string; leadLawyerId: string; buddyIds: string[]; courtLevel: CourtLevel;
  ownRef?: string; customerRef?: string; clientId?: string; clientName?: string; partyRole?: PartyRole;
  opponents: string[]; caseTypeId?: string; courtName?: string; blackCaseNumber?: string; redCaseNumber?: string;
  claimedAmount?: number; estimatedFee?: number; limitationDeadline?: string /*YYYY-MM-DD*/; stage?: CaseStage;
  openedAt?: string; closed: boolean; outcome?: CaseOutcome; closedAt?: string; closingSummary?: string; description?: string;
  leadEmail: string; clientMatched: boolean;   // for display
}
export function resolveCaseRows(rows: RawCaseRow[], lookups: ImportLookups, today: Date): ExcelCaseDraft[]
// service
CaseImportService.template(user): Promise<Buffer>
CaseImportService.preview(user, file: { buffer: Buffer; size: number; originalname: string }): Promise<{ drafts: ExcelCaseDraft[]; noKeyRows: number }>
```
- Routes (controller prefix `case-import`, JwtAuthGuard + RolesGuard ADMIN/LAWYER):
  - `GET /case-import/template`: `Content-Disposition: attachment; filename="case-import-template.xlsx"`.
  - `POST /case-import/preview`: multipart field `file`, `FileInterceptor` with a 2 MB limit; reject a non-`.xlsx` name with `รองรับเฉพาะไฟล์ .xlsx`.

- [ ] **Step 1: Write failing tests** for `resolveCaseRows`, each problem as exact Thai text:
  - `ยังไม่ได้กรอกชื่อคดี`, `ไม่พบทนายอีเมล <x> ในสำนักงาน`, `ชั้นศาลไม่ถูกต้อง: <x>`, `ไม่พบสมาชิกอีเมล <x> ในสำนักงาน`, `ฐานะลูกความไม่ถูกต้อง: <x>`, `ไม่พบประเภทคดี <x>`, `เลขคดีดำไม่ถูกรูปแบบ`, `เลขคดีแดงไม่ถูกรูปแบบ`, `ทุนทรัพย์ไม่ถูกต้อง`, `ค่าวิชาชีพไม่ถูกต้อง`, `วันครบอายุความไม่ถูกต้อง`, `ขั้นตอนคดีไม่ถูกต้อง: <x>`, `วันเปิดคดีไม่ถูกต้อง`, `วันเปิดคดีอยู่ในอนาคต`, `สถานะไม่ถูกต้อง: <x>`, `เลือกผลคดีของคดีที่ปิดแล้ว`, `ผลคดีไม่ถูกต้อง: <x>`, `วันปิดคดีไม่ถูกต้อง`, `วันปิดคดีก่อนวันเปิดคดี`, `สรุปตอนปิดต้องยาวอย่างน้อย 10 ตัวอักษร`, `มีคดีนี้ในระบบแล้ว (<ownRef>)`, `ซ้ำกับแถวที่ <n> ในไฟล์`.
  - Mapping tests:
    - an exact client name (`  ACME จำกัด ` vs `acme จำกัด`) → `clientId`, `clientMatched true`; an unknown name → `clientName`, `clientMatched false`.
    - closed with a blank summary → `นำเข้าจาก Excel: <title>`.
    - an open row ignores ผลคดี and วันปิดคดี.
    - stage on a closed row is ignored.
    - opponents are split by `;`.
  - Duplicates (`flags duplicates against the firm and inside the file`):
    - black + court equal to an existing case → flagged.
    - the same black number in a different court → not flagged.
    - an existing black number with a null court → matches any court.
    - two rows with the same black + court → the second is flagged `ซ้ำกับแถวที่ 2 ในไฟล์`.
    - an existing ownRef → flagged.
  - Service test `resolves lookups only inside the caller's firm`: every prisma `findMany` used by `preview` has `firmId: 'f1'` (or `firmMembers.some.firmId`) in its where. `noKeyRows` counts rows with neither ownRef nor black number.
  - Service test `preview creates nothing`: no `create`, `update` or `$transaction` calls.
- [ ] **Step 2: Run** `npx jest src/case-import` — Expected: FAIL.
- [ ] **Step 3: Implement.** Lookups come from:
  - lawyers: the same where as `UsersService.findLawyers`.
  - members: `firmMember` with role not EXTERNAL.
  - clients: `client.findMany({ where: { firmId } })`.
  - case types: `caseType.findMany({ where: { firmId, isActive: true } })`.
  - existing ownRefs and numbers: `case.findMany({ where: { firmId, deletedAt: null } })`, plus `caseProceeding.findMany({ where: { case: { firmId } } })`.
- [ ] **Step 4: Run** — Expected: PASS. Commit `feat(case-import): resolve rows and preview`.

---

### Task 4: Create endpoint (widen createForImport)

**Files:**
- Modify: `apps/api/src/cases/cases.service.ts` (`CaseImportParams`, `createForImport`), `cases-import.spec.ts`
- Modify: `case-import.service.ts`, `case-import.controller.ts`, `case-import.dto.ts`
- Test: `case-import.service.spec.ts`

**Interfaces:**
- `CaseImportParams` gains these optional fields: `ownRef`, `customerRef`, `clientId`, `clientName`, `partyRole`, `opponents: string[]`, `caseTypeId`, `redCaseNumber`, `claimedAmount`, `estimatedFee`, `limitationDeadline: Date`, `description`, `stage: CaseStage`, `openedAt: Date`. `closed` gains an optional `closedAt: Date`. The OneDrive caller is unchanged.
- `POST /case-import` takes the body `{ rows: CreateExcelCaseRowDto[] }` (1..300). Each row has the `ExcelCaseDraft` fields, without `rowNumber`, `problems`, `leadEmail` or `clientMatched`, plus `rowNumber` for reporting. Every field is validated again, with the same rules as the resolver.
- It returns `{ results: { rowNumber: number; status: 'CREATED' | 'FAILED'; caseId?: string; ownRef?: string; message?: string }[] }`.

- [ ] **Step 1: Write failing tests.**
  - In `cases-import.spec.ts`:
    - `uses a requested ownRef and fails on a taken one` (`ConflictException`).
    - `sets stage and openedAt when given` (an open case at HEARING: `tx.case.update` gets stage HEARING; create data has openedAt).
    - `closed uses the given closedAt`.
    - `writes the OURS party by client id` (calls `ensureOurClientParticipant` → `tx.caseParticipant.create` with clientId).
    - `writes a name-only OURS party when no client matched` (`side: 'OURS'`, `clientId` absent, name = clientName, role from `ourParticipantRole(partyRole)` or `OTHER`).
    - `adds opponents` (`addOpponents`).
    - `syncs the limitation reminder inside the tx`.
    - The existing OneDrive tests still pass unchanged.
  - In `case-import.service.spec.ts`:
    - `rejects the request when a lead or team member is not in the firm` (nothing created).
    - `checks the plan once for open rows`.
    - `re-checks duplicates at create time` (a row whose black + court now exists → `FAILED` with `มีคดีนี้ในระบบแล้ว (<ownRef>)`, others created).
    - `one transaction per row; a failing row does not stop the others`.
    - `rejects a caseTypeId or clientId from another firm` (`assertFirmRefs`, or a firm-scoped lookup → whole request `BadRequestException`).
- [ ] **Step 2: Run** `npx jest src/case-import src/cases` — Expected: FAIL.
- [ ] **Step 3: Implement.**
  - Stage: insertCase stays PRE_LITIGATION. When `stage` is present and differs (or the row is closed → CLOSING), do one `tx.case.update`.
  - Pass `openedAt` through insertCase data.
  - Write the name-only OURS row with `tx.caseParticipant.create`.
  - Call `syncLimitationReminder(tx, id)` only when `limitationDeadline` is set.
  - Audit `CASES_IMPORTED_EXCEL` once per request with `{ created, failed }`.
- [ ] **Step 4: Run** `npx jest src/case-import src/cases src/outlook-integration && npx tsc --noEmit -p .` — Expected: PASS. Commit `feat(case-import): create cases from reviewed Excel rows`.

---

### Task 5: Web page `/cases/import`

**Files:**
- Modify: `apps/web/src/lib/api.ts` (`downloadCaseImportTemplate`, `previewCaseImport(file)`, `createCasesFromExcel(rows)`, types)
- Create: `apps/web/src/lib/excel-case-import.ts`, `apps/web/src/lib/excel-case-import.test.ts`, `apps/web/src/app/(dashboard)/cases/import/page.tsx`
- Modify: `apps/web/src/app/(dashboard)/cases/page.tsx` (add an `นำเข้าจาก Excel` link next to the new-case button)

**Interfaces:**
- `excelRowProblems(d: ExcelCaseDraft): string[]` re-checks the fields editable in the table (title, lead, courtLevel, black/red numbers, closed/outcome/summary) and keeps server problems on fields not editable here. `toCreateRow(d)` strips the display-only fields.

- [ ] **Step 1: Write failing tests** (`node --test`):
  - Editing the title from blank clears `ยังไม่ได้กรอกชื่อคดี`.
  - Server-only problems such as `ไม่พบประเภทคดี X` stay.
  - Duplicate problems stay.
  - Closed without an outcome → `เลือกผลคดีของคดีที่ปิดแล้ว`.
  - `toCreateRow` drops `problems`, `leadEmail` and `clientMatched`.
- [ ] **Step 2: Run** — Expected: FAIL. **Step 3:** Implement the lib.
- [ ] **Step 4: Build the page.**
  - Heading `นำเข้าคดีจาก Excel`. Step 1 is a button `ดาวน์โหลด template`. Step 2 is a file input (`accept=".xlsx"`) that calls preview when a file is chosen.
  - When `noKeyRows > 0`, show the warning `<n> แถวไม่มีเลขอ้างอิงหรือเลขคดีดำ — ระบบตรวจซ้ำให้ไม่ได้`.
  - Each row card shows: `แถว <n>`, then editable fields (title, lead select from `getLawyers`, courtLevel, black, red, ปิดแล้ว toggle → outcome + summary), then read-only lines for the other fields (client with `(ลูกความในระบบ)` / `(ชื่อใหม่ — ยังไม่สร้างลูกความ)`, opponents, court, dates, amounts), then its problems in red.
  - Rows with problems can't be ticked. Rows without problems start ticked.
  - Button `สร้าง N คดี`. Results show per row, with a link to each created case.
  - Reuse `DriveCaseImportTable` styling: the `field` class and the list-of-cards layout.
- [ ] **Step 5: Verify in the browser** on 3026/3021 (no Microsoft needed):
  1. Download the template and fill 3 rows with exceljs in a scratch script: one valid open row, one closed row, and one row with an unknown lawyer email.
  2. Upload it. Expected: 2 rows ticked and 1 row with `ไม่พบทนายอีเมล`.
  3. Create. Expected: 2 cases appear in the case list, and the closed case is closed with its outcome.
  4. Upload again. Expected: the 2 rows are now flagged `มีคดีนี้ในระบบแล้ว`.
  5. Screenshot.
- [ ] **Step 6: Run** `cd apps/web && npm test && npx tsc --noEmit -p .` — Expected: PASS. Commit `feat(web): import cases from Excel`.

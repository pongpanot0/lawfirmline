# SOP + Playbook Merge & Stage Tasks on Any Channel — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Case pages surface playbook stage-task proposals no matter how the stage changed, and the sidebar shows one "SOP" menu that lists both plain SOPs and automated SOPs (playbooks).

**Architecture:** A nullable `Case.stageTasksHandledFor` column records the last stage whose proposals the user created or skipped; the case page shows a banner whenever `stage !== stageTasksHandledFor` and reuses the existing `StageTasksDialog`. The SOP page merges the two lists client-side; `/playbooks` stays as the automated-SOP editor.

**Tech Stack:** NestJS + Prisma (apps/api, jest), Next.js App Router (apps/web), `@lawfirm/shared` enums.

**Spec:** `docs/superpowers/specs/2026-09-28-sop-playbook-merge-stage-tasks-design.md`

## Global Constraints

- Stage-task creation always needs a user click (no auto-create).
- No merge of `Sop` and `PlaybookRelease` tables.
- Migration must backfill `stageTasksHandledFor = stage` for existing cases.
- Never run `prisma migrate dev`; apply the migration locally with `psql` + `prisma migrate resolve --applied` (project convention).
- Rebuild `packages/shared/dist` in this worktree before running api tests: `pnpm --filter @lawfirm/shared build`.
- UI copy in Thai, matching surrounding pages.

---

### Task 1: API — handled marker, dismiss endpoint, dedupe proposals

**Files:**
- Modify: `apps/api/prisma/schema.prisma` (model `Case`, next to `stageChangedAt`)
- Create: `apps/api/prisma/migrations/20260928120000_case_stage_tasks_handled/migration.sql`
- Modify: `apps/api/src/practice-setup/practice-setup.service.ts` (`proposeStageTasks`, `createStageTasks`, new `dismissStageTasks`)
- Modify: `apps/api/src/practice-setup/practice-setup.controller.ts` (new route + DTO)
- Test: `apps/api/src/practice-setup/practice-setup.service.spec.ts` (`describe('stage-driven task proposals')`)

**Interfaces:**
- Produces: `POST /practice-setup/cases/:caseId/stage-tasks/dismiss` body `{ stage: CaseStage }` → `{ dismissed: true }`
- Produces: `Case.stageTasksHandledFor: CaseStage | null` on case detail responses (`caseInclude` uses `include`, so scalars come through automatically)
- Produces: `PracticeSetupService.dismissStageTasks(user: AuthUser, caseId: string, stage: CaseStage): Promise<{ dismissed: true }>`

- [ ] **Step 1: Schema + migration**

In `schema.prisma` model `Case`, directly under `stageChangedAt`:

```prisma
  /// ขั้นล่าสุดที่ผู้ใช้จัดการงานแนะนำจาก playbook แล้ว (สร้างหรือข้าม) — ≠ stage → หน้าคดีเสนองานของขั้นนั้น
  stageTasksHandledFor CaseStage?
```

`migration.sql`:

```sql
-- Existing cases are treated as handled so the banner doesn't appear on every old case after deploy.
ALTER TABLE "Case" ADD COLUMN "stageTasksHandledFor" "CaseStage";
UPDATE "Case" SET "stageTasksHandledFor" = "stage";
```

Run: `cd apps/api && pnpm prisma generate`

- [ ] **Step 2: Write the failing tests**

In `buildService` add to the `prisma` mock:

```ts
      case: { findFirst: jest.fn().mockResolvedValue(theCase), update: jest.fn().mockResolvedValue(theCase) },
      ...
      task: {
        create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: `task-${data.title}`, ...data })),
        findMany: jest.fn().mockResolvedValue([]),
      },
```

Add tests inside `describe('stage-driven task proposals')`:

```ts
  it('skips steps that already exist as tasks for that stage', async () => {
    const { service, prisma } = buildService({
      steps: [
        { title: 'ตรวจเอกสาร', instructions: 'ทำ A', stage: CaseStage.FILING },
        { title: 'ยื่นฟ้อง', instructions: 'ทำ B', stage: CaseStage.FILING },
      ],
    });
    prisma.task.findMany.mockResolvedValue([{ title: 'ตรวจเอกสาร' }]);
    const result = await service.proposeStageTasks(user, theCase.id, CaseStage.FILING);
    expect(result.map((r) => r.title)).toEqual(['ยื่นฟ้อง']);
    expect(prisma.task.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { caseId: theCase.id, labels: { has: `stage:${CaseStage.FILING}` } } }),
    );
  });

  it('createStageTasks marks the stage as handled', async () => {
    const { service, prisma } = buildService();
    prisma.firmMember.findMany.mockResolvedValue([{ userId: 'member-1' }]);
    await service.createStageTasks(user, theCase.id, CaseStage.FILING, [{ title: 'งานใหม่', assigneeId: 'member-1' }]);
    expect(prisma.case.update).toHaveBeenCalledWith({ where: { id: theCase.id }, data: { stageTasksHandledFor: CaseStage.FILING } });
  });

  it('dismissStageTasks marks the stage as handled without creating tasks', async () => {
    const { service, prisma } = buildService();
    await expect(service.dismissStageTasks(user, theCase.id, CaseStage.CLOSING)).resolves.toEqual({ dismissed: true });
    expect(prisma.case.update).toHaveBeenCalledWith({ where: { id: theCase.id }, data: { stageTasksHandledFor: CaseStage.CLOSING } });
    expect(prisma.task.create).not.toHaveBeenCalled();
  });

  it('dismissStageTasks rejects a case the user cannot access', async () => {
    const { service, prisma } = buildService();
    prisma.case.findFirst.mockResolvedValue(null);
    await expect(service.dismissStageTasks(user, 'other-case', CaseStage.CLOSING)).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.case.update).not.toHaveBeenCalled();
  });
```

Add `NotFoundException` to the `@nestjs/common` import at the top of the spec.

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd apps/api && pnpm jest src/practice-setup/practice-setup.service.spec.ts`
Expected: 4 new tests FAIL (`dismissStageTasks is not a function`, missing `task.findMany`/`case.update` calls).

- [ ] **Step 4: Implement**

In `proposeStageTasks`, after building `stepsByTitle` and before `if (!stepsByTitle.size) return [];`:

```ts
    // คดีย้อนกลับมาขั้นเดิม — อย่าเสนองานที่สร้างจากขั้นนี้ไปแล้ว
    const existing = await this.prisma.task.findMany({ where: { caseId, labels: { has: `stage:${stage}` } }, select: { title: true } });
    for (const t of existing) stepsByTitle.delete(t.title);
```

In `createStageTasks`, after `const taskIds = ...`:

```ts
    await this.prisma.case.update({ where: { id: caseId }, data: { stageTasksHandledFor: stage } });
```

New method after `createStageTasks`:

```ts
  /** ผู้ใช้เลือกไม่สร้างงานแนะนำของขั้นนี้ — ซ่อนแถบงานแนะนำจนกว่าคดีจะเปลี่ยนขั้น */
  async dismissStageTasks(user: AuthUser, caseId: string, stage: CaseStage): Promise<{ dismissed: true }> {
    const c = await this.prisma.case.findFirst({ where: { id: caseId, ...this.access.getCaseFilterForUser(user) } });
    if (!c) throw new NotFoundException('Case not found');
    await this.prisma.case.update({ where: { id: caseId }, data: { stageTasksHandledFor: stage } });
    return { dismissed: true };
  }
```

Controller — DTO next to `CreateStageTasksDto`:

```ts
class DismissStageTasksDto { @IsEnum(CaseStage) stage!: CaseStage; }
```

Route after the `createStageTasks` route:

```ts
  @Post('cases/:caseId/stage-tasks/dismiss')
  @UseGuards(CaseAccessGuard)
  dismissStageTasks(@CurrentUser() u: AuthUser, @Param('caseId', ParseUUIDPipe) id: string, @Body() dto: DismissStageTasksDto) {
    return this.service.dismissStageTasks(u, id, dto.stage);
  }
```

- [ ] **Step 5: Run tests + typecheck**

Run: `cd apps/api && pnpm jest src/practice-setup && pnpm tsc --noEmit -p tsconfig.json`
Expected: all PASS, no type errors.

- [ ] **Step 6: Apply migration locally**

```bash
cd apps/api && psql "$DATABASE_URL" -f prisma/migrations/20260928120000_case_stage_tasks_handled/migration.sql && pnpm prisma migrate resolve --applied 20260928120000_case_stage_tasks_handled
```

Verify: `psql "$DATABASE_URL" -c 'SELECT count(*) FROM "Case" WHERE "stageTasksHandledFor" IS DISTINCT FROM "stage"'` → `0`.
(If no local DB is reachable, skip and note it in the report.)

- [ ] **Step 7: Commit**

```bash
git add apps/api/prisma apps/api/src/practice-setup
git commit -m "feat(api): track handled stage tasks, dismiss endpoint, skip duplicate proposals"
```

---

### Task 2: Web — stage-task banner on the case page

**Files:**
- Modify: `apps/web/src/lib/api.ts` (`CaseItem` near line 346; stage-task helpers near line 1767)
- Modify: `apps/web/src/app/(dashboard)/cases/[id]/page.tsx` (state ~218, handlers ~405-470, JSX near header and `<StageTasksDialog>` ~880)

**Interfaces:**
- Consumes: Task 1 endpoint `POST /practice-setup/cases/:caseId/stage-tasks/dismiss` and `stageTasksHandledFor` on case detail.
- Produces: `api.dismissStageTasks(token: string, caseId: string, stage: string): Promise<{ dismissed: true }>`

- [ ] **Step 1: API client**

In `CaseItem` after `stageChangedAt?: string;`:

```ts
  stageTasksHandledFor?: string | null;
```

After `createStageTasks` in `api`:

```ts
  dismissStageTasks: (token: string, caseId: string, stage: string) =>
    request<{ dismissed: true }>(`/practice-setup/cases/${caseId}/stage-tasks/dismiss`, {
      method: 'POST',
      token,
      body: JSON.stringify({ stage }),
    }),
```

- [ ] **Step 2: Banner state + loader**

Next to `stageTaskProposals` state:

```ts
  const [bannerProposals, setBannerProposals] = useState<StageTaskProposal[]>([]);
```

Effect (place after `loadCase` is defined):

```ts
  // ขั้นเปลี่ยนจากทางไหนก็ได้ (ปิดคดี, แปลงเรื่องรับเข้า, ...) — ถ้ายังไม่ได้จัดการงานแนะนำของขั้นนี้ให้เสนอ
  useEffect(() => {
    const stage = legalCase?.stage;
    if (!token || !id || !stage || stage === legalCase?.stageTasksHandledFor) {
      setBannerProposals([]);
      return;
    }
    api
      .getStageTaskProposals(token, id, stage)
      .then(setBannerProposals)
      .catch((err) => {
        console.error(err);
        setBannerProposals([]);
      });
  }, [token, id, legalCase?.stage, legalCase?.stageTasksHandledFor]);

  const openBannerProposals = () => {
    if (!legalCase) return;
    if (lawyers.length === 0) api.getLawyers(token!).then(setLawyers).catch(() => {});
    setStageTaskError('');
    setStageTaskProposals(bannerProposals);
    setPendingStage(legalCase.stage);
  };
```

- [ ] **Step 3: Handlers reuse — skip no-op stage PATCH, mark skip as handled**

In `handleStageOnly` replace `await applyStageChange(pendingStage);` with:

```ts
      if (pendingStage !== legalCase?.stage) await applyStageChange(pendingStage);
      await api.dismissStageTasks(token!, id!, pendingStage).catch(console.error);
      loadCase();
```

(`handleStageOnly` must also start with `if (!token || !id || !pendingStage) return;`.)

In `handleStageAndCreateTasks` replace `await applyStageChange(pendingStage);` with:

```ts
      if (pendingStage !== legalCase?.stage) await applyStageChange(pendingStage);
```

(`createStageTasks` already marks handled server-side; `loadCase()` after it refreshes the banner.)

- [ ] **Step 4: Banner JSX**

Directly above the tabs/body of the case page (below the case header block), render:

```tsx
        {bannerProposals.length > 0 && pendingStage === null && (
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-primary/30 bg-primary/5 px-4 py-3 text-sm">
            <span>
              ⚡ ขั้น <b>{caseStageLabel(legalCase.stage, 'th')}</b> มีงานแนะนำ {bannerProposals.length} งาน
            </span>
            <Button size="sm" onClick={openBannerProposals}>ดูและสร้างงาน</Button>
          </div>
        )}
```

- [ ] **Step 5: Typecheck + tests**

Run: `pnpm --filter web exec tsc --noEmit && pnpm --filter web test`
Expected: no errors, existing tests PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/lib/api.ts "apps/web/src/app/(dashboard)/cases/[id]/page.tsx"
git commit -m "feat(web): stage-task banner on case page for stages changed anywhere"
```

---

### Task 3: Web — one SOP menu (plain + automated)

**Files:**
- Modify: `apps/web/src/app/(dashboard)/sops/page.tsx`
- Modify: `apps/web/src/app/(dashboard)/playbooks/page.tsx` (heading line ~125, `useEffect` load)
- Modify: `apps/web/src/components/layout/SamnuanSidebar.tsx:77` (remove `/playbooks` entry)
- Modify: `apps/web/src/lib/i18n/dashboard.ts:47` and `:1114` (sops label)

**Interfaces:**
- Consumes: `setupRequest<PlaybookRelease[]>(token, '/playbooks')` from `@/lib/practice-setup` (returns all versions, newest version first per name).
- Produces: `/playbooks?id=<releaseId>` opens that release in the editor; `/playbooks?new=1` opens a blank editor.

- [ ] **Step 1: SOP page — load playbooks and merge**

Add imports:

```ts
import Link from 'next/link';
import { PlaybookRelease, setupRequest } from '@/lib/practice-setup';
import { Zap } from 'lucide-react';
```

State + loading (inside `SopsPage`):

```ts
  const [playbooks, setPlaybooks] = useState<PlaybookRelease[]>([]);
  const [onlyAuto, setOnlyAuto] = useState(false);

  useEffect(() => {
    if (!token) return;
    setupRequest<PlaybookRelease[]>(token, '/playbooks')
      .then((all) => {
        // API ส่งทุก version — เก็บเฉพาะ version ล่าสุดของแต่ละชื่อ
        const latest = new Map<string, PlaybookRelease>();
        for (const p of all) if (!latest.has(p.name) || p.version > latest.get(p.name)!.version) latest.set(p.name, p);
        setPlaybooks([...latest.values()]);
      })
      .catch(console.error);
  }, [token]);

  const autoItems = playbooks.filter((p) => !q || p.name.toLowerCase().includes(q.toLowerCase()));
```

- [ ] **Step 2: Header actions, filter, list**

Header: title `"SOP / คู่มือการทำงาน"`, description `"คู่มือให้คนอ่าน และ SOP อัตโนมัติ (⚡) ที่ระบบสร้างงานให้เมื่อคดีเข้าขั้น"`. Owner actions:

```tsx
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => setEditing({})}>
                <Plus className="mr-1 h-4 w-4" /> SOP เอกสาร
              </Button>
              <Button size="sm" asChild>
                <Link href="/playbooks?new=1"><Zap className="mr-1 h-4 w-4" /> SOP อัตโนมัติ</Link>
              </Button>
            </div>
```

(If `Button` has no `asChild`, wrap: `<Link href="/playbooks?new=1"><Button size="sm">…</Button></Link>`.)

Next to the search input:

```tsx
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={onlyAuto} onChange={(e) => setOnlyAuto(e.target.checked)} />
          เฉพาะ SOP อัตโนมัติ
        </label>
```

(Wrap search + checkbox in `<div className="mb-4 flex flex-wrap items-center gap-3">` and drop `mb-4` from the Input.)

Above the existing plain-SOP list render the automated cards; hide plain SOPs when `onlyAuto`:

```tsx
      {autoItems.length > 0 && (
        <div className="mb-3 space-y-3">
          {autoItems.map((p) => (
            <Link key={p.id} href={`/playbooks?id=${p.id}`} className="block">
              <Card className="transition-colors hover:border-primary/50">
                <CardContent className="flex items-center gap-2 p-4">
                  <Zap className="h-4 w-4 shrink-0 text-amber-500" />
                  <span className="font-semibold">{p.name}</span>
                  <Badge variant="muted">อัตโนมัติ · {p.steps.length} ขั้นตอน</Badge>
                  <span className="ml-auto text-xs text-muted-foreground">v{p.version}</span>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
```

Change the plain list condition so `onlyAuto` hides it, and the empty state shows only when both lists are empty:

```tsx
      {loading ? (
        <PageLoading title="กำลังโหลด SOP" lines={3} />
      ) : onlyAuto ? null : sops.length === 0 ? (
        autoItems.length === 0 && <EmptyState ... />   // keep existing EmptyState props
      ) : ( ...existing list... )}
```

- [ ] **Step 3: Playbooks page — deep links + heading**

```ts
import { useSearchParams } from 'next/navigation';
...
  const params = useSearchParams();
```

Replace the load effect with one that opens the requested item once data arrives:

```ts
  useEffect(() => {
    load()
      .then(() => { if (params.get('new') === '1') resetForm(); })
      .catch(e => setError(e.message));
  }, [token]);
  useEffect(() => {
    const id = params.get('id');
    const target = id && items.find((p) => p.id === id);
    if (target) startDraft(target);
  }, [items]);
```

(`load` currently returns after `setItems`; make it `return` the promise — it already is `async`.)
If the page isn't wrapped in `<Suspense>` and Next complains about `useSearchParams`, wrap the default export body in a child component under `<Suspense>`.

Heading: replace `<h1 className="text-2xl font-semibold">Playbooks</h1>` with:

```tsx
      <Link href="/sops" className="text-sm text-primary">← SOP</Link>
      <h1 className="text-2xl font-semibold">{th ? 'SOP อัตโนมัติ' : 'Automated SOPs'}</h1>
```

- [ ] **Step 4: Sidebar + i18n**

Delete the `/playbooks` line in `SamnuanSidebar.tsx`; remove `Workflow` from the lucide import if now unused.
`dashboard.ts:47` → `sops: 'SOP / คู่มือ & อัตโนมัติ',`; `:1114` → `sops: 'SOPs & automations',`. Leave the `playbooks` keys (onboarding tour may use them).

- [ ] **Step 5: Typecheck + tests**

Run: `pnpm --filter web exec tsc --noEmit && pnpm --filter web test`
Expected: no errors, tests PASS.

- [ ] **Step 6: Commit**

```bash
git add "apps/web/src/app/(dashboard)/sops/page.tsx" "apps/web/src/app/(dashboard)/playbooks/page.tsx" apps/web/src/components/layout/SamnuanSidebar.tsx apps/web/src/lib/i18n/dashboard.ts
git commit -m "feat(web): single SOP menu listing plain and automated SOPs"
```

---

### Task 4: Browser verification (controller, not a subagent)

- [ ] Start worktree preview (ports 3011/3015 per project convention).
- [ ] Case with a playbook step on `CLOSING`: close the case → open case page → banner shows → "ข้าม" → banner gone, reload → still gone.
- [ ] New case (PRE_LITIGATION) of a type with default playbook → banner shows → create → tasks appear, banner gone.
- [ ] `/sops`: ⚡ items listed, filter works, click opens `/playbooks?id=…` with that playbook in the editor; sidebar has no Playbook entry.

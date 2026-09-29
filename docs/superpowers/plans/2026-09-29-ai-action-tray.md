# AI Action Tray Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A computed "AI tray" shows cards for new documents AI hasn't read (one click: extract dates + summarize, per file) and for AI-proposed dates awaiting confirmation. It appears on the case page and in the AI Assistant.

**Architecture:** New `ai-tray` Nest module computes cards from existing tables plus a new `Document.aiTrayHandledAt` marker. The web calls the existing per-document AI endpoints one file at a time, then marks each file handled.

**Tech Stack:** NestJS + Prisma (apps/api, jest), Next.js (apps/web), `@lawfirm/shared` (`AI_CREDIT_COST`, `DOCUMENT_ANALYSIS_MIME_TYPES`, `DateSuggestionStatus`).

**Spec:** `docs/superpowers/specs/2026-09-29-ai-action-tray-design.md`

## Global Constraints

- AI never runs without a user click; show the credit cost and `confirm()` before running.
- AI-proposed dates stay `PENDING`; confirmation happens in the existing `DateSuggestionsPanel`.
- Existing documents are backfilled as handled (`aiTrayHandledAt = NOW()`).
- Credit cost per document = `AI_CREDIT_COST.DOCUMENT_ANALYSIS * 2` (dates + summary).
- Never run `prisma migrate dev`; apply locally with `psql` + `prisma migrate resolve --applied`.
- Rebuild shared first: `pnpm --filter @lawfirm/shared build`.
- UI copy in Thai.

---

### Task 1: API — `ai-tray` module

**Files:**
- Modify: `apps/api/prisma/schema.prisma` (model `Document`, after `visibleToClient`)
- Create: `apps/api/prisma/migrations/20260929130000_document_ai_tray_handled/migration.sql`
- Create: `apps/api/src/ai-tray/ai-tray.service.ts`
- Create: `apps/api/src/ai-tray/ai-tray.controller.ts`
- Create: `apps/api/src/ai-tray/ai-tray.module.ts`
- Modify: `apps/api/src/app.module.ts` (import + register `AiTrayModule`)
- Test: `apps/api/src/ai-tray/ai-tray.service.spec.ts`

**Interfaces:**
- Produces: `GET /ai-tray?caseId=<uuid?>` → `AiTrayCard[]`; `POST /ai-tray/documents/handled` body `{ documentIds: string[] }` → `{ handled: number }`
- Produces: `AiTrayService.list(user: AuthUser, caseId?: string): Promise<AiTrayCard[]>`, `AiTrayService.markHandled(user: AuthUser, documentIds: string[]): Promise<{ handled: number }>`
- `AiTrayCard` is exported from `ai-tray.service.ts`:

```ts
export type AiTrayCard =
  | { type: 'UNREAD_DOCUMENTS'; caseId: string; caseTitle: string; caseRef: string | null;
      documents: { id: string; filename: string; createdAt: string }[]; creditCost: number }
  | { type: 'PENDING_DATES'; caseId: string; caseTitle: string; caseRef: string | null; count: number };
```

- [ ] **Step 1: Schema + migration**

`schema.prisma`, model `Document`, after `visibleToClient`:

```prisma
  /// ถาดงาน AI: ตั้งเมื่อผู้ใช้ "ข้าม" หรือ AI อ่านครบ (จับวัน + สรุป) — null = ยังรอในถาด
  aiTrayHandledAt     DateTime?
```

`migration.sql`:

```sql
-- Existing documents are treated as handled so only uploads after deploy enter the AI tray.
ALTER TABLE "Document" ADD COLUMN "aiTrayHandledAt" TIMESTAMP(3);
UPDATE "Document" SET "aiTrayHandledAt" = NOW();
```

Run: `cd apps/api && pnpm prisma generate`

- [ ] **Step 2: Write the failing tests** — `ai-tray.service.spec.ts`

```ts
import { NotFoundException } from '@nestjs/common';
import { AI_CREDIT_COST, DOCUMENT_ANALYSIS_MIME_TYPES, DateSuggestionStatus, type AuthUser } from '@lawfirm/shared';
import { AiTrayService } from './ai-tray.service';

describe('AiTrayService', () => {
  const user = { id: 'u1', firmId: 'f1' } as AuthUser;
  const caseFilter = { firmId: 'f1' };

  function build() {
    const prisma = {
      document: { findMany: jest.fn().mockResolvedValue([]), updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
      documentDateSuggestion: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const access = { getCaseFilterForUser: jest.fn().mockReturnValue(caseFilter) };
    return { service: new AiTrayService(prisma as never, access as never), prisma, access };
  }

  it('queries only unhandled, analyzable, unread documents in cases the user can access', async () => {
    const { service, prisma } = build();
    await service.list(user, 'c1');
    expect(prisma.document.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        caseId: 'c1',
        case: caseFilter,
        aiTrayHandledAt: null,
        mimeType: { in: [...DOCUMENT_ANALYSIS_MIME_TYPES] },
        knowledge: { none: {} },
      },
      take: 200,
    }));
    expect(prisma.documentDateSuggestion.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { caseId: 'c1', status: DateSuggestionStatus.PENDING, case: caseFilter },
      take: 500,
    }));
  });

  it('without caseId queries every accessible case', async () => {
    const { service, prisma } = build();
    await service.list(user);
    expect(prisma.document.findMany.mock.calls[0][0].where.caseId).toEqual({ not: null });
  });

  it('groups unread documents per case with a credit estimate, and counts pending dates per case', async () => {
    const { service, prisma } = build();
    const kase = { id: 'c1', title: 'คดี A', ownRef: 'A-1' };
    prisma.document.findMany.mockResolvedValue([
      { id: 'd2', filename: 'b.pdf', createdAt: new Date('2026-09-29T02:00:00Z'), caseId: 'c1', case: kase },
      { id: 'd1', filename: 'a.pdf', createdAt: new Date('2026-09-29T01:00:00Z'), caseId: 'c1', case: kase },
    ]);
    prisma.documentDateSuggestion.findMany.mockResolvedValue([
      { caseId: 'c2', case: { id: 'c2', title: 'คดี B', ownRef: null } },
      { caseId: 'c2', case: { id: 'c2', title: 'คดี B', ownRef: null } },
    ]);
    const cards = await service.list(user);
    expect(cards).toEqual([
      {
        type: 'UNREAD_DOCUMENTS', caseId: 'c1', caseTitle: 'คดี A', caseRef: 'A-1',
        documents: [
          { id: 'd2', filename: 'b.pdf', createdAt: '2026-09-29T02:00:00.000Z' },
          { id: 'd1', filename: 'a.pdf', createdAt: '2026-09-29T01:00:00.000Z' },
        ],
        creditCost: 2 * AI_CREDIT_COST.DOCUMENT_ANALYSIS * 2,
      },
      { type: 'PENDING_DATES', caseId: 'c2', caseTitle: 'คดี B', caseRef: null, count: 2 },
    ]);
  });

  it('markHandled stamps only documents in accessible cases', async () => {
    const { service, prisma } = build();
    prisma.document.findMany.mockResolvedValue([{ id: 'd1' }, { id: 'd2' }]);
    prisma.document.updateMany.mockResolvedValue({ count: 2 });
    await expect(service.markHandled(user, ['d1', 'd2'])).resolves.toEqual({ handled: 2 });
    expect(prisma.document.findMany).toHaveBeenCalledWith({ where: { id: { in: ['d1', 'd2'] }, case: caseFilter }, select: { id: true } });
    expect(prisma.document.updateMany).toHaveBeenCalledWith({ where: { id: { in: ['d1', 'd2'] } }, data: { aiTrayHandledAt: expect.any(Date) } });
  });

  it('markHandled rejects the whole request when any document is out of reach', async () => {
    const { service, prisma } = build();
    prisma.document.findMany.mockResolvedValue([{ id: 'd1' }]);
    await expect(service.markHandled(user, ['d1', 'other'])).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.document.updateMany).not.toHaveBeenCalled();
  });
});
```

If `DateSuggestionStatus` is not exported from `@lawfirm/shared`, import it from `../generated/prisma` in both the spec and the service (check how `intelligence/date-suggestions.service.ts` imports it and match).

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd apps/api && pnpm jest src/ai-tray`
Expected: FAIL (`Cannot find module './ai-tray.service'`).

- [ ] **Step 4: Implement the service** — `ai-tray.service.ts`

```ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { AI_CREDIT_COST, DOCUMENT_ANALYSIS_MIME_TYPES, DateSuggestionStatus, AuthUser } from '@lawfirm/shared';
import { PrismaService } from '../prisma/prisma.module';
import { CaseAccessService } from '../common/services/case-access.service';

export type AiTrayCard =
  | { type: 'UNREAD_DOCUMENTS'; caseId: string; caseTitle: string; caseRef: string | null;
      documents: { id: string; filename: string; createdAt: string }[]; creditCost: number }
  | { type: 'PENDING_DATES'; caseId: string; caseTitle: string; caseRef: string | null; count: number };

/** จับวัน + สรุป ต่อหนึ่งไฟล์ */
const CREDITS_PER_DOCUMENT = AI_CREDIT_COST.DOCUMENT_ANALYSIS * 2;

/**
 * งานที่ AI เตรียมไว้ให้ — คำนวณสดจากข้อมูลเดิม ไม่รัน AI เอง (ผู้ใช้กดเท่านั้น).
 * เพดานจำนวนแถวกันคำขอใหญ่เกิน: ถาดคือรายการที่ควรทำ ไม่ใช่รายงานครบถ้วน.
 */
@Injectable()
export class AiTrayService {
  constructor(private prisma: PrismaService, private access: CaseAccessService) {}

  async list(user: AuthUser, caseId?: string): Promise<AiTrayCard[]> {
    const caseFilter = this.access.getCaseFilterForUser(user);
    const caseSelect = { select: { id: true, title: true, ownRef: true } } as const;
    const [documents, pendingDates] = await Promise.all([
      this.prisma.document.findMany({
        where: {
          caseId: caseId ?? { not: null },
          case: caseFilter,
          aiTrayHandledAt: null,
          mimeType: { in: [...DOCUMENT_ANALYSIS_MIME_TYPES] },
          knowledge: { none: {} },
        },
        select: { id: true, filename: true, createdAt: true, caseId: true, case: caseSelect },
        orderBy: { createdAt: 'desc' },
        take: 200,
      }),
      this.prisma.documentDateSuggestion.findMany({
        where: { caseId: caseId ?? undefined, status: DateSuggestionStatus.PENDING, case: caseFilter },
        select: { caseId: true, case: caseSelect },
        take: 500,
      }),
    ]);

    const cards: AiTrayCard[] = [];
    const docCards = new Map<string, Extract<AiTrayCard, { type: 'UNREAD_DOCUMENTS' }>>();
    for (const d of documents) {
      if (!d.caseId || !d.case) continue;
      let card = docCards.get(d.caseId);
      if (!card) {
        card = { type: 'UNREAD_DOCUMENTS', caseId: d.caseId, caseTitle: d.case.title, caseRef: d.case.ownRef, documents: [], creditCost: 0 };
        docCards.set(d.caseId, card);
        cards.push(card);
      }
      card.documents.push({ id: d.id, filename: d.filename, createdAt: d.createdAt.toISOString() });
      card.creditCost += CREDITS_PER_DOCUMENT;
    }
    const dateCards = new Map<string, Extract<AiTrayCard, { type: 'PENDING_DATES' }>>();
    for (const s of pendingDates) {
      let card = dateCards.get(s.caseId);
      if (!card) {
        card = { type: 'PENDING_DATES', caseId: s.caseId, caseTitle: s.case.title, caseRef: s.case.ownRef, count: 0 };
        dateCards.set(s.caseId, card);
        cards.push(card);
      }
      card.count += 1;
    }
    return cards;
  }

  async markHandled(user: AuthUser, documentIds: string[]): Promise<{ handled: number }> {
    const reachable = await this.prisma.document.findMany({
      where: { id: { in: documentIds }, case: this.access.getCaseFilterForUser(user) },
      select: { id: true },
    });
    if (reachable.length !== new Set(documentIds).size) throw new NotFoundException('ไม่พบเอกสาร');
    const { count } = await this.prisma.document.updateMany({ where: { id: { in: documentIds } }, data: { aiTrayHandledAt: new Date() } });
    return { handled: count };
  }
}
```

(Adjust `select`/types to what Prisma's generated types require — e.g. `case` may be typed nullable on Document; the `continue` guard covers it. Match the `Case.title`/`ownRef` field names in the schema.)

- [ ] **Step 5: Controller + module + registration**

`ai-tray.controller.ts`:

```ts
import { Body, Controller, Get, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsUUID } from 'class-validator';
import { AuthUser } from '@lawfirm/shared';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AiTrayService } from './ai-tray.service';

class MarkHandledDto {
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(50) @IsUUID('4', { each: true }) documentIds!: string[];
}

@Controller('ai-tray')
@UseGuards(JwtAuthGuard)
export class AiTrayController {
  constructor(private readonly service: AiTrayService) {}

  @Get()
  list(@CurrentUser() u: AuthUser, @Query('caseId', new ParseUUIDPipe({ optional: true })) caseId?: string) {
    return this.service.list(u, caseId);
  }

  @Post('documents/handled')
  markHandled(@CurrentUser() u: AuthUser, @Body() dto: MarkHandledDto) {
    return this.service.markHandled(u, dto.documentIds);
  }
}
```

(If document ids in this codebase are not v4 UUIDs, use `@IsUUID('all', { each: true })` — check `BatchAnalysisDto`, which uses `'4'`.)

`ai-tray.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { AiTrayController } from './ai-tray.controller';
import { AiTrayService } from './ai-tray.service';

@Module({ controllers: [AiTrayController], providers: [AiTrayService] })
export class AiTrayModule {}
```

Register `AiTrayModule` in `app.module.ts` `imports` (next to `IntelligenceModule`). `CaseAccessService` and `PrismaService` come from global modules — confirm by checking how `PracticeSetupService` gets them.

- [ ] **Step 6: Run tests + typecheck**

Run: `cd apps/api && pnpm jest src/ai-tray && pnpm tsc --noEmit -p tsconfig.json`
Expected: PASS, no type errors. If `app.module.spec.ts` asserts the module list, update it.

- [ ] **Step 7: Apply migration locally**

```bash
cd apps/api && set -a && . ./.env && set +a && psql "${DATABASE_URL%%\?*}" -v ON_ERROR_STOP=1 -f prisma/migrations/20260929130000_document_ai_tray_handled/migration.sql && pnpm prisma migrate resolve --applied 20260929130000_document_ai_tray_handled
```

(If `apps/api/.env` is missing, copy it from `/Users/pongpanot_s/Documents/dev/lawfirm/apps/api/.env`. If the DB is unreachable, skip and report.)

- [ ] **Step 8: Commit**

```bash
git add apps/api/prisma apps/api/src/ai-tray apps/api/src/app.module.ts
git commit -m "feat(api): AI tray — unread documents and pending AI dates per case"
```

---

### Task 2: Web — `AiTrayCards` on the case page and in AI Assistant

**Files:**
- Modify: `apps/web/src/lib/api.ts` (types + `getAiTray`, `markAiTrayHandled` next to `extractDatesFromDocument`)
- Create: `apps/web/src/components/ai/AiTrayCards.tsx`
- Modify: `apps/web/src/app/(dashboard)/cases/[id]/page.tsx` (render under the stage-task banner, ~line 873)
- Modify: `apps/web/src/components/ai/AIAssistantPanel.tsx` (in the `!active` branch, above `เลือกฟีเจอร์ AI ที่ต้องการใช้งาน`)

**Interfaces:**
- Consumes: Task 1 routes; existing `api.extractDatesFromDocument(token, caseId, documentId)` and `api.analyzeExistingDocument(token, caseId, documentId)`
- Produces: `api.getAiTray(token: string, caseId?: string): Promise<AiTrayCard[]>`, `api.markAiTrayHandled(token: string, documentIds: string[]): Promise<{ handled: number }>`, `<AiTrayCards caseId?: string compact?: boolean onChanged?: () => void />`

- [ ] **Step 1: API client** (in `api.ts`)

Types (near `DateSuggestionItem`):

```ts
export type AiTrayCard =
  | { type: 'UNREAD_DOCUMENTS'; caseId: string; caseTitle: string; caseRef: string | null;
      documents: { id: string; filename: string; createdAt: string }[]; creditCost: number }
  | { type: 'PENDING_DATES'; caseId: string; caseTitle: string; caseRef: string | null; count: number };
```

Methods (after `extractDatesFromDocument`):

```ts
  // ถาดงาน AI — งานที่ AI เตรียมไว้ให้ (ไม่รัน AI เอง)
  getAiTray: (token: string, caseId?: string) =>
    request<AiTrayCard[]>(`/ai-tray${caseId ? `?caseId=${caseId}` : ''}`, { token }),
  markAiTrayHandled: (token: string, documentIds: string[]) =>
    request<{ handled: number }>('/ai-tray/documents/handled', {
      method: 'POST',
      token,
      body: JSON.stringify({ documentIds }),
    }),
```

- [ ] **Step 2: `AiTrayCards.tsx`**

```tsx
'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { CalendarCheck, Sparkles } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { api, type AiTrayCard } from '@/lib/api';
import { Button } from '@/components/ui/button';

type DocStatus = 'running' | 'done' | 'failed';
type UnreadCard = Extract<AiTrayCard, { type: 'UNREAD_DOCUMENTS' }>;

/**
 * ถาดงาน AI: เสนองาน ไม่รันเอง — AI ทำงานเมื่อผู้ใช้กด และบอกเครดิตก่อนเสมอ.
 * caseId → เฉพาะคดีนั้น (หน้าคดี); ไม่ส่ง → ทุกคดีที่เข้าถึงได้ (AI Assistant).
 */
export function AiTrayCards({ caseId, compact = false, onChanged }: { caseId?: string; compact?: boolean; onChanged?: () => void }) {
  const { token } = useAuth();
  const [cards, setCards] = useState<AiTrayCard[] | null>(null);

  const load = useCallback(() => {
    if (!token) return;
    api.getAiTray(token, caseId).then(setCards).catch((err) => {
      console.error(err);
      setCards([]);
    });
  }, [token, caseId]);
  useEffect(load, [load]);

  if (!cards) return null;
  if (!cards.length) return compact ? <p className="text-xs text-muted-foreground">ไม่มีงาน AI ค้าง</p> : null;

  return (
    <div className={compact ? 'space-y-2' : 'mb-4 space-y-2'}>
      {cards.map((card) =>
        card.type === 'UNREAD_DOCUMENTS' ? (
          <UnreadDocumentsCard key={`d-${card.caseId}`} card={card} showCase={!caseId} onDone={() => { load(); onChanged?.(); }} />
        ) : (
          <div key={`p-${card.caseId}`} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-4 py-3 text-sm">
            <span className="flex items-center gap-2">
              <CalendarCheck className="h-4 w-4 text-primary" />
              {!caseId && <b>{card.caseRef ?? card.caseTitle}:</b>} มีวันนัด/ครบกำหนด {card.count} รายการที่ AI เสนอ รอยืนยัน
            </span>
            <Link href={`/cases/${card.caseId}?tab=calendar`}>
              <Button size="sm" variant="outline">ตรวจวันที่</Button>
            </Link>
          </div>
        ),
      )}
    </div>
  );
}

function UnreadDocumentsCard({ card, showCase, onDone }: { card: UnreadCard; showCase: boolean; onDone: () => void }) {
  const { token } = useAuth();
  const [selected, setSelected] = useState<Set<string>>(() => new Set(card.documents.map((d) => d.id)));
  const [status, setStatus] = useState<Record<string, DocStatus>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const perDoc = card.documents.length ? card.creditCost / card.documents.length : 0;
  const cost = selected.size * perDoc;

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });

  const run = async () => {
    if (!token || !selected.size) return;
    if (!confirm(`ให้ AI อ่าน ${selected.size} ไฟล์ (จับวันสำคัญ + สรุป) ใช้ ${cost} เครดิต?`)) return;
    setBusy(true);
    // ทีละไฟล์: ไฟล์ไหนพังเห็นชัด ไฟล์ที่เหลือยังทำต่อ และไฟล์ที่พังยังอยู่ในถาดให้ลองใหม่
    for (const id of selected) {
      setStatus((s) => ({ ...s, [id]: 'running' }));
      try {
        await api.extractDatesFromDocument(token, card.caseId, id);
        await api.analyzeExistingDocument(token, card.caseId, id);
        await api.markAiTrayHandled(token, [id]);
        setStatus((s) => ({ ...s, [id]: 'done' }));
      } catch (err) {
        setStatus((s) => ({ ...s, [id]: 'failed' }));
        setErrors((e) => ({ ...e, [id]: err instanceof Error ? err.message : 'อ่านไม่สำเร็จ' }));
      }
    }
    setBusy(false);
    onDone();
  };

  const skip = async () => {
    if (!token || !selected.size) return;
    setBusy(true);
    try {
      await api.markAiTrayHandled(token, [...selected]);
      onDone();
    } catch (err) {
      console.error(err);
    } finally {
      setBusy(false);
    }
  };

  const mark = (id: string) => (status[id] === 'running' ? '⏳' : status[id] === 'done' ? '✓' : status[id] === 'failed' ? '✕' : '');

  return (
    <div className="rounded-lg border border-primary/30 bg-primary/5 px-4 py-3 text-sm">
      <p className="flex items-center gap-2 font-medium">
        <Sparkles className="h-4 w-4 text-primary" />
        {showCase && (
          <Link href={`/cases/${card.caseId}`} className="text-primary underline">{card.caseRef ?? card.caseTitle}</Link>
        )}
        มีเอกสารใหม่ {card.documents.length} ฉบับที่ AI ยังไม่อ่าน
      </p>
      <ul className="mt-2 space-y-1">
        {card.documents.map((d) => (
          <li key={d.id}>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={selected.has(d.id)} disabled={busy} onChange={() => toggle(d.id)} />
              <span className="truncate">{d.filename}</span>
              <span className="w-4">{mark(d.id)}</span>
            </label>
            {errors[d.id] && <p className="ml-6 text-xs text-red-600">{errors[d.id]}</p>}
          </li>
        ))}
      </ul>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button size="sm" onClick={run} disabled={busy || !selected.size}>
          ✦ ให้ AI อ่าน ({cost} เครดิต)
        </Button>
        <Button size="sm" variant="ghost" onClick={skip} disabled={busy || !selected.size}>ข้าม</Button>
      </div>
    </div>
  );
}
```

(If the case page's `Button` import path or icon set differs, match the page. Keep the file self-contained.)

- [ ] **Step 3: Case page**

Import `AiTrayCards` from `@/components/ai/AiTrayCards`. Directly after the stage-task banner block (`{bannerProposals.length > 0 && pendingStage === null && legalCase.stage && (...)}`), render:

```tsx
        <AiTrayCards caseId={id} onChanged={loadCase} />
```

(`id` is the page's case id; if it is typed `string | undefined`, guard with `{id && <AiTrayCards ... />}`.)

- [ ] **Step 4: AI Assistant**

In `AIAssistantPanel.tsx`, in the `!active` branch, before `<p className="text-sm text-muted-foreground">เลือกฟีเจอร์ AI ที่ต้องการใช้งาน</p>`:

```tsx
            <div className="space-y-2 border-b border-border pb-3">
              <p className="text-sm font-medium">งานที่ AI เตรียมไว้</p>
              <AiTrayCards compact />
            </div>
```

- [ ] **Step 5: Typecheck + tests**

Run: `pnpm --filter web exec tsc --noEmit && pnpm --filter web test`
Expected: clean, all pass.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/lib/api.ts apps/web/src/components/ai/AiTrayCards.tsx "apps/web/src/app/(dashboard)/cases/[id]/page.tsx" apps/web/src/components/ai/AIAssistantPanel.tsx
git commit -m "feat(web): AI tray cards on case page and AI Assistant"
```

---

### Task 3: Browser verification (controller, not a subagent)

- [ ] Worktree preview on free ports (3021/3026 pattern); temporary `.claude/launch.json` entries reverted after.
- [ ] Upload a PDF to a case → the case page shows the ✦ card, and the AI Assistant (on a non-case page) shows it with the case link.
- [ ] Skip → the card disappears and stays gone after reload.
- [ ] Upload again → run → without `OPENAI_API_KEY` the file shows ✕ with a message and remains in the tray (with a key: ✓, date suggestions appear, the date card appears and links to `?tab=calendar`).
- [ ] Revert test data.

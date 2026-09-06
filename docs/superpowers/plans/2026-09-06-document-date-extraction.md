# Document Date Extraction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let staff extract candidate important dates (court dates, filing deadlines, statutory deadlines) from a case document via a dedicated AI action, review/edit each one, and confirm it into a real `CalendarEvent` — nothing lands on the calendar without a human reviewing it first.

**Architecture:** A new staging table, `DocumentDateSuggestion`, holds every AI-extracted date candidate (`PENDING`/`CONFIRMED`/`DISMISSED`) — this is the audit trail of what AI proposed, kept even for dismissed items. Extraction reuses `DocumentIntelligenceService.extractText()` and calls OpenAI in JSON mode to get a structured list of candidates. Confirming a suggestion reuses `CalendarService.create()` as-is (the same path a human uses creating an event by hand) — no duplicate event-creation logic. Review happens entirely on the existing case Documents page; no cross-case queue, no changes to the Operations dashboard (it already reads any `CalendarEvent.startAt`).

**Tech Stack:** NestJS 11, Prisma 6, PostgreSQL, Next.js (apps/web), Jest (`ts-jest`)

**Spec:** `docs/superpowers/specs/2026-09-06-document-date-extraction-design.md`

## Global Constraints

- Extraction never throws for "no dates found" or a malformed/failed AI call — `extractDatesWithAI` always resolves to an array (empty on any failure), never rejects.
- A suggestion's `date`, `eventType`, and `label` can be overridden by the reviewer at confirm time; overrides apply on top of the stored suggestion values, they don't mutate the stored suggestion row itself.
- `confirm` and `dismiss` never cost AI credits (no `@RequireCredits` on those handlers) — only the extraction call does, at the same 5-credit cost as the existing "analyze" action (`@RequireCredits(5)` on `POST .../documents/analyze`).
- `confirm`/`dismiss` on a suggestion that is not currently `PENDING`, or that belongs to a different case than the URL's `:caseId`, must be rejected (`ConflictException` / `NotFoundException` respectively) — never silently no-op.
- Confirming reuses `CalendarService.create()` unchanged. Be aware this has a real side effect for `COURT_DATE`-typed suggestions: it sends a LINE alert to the case's lawyers and flips `Case.status` to `COURT_DATE` — this is existing, intended behavior for creating any court-date event, not something this feature adds or should suppress.
- No changes to `OperationsService` — it already reads any `CalendarEvent.startAt` (no type filter) plus `Task.dueDate` for its near-deadline tracking, so a confirmed suggestion is picked up automatically.

---

### Task 1: `DocumentDateSuggestion` model and shared enum

**Files:**
- Modify: `packages/shared/src/index.ts`
- Modify: `apps/api/prisma/schema.prisma`
- Migration: created via `prisma migrate dev`

**Interfaces:**
- Produces: `DateSuggestionStatus` enum (`PENDING` | `CONFIRMED` | `DISMISSED`) exported from `@lawfirm/shared`, and the `DocumentDateSuggestion` Prisma model/client type (`prisma.documentDateSuggestion`) — consumed by Tasks 2–4.

**Context this task's implementer needs:** This codebase hand-duplicates simple Prisma enums into `packages/shared/src/index.ts` as plain TS enums with matching string values (see `EventType`, `TaskStatus` there) — Prisma's own generated enum is not imported by application code. `@lawfirm/shared` is a workspace package built to `dist/` (`packages/shared/package.json`'s `main`/`types` point at `dist/`), so a change to `src/index.ts` is invisible to `apps/api` until you run `pnpm --filter shared build`.

- [ ] **Step 1: Add the enum to the shared package**

In `packages/shared/src/index.ts`, add near the other small enums (e.g. right after `EventType`):
```typescript
export enum DateSuggestionStatus {
  PENDING = 'PENDING',
  CONFIRMED = 'CONFIRMED',
  DISMISSED = 'DISMISSED',
}
```

- [ ] **Step 2: Build the shared package**

Run: `(cd /Users/pongpanot_s/Documents/dev/lawfirm && pnpm --filter shared build)`
Expected: builds cleanly, `packages/shared/dist/index.js` and `.d.ts` now export `DateSuggestionStatus`.

- [ ] **Step 3: Add the matching Prisma enum and model**

In `apps/api/prisma/schema.prisma`, add the enum near the other small enums (e.g. next to `EventType`):
```prisma
enum DateSuggestionStatus {
  PENDING
  CONFIRMED
  DISMISSED
}
```

Add the model (place it near `CaseKnowledge`, which it closely resembles):
```prisma
model DocumentDateSuggestion {
  id              String               @id @default(uuid())
  caseId          String
  documentId      String?
  label           String
  suggestedDate   DateTime
  eventType       EventType            @default(DEADLINE)
  sourceExcerpt   String               @db.Text
  status          DateSuggestionStatus @default(PENDING)
  calendarEventId String?              @unique
  createdById     String
  reviewedById    String?
  reviewedAt      DateTime?
  createdAt       DateTime             @default(now())
  updatedAt       DateTime             @updatedAt

  case          Case           @relation(fields: [caseId], references: [id], onDelete: Cascade)
  document      Document?      @relation(fields: [documentId], references: [id], onDelete: SetNull)
  calendarEvent CalendarEvent? @relation(fields: [calendarEventId], references: [id], onDelete: SetNull)
  createdBy     User           @relation("DateSuggestionCreator", fields: [createdById], references: [id])
  reviewedBy    User?          @relation("DateSuggestionReviewer", fields: [reviewedById], references: [id])

  @@index([caseId, status])
}
```

Add the back-relation on `model Case { ... }` (next to the existing `knowledge CaseKnowledge[]` line):
```prisma
dateSuggestions DocumentDateSuggestion[]
```

Add the back-relation on `model Document { ... }` (next to the existing `knowledge CaseKnowledge[]` line):
```prisma
dateSuggestions DocumentDateSuggestion[]
```

Add the back-relation on `model CalendarEvent { ... }` (this is a 1:1 back-reference via the unique `calendarEventId` FK):
```prisma
dateSuggestion DocumentDateSuggestion?
```

Add both back-relations on `model User { ... }` (next to the existing `caseMessages CaseMessage[]` line):
```prisma
createdDateSuggestions  DocumentDateSuggestion[] @relation("DateSuggestionCreator")
reviewedDateSuggestions DocumentDateSuggestion[] @relation("DateSuggestionReviewer")
```

- [ ] **Step 4: Generate and apply the migration**

Run: `(cd /Users/pongpanot_s/Documents/dev/lawfirm && pnpm --filter api prisma migrate dev --name add_document_date_suggestion)`
Expected: purely additive migration (new enum, new table, new FKs, new unique/index). Retry once on `P1001`. Never `migrate reset`. If the generated SQL includes anything beyond `CREATE TYPE`/`CREATE TABLE`/`CREATE INDEX`/`CREATE UNIQUE INDEX`/`ADD CONSTRAINT`, STOP and report BLOCKED with the exact SQL.

- [ ] **Step 5: Verify**

Run: `(cd /Users/pongpanot_s/Documents/dev/lawfirm && pnpm --filter api prisma migrate status)`
Expected: "Database schema is up to date!"

- [ ] **Step 6: Commit**

```bash
(cd /Users/pongpanot_s/Documents/dev/lawfirm && git add packages/shared apps/api/prisma && git commit -m "feat(db): add DocumentDateSuggestion model" -m "$(printf '%s\n' 'Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>')")
```

---

### Task 2: AI date extraction in `DocumentIntelligenceService`

**Files:**
- Modify: `apps/api/src/intelligence/document-intelligence.service.ts`
- Test: `apps/api/src/intelligence/document-intelligence.service.spec.ts` (new file — no test file exists for this service yet)

**Interfaces:**
- Consumes: `PrismaService` (`this.prisma`), `ConfigService` (`this.config`), `this.extractText()` — all already present on the class.
- Produces: `extractDatesWithAI(text: string): Promise<{ label: string; date: string; eventType: EventType; sourceExcerpt: string }[]>` and `extractDates(fileBuffer: Buffer, mimeType: string, caseId: string, userId: string, documentId?: string): Promise<DocumentDateSuggestion[]>` — consumed by Task 4's controller.

**Context this task's implementer needs:** `DocumentIntelligenceService.summarizeWithAI` (same file) is the existing pattern for calling OpenAI — same `fetch` call shape, same `this.config.get<string>('OPENAI_API_KEY')` check. This task adds a second, JSON-structured AI call alongside it; it does not modify `summarizeWithAI`.

- [ ] **Step 1: Write the failing tests**

```typescript
// apps/api/src/intelligence/document-intelligence.service.spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventType } from '@lawfirm/shared';
import { DocumentIntelligenceService } from './document-intelligence.service';
import { PrismaService } from '../prisma/prisma.module';

describe('DocumentIntelligenceService — date extraction', () => {
  let service: DocumentIntelligenceService;
  const mockPrisma = {
    case: { findUnique: jest.fn() },
    documentDateSuggestion: { create: jest.fn() },
  };
  const mockConfig = { get: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DocumentIntelligenceService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: ConfigService, useValue: mockConfig },
      ],
    }).compile();
    service = module.get(DocumentIntelligenceService);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('extractDatesWithAI', () => {
    it('returns [] when OPENAI_API_KEY is not set', async () => {
      mockConfig.get.mockReturnValue(undefined);
      const result = await service.extractDatesWithAI('some text');
      expect(result).toEqual([]);
    });

    it('parses a valid AI JSON response into candidates', async () => {
      mockConfig.get.mockReturnValue('test-key');
      jest.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  dates: [
                    {
                      label: 'วันนัดไต่สวน',
                      date: '2026-10-01',
                      eventType: 'COURT_DATE',
                      sourceExcerpt: 'นัดไต่สวนวันที่ 1 ตุลาคม 2569',
                    },
                  ],
                }),
              },
            },
          ],
        }),
      } as Response);

      const result = await service.extractDatesWithAI('document text');

      expect(result).toEqual([
        {
          label: 'วันนัดไต่สวน',
          date: new Date('2026-10-01').toISOString(),
          eventType: EventType.COURT_DATE,
          sourceExcerpt: 'นัดไต่สวนวันที่ 1 ตุลาคม 2569',
        },
      ]);
    });

    it('drops candidates with an unparseable date', async () => {
      mockConfig.get.mockReturnValue('test-key');
      jest.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [{
            message: {
              content: JSON.stringify({
                dates: [{ label: 'x', date: 'not-a-date', eventType: 'OTHER', sourceExcerpt: 'y' }],
              }),
            },
          }],
        }),
      } as Response);

      const result = await service.extractDatesWithAI('text');
      expect(result).toEqual([]);
    });

    it('falls back to OTHER for an eventType the AI invented', async () => {
      mockConfig.get.mockReturnValue('test-key');
      jest.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [{
            message: {
              content: JSON.stringify({
                dates: [{ label: 'x', date: '2026-10-01', eventType: 'BOGUS_TYPE', sourceExcerpt: 'y' }],
              }),
            },
          }],
        }),
      } as Response);

      const result = await service.extractDatesWithAI('text');
      expect(result[0].eventType).toBe(EventType.OTHER);
    });

    it('returns [] when the AI response content is not valid JSON', async () => {
      mockConfig.get.mockReturnValue('test-key');
      jest.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        json: async () => ({ choices: [{ message: { content: 'not json at all' } }] }),
      } as Response);

      const result = await service.extractDatesWithAI('text');
      expect(result).toEqual([]);
    });

    it('returns [] when the OpenAI call itself fails', async () => {
      mockConfig.get.mockReturnValue('test-key');
      jest.spyOn(global, 'fetch').mockResolvedValue({ ok: false, status: 500 } as Response);

      const result = await service.extractDatesWithAI('text');
      expect(result).toEqual([]);
    });
  });

  describe('extractDates', () => {
    it('throws NotFoundException when the case does not exist', async () => {
      mockPrisma.case.findUnique.mockResolvedValue(null);
      await expect(
        service.extractDates(Buffer.from('x'), 'text/plain', 'case-1', 'user-1'),
      ).rejects.toThrow(NotFoundException);
    });

    it('creates one DocumentDateSuggestion per extracted candidate', async () => {
      mockPrisma.case.findUnique.mockResolvedValue({ id: 'case-1' });
      jest.spyOn(service, 'extractText').mockResolvedValue('some text');
      jest.spyOn(service, 'extractDatesWithAI').mockResolvedValue([
        {
          label: 'x',
          date: '2026-10-01T00:00:00.000Z',
          eventType: EventType.DEADLINE,
          sourceExcerpt: 'y',
        },
      ]);
      mockPrisma.documentDateSuggestion.create.mockResolvedValue({ id: 'sug-1' });

      const result = await service.extractDates(
        Buffer.from('x'),
        'text/plain',
        'case-1',
        'user-1',
        'doc-1',
      );

      expect(mockPrisma.documentDateSuggestion.create).toHaveBeenCalledWith({
        data: {
          caseId: 'case-1',
          documentId: 'doc-1',
          label: 'x',
          suggestedDate: new Date('2026-10-01T00:00:00.000Z'),
          eventType: EventType.DEADLINE,
          sourceExcerpt: 'y',
          createdById: 'user-1',
        },
      });
      expect(result).toEqual([{ id: 'sug-1' }]);
    });

    it('creates zero rows when no dates are found', async () => {
      mockPrisma.case.findUnique.mockResolvedValue({ id: 'case-1' });
      jest.spyOn(service, 'extractText').mockResolvedValue('some text');
      jest.spyOn(service, 'extractDatesWithAI').mockResolvedValue([]);

      const result = await service.extractDates(Buffer.from('x'), 'text/plain', 'case-1', 'user-1');

      expect(mockPrisma.documentDateSuggestion.create).not.toHaveBeenCalled();
      expect(result).toEqual([]);
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `(cd /Users/pongpanot_s/Documents/dev/lawfirm && pnpm --filter api test -- document-intelligence.service.spec.ts)`
Expected: FAIL — `extractDatesWithAI`/`extractDates` do not exist yet.

- [ ] **Step 3: Implement `extractDatesWithAI` and `extractDates`**

In `apps/api/src/intelligence/document-intelligence.service.ts`, add the `EventType` import and a result-shape interface near the top of the file:
```typescript
import { KnowledgeCategory, EventType } from '@lawfirm/shared';

interface ExtractedDateCandidate {
  label: string;
  date: string;
  eventType: EventType;
  sourceExcerpt: string;
}

interface RawDateCandidate {
  label?: unknown;
  date?: unknown;
  eventType?: unknown;
  sourceExcerpt?: unknown;
}
```

Add these two methods to the `DocumentIntelligenceService` class, after `summarizeWithAI`:
```typescript
  async extractDatesWithAI(text: string): Promise<ExtractedDateCandidate[]> {
    const apiKey = this.config.get<string>('OPENAI_API_KEY');
    if (!apiKey) return [];

    let raw: string | undefined;
    try {
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'gpt-4o',
          response_format: { type: 'json_object' },
          messages: [
            {
              role: 'system',
              content:
                'Find every important date in this legal document (court hearing dates, filing deadlines, statutory deadlines). Respond ONLY with JSON of the shape {"dates": [{"label": string, "date": "YYYY-MM-DD", "eventType": "COURT_DATE"|"DEADLINE"|"CLIENT_MEETING"|"OTHER", "sourceExcerpt": string}]}. "sourceExcerpt" must be the exact sentence from the document the date came from. If no dates are found, respond {"dates": []}. Write labels in Thai when the document is in Thai, otherwise English.',
            },
            { role: 'user', content: text.slice(0, 12000) },
          ],
          temperature: 0.1,
        }),
      });

      if (!res.ok) {
        this.logger.error(`OpenAI error (date extraction): ${res.status}`);
        return [];
      }

      const data = (await res.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      raw = data.choices?.[0]?.message?.content;
    } catch (err) {
      this.logger.error(`OpenAI request failed (date extraction): ${err}`);
      return [];
    }

    if (!raw) return [];

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      this.logger.warn('Failed to parse AI date-extraction response as JSON');
      return [];
    }

    const dates = (parsed as { dates?: unknown }).dates;
    if (!Array.isArray(dates)) return [];

    const validEventTypes = new Set<string>(Object.values(EventType));
    const results: ExtractedDateCandidate[] = [];

    for (const rawItem of dates) {
      const item = rawItem as RawDateCandidate;
      if (
        typeof item?.label !== 'string' ||
        typeof item?.date !== 'string' ||
        typeof item?.sourceExcerpt !== 'string'
      ) {
        continue;
      }

      const parsedDate = new Date(item.date);
      if (isNaN(parsedDate.getTime())) continue;

      const eventType = validEventTypes.has(item.eventType as string)
        ? (item.eventType as EventType)
        : EventType.OTHER;

      results.push({
        label: item.label,
        date: parsedDate.toISOString(),
        eventType,
        sourceExcerpt: item.sourceExcerpt,
      });
    }

    return results;
  }

  async extractDates(
    fileBuffer: Buffer,
    mimeType: string,
    caseId: string,
    userId: string,
    documentId?: string,
  ) {
    const legalCase = await this.prisma.case.findUnique({ where: { id: caseId } });
    if (!legalCase) throw new NotFoundException('Case not found');

    const text = await this.extractText(fileBuffer, mimeType);
    const candidates = await this.extractDatesWithAI(text);

    return Promise.all(
      candidates.map((c) =>
        this.prisma.documentDateSuggestion.create({
          data: {
            caseId,
            documentId,
            label: c.label,
            suggestedDate: new Date(c.date),
            eventType: c.eventType,
            sourceExcerpt: c.sourceExcerpt,
            createdById: userId,
          },
        }),
      ),
    );
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `(cd /Users/pongpanot_s/Documents/dev/lawfirm && pnpm --filter api test -- document-intelligence.service.spec.ts)`
Expected: PASS, all cases green.

- [ ] **Step 5: Commit**

```bash
(cd /Users/pongpanot_s/Documents/dev/lawfirm && git add apps/api/src/intelligence && git commit -m "feat(api): add AI date extraction to DocumentIntelligenceService" -m "$(printf '%s\n' 'Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>')")
```

---

### Task 3: `DateSuggestionsService` (confirm / dismiss / list)

**Files:**
- Create: `apps/api/src/intelligence/date-suggestions.service.ts`
- Create: `apps/api/src/intelligence/dto/date-suggestion.dto.ts`
- Test: `apps/api/src/intelligence/date-suggestions.service.spec.ts`

**Interfaces:**
- Consumes: `CalendarService.create(dto: CreateEventDto): Promise<CalendarEvent>` (`apps/api/src/calendar/calendar.service.ts`) — pass `{ caseId, title, startAt, type, reminderMinutes }`.
- Produces: `listForCase(caseId, status?): Promise<DocumentDateSuggestion[]>`, `confirm(caseId, id, userId, overrides): Promise<DocumentDateSuggestion>`, `dismiss(caseId, id, userId): Promise<DocumentDateSuggestion>` — consumed by Task 4's controller.

**Context this task's implementer needs:** `CalendarService.create` takes a `CreateEventDto` (`apps/api/src/calendar/dto/calendar.dto.ts`): `{ caseId: string; title: string; startAt: string (ISO); type?: EventType; reminderMinutes?: number[] }` and returns the created `CalendarEvent` (has `.id`). If `type === EventType.COURT_DATE`, `create()` sends a LINE alert and updates `Case.status` — this is existing behavior, not something to guard against here.

- [ ] **Step 1: Write the DTO**

```typescript
// apps/api/src/intelligence/dto/date-suggestion.dto.ts
import { IsOptional, IsString, IsDateString, IsEnum, IsArray, IsInt } from 'class-validator';
import { EventType } from '@lawfirm/shared';

export class ConfirmDateSuggestionDto {
  @IsOptional()
  @IsString()
  label?: string;

  @IsOptional()
  @IsDateString()
  date?: string;

  @IsOptional()
  @IsEnum(EventType)
  eventType?: EventType;

  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  reminderMinutes?: number[];
}
```

- [ ] **Step 2: Write the failing tests**

```typescript
// apps/api/src/intelligence/date-suggestions.service.spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ConflictException } from '@nestjs/common';
import { DateSuggestionStatus, EventType } from '@lawfirm/shared';
import { DateSuggestionsService } from './date-suggestions.service';
import { PrismaService } from '../prisma/prisma.module';
import { CalendarService } from '../calendar/calendar.service';

describe('DateSuggestionsService', () => {
  let service: DateSuggestionsService;
  const mockPrisma = {
    documentDateSuggestion: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  };
  const mockCalendar = { create: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DateSuggestionsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: CalendarService, useValue: mockCalendar },
      ],
    }).compile();
    service = module.get(DateSuggestionsService);
  });

  describe('listForCase', () => {
    it('defaults to PENDING status', async () => {
      mockPrisma.documentDateSuggestion.findMany.mockResolvedValue([]);
      await service.listForCase('case-1');
      expect(mockPrisma.documentDateSuggestion.findMany).toHaveBeenCalledWith({
        where: { caseId: 'case-1', status: DateSuggestionStatus.PENDING },
        orderBy: { createdAt: 'desc' },
      });
    });
  });

  describe('confirm', () => {
    const pending = {
      id: 'sug-1',
      caseId: 'case-1',
      label: 'วันนัดไต่สวน',
      suggestedDate: new Date('2026-10-01T00:00:00.000Z'),
      eventType: EventType.COURT_DATE,
      status: DateSuggestionStatus.PENDING,
    };

    it('creates a CalendarEvent using stored values when no overrides given', async () => {
      mockPrisma.documentDateSuggestion.findUnique.mockResolvedValue(pending);
      mockCalendar.create.mockResolvedValue({ id: 'event-1' });
      mockPrisma.documentDateSuggestion.update.mockResolvedValue({
        ...pending,
        status: DateSuggestionStatus.CONFIRMED,
      });

      await service.confirm('case-1', 'sug-1', 'user-1', {});

      expect(mockCalendar.create).toHaveBeenCalledWith({
        caseId: 'case-1',
        title: 'วันนัดไต่สวน',
        startAt: pending.suggestedDate.toISOString(),
        type: EventType.COURT_DATE,
        reminderMinutes: undefined,
      });
    });

    it('applies overrides on top of the stored values', async () => {
      mockPrisma.documentDateSuggestion.findUnique.mockResolvedValue(pending);
      mockCalendar.create.mockResolvedValue({ id: 'event-1' });
      mockPrisma.documentDateSuggestion.update.mockResolvedValue(pending);

      await service.confirm('case-1', 'sug-1', 'user-1', {
        label: 'แก้ไขแล้ว',
        date: '2026-11-01T00:00:00.000Z',
        eventType: EventType.DEADLINE,
      });

      expect(mockCalendar.create).toHaveBeenCalledWith({
        caseId: 'case-1',
        title: 'แก้ไขแล้ว',
        startAt: '2026-11-01T00:00:00.000Z',
        type: EventType.DEADLINE,
        reminderMinutes: undefined,
      });
    });

    it('marks the suggestion CONFIRMED, storing the created event id and reviewer', async () => {
      mockPrisma.documentDateSuggestion.findUnique.mockResolvedValue(pending);
      mockCalendar.create.mockResolvedValue({ id: 'event-1' });
      mockPrisma.documentDateSuggestion.update.mockResolvedValue({});

      await service.confirm('case-1', 'sug-1', 'user-1', {});

      expect(mockPrisma.documentDateSuggestion.update).toHaveBeenCalledWith({
        where: { id: 'sug-1' },
        data: expect.objectContaining({
          status: DateSuggestionStatus.CONFIRMED,
          calendarEventId: 'event-1',
          reviewedById: 'user-1',
        }),
      });
    });

    it('throws NotFoundException when the suggestion belongs to a different case', async () => {
      mockPrisma.documentDateSuggestion.findUnique.mockResolvedValue({
        ...pending,
        caseId: 'other-case',
      });
      await expect(service.confirm('case-1', 'sug-1', 'user-1', {})).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws ConflictException when the suggestion is not PENDING', async () => {
      mockPrisma.documentDateSuggestion.findUnique.mockResolvedValue({
        ...pending,
        status: DateSuggestionStatus.DISMISSED,
      });
      await expect(service.confirm('case-1', 'sug-1', 'user-1', {})).rejects.toThrow(
        ConflictException,
      );
    });
  });

  describe('dismiss', () => {
    it('marks a PENDING suggestion DISMISSED with the reviewer', async () => {
      mockPrisma.documentDateSuggestion.findUnique.mockResolvedValue({
        id: 'sug-1',
        caseId: 'case-1',
        status: DateSuggestionStatus.PENDING,
      });
      mockPrisma.documentDateSuggestion.update.mockResolvedValue({});

      await service.dismiss('case-1', 'sug-1', 'user-1');

      expect(mockPrisma.documentDateSuggestion.update).toHaveBeenCalledWith({
        where: { id: 'sug-1' },
        data: expect.objectContaining({
          status: DateSuggestionStatus.DISMISSED,
          reviewedById: 'user-1',
        }),
      });
    });

    it('throws ConflictException when already CONFIRMED', async () => {
      mockPrisma.documentDateSuggestion.findUnique.mockResolvedValue({
        id: 'sug-1',
        caseId: 'case-1',
        status: DateSuggestionStatus.CONFIRMED,
      });
      await expect(service.dismiss('case-1', 'sug-1', 'user-1')).rejects.toThrow(
        ConflictException,
      );
    });
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `(cd /Users/pongpanot_s/Documents/dev/lawfirm && pnpm --filter api test -- date-suggestions.service.spec.ts)`
Expected: FAIL — `DateSuggestionsService` does not exist yet.

- [ ] **Step 4: Implement `DateSuggestionsService`**

```typescript
// apps/api/src/intelligence/date-suggestions.service.ts
import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { DateSuggestionStatus, EventType } from '@lawfirm/shared';
import { PrismaService } from '../prisma/prisma.module';
import { CalendarService } from '../calendar/calendar.service';
import { ConfirmDateSuggestionDto } from './dto/date-suggestion.dto';

@Injectable()
export class DateSuggestionsService {
  constructor(
    private prisma: PrismaService,
    private calendarService: CalendarService,
  ) {}

  async listForCase(caseId: string, status: DateSuggestionStatus = DateSuggestionStatus.PENDING) {
    return this.prisma.documentDateSuggestion.findMany({
      where: { caseId, status },
      orderBy: { createdAt: 'desc' },
    });
  }

  private async findPendingOrThrow(caseId: string, id: string) {
    const suggestion = await this.prisma.documentDateSuggestion.findUnique({ where: { id } });
    if (!suggestion || suggestion.caseId !== caseId) {
      throw new NotFoundException('Date suggestion not found');
    }
    if (suggestion.status !== DateSuggestionStatus.PENDING) {
      throw new ConflictException('Date suggestion is no longer pending');
    }
    return suggestion;
  }

  async confirm(
    caseId: string,
    id: string,
    userId: string,
    overrides: ConfirmDateSuggestionDto,
  ) {
    const suggestion = await this.findPendingOrThrow(caseId, id);

    const event = await this.calendarService.create({
      caseId,
      title: overrides.label ?? suggestion.label,
      startAt: overrides.date ?? suggestion.suggestedDate.toISOString(),
      type: (overrides.eventType ?? suggestion.eventType) as EventType,
      reminderMinutes: overrides.reminderMinutes,
    });

    return this.prisma.documentDateSuggestion.update({
      where: { id },
      data: {
        status: DateSuggestionStatus.CONFIRMED,
        calendarEventId: event.id,
        reviewedById: userId,
        reviewedAt: new Date(),
      },
    });
  }

  async dismiss(caseId: string, id: string, userId: string) {
    await this.findPendingOrThrow(caseId, id);

    return this.prisma.documentDateSuggestion.update({
      where: { id },
      data: {
        status: DateSuggestionStatus.DISMISSED,
        reviewedById: userId,
        reviewedAt: new Date(),
      },
    });
  }
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `(cd /Users/pongpanot_s/Documents/dev/lawfirm && pnpm --filter api test -- date-suggestions.service.spec.ts)`
Expected: PASS, all cases green.

- [ ] **Step 6: Commit**

```bash
(cd /Users/pongpanot_s/Documents/dev/lawfirm && git add apps/api/src/intelligence && git commit -m "feat(api): add DateSuggestionsService (confirm/dismiss/list)" -m "$(printf '%s\n' 'Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>')")
```

---

### Task 4: Controllers and module wiring

**Files:**
- Modify: `apps/api/src/intelligence/intelligence.controller.ts`
- Create: `apps/api/src/intelligence/date-suggestions.controller.ts`
- Modify: `apps/api/src/intelligence/intelligence.module.ts`
- Test: `apps/api/src/intelligence/intelligence.controller.spec.ts` (new file)
- Test: `apps/api/src/intelligence/date-suggestions.controller.spec.ts`

**Interfaces:**
- Consumes: `DocumentIntelligenceService.extractDates` (Task 2), `DateSuggestionsService.{listForCase,confirm,dismiss}` (Task 3).
- Produces: `POST /cases/:caseId/documents/extract-dates`, `GET /cases/:caseId/date-suggestions`, `POST /cases/:caseId/date-suggestions/:id/confirm`, `POST /cases/:caseId/date-suggestions/:id/dismiss` — consumed by Task 5's frontend API client.

**Context this task's implementer needs:** `IntelligenceController`'s existing `analyze` handler (same file) is the exact pattern to mirror for `extractDates` — same guards, same `FileInterceptor`/`AiCreditsInterceptor` stack, same `@RequireCredits`. `CalendarModule` (`apps/api/src/calendar/calendar.module.ts`) exports `CalendarService` and must be imported into `IntelligenceModule` for `DateSuggestionsService` to inject it.

- [ ] **Step 1: Add `extractDates` to `IntelligenceController`**

In `apps/api/src/intelligence/intelligence.controller.ts`, add this handler after `analyze`:
```typescript
  @Post('cases/:caseId/documents/extract-dates')
  @UseGuards(CaseAccessGuard)
  @RequireCredits(5)
  @UseInterceptors(FileInterceptor('file'), AiCreditsInterceptor)
  extractDates(
    @CurrentUser() user: AuthUser,
    @Param('caseId') caseId: string,
    @UploadedFile() file: Express.Multer.File,
    @Query('documentId') documentId?: string,
  ) {
    return this.intelligenceService.extractDates(
      file.buffer,
      file.mimetype,
      caseId,
      user.id,
      documentId,
    );
  }
```

- [ ] **Step 2: Create `DateSuggestionsController`**

```typescript
// apps/api/src/intelligence/date-suggestions.controller.ts
import { Controller, Get, Post, Param, Query, Body, UseGuards } from '@nestjs/common';
import { AuthUser, DateSuggestionStatus } from '@lawfirm/shared';
import { DateSuggestionsService } from './date-suggestions.service';
import { ConfirmDateSuggestionDto } from './dto/date-suggestion.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CaseAccessGuard } from '../common/guards/case-access.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@Controller('cases/:caseId/date-suggestions')
@UseGuards(JwtAuthGuard, CaseAccessGuard)
export class DateSuggestionsController {
  constructor(private dateSuggestions: DateSuggestionsService) {}

  @Get()
  list(@Param('caseId') caseId: string, @Query('status') status?: DateSuggestionStatus) {
    return this.dateSuggestions.listForCase(caseId, status);
  }

  @Post(':id/confirm')
  confirm(
    @CurrentUser() user: AuthUser,
    @Param('caseId') caseId: string,
    @Param('id') id: string,
    @Body() body: ConfirmDateSuggestionDto,
  ) {
    return this.dateSuggestions.confirm(caseId, id, user.id, body);
  }

  @Post(':id/dismiss')
  dismiss(
    @CurrentUser() user: AuthUser,
    @Param('caseId') caseId: string,
    @Param('id') id: string,
  ) {
    return this.dateSuggestions.dismiss(caseId, id, user.id);
  }
}
```

- [ ] **Step 3: Wire the module**

Replace `apps/api/src/intelligence/intelligence.module.ts` with:
```typescript
import { Module } from '@nestjs/common';
import { DocumentIntelligenceService } from './document-intelligence.service';
import { DateSuggestionsService } from './date-suggestions.service';
import { IntelligenceController } from './intelligence.controller';
import { DateSuggestionsController } from './date-suggestions.controller';
import { AiCreditsInterceptor } from '../common/interceptors/ai-credits.interceptor';
import { CalendarModule } from '../calendar/calendar.module';

@Module({
  imports: [CalendarModule],
  providers: [DocumentIntelligenceService, DateSuggestionsService, AiCreditsInterceptor],
  controllers: [IntelligenceController, DateSuggestionsController],
  exports: [DocumentIntelligenceService, DateSuggestionsService],
})
export class IntelligenceModule {}
```

- [ ] **Step 4: Write controller tests**

```typescript
// apps/api/src/intelligence/intelligence.controller.spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import { IntelligenceController } from './intelligence.controller';
import { DocumentIntelligenceService } from './document-intelligence.service';
import { REQUIRE_CREDITS_KEY } from '../common/decorators/require-credits.decorator';

describe('IntelligenceController', () => {
  let controller: IntelligenceController;
  let reflector: Reflector;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [IntelligenceController],
      providers: [{ provide: DocumentIntelligenceService, useValue: {} }, Reflector],
    }).compile();
    controller = module.get(IntelligenceController);
    reflector = module.get(Reflector);
  });

  it('requires 5 AI credits on extractDates, matching analyze', () => {
    expect(reflector.get(REQUIRE_CREDITS_KEY, controller.analyze)).toBe(5);
    expect(reflector.get(REQUIRE_CREDITS_KEY, controller.extractDates)).toBe(5);
  });
});
```

```typescript
// apps/api/src/intelligence/date-suggestions.controller.spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import { DateSuggestionStatus } from '@lawfirm/shared';
import { DateSuggestionsController } from './date-suggestions.controller';
import { DateSuggestionsService } from './date-suggestions.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CaseAccessGuard } from '../common/guards/case-access.guard';
import { REQUIRE_CREDITS_KEY } from '../common/decorators/require-credits.decorator';

describe('DateSuggestionsController', () => {
  let controller: DateSuggestionsController;
  let reflector: Reflector;
  const mockService = { listForCase: jest.fn(), confirm: jest.fn(), dismiss: jest.fn() };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [DateSuggestionsController],
      providers: [{ provide: DateSuggestionsService, useValue: mockService }, Reflector],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(CaseAccessGuard)
      .useValue({ canActivate: () => true })
      .compile();
    controller = module.get(DateSuggestionsController);
    reflector = module.get(Reflector);
  });

  it('confirm and dismiss do not cost AI credits', () => {
    expect(reflector.get(REQUIRE_CREDITS_KEY, controller.confirm)).toBeUndefined();
    expect(reflector.get(REQUIRE_CREDITS_KEY, controller.dismiss)).toBeUndefined();
  });

  it('list delegates to the service with the given case and status', async () => {
    mockService.listForCase.mockResolvedValue([]);
    await controller.list('case-1', DateSuggestionStatus.PENDING);
    expect(mockService.listForCase).toHaveBeenCalledWith('case-1', DateSuggestionStatus.PENDING);
  });

  it('confirm delegates to the service with the current user id and body', async () => {
    mockService.confirm.mockResolvedValue({});
    await controller.confirm({ id: 'user-1' } as never, 'case-1', 'sug-1', { label: 'x' });
    expect(mockService.confirm).toHaveBeenCalledWith('case-1', 'sug-1', 'user-1', { label: 'x' });
  });

  it('dismiss delegates to the service with the current user id', async () => {
    mockService.dismiss.mockResolvedValue({});
    await controller.dismiss({ id: 'user-1' } as never, 'case-1', 'sug-1');
    expect(mockService.dismiss).toHaveBeenCalledWith('case-1', 'sug-1', 'user-1');
  });
});
```

- [ ] **Step 5: Run tests and build**

Run: `(cd /Users/pongpanot_s/Documents/dev/lawfirm && pnpm --filter api test && pnpm --filter api build)`
Expected: all tests PASS (including Tasks 2 and 3's suites still passing), build succeeds.

- [ ] **Step 6: Commit**

```bash
(cd /Users/pongpanot_s/Documents/dev/lawfirm && git add apps/api/src/intelligence && git commit -m "feat(api): add extract-dates and date-suggestions endpoints" -m "$(printf '%s\n' 'Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>')")
```

---

### Task 5: Frontend API client

**Files:**
- Modify: `apps/web/src/lib/api.ts`

**Interfaces:**
- Consumes: the four endpoints from Task 4.
- Produces: `api.extractDates`, `api.getDateSuggestions`, `api.confirmDateSuggestion`, `api.dismissDateSuggestion`, and `DateSuggestionItem` — consumed by Task 6.

**Context this task's implementer needs:** `api.analyzeDocument` (same file) is the multipart-upload pattern to mirror. `request<T>()` (same file) auto-attaches the bearer token and, for a `FormData` body, skips setting `Content-Type` (the browser sets the multipart boundary itself) — do not set `Content-Type` manually on the multipart call.

- [ ] **Step 1: Add the `DateSuggestionItem` interface**

Add near `KnowledgeItem` (same file):
```typescript
export interface DateSuggestionItem {
  id: string;
  caseId: string;
  documentId?: string | null;
  label: string;
  suggestedDate: string;
  eventType: 'COURT_DATE' | 'CLIENT_MEETING' | 'DEADLINE' | 'OTHER';
  sourceExcerpt: string;
  status: 'PENDING' | 'CONFIRMED' | 'DISMISSED';
  calendarEventId?: string | null;
  createdAt: string;
}
```

- [ ] **Step 2: Add the API methods**

Add near `analyzeDocument` (same file):
```typescript
  extractDates: (token: string, caseId: string, file: File) => {
    const form = new FormData();
    form.append('file', file);
    return request<DateSuggestionItem[]>(`/cases/${caseId}/documents/extract-dates`, {
      method: 'POST',
      token,
      body: form,
    });
  },

  getDateSuggestions: (token: string, caseId: string, status?: string) => {
    const qs = status ? `?status=${status}` : '';
    return request<DateSuggestionItem[]>(`/cases/${caseId}/date-suggestions${qs}`, { token });
  },

  confirmDateSuggestion: (
    token: string,
    caseId: string,
    id: string,
    overrides: { label?: string; date?: string; eventType?: string },
  ) =>
    request<DateSuggestionItem>(`/cases/${caseId}/date-suggestions/${id}/confirm`, {
      method: 'POST',
      token,
      body: JSON.stringify(overrides),
    }),

  dismissDateSuggestion: (token: string, caseId: string, id: string) =>
    request<DateSuggestionItem>(`/cases/${caseId}/date-suggestions/${id}/dismiss`, {
      method: 'POST',
      token,
    }),
```

- [ ] **Step 3: Type-check**

Run: `(cd /Users/pongpanot_s/Documents/dev/lawfirm && pnpm --filter web build)`
Expected: builds successfully with no type errors (this codebase has no unit tests for `lib/api.ts`; the Next.js production build is the existing verification method for this file, same as Task 5 of the `case-messaging` plan).

- [ ] **Step 4: Commit**

```bash
(cd /Users/pongpanot_s/Documents/dev/lawfirm && git add apps/web/src/lib/api.ts && git commit -m "feat(web): add date-suggestion API client methods" -m "$(printf '%s\n' 'Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>')")
```

---

### Task 6: Documents page UI — extract, review, confirm/dismiss

**Files:**
- Modify: `apps/web/src/app/(dashboard)/cases/[id]/documents/page.tsx`
- Modify: `apps/web/src/lib/i18n/dashboard.ts`

**Interfaces:**
- Consumes: `api.extractDates`, `api.getDateSuggestions`, `api.confirmDateSuggestion`, `api.dismissDateSuggestion`, `DateSuggestionItem` (Task 5). Reuses `d.calendar.typeCourtDate` / `typeClientMeeting` / `typeDeadline` / `typeOther` (already in `dashboard.ts`) for the event-type dropdown labels, instead of adding duplicate translation keys.

**Context this task's implementer needs:** The file already has two `DocumentDropZone` instances (`uploadRef`/`handleUpload`, `analyzeRef`/`handleAnalyze`) laid out side-by-side in a `grid lg:grid-cols-2`; this task adds a third card below them, plus a pending-suggestions list. `DocumentDropZone`'s props are `{ onFile, loading, loadingLabel, label, hint }` and it exposes an imperative `.open()` via `ref` (see `apps/web/src/components/DocumentDropZone.tsx`).

- [ ] **Step 1: Add i18n strings**

In `apps/web/src/lib/i18n/dashboard.ts`, add these keys inside the Thai `caseDocuments` block (right after `analyzeFailed`, before the closing `},`):
```typescript
      extractDates: 'ดึงวันสำคัญ (AI)',
      extracting: 'กำลังดึงวันสำคัญ...',
      chooseFileForDates: 'เลือกไฟล์เพื่อดึงวันสำคัญ',
      extractDatesFailed: 'ดึงวันสำคัญไม่สำเร็จ (ตรวจสอบเครดิต)',
      pendingDateSuggestions: 'วันสำคัญที่รอยืนยัน',
      noDateSuggestions: 'ไม่พบวันที่สำคัญในเอกสารนี้',
      sourceExcerpt: 'ข้อความอ้างอิง',
      confirmDate: 'ยืนยัน',
      dismissDate: 'ปัดทิ้ง',
      confirming: 'กำลังยืนยัน...',
```

Add the matching English keys inside the English `caseDocuments` block (right after `analyzeFailed`, before its closing `},`):
```typescript
      extractDates: 'Extract Important Dates (AI)',
      extracting: 'Extracting dates...',
      chooseFileForDates: 'Choose file to extract dates',
      extractDatesFailed: 'Date extraction failed (check credits)',
      pendingDateSuggestions: 'Pending Date Suggestions',
      noDateSuggestions: 'No important dates found in this document',
      sourceExcerpt: 'Source excerpt',
      confirmDate: 'Confirm',
      dismissDate: 'Dismiss',
      confirming: 'Confirming...',
```

- [ ] **Step 2: Add state, loaders, and handlers**

In `apps/web/src/app/(dashboard)/cases/[id]/documents/page.tsx`, add to the imports:
```typescript
import { api, ApiError, DocumentItem, DocumentTemplateItem, DocumentPublicationEntry, DateSuggestionItem } from '@/lib/api';
```

Add new state, next to the existing `analyzing` state:
```typescript
  const [extracting, setExtracting] = useState(false);
  const extractRef = useRef<DocumentDropZoneHandle>(null);
  const [suggestions, setSuggestions] = useState<DateSuggestionItem[]>([]);
  const [drafts, setDrafts] = useState<Record<string, { label: string; date: string; eventType: string }>>({});
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
```

Add a loader for pending suggestions and call it alongside the existing `load()` on mount:
```typescript
  const loadSuggestions = () => {
    if (!token || !id) return;
    api
      .getDateSuggestions(token, id, 'PENDING')
      .then((items) => {
        setSuggestions(items);
        setDrafts((prev) => {
          const next = { ...prev };
          items.forEach((s) => {
            if (!next[s.id]) {
              next[s.id] = {
                label: s.label,
                date: s.suggestedDate.slice(0, 10),
                eventType: s.eventType,
              };
            }
          });
          return next;
        });
      })
      .catch(console.error);
  };

  useEffect(() => { loadSuggestions(); }, [token, id]);
```

Add the extract/confirm/dismiss handlers, next to `handleAnalyze`:
```typescript
  const handleExtractDates = async (file: File) => {
    if (!token || !id) return;
    setExtracting(true);
    setError('');
    try {
      await api.extractDates(token, id, file);
      loadSuggestions();
    } catch (e) {
      setError(e instanceof Error ? e.message : d.caseDocuments.extractDatesFailed);
    } finally {
      setExtracting(false);
    }
  };

  const handleConfirmSuggestion = async (suggestionId: string) => {
    if (!token || !id) return;
    const draft = drafts[suggestionId];
    setConfirmingId(suggestionId);
    setError('');
    try {
      await api.confirmDateSuggestion(token, id, suggestionId, {
        label: draft?.label,
        date: draft?.date ? new Date(draft.date).toISOString() : undefined,
        eventType: draft?.eventType,
      });
      setSuggestions((prev) => prev.filter((s) => s.id !== suggestionId));
    } catch (e) {
      setError(e instanceof Error ? e.message : d.caseDocuments.extractDatesFailed);
    } finally {
      setConfirmingId(null);
    }
  };

  const handleDismissSuggestion = async (suggestionId: string) => {
    if (!token || !id) return;
    setError('');
    try {
      await api.dismissDateSuggestion(token, id, suggestionId);
      setSuggestions((prev) => prev.filter((s) => s.id !== suggestionId));
    } catch (e) {
      setError(e instanceof Error ? e.message : d.caseDocuments.extractDatesFailed);
    }
  };
```

- [ ] **Step 3: Add the extract dropzone and the pending-suggestions section to the JSX**

Change the two-column grid (`uploadDocument` + `aiAnalyzer` cards) to three columns, and add the extract card as the third:
```typescript
      <div className="mb-6 grid gap-6 lg:grid-cols-3">
```
(this is the same `<div>` that currently opens with `className="mb-6 grid gap-6 lg:grid-cols-2"` — just widen it to `lg:grid-cols-3`)

Add the third card immediately after the existing `aiAnalyzer` card's closing `</div>` (still inside the grid `<div>`):
```typescript
        <div className="rounded-xl border bg-card p-6 shadow-soft">
          <h2 className="mb-4 font-semibold text-foreground">{d.caseDocuments.extractDates}</h2>
          <DocumentDropZone
            ref={extractRef}
            onFile={handleExtractDates}
            loading={extracting}
            loadingLabel={d.caseDocuments.extracting}
            label={d.documents.dropHint}
            hint={d.documents.fileTypesHint}
          />
          <Button
            type="button"
            variant="outline"
            disabled={extracting}
            onClick={() => extractRef.current?.open()}
            className="mt-3 w-full"
          >
            <Upload className="h-4 w-4" />
            {extracting ? d.caseDocuments.extracting : d.caseDocuments.chooseFileForDates}
          </Button>
        </div>
```

Add the pending-suggestions section right after the `{error && ...}` line and before the templates card:
```typescript
      {suggestions.length > 0 && (
        <div className="mb-6 rounded-xl border bg-card p-6 shadow-soft">
          <h2 className="mb-4 font-semibold text-foreground">{d.caseDocuments.pendingDateSuggestions}</h2>
          <div className="space-y-3">
            {suggestions.map((s) => {
              const draft = drafts[s.id] ?? {
                label: s.label,
                date: s.suggestedDate.slice(0, 10),
                eventType: s.eventType,
              };
              return (
                <div key={s.id} className="rounded-lg border p-3">
                  <div className="grid gap-2 sm:grid-cols-3">
                    <input
                      type="text"
                      value={draft.label}
                      onChange={(e) =>
                        setDrafts((prev) => ({ ...prev, [s.id]: { ...draft, label: e.target.value } }))
                      }
                      className="h-9 rounded-lg border border-input bg-card px-3 text-sm"
                    />
                    <input
                      type="date"
                      value={draft.date}
                      onChange={(e) =>
                        setDrafts((prev) => ({ ...prev, [s.id]: { ...draft, date: e.target.value } }))
                      }
                      className="h-9 rounded-lg border border-input bg-card px-3 text-sm"
                    />
                    <select
                      value={draft.eventType}
                      onChange={(e) =>
                        setDrafts((prev) => ({ ...prev, [s.id]: { ...draft, eventType: e.target.value } }))
                      }
                      className="h-9 rounded-lg border border-input bg-card px-3 text-sm"
                    >
                      <option value="COURT_DATE">{d.calendar.typeCourtDate}</option>
                      <option value="CLIENT_MEETING">{d.calendar.typeClientMeeting}</option>
                      <option value="DEADLINE">{d.calendar.typeDeadline}</option>
                      <option value="OTHER">{d.calendar.typeOther}</option>
                    </select>
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {d.caseDocuments.sourceExcerpt}: &ldquo;{s.sourceExcerpt}&rdquo;
                  </p>
                  <div className="mt-3 flex gap-2">
                    <Button
                      type="button"
                      size="sm"
                      disabled={confirmingId === s.id}
                      onClick={() => handleConfirmSuggestion(s.id)}
                    >
                      {confirmingId === s.id ? d.caseDocuments.confirming : d.caseDocuments.confirmDate}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={confirmingId === s.id}
                      onClick={() => handleDismissSuggestion(s.id)}
                    >
                      {d.caseDocuments.dismissDate}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
```

- [ ] **Step 4: Build and manually verify in the browser**

Run: `(cd /Users/pongpanot_s/Documents/dev/lawfirm && pnpm --filter web build)`
Expected: builds successfully with no type errors.

Then, with the dev server running (`pnpm dev` from repo root), open a case's Documents page in the browser and confirm:
- The page now shows three cards (upload / analyze / extract dates) side by side on desktop.
- Dropping a document onto "ดึงวันสำคัญ (AI)" shows the loading state, then either populates the "วันสำคัญที่รอยืนยัน" section or (if `OPENAI_API_KEY` isn't configured locally) shows no new rows without an error.
- If suggestions exist (seed one via the API directly if no key is configured locally), editing a label/date/type, clicking "ยืนยัน" removes it from the list; clicking "ปัดทิ้ง" on another removes it too; reloading the page does not bring back a confirmed or dismissed suggestion, only ones still `PENDING`.

- [ ] **Step 5: Commit**

```bash
(cd /Users/pongpanot_s/Documents/dev/lawfirm && git add apps/web/src/app/\(dashboard\)/cases/\[id\]/documents/page.tsx apps/web/src/lib/i18n/dashboard.ts && git commit -m "feat(web): add date-suggestion extraction and review UI to case documents" -m "$(printf '%s\n' 'Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>')")
```

# Bilingual Contract Translation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let lawyers turn a Thai or English contract into a clause-aligned bilingual document they can view, edit, and download as DOCX.

**Architecture:** New NestJS `translation` module: extract text (PDF/DOCX/plain) → segment into clauses → translate each with GPT-4o → persist a `TranslationJob` → serve to a Next.js side-by-side editor with DOCX export. Reuses the existing OpenAI fetch pattern and AI-credit model from `document-intelligence`.

**Tech Stack:** NestJS 11, Prisma 6 (PostgreSQL), OpenAI GPT-4o (REST via `fetch`), `pdf-parse`, `mammoth` (new), `docx` (new), Next.js 15 (App Router), React 19.

## Global Constraints

- **No automated test framework** — this repo has none (no jest/vitest, no test files). Each task is verified by `pnpm typecheck`/build plus a concrete manual runtime check. Do NOT add a test runner.
- **Language pair is TH ↔ EN only.** Enum `Lang { TH EN }`.
- **AI credits:** cost = `Math.max(1, Math.ceil(sourceTextLength / 1000))`. Check balance before translating; decrement after success. Credits live on `User.aiCredits` (Int).
- **OpenAI:** call `https://api.openai.com/v1/chat/completions`, model `gpt-4o`, key from `ConfigService.get('OPENAI_API_KEY')`. When the key is absent, return a deterministic demo result (mirror `document-intelligence.service.ts`).
- **Multi-tenancy:** everything firm-scoped. Auth via `JwtAuthGuard`; current user via `@CurrentUser()` returning `AuthUser` from `@lawfirm/shared`.
- **Prisma client import:** `import { PrismaService } from '../prisma/prisma.module'` (PrismaModule is `@Global`).
- **Commands run from repo root** unless noted. API dev server: `pnpm --filter @lawfirm/api dev`. Typecheck API build: `pnpm --filter @lawfirm/api build`. Web build: `pnpm --filter @lawfirm/web build`.

---

## File Structure

**Backend (`apps/api/`):**
- `prisma/schema.prisma` — add `TranslationJob` model + `Lang` enum; add relations on `Firm`, `Case`, `Document`, `User`. (modify)
- `src/common/text/text-extractor.ts` — shared PDF/DOCX/plain text extractor. (create)
- `src/intelligence/document-intelligence.service.ts` — delegate `extractText` to the shared util (fixes the DOCX bug). (modify)
- `src/translation/translation.service.ts` — segmentation, GPT-4o translation, credits, persistence. (create)
- `src/translation/docx-export.service.ts` — build the two-column DOCX. (create)
- `src/translation/translation.controller.ts` — REST endpoints. (create)
- `src/translation/dto/translation.dto.ts` — request DTOs. (create)
- `src/translation/translation.module.ts` — module wiring. (create)
- `src/app.module.ts` — register `TranslationModule`. (modify)

**Frontend (`apps/web/`):**
- `src/lib/api.ts` — client methods + types for translation. (modify)
- `src/app/(dashboard)/cases/[id]/page.tsx` — add a "Translate" tab entry. (modify)
- `src/app/(dashboard)/cases/[id]/translate/page.tsx` — case-scoped translate UI. (create)
- `src/app/(dashboard)/translate/page.tsx` — standalone paste-text translate UI. (create)
- `src/components/Sidebar.tsx` — add a "Translate" nav item. (modify)

---

## Task 1: Prisma model + migration

**Files:**
- Modify: `apps/api/prisma/schema.prisma`

**Interfaces:**
- Produces: `TranslationJob` model and `Lang` enum available on `PrismaService`. Segment shape (stored in `segments` JSON): `{ heading: string; source: string; target: string }`.

- [ ] **Step 1: Add the `Lang` enum**

In `apps/api/prisma/schema.prisma`, after the existing `enum ActivityType { ... }` block, add:

```prisma
enum Lang {
  TH
  EN
}
```

- [ ] **Step 2: Add the `TranslationJob` model**

Add at the end of the file:

```prisma
model TranslationJob {
  id          String   @id @default(uuid())
  firmId      String
  caseId      String?
  createdById String
  documentId  String?
  title       String
  sourceLang  Lang
  targetLang  Lang
  sourceType  String   // 'document' | 'text'
  segments    Json     // [{ heading, source, target }]
  status      String   @default("DONE") // PENDING | DONE | FAILED
  creditsUsed Int      @default(0)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  firm      Firm      @relation(fields: [firmId], references: [id], onDelete: Cascade)
  case      Case?     @relation(fields: [caseId], references: [id], onDelete: SetNull)
  document  Document? @relation(fields: [documentId], references: [id], onDelete: SetNull)
  createdBy User      @relation(fields: [createdById], references: [id])

  @@index([firmId])
  @@index([caseId])
}
```

- [ ] **Step 3: Add back-relations on the four parent models**

Add `translationJobs TranslationJob[]` to each:

- `model Firm { ... }` — after the `pettyCashFund` line, add:
  ```prisma
  translationJobs  TranslationJob[]
  ```
- `model Case { ... }` — after the `knowledge` line, add:
  ```prisma
  translationJobs TranslationJob[]
  ```
- `model Document { ... }` — after the `knowledge` line, add:
  ```prisma
  translationJobs TranslationJob[]
  ```
- `model User { ... }` — after the `caseActivities` line, add:
  ```prisma
  translationJobs     TranslationJob[]
  ```

- [ ] **Step 4: Create and apply the migration**

Run:
```bash
pnpm --filter @lawfirm/api prisma migrate dev --name translation_jobs
```
Expected: a new folder `apps/api/prisma/migrations/<timestamp>_translation_jobs/` is created, the migration applies cleanly, and `prisma generate` runs (output ends with "Your database is now in sync with your schema.").

If no local database is available, instead run `pnpm --filter @lawfirm/api prisma generate` and hand-author the SQL migration file mirroring the model, then note that `migrate deploy` will apply it in the target env.

- [ ] **Step 5: Verify the client typechecks**

Run:
```bash
pnpm --filter @lawfirm/api build
```
Expected: build succeeds. (`prisma.translationJob` and enum `Lang` now exist on the generated client.)

- [ ] **Step 6: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations
git commit -m "feat(translation): add TranslationJob model and Lang enum"
```

---

## Task 2: Shared text extractor + DOCX bug fix

**Files:**
- Create: `apps/api/src/common/text/text-extractor.ts`
- Modify: `apps/api/src/intelligence/document-intelligence.service.ts:24-37`
- Modify: `apps/api/package.json` (add `mammoth`)

**Interfaces:**
- Produces: `extractText(fileBuffer: Buffer, mimeType: string): Promise<string>` — supports PDF (text layer), DOCX (via `mammoth`), and `text/plain`. Throws `Error("Unsupported file type: <mime>")` otherwise. Constant `SUPPORTED_MIME_TYPES: string[]`.

- [ ] **Step 1: Install `mammoth`**

Run:
```bash
pnpm --filter @lawfirm/api add mammoth
```
Expected: `mammoth` appears under `dependencies` in `apps/api/package.json`.

- [ ] **Step 2: Create the shared extractor**

Create `apps/api/src/common/text/text-extractor.ts`:

```typescript
// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfParse = require('pdf-parse');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const mammoth = require('mammoth');

const PDF = 'application/pdf';
const DOCX =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const TXT = 'text/plain';

export const SUPPORTED_MIME_TYPES: string[] = [PDF, DOCX, TXT];

export async function extractText(
  fileBuffer: Buffer,
  mimeType: string,
): Promise<string> {
  if (mimeType === PDF) {
    const data = await pdfParse(fileBuffer);
    return data.text ?? '';
  }
  if (mimeType === DOCX) {
    const result = await mammoth.extractRawText({ buffer: fileBuffer });
    return result.value ?? '';
  }
  if (mimeType === TXT) {
    return fileBuffer.toString('utf-8');
  }
  throw new Error(`Unsupported file type: ${mimeType}`);
}
```

- [ ] **Step 3: Delegate `document-intelligence` to the shared util**

In `apps/api/src/intelligence/document-intelligence.service.ts`, remove the local `const pdfParse = require('pdf-parse')` line and the entire body of `extractText` (lines 24-37), and add the import at the top:

```typescript
import { extractText } from '../common/text/text-extractor';
```

Replace the method with a thin delegate:

```typescript
  async extractText(fileBuffer: Buffer, mimeType: string): Promise<string> {
    return extractText(fileBuffer, mimeType);
  }
```

- [ ] **Step 4: Verify build**

Run:
```bash
pnpm --filter @lawfirm/api build
```
Expected: build succeeds with no type errors.

- [ ] **Step 5: Manual runtime check (DOCX no longer garbled)**

Start the API (`pnpm --filter @lawfirm/api dev`), then with a real `.docx` in a case, call the existing analyze endpoint:
```bash
curl -s -X POST "http://localhost:3001/cases/<CASE_ID>/documents/analyze" \
  -H "Authorization: Bearer <TOKEN>" \
  -F "file=@sample.docx"
```
Expected: the returned `summary` reflects readable document text (Thai/English), not binary garbage. (Previously the DOCX path returned `toString('utf-8')` gibberish.)

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/common/text/text-extractor.ts apps/api/src/intelligence/document-intelligence.service.ts apps/api/package.json
git commit -m "feat(translation): shared text extractor with mammoth DOCX parsing"
```

---

## Task 3: Translation service (segmentation + GPT-4o + credits)

**Files:**
- Create: `apps/api/src/translation/translation.service.ts`

**Interfaces:**
- Consumes: `extractText` (Task 2); `PrismaService`; `ConfigService`; `DocumentsService.getFilePath(documentId)` → `{ path, filename, mimeType }`.
- Produces:
  - `type Segment = { heading: string; source: string; target: string }`
  - `estimateCredits(text: string): number`
  - `createJob(user: AuthUser, input: CreateTranslationInput): Promise<TranslationJob>` where `CreateTranslationInput = { caseId?: string; documentId?: string; text?: string; sourceLang: 'TH'|'EN'; targetLang: 'TH'|'EN'; title?: string }`
  - `listJobs(caseId?: string): Promise<TranslationJob[]>`
  - `getJob(id: string): Promise<TranslationJob>`
  - `updateSegments(id: string, segments: Segment[]): Promise<TranslationJob>`

- [ ] **Step 1: Create the service**

Create `apps/api/src/translation/translation.service.ts`:

```typescript
import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import { AuthUser } from '@lawfirm/shared';
import { PrismaService } from '../prisma/prisma.module';
import { DocumentsService } from '../documents/documents.service';
import { extractText } from '../common/text/text-extractor';

export type Segment = { heading: string; source: string; target: string };

export interface CreateTranslationInput {
  caseId?: string;
  documentId?: string;
  text?: string;
  sourceLang: 'TH' | 'EN';
  targetLang: 'TH' | 'EN';
  title?: string;
}

const CHUNK_CHARS = 6000;
const LANG_NAME: Record<string, string> = { TH: 'Thai', EN: 'English' };

@Injectable()
export class TranslationService {
  private readonly logger = new Logger(TranslationService.name);

  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
    private documents: DocumentsService,
  ) {}

  estimateCredits(text: string): number {
    return Math.max(1, Math.ceil(text.length / 1000));
  }

  private splitParagraphs(text: string): string[] {
    return text
      .split(/\n\s*\n/)
      .map((p) => p.replace(/\s+$/g, '').trim())
      .filter((p) => p.length > 0);
  }

  private chunk(paragraphs: string[]): string[] {
    const chunks: string[] = [];
    let current = '';
    for (const p of paragraphs) {
      if (current && current.length + p.length > CHUNK_CHARS) {
        chunks.push(current);
        current = '';
      }
      current = current ? `${current}\n\n${p}` : p;
    }
    if (current) chunks.push(current);
    return chunks;
  }

  private async translateChunk(
    chunk: string,
    sourceLang: string,
    targetLang: string,
    apiKey: string,
  ): Promise<Segment[]> {
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
              `You are a legal translator. Translate the contract text from ${LANG_NAME[sourceLang]} to ${LANG_NAME[targetLang]}. ` +
              `Split it into logical clauses. Return ONLY JSON of the form ` +
              `{"segments":[{"heading":"<clause/section number or short label, may be empty>","source":"<original clause text>","target":"<translated clause text>"}]}. ` +
              `Preserve clause numbering and legal meaning. Do not add commentary.`,
          },
          { role: 'user', content: chunk },
        ],
        temperature: 0.2,
      }),
    });

    if (!res.ok) {
      this.logger.error(`OpenAI error: ${res.status}`);
      throw new Error('AI translation failed');
    }

    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = data.choices?.[0]?.message?.content ?? '{"segments":[]}';
    const parsed = JSON.parse(content) as { segments?: Segment[] };
    return (parsed.segments ?? []).map((s) => ({
      heading: s.heading ?? '',
      source: s.source ?? '',
      target: s.target ?? '',
    }));
  }

  private demoSegments(paragraphs: string[]): Segment[] {
    return paragraphs.map((p, i) => ({
      heading: `Clause ${i + 1}`,
      source: p,
      target: '[Demo translation — set OPENAI_API_KEY for GPT-4o]',
    }));
  }

  private async translate(
    text: string,
    sourceLang: string,
    targetLang: string,
  ): Promise<Segment[]> {
    const paragraphs = this.splitParagraphs(text);
    if (paragraphs.length === 0) return [];

    const apiKey = this.config.get<string>('OPENAI_API_KEY');
    if (!apiKey) return this.demoSegments(paragraphs);

    const chunks = this.chunk(paragraphs);
    const segments: Segment[] = [];
    for (const c of chunks) {
      const chunkSegments = await this.translateChunk(
        c,
        sourceLang,
        targetLang,
        apiKey,
      );
      segments.push(...chunkSegments);
    }
    return segments;
  }

  private async resolveSourceText(
    input: CreateTranslationInput,
  ): Promise<{ text: string; sourceType: string; title: string }> {
    if (input.documentId) {
      const { path, filename, mimeType } = await this.documents.getFilePath(
        input.documentId,
      );
      const buffer = fs.readFileSync(path);
      const text = await extractText(buffer, mimeType);
      return {
        text,
        sourceType: 'document',
        title: input.title ?? filename,
      };
    }
    if (input.text && input.text.trim().length > 0) {
      return {
        text: input.text,
        sourceType: 'text',
        title: input.title ?? 'Pasted text',
      };
    }
    throw new BadRequestException('Provide either documentId or text');
  }

  async createJob(user: AuthUser, input: CreateTranslationInput) {
    if (input.sourceLang === input.targetLang) {
      throw new BadRequestException('Source and target language must differ');
    }

    const { text, sourceType, title } = await this.resolveSourceText(input);
    if (!text.trim()) {
      throw new BadRequestException(
        'Could not extract text. Scanned/image documents are not yet supported — paste the text instead.',
      );
    }

    const cost = this.estimateCredits(text);
    const dbUser = await this.prisma.user.findUnique({
      where: { id: user.id },
      select: { aiCredits: true },
    });
    if (!dbUser || dbUser.aiCredits < cost) {
      throw new HttpException(
        'Insufficient AI credits',
        HttpStatus.PAYMENT_REQUIRED,
      );
    }

    const segments = await this.translate(
      text,
      input.sourceLang,
      input.targetLang,
    );

    await this.prisma.user.update({
      where: { id: user.id },
      data: { aiCredits: { decrement: cost } },
    });

    return this.prisma.translationJob.create({
      data: {
        firmId: user.firmId,
        caseId: input.caseId ?? null,
        createdById: user.id,
        documentId: input.documentId ?? null,
        title,
        sourceLang: input.sourceLang,
        targetLang: input.targetLang,
        sourceType,
        segments: segments as unknown as object,
        status: 'DONE',
        creditsUsed: cost,
      },
    });
  }

  async listJobs(firmId: string, caseId?: string) {
    return this.prisma.translationJob.findMany({
      where: { firmId, ...(caseId ? { caseId } : {}) },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  async getJob(firmId: string, id: string) {
    const job = await this.prisma.translationJob.findFirst({
      where: { id, firmId },
    });
    if (!job) throw new NotFoundException('Translation job not found');
    return job;
  }

  async updateSegments(firmId: string, id: string, segments: Segment[]) {
    await this.getJob(firmId, id);
    return this.prisma.translationJob.update({
      where: { id },
      data: { segments: segments as unknown as object },
    });
  }
}
```

- [ ] **Step 2: Verify build**

Run:
```bash
pnpm --filter @lawfirm/api build
```
Expected: build succeeds. (Full wiring is tested in Task 5; this task just needs to compile against the generated client and `DocumentsService`.)

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/translation/translation.service.ts
git commit -m "feat(translation): translation service with segmentation, GPT-4o, credits"
```

---

## Task 4: DOCX export service

**Files:**
- Create: `apps/api/src/translation/docx-export.service.ts`
- Modify: `apps/api/package.json` (add `docx`)

**Interfaces:**
- Consumes: `Segment` type (Task 3).
- Produces: `DocxExportService.build(job: { title: string; sourceLang: string; targetLang: string; segments: Segment[] }): Promise<Buffer>` — a `.docx` with a two-column table.

- [ ] **Step 1: Install `docx`**

Run:
```bash
pnpm --filter @lawfirm/api add docx
```
Expected: `docx` appears under `dependencies`.

- [ ] **Step 2: Create the export service**

Create `apps/api/src/translation/docx-export.service.ts`:

```typescript
import { Injectable } from '@nestjs/common';
import {
  Document,
  Packer,
  Paragraph,
  Table,
  TableRow,
  TableCell,
  TextRun,
  HeadingLevel,
  WidthType,
} from 'docx';
import type { Segment } from './translation.service';

const LANG_NAME: Record<string, string> = { TH: 'Thai', EN: 'English' };

@Injectable()
export class DocxExportService {
  async build(job: {
    title: string;
    sourceLang: string;
    targetLang: string;
    segments: Segment[];
  }): Promise<Buffer> {
    const headerRow = new TableRow({
      tableHeader: true,
      children: [
        this.cell(LANG_NAME[job.sourceLang] ?? job.sourceLang, true),
        this.cell(LANG_NAME[job.targetLang] ?? job.targetLang, true),
      ],
    });

    const rows = job.segments.map(
      (s) =>
        new TableRow({
          children: [
            this.segmentCell(s.heading, s.source),
            this.segmentCell(s.heading, s.target),
          ],
        }),
    );

    const table = new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [headerRow, ...rows],
    });

    const doc = new Document({
      sections: [
        {
          children: [
            new Paragraph({ text: job.title, heading: HeadingLevel.HEADING_1 }),
            table,
          ],
        },
      ],
    });

    return Packer.toBuffer(doc);
  }

  private cell(text: string, bold = false): TableCell {
    return new TableCell({
      children: [new Paragraph({ children: [new TextRun({ text, bold })] })],
    });
  }

  private segmentCell(heading: string, body: string): TableCell {
    const children: Paragraph[] = [];
    if (heading) {
      children.push(
        new Paragraph({ children: [new TextRun({ text: heading, bold: true })] }),
      );
    }
    children.push(new Paragraph({ children: [new TextRun({ text: body })] }));
    return new TableCell({ children });
  }
}
```

- [ ] **Step 3: Verify build**

Run:
```bash
pnpm --filter @lawfirm/api build
```
Expected: build succeeds.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/translation/docx-export.service.ts apps/api/package.json
git commit -m "feat(translation): DOCX export service (two-column table)"
```

---

## Task 5: Controller + module wiring (backend end-to-end)

**Files:**
- Create: `apps/api/src/translation/dto/translation.dto.ts`
- Create: `apps/api/src/translation/translation.controller.ts`
- Create: `apps/api/src/translation/translation.module.ts`
- Modify: `apps/api/src/app.module.ts`

**Interfaces:**
- Consumes: `TranslationService` (Task 3), `DocxExportService` (Task 4), `DocumentsModule` (exports `DocumentsService`).
- Produces REST API:
  - `POST /translation` → creates a job
  - `GET /translation?caseId=` → lists firm's jobs
  - `GET /translation/:id` → one job
  - `PATCH /translation/:id` → save edited segments
  - `GET /translation/:id/export.docx` → DOCX download

- [ ] **Step 1: Create the DTOs**

Create `apps/api/src/translation/dto/translation.dto.ts`:

```typescript
import {
  IsIn,
  IsOptional,
  IsString,
  IsArray,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateTranslationDto {
  @IsOptional() @IsString() caseId?: string;
  @IsOptional() @IsString() documentId?: string;
  @IsOptional() @IsString() text?: string;
  @IsIn(['TH', 'EN']) sourceLang!: 'TH' | 'EN';
  @IsIn(['TH', 'EN']) targetLang!: 'TH' | 'EN';
  @IsOptional() @IsString() title?: string;
}

export class SegmentDto {
  @IsString() heading!: string;
  @IsString() source!: string;
  @IsString() target!: string;
}

export class UpdateSegmentsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SegmentDto)
  segments!: SegmentDto[];
}
```

- [ ] **Step 2: Create the controller**

Create `apps/api/src/translation/translation.controller.ts`:

```typescript
import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { AuthUser } from '@lawfirm/shared';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { TranslationService } from './translation.service';
import { DocxExportService } from './docx-export.service';
import { CreateTranslationDto, UpdateSegmentsDto } from './dto/translation.dto';

@Controller('translation')
@UseGuards(JwtAuthGuard)
export class TranslationController {
  constructor(
    private translation: TranslationService,
    private docx: DocxExportService,
  ) {}

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateTranslationDto) {
    return this.translation.createJob(user, dto);
  }

  @Get()
  list(@CurrentUser() user: AuthUser, @Query('caseId') caseId?: string) {
    return this.translation.listJobs(user.firmId, caseId);
  }

  @Get(':id')
  get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.translation.getJob(user.firmId, id);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateSegmentsDto,
  ) {
    return this.translation.updateSegments(user.firmId, id, dto.segments);
  }

  @Get(':id/export.docx')
  async export(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    const job = await this.translation.getJob(user.firmId, id);
    const buffer = await this.docx.build({
      title: job.title,
      sourceLang: job.sourceLang,
      targetLang: job.targetLang,
      segments: job.segments as unknown as {
        heading: string;
        source: string;
        target: string;
      }[],
    });
    res.set({
      'Content-Type':
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'Content-Disposition': `attachment; filename="translation-${id}.docx"`,
    });
    res.send(buffer);
  }
}
```

- [ ] **Step 3: Create the module**

Create `apps/api/src/translation/translation.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { TranslationService } from './translation.service';
import { DocxExportService } from './docx-export.service';
import { TranslationController } from './translation.controller';
import { DocumentsModule } from '../documents/documents.module';

@Module({
  imports: [DocumentsModule],
  providers: [TranslationService, DocxExportService],
  controllers: [TranslationController],
  exports: [TranslationService],
})
export class TranslationModule {}
```

- [ ] **Step 4: Register the module**

In `apps/api/src/app.module.ts`, add the import near the other module imports:
```typescript
import { TranslationModule } from './translation/translation.module';
```
and add `TranslationModule,` to the `imports` array (place it after `IntelligenceModule,`).

- [ ] **Step 5: Verify build**

Run:
```bash
pnpm --filter @lawfirm/api build
```
Expected: build succeeds.

- [ ] **Step 6: Manual runtime check (full backend flow)**

Start the API. Create a job from pasted text (demo mode is fine without an OpenAI key):
```bash
curl -s -X POST "http://localhost:3001/translation" \
  -H "Authorization: Bearer <TOKEN>" -H "Content-Type: application/json" \
  -d '{"text":"ข้อ 1. สัญญานี้ทำขึ้นระหว่างคู่สัญญา\n\nข้อ 2. ระยะเวลาของสัญญา","sourceLang":"TH","targetLang":"EN"}'
```
Expected: JSON with an `id`, `segments` array (one entry per clause), `creditsUsed >= 1`, `status:"DONE"`.

Then export it:
```bash
curl -s "http://localhost:3001/translation/<JOB_ID>/export.docx" \
  -H "Authorization: Bearer <TOKEN>" -o /tmp/out.docx && file /tmp/out.docx
```
Expected: `/tmp/out.docx: Microsoft Word 2007+` (a valid DOCX).

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/translation/translation.controller.ts apps/api/src/translation/translation.module.ts apps/api/src/translation/dto/translation.dto.ts apps/api/src/app.module.ts
git commit -m "feat(translation): REST endpoints and module wiring"
```

---

## Task 6: Web API client methods

**Files:**
- Modify: `apps/web/src/lib/api.ts`

**Interfaces:**
- Consumes: existing `request<T>`, `fetchBlob`, and the `api` object.
- Produces on `api`:
  - `createTranslation(token, body): Promise<TranslationJob>`
  - `getTranslations(token, caseId?): Promise<TranslationJob[]>`
  - `getTranslation(token, id): Promise<TranslationJob>`
  - `updateTranslation(token, id, segments): Promise<TranslationJob>`
  - `downloadTranslationDocx(token, id): Promise<Blob>`
  - exported types `TranslationSegment`, `TranslationJob`.

- [ ] **Step 1: Add exported types**

In `apps/web/src/lib/api.ts`, near the other exported interfaces (e.g. beside `KnowledgeItem`), add:

```typescript
export interface TranslationSegment {
  heading: string;
  source: string;
  target: string;
}

export interface TranslationJob {
  id: string;
  caseId: string | null;
  documentId: string | null;
  title: string;
  sourceLang: 'TH' | 'EN';
  targetLang: 'TH' | 'EN';
  sourceType: 'document' | 'text';
  segments: TranslationSegment[];
  status: string;
  creditsUsed: number;
  createdAt: string;
}
```

- [ ] **Step 2: Add methods to the `api` object**

Inside the `export const api = { ... }` object, add these entries (place after `analyzeDocument`):

```typescript
  createTranslation: (
    token: string,
    body: {
      caseId?: string;
      documentId?: string;
      text?: string;
      sourceLang: 'TH' | 'EN';
      targetLang: 'TH' | 'EN';
      title?: string;
    },
  ) =>
    request<TranslationJob>('/translation', {
      method: 'POST',
      token,
      body: JSON.stringify(body),
    }),

  getTranslations: (token: string, caseId?: string) =>
    request<TranslationJob[]>(
      `/translation${caseId ? `?caseId=${caseId}` : ''}`,
      { token },
    ),

  getTranslation: (token: string, id: string) =>
    request<TranslationJob>(`/translation/${id}`, { token }),

  updateTranslation: (
    token: string,
    id: string,
    segments: TranslationSegment[],
  ) =>
    request<TranslationJob>(`/translation/${id}`, {
      method: 'PATCH',
      token,
      body: JSON.stringify({ segments }),
    }),

  downloadTranslationDocx: (token: string, id: string) =>
    fetchBlob(`/translation/${id}/export.docx`, { token }),
```

- [ ] **Step 3: Verify build**

Run:
```bash
pnpm --filter @lawfirm/web build
```
Expected: build succeeds (types resolve).

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/lib/api.ts
git commit -m "feat(translation): web api client methods"
```

---

## Task 7: Case-scoped translate tab

**Files:**
- Create: `apps/web/src/app/(dashboard)/cases/[id]/translate/page.tsx`
- Modify: `apps/web/src/app/(dashboard)/cases/[id]/page.tsx:221-227` (tabs array)

**Interfaces:**
- Consumes: `api.getDocuments`, `api.createTranslation`, `api.getTranslations`, `api.getTranslation`, `api.updateTranslation`, `api.downloadTranslationDocx`; `useAuth`, `useParams`.

- [ ] **Step 1: Add the "Translate" tab entry**

In `apps/web/src/app/(dashboard)/cases/[id]/page.tsx`, inside the `tabs` array (currently ending with the `billing` entry at line ~226), add after the `documents` entry:
```typescript
    { id: 'translate', label: 'Translate / แปล', href: `/cases/${id}/translate` },
```

- [ ] **Step 2: Create the translate page**

Create `apps/web/src/app/(dashboard)/cases/[id]/translate/page.tsx`:

```typescript
'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Download, Loader2, Languages } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import {
  api,
  ApiError,
  DocumentItem,
  TranslationJob,
  TranslationSegment,
} from '@/lib/api';

export default function CaseTranslatePage() {
  const { id } = useParams<{ id: string }>();
  const { token } = useAuth();
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [jobs, setJobs] = useState<TranslationJob[]>([]);
  const [active, setActive] = useState<TranslationJob | null>(null);
  const [sourceLang, setSourceLang] = useState<'TH' | 'EN'>('TH');
  const [targetLang, setTargetLang] = useState<'TH' | 'EN'>('EN');
  const [mode, setMode] = useState<'document' | 'text'>('document');
  const [documentId, setDocumentId] = useState('');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!token || !id) return;
    api.getDocuments(token, id).then((d) => setDocuments(d as DocumentItem[])).catch(console.error);
    api.getTranslations(token, id).then(setJobs).catch(console.error);
  }, [token, id]);

  const translate = async () => {
    if (!token) return;
    setBusy(true);
    setError('');
    try {
      const job = await api.createTranslation(token, {
        caseId: id,
        sourceLang,
        targetLang,
        ...(mode === 'document' ? { documentId } : { text }),
      });
      setActive(job);
      setJobs([job, ...jobs]);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Translation failed');
    } finally {
      setBusy(false);
    }
  };

  const editSegment = (i: number, value: string) => {
    if (!active) return;
    const segments = active.segments.map((s, idx) =>
      idx === i ? { ...s, target: value } : s,
    );
    setActive({ ...active, segments });
  };

  const save = async () => {
    if (!token || !active) return;
    setBusy(true);
    try {
      const updated = await api.updateTranslation(token, active.id, active.segments);
      setActive(updated);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Save failed');
    } finally {
      setBusy(false);
    }
  };

  const download = async () => {
    if (!token || !active) return;
    const blob = await api.downloadTranslationDocx(token, active.id);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${active.title || 'translation'}.docx`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Languages className="h-5 w-5 text-primary" />
        <h2 className="text-lg font-semibold">Bilingual Contract Translation</h2>
      </div>

      <div className="rounded-lg border p-4 space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <select
            className="rounded border px-2 py-1 text-sm"
            value={sourceLang}
            onChange={(e) => setSourceLang(e.target.value as 'TH' | 'EN')}
          >
            <option value="TH">Thai</option>
            <option value="EN">English</option>
          </select>
          <span>→</span>
          <select
            className="rounded border px-2 py-1 text-sm"
            value={targetLang}
            onChange={(e) => setTargetLang(e.target.value as 'TH' | 'EN')}
          >
            <option value="EN">English</option>
            <option value="TH">Thai</option>
          </select>

          <select
            className="rounded border px-2 py-1 text-sm"
            value={mode}
            onChange={(e) => setMode(e.target.value as 'document' | 'text')}
          >
            <option value="document">From document</option>
            <option value="text">Paste text</option>
          </select>
        </div>

        {mode === 'document' ? (
          <select
            className="w-full rounded border px-2 py-2 text-sm"
            value={documentId}
            onChange={(e) => setDocumentId(e.target.value)}
          >
            <option value="">Select a document…</option>
            {documents.map((d) => (
              <option key={d.id} value={d.id}>
                {d.filename}
              </option>
            ))}
          </select>
        ) : (
          <textarea
            className="w-full rounded border px-2 py-2 text-sm"
            rows={6}
            placeholder="Paste contract text…"
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
        )}

        <button
          className="inline-flex items-center gap-2 rounded bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-50"
          disabled={busy || (mode === 'document' ? !documentId : !text.trim())}
          onClick={translate}
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Languages className="h-4 w-4" />}
          Translate
        </button>
        {error && <p className="text-sm text-red-500">{error}</p>}
      </div>

      {active && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-medium">{active.title}</h3>
            <div className="flex gap-2">
              <button
                className="rounded border px-3 py-1.5 text-sm disabled:opacity-50"
                disabled={busy}
                onClick={save}
              >
                Save
              </button>
              <button
                className="inline-flex items-center gap-1 rounded border px-3 py-1.5 text-sm"
                onClick={download}
              >
                <Download className="h-4 w-4" /> DOCX
              </button>
            </div>
          </div>

          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/40 text-left">
                  <th className="w-1/2 p-2">{active.sourceLang === 'TH' ? 'Thai' : 'English'}</th>
                  <th className="w-1/2 p-2">{active.targetLang === 'TH' ? 'Thai' : 'English'}</th>
                </tr>
              </thead>
              <tbody>
                {active.segments.map((s: TranslationSegment, i: number) => (
                  <tr key={i} className="border-b align-top">
                    <td className="p-2 whitespace-pre-wrap">
                      {s.heading && <div className="font-medium">{s.heading}</div>}
                      {s.source}
                    </td>
                    <td className="p-2">
                      <textarea
                        className="w-full resize-y rounded border px-2 py-1"
                        rows={Math.max(2, Math.ceil((s.target?.length || 0) / 60))}
                        value={s.target}
                        onChange={(e) => editSegment(i, e.target.value)}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Verify build**

Run:
```bash
pnpm --filter @lawfirm/web build
```
Expected: build succeeds. (If `DocumentItem` lacks a `filename` field, confirm the actual field name in `api.ts` and adjust the `<option>` label accordingly.)

- [ ] **Step 4: Manual runtime check**

Start web + API. Open a case → **Translate / แปล** tab. Paste two Thai clauses, choose TH→EN, click **Translate**. Expected: a two-column table appears; the right column is editable; **Save** persists; **DOCX** downloads a file that opens in Word with a two-column table.

- [ ] **Step 5: Commit**

```bash
git add "apps/web/src/app/(dashboard)/cases/[id]/translate/page.tsx" "apps/web/src/app/(dashboard)/cases/[id]/page.tsx"
git commit -m "feat(translation): case-scoped bilingual translate tab"
```

---

## Task 8: Standalone translate page + sidebar entry

**Files:**
- Create: `apps/web/src/app/(dashboard)/translate/page.tsx`
- Modify: `apps/web/src/components/Sidebar.tsx:16` (nav array)

**Interfaces:**
- Consumes: same `api` translation methods; no `caseId` (paste-text only).

- [ ] **Step 1: Add the sidebar nav item**

In `apps/web/src/components/Sidebar.tsx`, add to the nav array (after the `Knowledge Base` entry):
```typescript
  { href: '/translate', label: 'Translate / แปล', roles: [Role.ADMIN, Role.LAWYER, Role.CLERK] },
```

- [ ] **Step 2: Create the standalone page**

Create `apps/web/src/app/(dashboard)/translate/page.tsx`. It is the paste-text-only variant of Task 7 — reuse the same component logic but without the document picker and without `caseId`:

```typescript
'use client';

import { useState } from 'react';
import { Download, Loader2, Languages } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { api, ApiError, TranslationJob, TranslationSegment } from '@/lib/api';

export default function TranslatePage() {
  const { token } = useAuth();
  const [sourceLang, setSourceLang] = useState<'TH' | 'EN'>('TH');
  const [targetLang, setTargetLang] = useState<'TH' | 'EN'>('EN');
  const [text, setText] = useState('');
  const [active, setActive] = useState<TranslationJob | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const translate = async () => {
    if (!token) return;
    setBusy(true);
    setError('');
    try {
      const job = await api.createTranslation(token, { text, sourceLang, targetLang });
      setActive(job);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Translation failed');
    } finally {
      setBusy(false);
    }
  };

  const editSegment = (i: number, value: string) => {
    if (!active) return;
    const segments = active.segments.map((s, idx) =>
      idx === i ? { ...s, target: value } : s,
    );
    setActive({ ...active, segments });
  };

  const save = async () => {
    if (!token || !active) return;
    setBusy(true);
    try {
      setActive(await api.updateTranslation(token, active.id, active.segments));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Save failed');
    } finally {
      setBusy(false);
    }
  };

  const download = async () => {
    if (!token || !active) return;
    const blob = await api.downloadTranslationDocx(token, active.id);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${active.title || 'translation'}.docx`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center gap-2">
        <Languages className="h-5 w-5 text-primary" />
        <h1 className="text-xl font-semibold">Translate / แปลเอกสาร</h1>
      </div>

      <div className="rounded-lg border p-4 space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <select className="rounded border px-2 py-1 text-sm" value={sourceLang}
            onChange={(e) => setSourceLang(e.target.value as 'TH' | 'EN')}>
            <option value="TH">Thai</option>
            <option value="EN">English</option>
          </select>
          <span>→</span>
          <select className="rounded border px-2 py-1 text-sm" value={targetLang}
            onChange={(e) => setTargetLang(e.target.value as 'TH' | 'EN')}>
            <option value="EN">English</option>
            <option value="TH">Thai</option>
          </select>
        </div>
        <textarea className="w-full rounded border px-2 py-2 text-sm" rows={6}
          placeholder="Paste contract text…" value={text}
          onChange={(e) => setText(e.target.value)} />
        <button
          className="inline-flex items-center gap-2 rounded bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-50"
          disabled={busy || !text.trim()} onClick={translate}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Languages className="h-4 w-4" />}
          Translate
        </button>
        {error && <p className="text-sm text-red-500">{error}</p>}
      </div>

      {active && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-medium">{active.title}</h3>
            <div className="flex gap-2">
              <button className="rounded border px-3 py-1.5 text-sm disabled:opacity-50"
                disabled={busy} onClick={save}>Save</button>
              <button className="inline-flex items-center gap-1 rounded border px-3 py-1.5 text-sm"
                onClick={download}><Download className="h-4 w-4" /> DOCX</button>
            </div>
          </div>
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/40 text-left">
                  <th className="w-1/2 p-2">{active.sourceLang === 'TH' ? 'Thai' : 'English'}</th>
                  <th className="w-1/2 p-2">{active.targetLang === 'TH' ? 'Thai' : 'English'}</th>
                </tr>
              </thead>
              <tbody>
                {active.segments.map((s: TranslationSegment, i: number) => (
                  <tr key={i} className="border-b align-top">
                    <td className="p-2 whitespace-pre-wrap">
                      {s.heading && <div className="font-medium">{s.heading}</div>}
                      {s.source}
                    </td>
                    <td className="p-2">
                      <textarea className="w-full resize-y rounded border px-2 py-1"
                        rows={Math.max(2, Math.ceil((s.target?.length || 0) / 60))}
                        value={s.target} onChange={(e) => editSegment(i, e.target.value)} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Verify build**

Run:
```bash
pnpm --filter @lawfirm/web build
```
Expected: build succeeds.

- [ ] **Step 4: Manual runtime check**

Open the sidebar → **Translate / แปล**. Paste text, translate, edit, save, download DOCX. Expected: works standalone (no case context).

- [ ] **Step 5: Commit**

```bash
git add "apps/web/src/app/(dashboard)/translate/page.tsx" apps/web/src/components/Sidebar.tsx
git commit -m "feat(translation): standalone translate page and sidebar entry"
```

---

## Self-Review Notes

- **Spec coverage:** bilingual side-by-side (Tasks 7/8), source = document + paste (Tasks 3/7), file types PDF/DOCX/plain (Task 2), TH↔EN both directions (Task 1 enum + UI), editable target + save (Tasks 3/7), DOCX export (Tasks 4/5), AI credits by length (Task 3 `estimateCredits`), demo fallback (Task 3), extraction-failure message for scanned docs (Task 3). All covered.
- **DOCX bug fix** from the spec is folded into Task 2 (shared extractor via `mammoth`).
- **Type consistency:** `Segment { heading, source, target }` is defined once in `translation.service.ts` and reused by `docx-export.service.ts` and the web `TranslationSegment`. Enum values `'TH' | 'EN'` consistent across DTO, service, and client.
- **Out of scope (per spec):** OCR, PDF export, saving export back as a `Document` — not in any task, intentionally.
- **Credits note:** the existing `AiCreditsInterceptor`/`RequireCredits` decorator uses a fixed amount known at decoration time; translation cost depends on text length, so credits are checked/decremented inside `TranslationService.createJob` instead. This is intentional and documented here.

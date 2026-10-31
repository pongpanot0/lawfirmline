import { Injectable, Logger } from '@nestjs/common';
import { redactForAi } from '@lawfirm/shared';
import type { AuthUser, SecretaryCard } from '@lawfirm/shared';
import { PrismaService } from '../prisma/prisma.module';
import { CaseAccessService } from '../common/services/case-access.service';
import { RagService } from '../rag/rag.service';
import { MatterBriefService } from './matter-brief.service';

export interface OpenAiToolDef {
  type: 'function';
  function: { name: string; description: string; parameters: Record<string, unknown> };
}
export interface ToolResult { content: unknown; cards: SecretaryCard[] }

const NOT_FOUND: ToolResult = { content: { error: 'not_found' }, cards: [] };
const bad = (msg: string): ToolResult => ({ content: { error: msg }, cards: [] });
const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);
const contains = (q: string) => ({ contains: q, mode: 'insensitive' as const });

const tool = (name: string, description: string, properties: Record<string, unknown>, required: string[]): OpenAiToolDef => ({
  type: 'function',
  function: { name, description, parameters: { type: 'object', properties, required, additionalProperties: false } },
});

/** Read-only, access-filtered tools for the AI secretary. Every query is scoped by the caller's case/intake filters. */
@Injectable()
export class SecretaryToolsService {
  private readonly logger = new Logger(SecretaryToolsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly access: CaseAccessService,
    private readonly brief: MatterBriefService,
    private readonly rag: RagService,
  ) {}

  definitions(): OpenAiToolDef[] {
    return [
      tool('find_matters', 'Find cases and intakes by title, reference, client, case number or participant name. Max 8.',
        { query: { type: 'string' } }, ['query']),
      tool('case_overview', 'Get the brief of one case or intake: parties, stage, next event, open tasks. Pass caseId or intakeId.',
        { caseId: { type: 'string' }, intakeId: { type: 'string' } }, []),
      tool('search_documents', 'Search documents by content and filename across accessible cases, optionally within one case. Max 10.',
        { query: { type: 'string' }, caseId: { type: 'string' } }, ['query']),
      tool('read_document', 'Read the passages of one document most relevant to a question.',
        { documentId: { type: 'string' }, question: { type: 'string' } }, ['documentId', 'question']),
      tool('list_events', 'List calendar events in a date range (ISO dates). Max 50.',
        { from: { type: 'string' }, to: { type: 'string' }, caseId: { type: 'string' }, mineOnly: { type: 'boolean' } }, ['from', 'to']),
    ];
  }

  async run(user: AuthUser, name: string, args: unknown): Promise<ToolResult> {
    const a = (args && typeof args === 'object' ? args : {}) as Record<string, unknown>;
    let result: ToolResult;
    switch (name) {
      case 'find_matters': result = await this.findMatters(user, a); break;
      case 'case_overview': result = await this.caseOverview(user, a); break;
      case 'search_documents': result = await this.searchDocuments(user, a); break;
      case 'read_document': result = await this.readDocument(user, a); break;
      case 'list_events': result = await this.listEvents(user, a); break;
      default: return bad('unknown_tool');
    }
    return { ...result, content: redactContent(result.content) };
  }

  private async findMatters(user: AuthUser, a: Record<string, unknown>): Promise<ToolResult> {
    const q = str(a.query);
    if (!q) return bad('query_required');
    const [caseFilter, intakeFilter] = [await this.access.getCaseFilterForUser(user), await this.access.getIntakeFilterForUser(user)];
    const [cases, intakes] = await Promise.all([
      this.prisma.case.findMany({
        where: { AND: [caseFilter, { OR: [
          { title: contains(q) }, { ownRef: contains(q) }, { clientName: contains(q) }, { customerRef: contains(q) },
          { blackCaseNumber: contains(q) }, { redCaseNumber: contains(q) },
          { participants: { some: { name: contains(q) } } },
        ] }] },
        select: { id: true, title: true, ownRef: true, stage: true }, take: 8,
      }),
      this.prisma.intake.findMany({
        where: { AND: [intakeFilter, { OR: [{ title: contains(q) }, { clientName: contains(q) }] }] },
        select: { id: true, title: true, clientName: true, stage: true }, take: 8,
      }),
    ]);
    const rows = [
      ...cases.map((c) => ({ kind: 'case', id: c.id, title: c.title, ownRef: c.ownRef, stage: c.stage })),
      ...intakes.map((i) => ({ kind: 'intake', id: i.id, title: i.title ?? i.clientName ?? '', ownRef: null, stage: i.stage })),
    ].slice(0, 8);
    const cards: SecretaryCard[] = rows.map((r) =>
      r.kind === 'case' ? { type: 'case', id: r.id, title: r.title, ownRef: r.ownRef } : { type: 'intake', id: r.id, title: r.title });
    return { content: { matters: rows }, cards };
  }

  private async caseOverview(user: AuthUser, a: Record<string, unknown>): Promise<ToolResult> {
    const caseId = str(a.caseId);
    const intakeId = str(a.intakeId);
    if (!caseId && !intakeId) return bad('caseId_or_intakeId_required');
    const b = caseId ? await this.brief.getCaseBrief(user, caseId) : await this.brief.getIntakeBrief(user, intakeId as string);
    if (!b) return NOT_FOUND;
    const card: SecretaryCard = b.kind === 'case'
      ? { type: 'case', id: b.id, title: b.title, ownRef: b.ownRef }
      : { type: 'intake', id: b.id, title: b.title };
    return { content: b, cards: [card] };
  }

  private async searchDocuments(user: AuthUser, a: Record<string, unknown>): Promise<ToolResult> {
    const q = str(a.query);
    if (!q) return bad('query_required');
    const caseId = str(a.caseId);
    const caseFilter = await this.access.getCaseFilterForUser(user);
    const [byContent, byName] = await Promise.all([
      this.rag.searchDocumentsByContent(user, q),
      this.prisma.document.findMany({
        where: { AND: [{ case: caseFilter }, { filename: contains(q) }, caseId ? { caseId } : {}] },
        select: { id: true, caseId: true, filename: true }, take: 10,
      }),
    ]);
    const seen = new Map<string, { documentId: string; caseId: string | null; filename: string; snippet?: string }>();
    for (const r of byContent) {
      if (caseId && r.caseId !== caseId) continue;
      seen.set(r.documentId, { documentId: r.documentId, caseId: r.caseId, filename: r.filename, snippet: r.snippet });
    }
    for (const d of byName) if (!seen.has(d.id)) seen.set(d.id, { documentId: d.id, caseId: d.caseId, filename: d.filename });
    const docs = [...seen.values()].slice(0, 10);
    return {
      content: { documents: docs },
      cards: docs.map((d) => ({ type: 'document', id: d.documentId, caseId: d.caseId, filename: d.filename })),
    };
  }

  private async readDocument(user: AuthUser, a: Record<string, unknown>): Promise<ToolResult> {
    const documentId = str(a.documentId);
    const question = str(a.question);
    if (!documentId || !question) return bad('documentId_and_question_required');
    const [caseFilter, intakeFilter] = [await this.access.getCaseFilterForUser(user), await this.access.getIntakeFilterForUser(user)];
    const doc = await this.prisma.document.findFirst({
      where: { id: documentId, OR: [{ case: caseFilter }, { intake: intakeFilter }] },
      select: { id: true, caseId: true, filename: true },
    });
    if (!doc) return NOT_FOUND;
    const cards: SecretaryCard[] = [{ type: 'document', id: doc.id, caseId: doc.caseId, filename: doc.filename }];
    // Chunks are case-scoped; intake documents are never indexed.
    const indexed = doc.caseId ? await this.prisma.documentChunk.count({ where: { documentId: doc.id } }) : 0;
    if (!doc.caseId || indexed === 0) {
      if (doc.caseId) this.rag.ensureCaseIndexed(doc.caseId, user.firmId).catch((e) => this.logger.warn(`ensureCaseIndexed: ${e}`));
      return { content: { notIndexed: true }, cards };
    }
    const chunks = await this.rag.retrieve(doc.caseId, user.firmId, question, [doc.id], user.id);
    return {
      content: { filename: doc.filename, chunks: chunks.slice(0, 5).map((c) => ({ pageStart: c.pageStart, pageEnd: c.pageEnd, content: c.content })) },
      cards,
    };
  }

  private async listEvents(user: AuthUser, a: Record<string, unknown>): Promise<ToolResult> {
    const from = new Date(String(a.from));
    const to = new Date(String(a.to));
    if (isNaN(from.getTime()) || isNaN(to.getTime())) return bad('invalid_date_range');
    const caseFilter = await this.access.getCaseFilterForUser(user);
    const caseId = str(a.caseId);
    if (caseId && !(await this.prisma.case.findFirst({ where: { AND: [caseFilter, { id: caseId }] }, select: { id: true } }))) return NOT_FOUND;
    const events = await this.prisma.calendarEvent.findMany({
      where: {
        case: caseFilter, startAt: { gte: from, lte: to }, ...(caseId ? { caseId } : {}),
        ...(a.mineOnly === true ? { OR: [{ assigneeId: user.id }, { assignees: { some: { userId: user.id } } }] } : {}),
      },
      orderBy: { startAt: 'asc' }, take: 50,
      select: { id: true, caseId: true, title: true, type: true, courtName: true, startAt: true },
    });
    const rows = events.map((e) => ({ id: e.id, caseId: e.caseId, title: e.title, type: e.type, courtName: e.courtName, startAt: e.startAt.toISOString() }));
    return {
      content: { events: rows },
      cards: rows.map((e) => ({ type: 'event', id: e.id, caseId: e.caseId, title: e.title, startAt: e.startAt })),
    };
  }
}

/** Redact PII from the serialized payload before it reaches the model; falls back to the redacted string if it no longer parses. */
function redactContent(content: unknown): unknown {
  const { text } = redactForAi(JSON.stringify(content));
  try { return JSON.parse(text); } catch { return text; }
}

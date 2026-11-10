import { Injectable, Logger } from '@nestjs/common';
import { LeaveStatus } from '../generated/prisma';
import { hasFirmCapability, redactForAi } from '@lawfirm/shared';
import type { AuthUser, FirmCapability, SecretaryCard } from '@lawfirm/shared';
import { PrismaService } from '../prisma/prisma.module';
import { CaseAccessService } from '../common/services/case-access.service';
import { RagService } from '../rag/rag.service';
import { CollectionsService } from '../billing/collections.service';
import { daysToExpiry } from '../lawyer-license/license-milestones';
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

/** Office tools mirror the capability that guards the same data's page; a tool without one is open to every member. */
const OFFICE_TOOL_CAPABILITY: Record<string, FirmCapability> = {
  receivables: 'manageInvoices',
  petty_cash_balance: 'viewPettyCash',
};
const canUse = (user: AuthUser, name: string) => {
  const cap = OFFICE_TOOL_CAPABILITY[name];
  return !cap || hasFirmCapability(user.firmRole, cap);
};
const DAY_MS = 86_400_000;
const MAX_LEAVE_RANGE_DAYS = 62;
const SOP_CONTENT_CHARS = 2000;

/** Read-only, access-filtered tools for the AI secretary. Every query is scoped by the caller's case/intake filters. */
@Injectable()
export class SecretaryToolsService {
  private readonly logger = new Logger(SecretaryToolsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly access: CaseAccessService,
    private readonly brief: MatterBriefService,
    private readonly rag: RagService,
    private readonly collections: CollectionsService,
  ) {}

  /** Only the tools this user may run — the model never sees an office tool it would be refused. */
  definitions(user: AuthUser): OpenAiToolDef[] {
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
      tool('list_leaves', 'List staff leave (pending and approved) overlapping a date range (ISO dates, max 62 days).',
        { from: { type: 'string' }, to: { type: 'string' } }, ['from', 'to']),
      tool('search_sops', 'Search the firm\'s SOPs / office procedures by keyword. Returns up to 5 with their content.',
        { query: { type: 'string' } }, ['query']),
      tool('lawyer_licenses', 'Lawyer licences expiring within N days (default 90), including recently expired. Office managers see all members; others see their own.',
        { withinDays: { type: 'number' } }, []),
      tool('receivables', 'Unpaid sent invoices with aging buckets (0-30, 31-60, 61-90, 90+ days overdue), largest overdue first. Max 20 rows.',
        { minDaysOverdue: { type: 'number' } }, []),
      tool('petty_cash_balance', 'Current petty cash fund balance (THB).', {}, []),
    ].filter((d) => canUse(user, d.function.name));
  }

  async run(user: AuthUser, name: string, args: unknown): Promise<ToolResult> {
    const a = (args && typeof args === 'object' ? args : {}) as Record<string, unknown>;
    if (!canUse(user, name)) return bad('forbidden');
    let result: ToolResult;
    switch (name) {
      case 'find_matters': result = await this.findMatters(user, a); break;
      case 'case_overview': result = await this.caseOverview(user, a); break;
      case 'search_documents': result = await this.searchDocuments(user, a); break;
      case 'read_document': result = await this.readDocument(user, a); break;
      case 'list_events': result = await this.listEvents(user, a); break;
      case 'list_leaves': result = await this.listLeaves(user, a); break;
      case 'search_sops': result = await this.searchSops(user, a); break;
      case 'lawyer_licenses': result = await this.lawyerLicenses(user, a); break;
      case 'receivables': result = await this.receivables(user, a); break;
      case 'petty_cash_balance': result = await this.pettyCashBalance(user); break;
      default: return bad('unknown_tool');
    }
    return { ...result, content: redactContent(result.content) };
  }

  /** Same visibility as GET /leaves: every member sees the firm's leave calendar. */
  private async listLeaves(user: AuthUser, a: Record<string, unknown>): Promise<ToolResult> {
    const from = new Date(String(a.from));
    const to = new Date(String(a.to));
    if (isNaN(from.getTime()) || isNaN(to.getTime()) || to < from || to.getTime() - from.getTime() > MAX_LEAVE_RANGE_DAYS * DAY_MS) {
      return bad('invalid_date_range');
    }
    const leaves = await this.prisma.leaveRequest.findMany({
      where: { firmId: user.firmId, status: { not: LeaveStatus.REJECTED }, startDate: { lte: to }, endDate: { gte: from } },
      select: { type: true, status: true, startDate: true, endDate: true, user: { select: { firstName: true, lastName: true } } },
      orderBy: { startDate: 'asc' }, take: 50,
    });
    return {
      content: { leaves: leaves.map((l) => ({
        name: `${l.user.firstName} ${l.user.lastName}`, type: l.type, status: l.status,
        startDate: l.startDate.toISOString().slice(0, 10), endDate: l.endDate.toISOString().slice(0, 10),
      })) },
      cards: [],
    };
  }

  private async searchSops(user: AuthUser, a: Record<string, unknown>): Promise<ToolResult> {
    const q = str(a.query);
    if (!q) return bad('query_required');
    const sops = await this.prisma.sop.findMany({
      where: { firmId: user.firmId, OR: [{ title: contains(q) }, { content: contains(q) }, { category: contains(q) }] },
      select: { title: true, category: true, content: true, updatedAt: true },
      orderBy: { updatedAt: 'desc' }, take: 5,
    });
    return {
      content: { sops: sops.map((s) => ({
        title: s.title, category: s.category, updatedAt: s.updatedAt.toISOString().slice(0, 10),
        content: s.content.length > SOP_CONTENT_CHARS ? `${s.content.slice(0, SOP_CONTENT_CHARS)}…` : s.content,
      })) },
      cards: [],
    };
  }

  /** Office managers see every member's licence (they renew them); everyone else only their own, like GET users/me/license. */
  private async lawyerLicenses(user: AuthUser, a: Record<string, unknown>): Promise<ToolResult> {
    const withinDays = typeof a.withinDays === 'number' && a.withinDays > 0 ? Math.min(a.withinDays, 730) : 90;
    const now = new Date();
    const users = await this.prisma.user.findMany({
      where: {
        firmMembers: { some: { firmId: user.firmId } },
        ...(hasFirmCapability(user.firmRole, 'runOperations') ? {} : { id: user.id }),
        // Up to 60 days past expiry: the late-renewal window of the Lawyers Act s.40.
        lawyerLicenseExpiresAt: { not: null, lte: new Date(now.getTime() + withinDays * DAY_MS), gte: new Date(now.getTime() - 60 * DAY_MS) },
      },
      select: { firstName: true, lastName: true, lawyerLicenseType: true, lawyerLicenseExpiresAt: true },
      orderBy: { lawyerLicenseExpiresAt: 'asc' }, take: 50,
    });
    return {
      content: { licences: users.map((u) => ({
        name: `${u.firstName} ${u.lastName}`, type: u.lawyerLicenseType,
        expiresAt: u.lawyerLicenseExpiresAt!.toISOString().slice(0, 10), daysToExpiry: daysToExpiry(u.lawyerLicenseExpiresAt!, now),
      })) },
      cards: [],
    };
  }

  private async receivables(user: AuthUser, a: Record<string, unknown>): Promise<ToolResult> {
    const minDays = typeof a.minDaysOverdue === 'number' ? a.minDaysOverdue : 0;
    const { buckets, rows } = await this.collections.getReceivables(user);
    const picked = rows.filter((r) => r.daysOverdue >= minDays).sort((x, y) => y.daysOverdue - x.daysOverdue);
    return {
      content: {
        buckets,
        totalOutstanding: Math.round(rows.reduce((s, r) => s + r.outstanding, 0) * 100) / 100,
        matching: picked.length,
        invoices: picked.slice(0, 20).map((r) => ({
          invoiceNumber: r.invoiceNumber, customerName: r.customerName, caseRef: r.caseRef, subject: r.subject,
          outstanding: r.outstanding, dueAt: r.dueAt?.slice(0, 10) ?? null, daysOverdue: r.daysOverdue,
          lastReminderAt: r.lastReminderAt?.slice(0, 10) ?? null, collectionOwner: r.collectionOwner, collectionNote: r.collectionNote,
        })),
      },
      cards: [],
    };
  }

  /** findUnique, not PettyCashService.getBalance: that upserts, and the secretary never writes. */
  private async pettyCashBalance(user: AuthUser): Promise<ToolResult> {
    const fund = await this.prisma.pettyCashFund.findUnique({ where: { firmId: user.firmId }, select: { balance: true, updatedAt: true } });
    return { content: fund ? { balance: fund.balance, updatedAt: fund.updatedAt.toISOString() } : { notSetUp: true }, cards: [] };
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
        // A converted intake is the same matter as its case — listing both makes the secretary ask "which one?".
        where: { AND: [intakeFilter, { case: null }, { OR: [{ title: contains(q) }, { clientName: contains(q) }] }] },
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

/** Record ids the model passes back to other tools — a uuid's hyphenated digits can look like a phone number to redactForAi. */
const ID_KEY = /^id$|Id$/;

/** Redact PII in every string value before it reaches the model, leaving record ids intact. */
function redactContent(content: unknown, key = ''): unknown {
  if (typeof content === 'string') return ID_KEY.test(key) ? content : redactForAi(content).text;
  if (Array.isArray(content)) return content.map((v) => redactContent(v));
  if (content && typeof content === 'object' && !(content instanceof Date)) {
    return Object.fromEntries(Object.entries(content).map(([k, v]) => [k, redactContent(v, k)]));
  }
  return content;
}

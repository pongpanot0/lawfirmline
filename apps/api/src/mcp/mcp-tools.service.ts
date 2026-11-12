import { BadRequestException, ForbiddenException, HttpException, Injectable, NotFoundException } from '@nestjs/common';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { AuthUser, EXPENSE_CATEGORIES, HEAVY_QUEUE_POINTS, MONEY_MAX, MONEY_MIN, mcpCaseScope, type McpNoticeDraft, hasFirmCapability, redactForAi, TaskStatus, subscriptionAllowsWrites, type TeamRadar } from '@lawfirm/shared';
import { DailyOperationsService } from '../operations/daily-operations.service';
import { bangkokDayKey } from '../common/utils/bangkok-time';
import { DateSuggestionSource, DateSuggestionStatus, EventType, LeaveStatus, LeaveType, TaskSource } from '../generated/prisma';
import { LeaveService } from '../leave/leave.service';
import { PrismaService } from '../prisma/prisma.module';
import { SecretaryToolsService } from '../secretary/secretary-tools.service';
import { CaseAccessService } from '../common/services/case-access.service';
import { TasksService } from '../tasks/tasks.service';
import { CaseCommentsService } from '../cases/case-comments.service';
import { BillingService } from '../billing/billing.service';
import { FirmLinkService } from '../notifications/firm-link.service';

const text = z.string().trim().min(1);
const title = text.max(200);
const note = text.max(5000);
const date = text.refine(validDay, 'ระบุวันที่จริงในรูปแบบ YYYY-MM-DD');
const readSchemas = {
  find_matters: { query: text },
  case_overview: { caseId: text.optional(), intakeId: text.optional() },
  search_documents: { query: text, caseId: text.optional() },
  read_document: { documentId: text, question: text },
  list_events: { from: date, to: date, caseId: text.optional(), mineOnly: z.boolean().optional() },
  list_leaves: { from: date, to: date },
  search_sops: { query: text },
  lawyer_licenses: { withinDays: z.number().optional() },
  receivables: { minDaysOverdue: z.number().optional() },
  petty_cash_balance: {},
  my_work: {},
};
const writeSchemas = {
  create_task: { caseId: text, title, description: note.optional(), dueDate: date.optional() },
  complete_task: { taskId: text },
  add_case_note: { caseId: text, text: note },
  log_time: { caseId: text, hours: z.number().min(0.1).max(24).multipleOf(0.01), description: text.max(500), date: date.optional(), billable: z.boolean().optional() },
  draft_expense: { amount: z.number().min(MONEY_MIN).max(MONEY_MAX).multipleOf(0.01), description: text.max(500), category: z.enum(EXPENSE_CATEGORIES).optional(), date: date.optional(), caseId: text.optional() },
  propose_court_date: { caseId: text, title, startAt: text.refine((v) => courtDate(v) !== null, 'ระบุวันเวลาจริงในรูปแบบ ISO'), courtName: title.optional(), note: note.optional() },
  request_leave: { type: z.nativeEnum(LeaveType), startDate: date, endDate: date },
  draft_notice: { caseId: text.optional(), intakeId: text.optional(), content: text.max(20000), recipient: title.optional(), deadline: date.optional() },
};
const descriptions: Record<keyof typeof writeSchemas, string> = {
  create_task: 'Create a task in your own case, assigned to you.',
  complete_task: 'Complete your assigned task in your own case. Tasks requiring review must be submitted in the app.',
  add_case_note: 'Add a case comment marked as AI-created, without mentions.',
  log_time: 'Log your time on your own case, using your default hourly rate.',
  propose_court_date: 'Propose a court date for a person to accept in the case page. Never creates a calendar event.',
  draft_expense: 'Write down an out-of-pocket cost (THB) as a DRAFT reimbursement for the caller, optionally on one of their cases. Never submits it: the person attaches the receipt and sends it for approval in the app.',
  request_leave: 'Submit a leave request for the caller only, dates inclusive (YYYY-MM-DD, Asia/Bangkok, from today, max 90 days). SICK = sick leave (recorded at once and the team is told), PERSONAL = personal business leave, VACATION = annual leave; PERSONAL/VACATION wait for approval. Confirm type and dates with the person before calling.',
  draft_notice: 'Save a demand notice (หนังสือทวงถาม/บอกกล่าว) you wrote as a DRAFT on one of the caller\'s matters — pass caseId for a pre-filing case, or intakeId for an intake not yet a case (ids from find_matters): the full letter in formal Thai, the recipient, and the reply deadline. Use only facts from case_overview and the documents; never invent facts. Replaces any earlier AI draft. Never issues it: the lawyer reviews, edits and issues it in the app.',
};

@Injectable()
export class McpToolsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly secretary: SecretaryToolsService,
    private readonly access: CaseAccessService,
    private readonly tasks: TasksService,
    private readonly comments: CaseCommentsService,
    private readonly billing: BillingService,
    private readonly links: FirmLinkService,
    private readonly operations: DailyOperationsService,
    private readonly leaves: LeaveService,
  ) {}

  createServer(user: AuthUser, connection: { id: string; clientName: string }): McpServer {
    const server = new McpServer({ name: 'samnuan', version: '1.0.0' });
    const origin = this.links.originForSlug(user.firmSlug);
    const result = (value: unknown) => ({ content: [{ type: 'text' as const, text: JSON.stringify(redactWithLinks(value, origin)) }] });
    const handle = async (run: () => Promise<unknown>) => {
      try { return result(await run()); }
      catch (e) {
        const message = e instanceof HttpException && /[ก-๙]/.test(e.message) ? e.message : 'ทำรายการไม่สำเร็จ กรุณาเปิดงานในแอปแล้วลองใหม่';
        return { ...result({ error: message }), isError: true };
      }
    };
    for (const definition of this.secretary.definitions(user)) {
      const name = definition.function.name as keyof typeof readSchemas;
      if (!(name in readSchemas)) continue;
      server.registerTool(name, { description: definition.function.description, inputSchema: readSchemas[name] }, (args: Record<string, unknown>) => handle(async () => {
        const output = await this.secretary.run(user, name, args, mcpScope(user));
        if (output.content && typeof output.content === 'object' && 'error' in output.content) {
          throw new NotFoundException('ไม่พบคดีนี้ในงานของคุณ');
        }
        return output;
      }));
    }
    // Team load is counts only (no case or task content) — the same numbers as the app's ทีม page, owners/office managers only.
    if (hasFirmCapability(user.firmRole, 'runOperations')) {
      server.registerTool('team_workload', {
        description: `Workload of every firm member for 7 days from a date (default today, Asia/Bangkok): open task points vs the ${HEAVY_QUEUE_POINTS}-point standard, overdue and review counts, and per-day task points, appointments, court dates and leave. Counts only — no case or task details. Use it for "who is free / overloaded".`,
        inputSchema: { from: date.optional() },
      }, (args: Record<string, unknown>) => handle(async () => teamWorkload(await this.operations.radar(user, (args.from as string | undefined) ?? bangkokDayKey(new Date())))));
    }
    for (const name of Object.keys(writeSchemas) as Array<keyof typeof writeSchemas>) {
      server.registerTool(name, { description: descriptions[name], inputSchema: writeSchemas[name] }, (args: Record<string, unknown>) => handle(async () => {
        if (user.subscriptionStatus && !subscriptionAllowsWrites(user.subscriptionStatus)) throw new ForbiddenException('แพ็กเกจสำนักงานไม่รองรับการบันทึก กรุณาติดต่อเจ้าของสำนักงาน');
        const a = args as Record<string, unknown>;
        let caseId = a.caseId as string;
        let entity: { id: string };
        const audit = (entityId: string) => this.audit(user, connection, name, caseId, entityId);
        if (name === 'complete_task') {
          const task = await this.prisma.task.findFirst({ where: { id: a.taskId as string, case: this.caseFilter(user) } });
          if (!task?.caseId) throw new NotFoundException('ไม่พบคดีนี้ในงานของคุณ');
          caseId = task.caseId;
          if (task.assigneeId !== user.id) throw new BadRequestException('ปิดได้เฉพาะงานที่มอบหมายให้คุณ');
          if (task.requiresReview) throw new BadRequestException('งานนี้ต้องส่งตรวจ กรุณากดส่งตรวจในแอป');
          entity = await this.tasks.update(task.id, { status: TaskStatus.DONE }, user, caseId, true, audit);
        } else if (name === 'draft_expense') {
          // No case = an office cost (e.g. travel); with a case it must be one this person may see.
          if (caseId) await this.assertOwnCase(user, caseId);
          entity = await this.billing.createAiExpenseDraft(user, { caseId: caseId ?? null, amount: a.amount as number, description: a.description as string,
            category: a.category as string | undefined, date: a.date as string | undefined }, audit);
        } else if (name === 'request_leave') {
          // Always the caller's own leave; same rules, approvals and notices as the app and LINE.
          const { id, type, status, startDate, endDate } = await this.leaves.create(user, { type: a.type as LeaveType, startDate: a.startDate as string, endDate: a.endDate as string }, audit);
          return { id, type, status, startDate, endDate, leavesUrl: `${origin}/leaves`,
            message: status === LeaveStatus.PENDING ? 'ส่งคำขอลาแล้ว รอผู้มีสิทธิ์อนุมัติ' : 'บันทึกการลาแล้ว' };
        } else if (name === 'draft_notice') {
          // Notice data lives on the intake; a pre-filing case issues it through its 1:1 intake.
          let intake: { id: string } | null = null;
          if (caseId) {
            const legalCase = await this.prisma.case.findFirst({ where: { AND: [this.caseFilter(user), { id: caseId }] }, select: { intake: { select: { id: true } } } });
            if (!legalCase) throw new NotFoundException('ไม่พบคดีนี้ในงานของคุณ');
            if (!legalCase.intake) throw new BadRequestException('คดีนี้ไม่มีเรื่องรับที่ใช้ออกหนังสือทวงถาม');
            intake = legalCase.intake;
          } else if (a.intakeId) {
            const filter = mcpScope(user) === 'app' ? await this.access.getIntakeFilterForUser(user) : this.access.getOwnIntakeFilterForUser(user);
            intake = await this.prisma.intake.findFirst({ where: { AND: [filter, { id: a.intakeId as string }] }, select: { id: true } });
            if (!intake) throw new NotFoundException('ไม่พบเรื่องนี้ในงานของคุณ');
          } else throw new BadRequestException('ระบุ caseId หรือ intakeId');
          const draft: McpNoticeDraft = { content: a.content as string, recipient: (a.recipient as string | undefined) ?? null, deadline: (a.deadline as string | undefined) ?? null,
            draftedAt: new Date().toISOString(), draftedById: user.id, clientName: connection.clientName };
          await this.prisma.$transaction(async (tx) => {
            await tx.intake.update({ where: { id: intake.id }, data: { noticeDraft: { ...draft } } });
            await tx.auditLog.create({ data: this.audit(user, connection, name, caseId, intake!.id) });
          });
          return { intakeId: intake.id, caseId, recipient: draft.recipient, deadline: draft.deadline, ...(caseId ? {} : { intakeUrl: `${origin}/intake/${encodeURIComponent(intake.id)}` }),
            message: 'บันทึกร่างหนังสือทวงถามแล้ว ทนายต้องตรวจแก้และกดออกหนังสือในแอป' };
        } else {
          await this.assertOwnCase(user, caseId);
          if (name === 'create_task') entity = await this.tasks.create(user, caseId, { title: a.title as string, description: a.description as string | undefined, dueDate: a.dueDate as string | undefined, assigneeId: user.id }, TaskSource.MCP, undefined, 0, undefined, audit);
          else if (name === 'add_case_note') entity = await this.comments.createComment(user, caseId, a.text as string, [], { viaAi: true, audit });
          else if (name === 'log_time') entity = await this.billing.createTimeEntry(user, caseId, { hours: a.hours as number, description: a.description as string, date: a.date as string | undefined, billable: a.billable as boolean | undefined }, { viaAi: true, audit });
          else entity = await this.prisma.$transaction(async (tx) => {
            const suggestion = await tx.documentDateSuggestion.create({ data: {
              caseId, label: a.title as string, suggestedDate: courtDate(a.startAt as string)!,
              // No court/note columns: keep both in the suggestion's displayed excerpt.
              sourceExcerpt: [a.courtName ? `ศาล: ${a.courtName}` : '', a.note].filter(Boolean).join('\n') || null,
              eventType: EventType.COURT_DATE, source: DateSuggestionSource.MCP, status: DateSuggestionStatus.PENDING, createdById: user.id,
            } });
            await tx.auditLog.create({ data: this.audit(user, connection, name, caseId, suggestion.id) });
            return suggestion;
          });
        }
        return { ...entity, caseId, ...(name === 'complete_task' || name === 'create_task' ? { kind: 'TASK' } : {}), ...(name === 'propose_court_date' ? { message: 'เสนอวันนัดแล้ว รอผู้ใช้ยอมรับในหน้าคดี' } : {}),
          ...(name === 'draft_expense' ? { message: 'บันทึกเป็นร่างเบิกแล้ว แนบใบเสร็จและกดส่งเบิกในแอป', expensesUrl: `${origin}/expenses` } : {}) };
      }));
    }
    return server;
  }

  private async assertOwnCase(user: AuthUser, caseId: string) {
    const legalCase = await this.prisma.case.findFirst({ where: { AND: [this.caseFilter(user), { id: caseId }] }, select: { id: true } });
    if (!legalCase) throw new NotFoundException('ไม่พบคดีนี้ในงานของคุณ');
  }

  private caseFilter(user: AuthUser) {
    return mcpScope(user) === 'app' ? this.access.getCaseFilterForUser(user) : this.access.getOwnCaseFilterForUser(user);
  }

  private audit(user: AuthUser, connection: { id: string; clientName: string }, tool: string, caseId: string | undefined, entityId: string) {
    return { firmId: user.firmId, userId: user.id, action: `mcp.${tool}`, metadata: { connectionId: connection.id, clientName: connection.clientName, tool, caseId, entityId } };
  }
}

const mcpScope = (user: AuthUser) => mcpCaseScope(user.firmRole);

/** Same status rule as the web TeamRadar card, spelled out so the model doesn't have to infer it. */
export function teamWorkload(radar: TeamRadar) {
  return {
    from: radar.start, standardPoints: HEAVY_QUEUE_POINTS,
    members: radar.members.map(({ userId: _id, days, ...m }) => {
      const leaveDays = days.filter((d) => d.onLeave).map((d) => d.date);
      const status = m.openPoints > HEAVY_QUEUE_POINTS ? 'over_standard'
        : m.openPoints >= HEAVY_QUEUE_POINTS * 0.8 ? 'near_standard'
          : leaveDays.length ? 'on_leave_this_week' : 'free';
      return { ...m, status, loadPercent: Math.round((m.openPoints / HEAVY_QUEUE_POINTS) * 100), leaveDays,
        days: days.map(({ onLeave: _l, ...d }) => d) };
    }),
  };
}

function validDay(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
}
function courtDate(value: string): Date | null {
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})?$/.exec(value);
  if (!match || !validDay(match[1]) || +match[2] > 23 || +match[3] > 59 || +(match[4] ?? 0) > 59) return null;
  if (match[5] && match[5] !== 'Z' && (+match[5].slice(1, 3) > 23 || +match[5].slice(4) > 59)) return null;
  const parsed = new Date(match[5] ? value : `${value}+07:00`);
  return isNaN(parsed.getTime()) ? null : parsed;
}
function redactWithLinks(value: unknown, origin: string, key = '', parentCaseId?: string): unknown {
  if (typeof value === 'string') return /^id$|Id$|^url$/.test(key) ? value : redactForAi(value).text;
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map((v) => redactWithLinks(v, origin, key, parentCaseId));
  if (!value || typeof value !== 'object') return value;
  const row = value as Record<string, unknown>;
  const isTask = row.kind === 'TASK' || key === 'openTasks';
  const caseId = row.caseId ?? ((row.kind === 'case' || row.type === 'case') ? row.id : isTask ? parentCaseId : undefined);
  const url = typeof caseId === 'string' ? `${origin}/cases/${encodeURIComponent(caseId)}${isTask && typeof row.id === 'string' ? `?task=${encodeURIComponent(row.id)}` : ''}` : undefined;
  return { ...Object.fromEntries(Object.entries(row).map(([k, v]) => [k, redactWithLinks(v, origin, k, typeof caseId === 'string' ? caseId : parentCaseId)])), ...(url ? { url } : {}) };
}

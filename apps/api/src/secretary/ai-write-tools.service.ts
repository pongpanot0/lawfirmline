import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { z } from 'zod';
import { AuthUser, EXPENSE_CATEGORIES, MONEY_MAX, MONEY_MIN, mcpCaseScope, type McpNoticeDraft, TaskStatus, subscriptionAllowsWrites } from '@lawfirm/shared';
import { DateSuggestionSource, DateSuggestionStatus, EventType, LeaveStatus, LeaveType, TaskSource } from '../generated/prisma';
import { LeaveService } from '../leave/leave.service';
import { PrismaService } from '../prisma/prisma.module';
import { CaseAccessService } from '../common/services/case-access.service';
import { TasksService } from '../tasks/tasks.service';
import { CaseCommentsService } from '../cases/case-comments.service';
import { BillingService } from '../billing/billing.service';
import { FirmLinkService } from '../notifications/firm-link.service';
import type { OpenAiToolDef } from './secretary-tools.service';

export const text = z.string().trim().min(1);
const title = text.max(200);
const note = text.max(5000);
export const date = text.refine(validDay, 'ระบุวันที่จริงในรูปแบบ YYYY-MM-DD');

/**
 * The writes an AI may make for a person — the MCP tools and the LINE secretary share these, so the
 * same scope, marking (viaAi / TaskSource.MCP = "made by AI") and audit apply wherever the AI runs.
 */
export const AI_WRITE_SCHEMAS = {
  create_task: { caseId: text.optional(), title, description: note.optional(), dueDate: date.optional() },
  complete_task: { taskId: text },
  add_case_note: { caseId: text, text: note },
  log_time: { caseId: text, hours: z.number().min(0.1).max(24).multipleOf(0.01), description: text.max(500), date: date.optional(), billable: z.boolean().optional() },
  draft_expense: { amount: z.number().min(MONEY_MIN).max(MONEY_MAX).multipleOf(0.01), description: text.max(500), category: z.enum(EXPENSE_CATEGORIES).optional(), date: date.optional(), caseId: text.optional() },
  propose_court_date: { caseId: text, title, startAt: text.refine((v) => courtDate(v) !== null, 'ระบุวันเวลาจริงในรูปแบบ ISO'), courtName: title.optional(), note: note.optional() },
  request_leave: { type: z.nativeEnum(LeaveType), startDate: date, endDate: date },
  draft_notice: { caseId: text.optional(), intakeId: text.optional(), content: text.max(20000), recipient: title.optional(), deadline: date.optional() },
};
export type AiWriteTool = keyof typeof AI_WRITE_SCHEMAS;
export const AI_WRITE_TOOLS = Object.keys(AI_WRITE_SCHEMAS) as AiWriteTool[];

export const AI_WRITE_DESCRIPTIONS: Record<AiWriteTool, string> = {
  create_task: 'Create a task assigned to you. Pass caseId only when the work belongs to one of your cases; leave it out for a personal to-do (a meeting, office work) — never ask the user for a case just to create a task.',
  complete_task: 'Complete a task assigned to you (on your own case or a personal to-do). Tasks requiring review must be submitted in the app.',
  add_case_note: 'Add a case comment marked as AI-created, without mentions.',
  log_time: 'Log your time on your own case, using your default hourly rate.',
  propose_court_date: 'Propose a court date for a person to accept in the case page. Never creates a calendar event.',
  draft_expense: 'Write down an out-of-pocket cost (THB) as a DRAFT reimbursement for the caller, optionally on one of their cases. Never submits it: the person attaches the receipt and sends it for approval in the app.',
  request_leave: 'Submit a leave request for the caller only, dates inclusive (YYYY-MM-DD, Asia/Bangkok, from today, max 90 days). SICK = sick leave (recorded at once; the team sees the name only, in the day-of notice), PERSONAL = personal business leave, VACATION = annual leave; PERSONAL/VACATION wait for approval. Confirm type and dates with the person before calling.',
  draft_notice: 'Save a demand notice (หนังสือทวงถาม/บอกกล่าว) you wrote as a DRAFT on one of the caller\'s matters — pass caseId for a pre-filing case, or intakeId for an intake not yet a case (ids from find_matters): the full letter in formal Thai, the recipient, and the reply deadline. Use only facts from case_overview and the documents; never invent facts. Replaces any earlier AI draft. Never issues it: the lawyer reviews, edits and issues it in the app.',
};

/** Where the AI ran: the audit action prefix and what identifies the channel in the audit row. */
export interface AiWriteVia {
  auditPrefix: 'mcp' | 'line_ai';
  auditMetadata: Record<string, unknown>;
  /** Shown on a notice draft as the app that wrote it. */
  clientName: string;
}

/** A write the AI wants to make, checked against the person's scope but not yet saved. */
export interface AiWriteProposal {
  tool: AiWriteTool;
  args: Record<string, unknown>;
  /** Human names for the ids, for the confirm message. */
  labels: { case?: string; task?: string; intake?: string };
}

/** OpenAI function definitions for the given write tools, from the same schemas the MCP server validates with. */
export function aiWriteDefinitions(tools: AiWriteTool[]): OpenAiToolDef[] {
  return tools.map((name) => {
    const { $schema: _s, ...parameters } = z.toJSONSchema(z.object(AI_WRITE_SCHEMAS[name])) as Record<string, unknown>;
    return { type: 'function', function: { name, description: AI_WRITE_DESCRIPTIONS[name], parameters } };
  });
}

export const isAiWriteTool = (name: string): name is AiWriteTool => name in AI_WRITE_SCHEMAS;

@Injectable()
export class AiWriteToolsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: CaseAccessService,
    private readonly tasks: TasksService,
    private readonly comments: CaseCommentsService,
    private readonly billing: BillingService,
    private readonly links: FirmLinkService,
    private readonly leaves: LeaveService,
  ) {}

  /**
   * Validates a write the AI asked for and checks it against the person's own work, without saving.
   * Throws the same Thai refusals as run(), so the AI can explain them before anyone is asked to confirm.
   */
  async check(user: AuthUser, name: AiWriteTool, raw: unknown): Promise<AiWriteProposal> {
    const parsed = z.object(AI_WRITE_SCHEMAS[name]).safeParse(raw ?? {});
    if (!parsed.success) throw new BadRequestException(`ข้อมูลไม่ครบหรือไม่ถูกต้อง: ${parsed.error.issues.map((i) => `${i.path.join('.')} ${i.message}`).join('; ')}`);
    this.assertWritable(user);
    const args = parsed.data as Record<string, unknown>;
    const labels: AiWriteProposal['labels'] = {};
    let caseId = args.caseId as string | undefined;
    if (name === 'complete_task') {
      const task = await this.ownTask(user, args.taskId as string);
      labels.task = task.title;
      caseId = task.caseId ?? undefined;
    } else if (name === 'draft_notice') {
      const intake = await this.noticeIntake(user, caseId, args.intakeId as string | undefined);
      if (!caseId) {
        const row = await this.prisma.intake.findUnique({ where: { id: intake.id }, select: { title: true, clientName: true } });
        labels.intake = row?.title ?? row?.clientName ?? undefined;
      }
    } else if (caseId) {
      await this.assertOwnCase(user, caseId);
    }
    if (caseId) {
      const legalCase = await this.prisma.case.findFirst({ where: { AND: [this.caseFilter(user), { id: caseId }] }, select: { ownRef: true, title: true } });
      if (legalCase) labels.case = `${legalCase.ownRef} · ${legalCase.title}`;
    }
    return { tool: name, args, labels };
  }

  /** Saves one AI write for the person, re-checking their scope at the moment of saving. */
  async run(user: AuthUser, name: AiWriteTool, a: Record<string, unknown>, via: AiWriteVia): Promise<Record<string, unknown>> {
    this.assertWritable(user);
    const origin = this.links.originForSlug(user.firmSlug);
    let caseId = a.caseId as string;
    let entity: { id: string };
    const audit = (entityId: string) => this.audit(user, via, name, caseId, entityId);
    if (name === 'complete_task') {
      const task = await this.ownTask(user, a.taskId as string);
      caseId = task.caseId as string; // null for a personal to-do: update() then skips the case binding
      entity = await this.tasks.update(task.id, { status: TaskStatus.DONE }, user, caseId, true, audit);
    } else if (name === 'draft_expense') {
      // No case = an office cost (e.g. travel); with a case it must be one this person may see.
      if (caseId) await this.assertOwnCase(user, caseId);
      entity = await this.billing.createAiExpenseDraft(user, { caseId: caseId ?? null, amount: a.amount as number, description: a.description as string,
        category: a.category as string | undefined, date: a.date as string | undefined }, audit);
    } else if (name === 'create_task') {
      // No case = a personal to-do (e.g. a meeting); with a case it must be one this person may see.
      if (caseId) await this.assertOwnCase(user, caseId);
      entity = await this.tasks.create(user, caseId ?? null, { title: a.title as string, description: a.description as string | undefined, dueDate: a.dueDate as string | undefined, assigneeId: user.id }, TaskSource.MCP, undefined, 0, undefined, audit);
    } else if (name === 'request_leave') {
      // Always the caller's own leave; same rules, approvals and notices as the app and LINE.
      const { id, type, status, startDate, endDate } = await this.leaves.create(user, { type: a.type as LeaveType, startDate: a.startDate as string, endDate: a.endDate as string }, audit);
      return { id, type, status, startDate, endDate, leavesUrl: `${origin}/leaves`,
        message: status === LeaveStatus.PENDING ? 'ส่งคำขอลาแล้ว รอผู้มีสิทธิ์อนุมัติ' : 'บันทึกการลาแล้ว' };
    } else if (name === 'draft_notice') {
      const intake = await this.noticeIntake(user, caseId, a.intakeId as string | undefined);
      const draft: McpNoticeDraft = { content: a.content as string, recipient: (a.recipient as string | undefined) ?? null, deadline: (a.deadline as string | undefined) ?? null,
        draftedAt: new Date().toISOString(), draftedById: user.id, clientName: via.clientName };
      await this.prisma.$transaction(async (tx) => {
        await tx.intake.update({ where: { id: intake.id }, data: { noticeDraft: { ...draft } } });
        await tx.auditLog.create({ data: this.audit(user, via, name, caseId, intake.id) });
      });
      return { intakeId: intake.id, caseId, recipient: draft.recipient, deadline: draft.deadline, ...(caseId ? {} : { intakeUrl: `${origin}/intake/${encodeURIComponent(intake.id)}` }),
        message: 'บันทึกร่างหนังสือทวงถามแล้ว ทนายต้องตรวจแก้และกดออกหนังสือในแอป' };
    } else {
      await this.assertOwnCase(user, caseId);
      if (name === 'add_case_note') entity = await this.comments.createComment(user, caseId, a.text as string, [], { viaAi: true, audit });
      else if (name === 'log_time') entity = await this.billing.createTimeEntry(user, caseId, { hours: a.hours as number, description: a.description as string, date: a.date as string | undefined, billable: a.billable as boolean | undefined }, { viaAi: true, audit });
      else entity = await this.prisma.$transaction(async (tx) => {
        const suggestion = await tx.documentDateSuggestion.create({ data: {
          caseId, label: a.title as string, suggestedDate: courtDate(a.startAt as string)!,
          // No court/note columns: keep both in the suggestion's displayed excerpt.
          sourceExcerpt: [a.courtName ? `ศาล: ${a.courtName}` : '', a.note].filter(Boolean).join('\n') || null,
          eventType: EventType.COURT_DATE, source: DateSuggestionSource.MCP, status: DateSuggestionStatus.PENDING, createdById: user.id,
        } });
        await tx.auditLog.create({ data: this.audit(user, via, name, caseId, suggestion.id) });
        return suggestion;
      });
    }
    return { ...entity, caseId: caseId ?? null, ...(name === 'complete_task' || name === 'create_task' ? { kind: 'TASK' } : {}), ...(name === 'propose_court_date' ? { message: 'เสนอวันนัดแล้ว รอผู้ใช้ยอมรับในหน้าคดี' } : {}),
      ...(name === 'draft_expense' ? { message: 'บันทึกเป็นร่างเบิกแล้ว แนบใบเสร็จและกดส่งเบิกในแอป', expensesUrl: `${origin}/expenses` } : {}) };
  }

  private assertWritable(user: AuthUser) {
    if (user.subscriptionStatus && !subscriptionAllowsWrites(user.subscriptionStatus)) throw new ForbiddenException('แพ็กเกจสำนักงานไม่รองรับการบันทึก กรุณาติดต่อเจ้าของสำนักงาน');
  }

  /** A task the person may close: assigned to them, on their own case or a personal to-do, not waiting on review. */
  private async ownTask(user: AuthUser, taskId: string) {
    const task = await this.prisma.task.findFirst({ where: { id: taskId, OR: [{ case: this.caseFilter(user) }, { caseId: null, assigneeId: user.id, firmId: user.firmId }] } });
    if (!task) throw new NotFoundException('ไม่พบงานนี้ในงานของคุณ');
    if (task.assigneeId !== user.id) throw new BadRequestException('ปิดได้เฉพาะงานที่มอบหมายให้คุณ');
    if (task.requiresReview) throw new BadRequestException('งานนี้ต้องส่งตรวจ กรุณากดส่งตรวจในแอป');
    return task;
  }

  /** Notice data lives on the intake; a pre-filing case issues it through its 1:1 intake. */
  private async noticeIntake(user: AuthUser, caseId: string | undefined, intakeId: string | undefined): Promise<{ id: string }> {
    if (caseId) {
      const legalCase = await this.prisma.case.findFirst({ where: { AND: [this.caseFilter(user), { id: caseId }] }, select: { intake: { select: { id: true } } } });
      if (!legalCase) throw new NotFoundException('ไม่พบคดีนี้ในงานของคุณ');
      if (!legalCase.intake) throw new BadRequestException('คดีนี้ไม่มีเรื่องรับที่ใช้ออกหนังสือทวงถาม');
      return legalCase.intake;
    }
    if (!intakeId) throw new BadRequestException('ระบุ caseId หรือ intakeId');
    const filter = mcpCaseScope(user.firmRole) === 'app' ? await this.access.getIntakeFilterForUser(user) : this.access.getOwnIntakeFilterForUser(user);
    const intake = await this.prisma.intake.findFirst({ where: { AND: [filter, { id: intakeId }] }, select: { id: true } });
    if (!intake) throw new NotFoundException('ไม่พบเรื่องนี้ในงานของคุณ');
    return intake;
  }

  private async assertOwnCase(user: AuthUser, caseId: string) {
    const legalCase = await this.prisma.case.findFirst({ where: { AND: [this.caseFilter(user), { id: caseId }] }, select: { id: true } });
    if (!legalCase) throw new NotFoundException('ไม่พบคดีนี้ในงานของคุณ');
  }

  private caseFilter(user: AuthUser) {
    return mcpCaseScope(user.firmRole) === 'app' ? this.access.getCaseFilterForUser(user) : this.access.getOwnCaseFilterForUser(user);
  }

  private audit(user: AuthUser, via: AiWriteVia, tool: string, caseId: string | undefined, entityId: string) {
    return { firmId: user.firmId, userId: user.id, action: `${via.auditPrefix}.${tool}`, metadata: { ...via.auditMetadata, tool, caseId, entityId } };
  }
}

export function validDay(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
}
export function courtDate(value: string): Date | null {
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})?$/.exec(value);
  if (!match || !validDay(match[1]) || +match[2] > 23 || +match[3] > 59 || +(match[4] ?? 0) > 59) return null;
  if (match[5] && match[5] !== 'Z' && (+match[5].slice(1, 3) > 23 || +match[5].slice(4) > 59)) return null;
  const parsed = new Date(match[5] ? value : `${value}+07:00`);
  return isNaN(parsed.getTime()) ? null : parsed;
}

const thaiDay = (day: string) => new Date(`${day}T00:00:00+07:00`).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Bangkok' });
const thaiDateTime = (at: Date) => at.toLocaleString('th-TH', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Bangkok' });
const clipText = (value: string, max: number) => (value.length > max ? `${value.slice(0, max - 1)}…` : value);

/** What an AI write will do, in the words the person confirms — one heading and one line per field. */
export function describeAiWrite({ tool, args: a, labels }: AiWriteProposal): string {
  const caseLine = `คดี: ${labels.case ?? 'ไม่ผูกคดี'}`;
  const rows: Record<AiWriteTool, () => Array<string | false>> = {
    create_task: () => ['📝 สร้างงาน', `ชื่องาน: ${a.title}`, caseLine, `กำหนดส่ง: ${a.dueDate ? thaiDay(a.dueDate as string) : 'ไม่ระบุ'}`, !!a.description && `รายละเอียด: ${clipText(a.description as string, 300)}`],
    complete_task: () => ['✅ ปิดงาน', `งาน: ${labels.task}`, caseLine],
    add_case_note: () => ['💬 เพิ่มบันทึกในคดี', caseLine, `ข้อความ: ${clipText(a.text as string, 500)}`],
    log_time: () => ['⏱️ ลงเวลาทำงาน', caseLine, `จำนวน: ${a.hours} ชม.`, `รายละเอียด: ${a.description}`, `วันที่: ${thaiDay((a.date as string | undefined) ?? new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' }).format(new Date()))}`, `คิดค่าบริการ: ${a.billable === false ? 'ไม่คิด' : 'ตามค่าเริ่มต้น'}`],
    propose_court_date: () => ['⚖️ เสนอวันนัดศาล', caseLine, `นัด: ${a.title}`, `วันเวลา: ${thaiDateTime(courtDate(a.startAt as string)!)}`, !!a.courtName && `ศาล: ${a.courtName}`, 'ยังไม่ลงปฏิทิน: ต้องกดยอมรับในหน้าคดีอีกครั้ง'],
    draft_expense: () => ['💸 ร่างเบิกค่าใช้จ่าย', `จำนวน: ${(a.amount as number).toLocaleString('th-TH')} บาท`, `รายการ: ${a.description}`, !!a.category && `หมวด: ${a.category}`, caseLine, 'บันทึกเป็นร่าง: แนบใบเสร็จและกดส่งเบิกในแอป'],
    request_leave: () => ['🌴 ยื่นลา', `ประเภท: ${({ SICK: 'ลาป่วย', PERSONAL: 'ลากิจ', VACATION: 'พักร้อน' } as Record<string, string>)[a.type as string] ?? a.type}`, `วันที่: ${thaiDay(a.startDate as string)} – ${thaiDay(a.endDate as string)}`],
    draft_notice: () => ['📄 ร่างหนังสือทวงถาม', a.caseId ? caseLine : `เรื่องรับ: ${labels.intake ?? 'ไม่มีชื่อเรื่อง'}`, `ถึง: ${a.recipient ?? 'ไม่ระบุ'}`, `กำหนดตอบ: ${a.deadline ? thaiDay(a.deadline as string) : 'ไม่ระบุ'}`, `เนื้อหา: ${clipText(a.content as string, 300)}`, 'บันทึกเป็นร่าง: ทนายตรวจแก้และกดออกหนังสือในแอป'],
  };
  return ['ตรวจสอบก่อนบันทึกครับ', '', ...rows[tool]().filter((r): r is string => !!r), '', 'กด "ยืนยัน" เพื่อบันทึก หรือ "ยกเลิก"'].join('\n');
}

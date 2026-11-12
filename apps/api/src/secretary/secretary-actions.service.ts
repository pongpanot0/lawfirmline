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

const text = z.string().trim().min(1);
const title = text.max(200);
const note = text.max(5000);
export const isoDay = text.refine(validDay, 'ระบุวันที่จริงในรูปแบบ YYYY-MM-DD');

export const ACTION_SCHEMAS = {
  create_task: { caseId: text.optional(), title, description: note.optional(), dueDate: isoDay.optional() },
  complete_task: { taskId: text },
  add_case_note: { caseId: text, text: note },
  log_time: { caseId: text, hours: z.number().min(0.1).max(24).multipleOf(0.01), description: text.max(500), date: isoDay.optional(), billable: z.boolean().optional() },
  draft_expense: { amount: z.number().min(MONEY_MIN).max(MONEY_MAX).multipleOf(0.01), description: text.max(500), category: z.enum(EXPENSE_CATEGORIES).optional(), date: isoDay.optional(), caseId: text.optional() },
  propose_court_date: { caseId: text, title, startAt: text.refine((v) => courtDate(v) !== null, 'ระบุวันเวลาจริงในรูปแบบ ISO'), courtName: title.optional(), note: note.optional() },
  request_leave: { type: z.nativeEnum(LeaveType), startDate: isoDay, endDate: isoDay },
  draft_notice: { caseId: text.optional(), intakeId: text.optional(), content: text.max(20000), recipient: title.optional(), deadline: isoDay.optional() },
};
export type ActionName = keyof typeof ACTION_SCHEMAS;
export const ACTION_DESCRIPTIONS: Record<ActionName, string> = {
  create_task: 'Create a task assigned to you. Pass caseId only when the work belongs to one of your cases; leave it out for a personal to-do (a meeting, office work) — never ask the user for a case just to create a task.',
  complete_task: 'Complete a task assigned to you (on your own case or a personal to-do). Tasks requiring review must be submitted in the app.',
  add_case_note: 'Add a case comment marked as AI-created, without mentions.',
  log_time: 'Log your time on your own case, using your default hourly rate.',
  propose_court_date: 'Propose a court date for a person to accept in the case page. Never creates a calendar event.',
  draft_expense: 'Write down an out-of-pocket cost (THB) as a DRAFT reimbursement for the caller, optionally on one of their cases. Never submits it: the person attaches the receipt and sends it for approval in the app.',
  request_leave: 'Submit a leave request for the caller only, dates inclusive (YYYY-MM-DD, Asia/Bangkok, from today, max 90 days). SICK = sick leave (recorded at once and the team is told), PERSONAL = personal business leave, VACATION = annual leave; PERSONAL/VACATION wait for approval. Confirm type and dates with the person before calling.',
  draft_notice: 'Save a demand notice (หนังสือทวงถาม/บอกกล่าว) you wrote as a DRAFT on one of the caller\'s matters — pass caseId for a pre-filing case, or intakeId for an intake not yet a case (ids from find_matters): the full letter in formal Thai, the recipient, and the reply deadline. Use only facts from case_overview and the documents; never invent facts. Replaces any earlier AI draft. Never issues it: the lawyer reviews, edits and issues it in the app.',
};
export const isAction = (name: string): name is ActionName => name in ACTION_SCHEMAS;

/** Who asked: an external MCP client, or the in-house AI on LINE. Decides the audit action and task source. */
export interface ActionChannel { kind: 'mcp' | 'line_ai'; id: string; clientName: string }

const LEAVE_LABEL: Record<LeaveType, string> = { SICK: 'ลาป่วย', PERSONAL: 'ลากิจ', VACATION: 'พักร้อน' };
const PREVIEW_TEXT_MAX = 300;

/**
 * The AI's write actions, shared by the MCP server and the LINE assistant. Each one acts as the
 * caller only, inside their own case scope, through the same services and audit as the app.
 */
@Injectable()
export class SecretaryActionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: CaseAccessService,
    private readonly tasks: TasksService,
    private readonly comments: CaseCommentsService,
    private readonly billing: BillingService,
    private readonly links: FirmLinkService,
    private readonly leaves: LeaveService,
  ) {}

  /** For the OpenAI chat loop; MCP registers the zod shapes directly. */
  definitions(): OpenAiToolDef[] {
    return (Object.keys(ACTION_SCHEMAS) as ActionName[]).map((name) => {
      const { $schema: _s, ...parameters } = z.toJSONSchema(z.object(ACTION_SCHEMAS[name]).strict()) as Record<string, unknown>;
      return { type: 'function', function: { name, description: ACTION_DESCRIPTIONS[name], parameters } };
    });
  }

  /**
   * What the action would save, in Thai, for the person to confirm — built from the arguments,
   * never from the model's wording. Throws (a Thai message) when the action could not run.
   */
  async preview(user: AuthUser, name: ActionName, raw: unknown): Promise<{ args: Record<string, unknown>; text: string }> {
    this.assertCanWrite(user);
    const args = this.parse(name, raw);
    const lines: Array<string | null> = [];
    const field = (label: string, value: unknown) => (value === undefined || value === null || value === '' ? null : `${label}: ${value}`);
    const matter = async () => (args.caseId ? `${await this.caseLabel(user, args.caseId as string)}` : null);
    switch (name) {
      case 'create_task':
        lines.push('📝 สร้างงาน', field('ชื่องาน', args.title), field('คดี', (await matter()) ?? 'งานส่วนตัว (ไม่ผูกคดี)'),
          field('กำหนดส่ง', day(args.dueDate)), field('รายละเอียด', clip(args.description)));
        break;
      case 'complete_task': {
        const task = await this.ownTask(user, args.taskId as string);
        lines.push('✅ ปิดงานว่าเสร็จ', field('งาน', task.title));
        break;
      }
      case 'add_case_note':
        lines.push('💬 เพิ่มบันทึกในคดี', field('คดี', await matter()), field('ข้อความ', clip(args.text)));
        break;
      case 'log_time':
        lines.push('⏱️ ลงเวลาทำงาน', field('คดี', await matter()), field('ชั่วโมง', args.hours), field('รายละเอียด', args.description),
          field('วันที่', day(args.date) ?? 'วันนี้'), field('คิดเงินลูกความ', args.billable === false ? 'ไม่' : 'ใช่'));
        break;
      case 'draft_expense':
        lines.push('💸 ร่างใบเบิกค่าใช้จ่าย (ยังไม่ส่งเบิก)', field('จำนวน', `${Number(args.amount).toLocaleString('th-TH')} บาท`),
          field('รายละเอียด', args.description), field('หมวด', args.category), field('วันที่', day(args.date) ?? 'วันนี้'), field('คดี', await matter()));
        break;
      case 'propose_court_date':
        lines.push('⚖️ เสนอวันนัดศาล (รอคนยอมรับในหน้าคดี)', field('คดี', await matter()), field('หัวข้อ', args.title),
          field('วันเวลา', courtDate(args.startAt as string)!.toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Bangkok' })),
          field('ศาล', args.courtName), field('หมายเหตุ', clip(args.note)));
        break;
      case 'request_leave':
        lines.push('🏖️ ยื่นลา', field('ประเภท', LEAVE_LABEL[args.type as LeaveType]), field('วันที่', `${day(args.startDate)} ถึง ${day(args.endDate)}`));
        break;
      case 'draft_notice':
        if (!args.caseId && !args.intakeId) throw new BadRequestException('ระบุ caseId หรือ intakeId');
        lines.push('📄 ร่างหนังสือทวงถาม (ยังไม่ออกหนังสือ)', field('คดี', await matter()), field('ผู้รับ', args.recipient),
          field('กำหนดตอบ', day(args.deadline)), field('เนื้อหา', clip(args.content)));
        break;
    }
    return { args, text: lines.filter(Boolean).join('\n') };
  }

  async run(user: AuthUser, channel: ActionChannel, name: ActionName, raw: unknown): Promise<Record<string, unknown>> {
    this.assertCanWrite(user);
    const a = this.parse(name, raw);
    const origin = this.links.originForSlug(user.firmSlug);
    let caseId = a.caseId as string;
    let entity: { id: string };
    const audit = (entityId: string) => this.audit(user, channel, name, caseId, entityId);
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
      entity = await this.tasks.create(user, caseId ?? null, { title: a.title as string, description: a.description as string | undefined, dueDate: a.dueDate as string | undefined, assigneeId: user.id },
        channel.kind === 'line_ai' ? TaskSource.LINE : TaskSource.MCP, undefined, 0, undefined, audit);
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
        const filter = mcpCaseScope(user.firmRole) === 'app' ? await this.access.getIntakeFilterForUser(user) : this.access.getOwnIntakeFilterForUser(user);
        intake = await this.prisma.intake.findFirst({ where: { AND: [filter, { id: a.intakeId as string }] }, select: { id: true } });
        if (!intake) throw new NotFoundException('ไม่พบเรื่องนี้ในงานของคุณ');
      } else throw new BadRequestException('ระบุ caseId หรือ intakeId');
      const draft: McpNoticeDraft = { content: a.content as string, recipient: (a.recipient as string | undefined) ?? null, deadline: (a.deadline as string | undefined) ?? null,
        draftedAt: new Date().toISOString(), draftedById: user.id, clientName: channel.clientName };
      await this.prisma.$transaction(async (tx) => {
        await tx.intake.update({ where: { id: intake.id }, data: { noticeDraft: { ...draft } } });
        await tx.auditLog.create({ data: this.audit(user, channel, name, caseId, intake!.id) });
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
        await tx.auditLog.create({ data: this.audit(user, channel, name, caseId, suggestion.id) });
        return suggestion;
      });
    }
    return { ...entity, caseId: caseId ?? null, ...(name === 'complete_task' || name === 'create_task' ? { kind: 'TASK' } : {}), ...(name === 'propose_court_date' ? { message: 'เสนอวันนัดแล้ว รอผู้ใช้ยอมรับในหน้าคดี' } : {}),
      ...(name === 'draft_expense' ? { message: 'บันทึกเป็นร่างเบิกแล้ว แนบใบเสร็จและกดส่งเบิกในแอป', expensesUrl: `${origin}/expenses` } : {}) };
  }

  private assertCanWrite(user: AuthUser) {
    if (user.subscriptionStatus && !subscriptionAllowsWrites(user.subscriptionStatus)) throw new ForbiddenException('แพ็กเกจสำนักงานไม่รองรับการบันทึก กรุณาติดต่อเจ้าของสำนักงาน');
  }

  /** MCP has already validated through the SDK; the chat loop has not, so both go through here. */
  private parse(name: ActionName, raw: unknown): Record<string, unknown> {
    const parsed = z.object(ACTION_SCHEMAS[name]).safeParse(raw ?? {});
    if (!parsed.success) throw new BadRequestException(parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '));
    return parsed.data as Record<string, unknown>;
  }

  private async ownTask(user: AuthUser, taskId: string) {
    const task = await this.prisma.task.findFirst({ where: { id: taskId, OR: [{ case: this.caseFilter(user) }, { caseId: null, assigneeId: user.id, firmId: user.firmId }] } });
    if (!task) throw new NotFoundException('ไม่พบงานนี้ในงานของคุณ');
    if (task.assigneeId !== user.id) throw new BadRequestException('ปิดได้เฉพาะงานที่มอบหมายให้คุณ');
    if (task.requiresReview) throw new BadRequestException('งานนี้ต้องส่งตรวจ กรุณากดส่งตรวจในแอป');
    return task;
  }

  private async caseLabel(user: AuthUser, caseId: string): Promise<string> {
    const legalCase = await this.prisma.case.findFirst({ where: { AND: [this.caseFilter(user), { id: caseId }] }, select: { title: true, ownRef: true } });
    if (!legalCase) throw new NotFoundException('ไม่พบคดีนี้ในงานของคุณ');
    return [legalCase.ownRef, legalCase.title].filter(Boolean).join(' · ');
  }

  private async assertOwnCase(user: AuthUser, caseId: string) {
    const legalCase = await this.prisma.case.findFirst({ where: { AND: [this.caseFilter(user), { id: caseId }] }, select: { id: true } });
    if (!legalCase) throw new NotFoundException('ไม่พบคดีนี้ในงานของคุณ');
  }

  private caseFilter(user: AuthUser) {
    return mcpCaseScope(user.firmRole) === 'app' ? this.access.getCaseFilterForUser(user) : this.access.getOwnCaseFilterForUser(user);
  }

  private audit(user: AuthUser, channel: ActionChannel, tool: string, caseId: string | undefined, entityId: string) {
    return { firmId: user.firmId, userId: user.id, action: `${channel.kind}.${tool}`, metadata: { connectionId: channel.id, clientName: channel.clientName, tool, caseId, entityId } };
  }
}

export function validDay(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
}
function courtDate(value: string): Date | null {
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})?$/.exec(value);
  if (!match || !validDay(match[1]) || +match[2] > 23 || +match[3] > 59 || +(match[4] ?? 0) > 59) return null;
  if (match[5] && match[5] !== 'Z' && (+match[5].slice(1, 3) > 23 || +match[5].slice(4) > 59)) return null;
  const parsed = new Date(match[5] ? value : `${value}+07:00`);
  return isNaN(parsed.getTime()) ? null : parsed;
}
function day(value: unknown): string | null {
  return typeof value === 'string' ? new Date(`${value}T00:00:00+07:00`).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Bangkok' }) : null;
}
function clip(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  return value.length > PREVIEW_TEXT_MAX ? `${value.slice(0, PREVIEW_TEXT_MAX)}…` : value;
}

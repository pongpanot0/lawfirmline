import { BadRequestException, ForbiddenException, HttpException, Injectable, NotFoundException } from '@nestjs/common';
import { z } from 'zod';
import { AuthUser, CustomFieldDefinitionDto, CustomFieldEntity, hasFirmCapability, EXPENSE_CATEGORIES, MONEY_MAX, MONEY_MIN, mcpCaseScope, type McpNoticeDraft, TaskStatus, subscriptionAllowsWrites, type WorkflowStepDefinition } from '@lawfirm/shared';
import { DateSuggestionSource, DateSuggestionStatus, EventType, LeaveStatus, LeaveType, TaskSource } from '../generated/prisma';
import { LeaveService } from '../leave/leave.service';
import { PrismaService } from '../prisma/prisma.module';
import { CaseAccessService } from '../common/services/case-access.service';
import { TasksService } from '../tasks/tasks.service';
import { CaseCommentsService } from '../cases/case-comments.service';
import { BillingService } from '../billing/billing.service';
import { FirmLinkService } from '../notifications/firm-link.service';
import { WorkflowsService } from '../workflows/workflows.service';
import { CustomFieldsService } from '../custom-fields/custom-fields.service';
import { CustomFieldValuesService } from '../custom-fields/custom-field-values.service';
import { validateValue } from '../custom-fields/custom-field-rules';
import { CreateCustomFieldDto, UpdateCustomFieldDto } from '../custom-fields/dto/custom-field.dto';
import type { OpenAiToolDef } from './secretary-tools.service';

export const text = z.string().trim().min(1);
const title = text.max(200);
const note = text.max(5000);
export const date = text.refine(validDay, 'ระบุวันที่จริงในรูปแบบ YYYY-MM-DD');

const fieldReference = z.string().regex(/\S/, 'ระบุชื่อหรือรหัสช่องข้อมูล');
const customFieldMetadata = {
  required: z.boolean().optional(), caseTypeNames: z.array(fieldReference).optional(),
  section: text.max(60).nullable().optional(), helpText: text.max(200).nullable().optional(),
  isSensitive: z.boolean().optional(),
};
const fieldLabel = fieldReference.max(80);
export const customFieldTool = (name: string) => name.endsWith('_custom_field') || name === 'set_custom_field_values';

/**
 * The writes an AI may make for a person — the MCP tools and the LINE secretary share these, so the
 * same scope, marking (viaAi / TaskSource.MCP = "made by AI") and audit apply wherever the AI runs.
 */
export const AI_WRITE_SCHEMAS = {
  create_custom_field: {
    entityKind: z.enum(['CASE', 'CLIENT']), visibility: z.enum(['PERSONAL', 'FIRM']).default('PERSONAL'),
    label: fieldLabel, type: z.enum(['TEXT', 'LONG_TEXT', 'NUMBER', 'DATE', 'SELECT', 'BOOLEAN']),
    options: z.array(z.strictObject({ label: fieldReference })).min(1).max(50).optional(), ...customFieldMetadata,
  },
  update_custom_field: { field: fieldReference, label: fieldLabel.optional(), options: z.array(fieldReference).min(1).max(50).optional(), ...customFieldMetadata },
  archive_custom_field: { field: fieldReference },
  restore_custom_field: { field: fieldReference },
  set_custom_field_values: { entity: z.enum(['CASE', 'CLIENT']), id: text, values: z.record(fieldReference, z.union([z.string(), z.number(), z.boolean(), z.null()])) },
  create_task: { caseId: text.optional(), title, description: note.optional(), dueDate: date.optional() },
  complete_task: { taskId: text },
  add_case_note: { caseId: text, text: note },
  log_time: { caseId: text, hours: z.number().min(0.1).max(24).multipleOf(0.01), description: text.max(500), date: date.optional(), billable: z.boolean().optional() },
  draft_expense: { amount: z.number().min(MONEY_MIN).max(MONEY_MAX).multipleOf(0.01), description: text.max(500), category: z.enum(EXPENSE_CATEGORIES).optional(), date: date.optional(), caseId: text.optional() },
  propose_court_date: { caseId: text, title, startAt: text.refine((v) => courtDate(v) !== null, 'ระบุวันเวลาจริงในรูปแบบ ISO'), courtName: title.optional(), note: note.optional() },
  request_leave: { type: z.nativeEnum(LeaveType), startDate: date, endDate: date },
  draft_notice: { caseId: text.optional(), intakeId: text.optional(), content: text.max(20000), recipient: title.optional(), deadline: date.optional() },
  // Same limits as the app's SopDto.
  create_sop: { title, content: text.max(50000), category: text.max(100).optional() },
  // WorkflowsService.validateSteps is the authority; this shape only guides the model.
  create_workflow: { name: title, description: note.optional(), steps: z.array(z.object({
    title, instructions: note.optional(), role: z.enum(['OWNER', 'SENIOR_LAWYER', 'LAWYER', 'ASSISTANT', 'EXTERNAL']),
    durationDays: z.number().int().min(1).max(60), requiresReview: z.boolean().optional(),
  })).min(1).max(20) },
};
export type AiWriteTool = keyof typeof AI_WRITE_SCHEMAS;
export const AI_WRITE_TOOLS = Object.keys(AI_WRITE_SCHEMAS) as AiWriteTool[];

export const AI_WRITE_DESCRIPTIONS: Record<AiWriteTool, string> = {
  create_custom_field: 'Create a CASE or CLIENT custom field. Default PERSONAL; FIRM needs manageFirmContent. SELECT options are objects with label. Resolve caseTypeNames within the firm. Use list_custom_fields first to avoid duplicates.',
  update_custom_field: 'Edit a visible custom field by key or exact label. Type, key, entity and visibility are immutable. options is the full desired list of labels; omitted options are archived without deleting saved values.',
  archive_custom_field: 'Archive a visible custom field by key or exact label. Keeps all existing values; never deletes them.',
  restore_custom_field: 'Restore an archived visible custom field by key or exact label, subject to the same plan and field limits as create.',
  set_custom_field_values: 'Fill CASE or CLIENT custom fields on your own work. values keys are field keys or exact visible labels. SELECT accepts option labels. null clears a value. Sensitive values never appear in results.',
  create_task: 'Create a task assigned to you. Pass caseId only when the work belongs to one of your cases; leave it out for a personal to-do (a meeting, office work) — never ask the user for a case just to create a task.',
  complete_task: 'Complete a task assigned to you (on your own case or a personal to-do). Tasks requiring review must be submitted in the app.',
  add_case_note: 'Add a case comment marked as AI-created, without mentions.',
  log_time: 'Log your time on your own case, using your default hourly rate.',
  propose_court_date: 'Propose a court date for a person to accept in the case page. Never creates a calendar event.',
  draft_expense: 'Write down an out-of-pocket cost (THB) as a DRAFT reimbursement for the caller, optionally on one of their cases. Never submits it: the person attaches the receipt and sends it for approval in the app.',
  request_leave: 'Submit a leave request for the caller only, dates inclusive (YYYY-MM-DD, Asia/Bangkok, from today, max 90 days). SICK = sick leave (the team sees the name only, in the day-of notice), PERSONAL = personal business leave, VACATION = annual leave; every type waits for approval. Confirm type and dates with the person before calling.',
  draft_notice: 'Save a demand notice (หนังสือทวงถาม/บอกกล่าว) you wrote as a DRAFT on one of the caller\'s matters — pass caseId for a pre-filing case, or intakeId for an intake not yet a case (ids from find_matters): the full letter in formal Thai, the recipient, and the reply deadline. Use only facts from case_overview and the documents; never invent facts. Replaces any earlier AI draft. Never issues it: the lawyer reviews, edits and issues it in the app.',
  create_sop: 'Add a new SOP (office procedure) for the whole firm: a short title, the steps in clear Thai (numbered list), and an optional category. Check search_sops first so you don\'t duplicate one. Creates only; editing or deleting is done in the app.',
  create_workflow: 'Save a reusable workflow template (ชุดขั้นตอนงาน) for the firm: a name, and 1-20 ordered steps, each with a title, optional instructions, the role that does it (OWNER, SENIOR_LAWYER, LAWYER, ASSISTANT, EXTERNAL), working days (1-60) and whether it needs review. People start it on a case in the app; this never starts it or assigns anyone. Confirm the steps with the person before calling.',
};

/** Where the AI ran: the audit action prefix and what identifies the channel in the audit row. */
export interface AiWriteVia {
  auditPrefix: 'mcp' | 'line_ai' | 'secretary_ai';
  auditMetadata: Record<string, unknown>;
  /** Shown on a notice draft as the app that wrote it. */
  clientName: string;
}

/** A write the AI wants to make, checked against the person's scope but not yet saved. */
export interface AiWriteProposal {
  tool: AiWriteTool;
  args: Record<string, unknown>;
  /** Human names for the ids, for the confirm message. */
  labels: { case?: string; task?: string; intake?: string; customFields?: string[] };
}

/** OpenAI function definitions for the given write tools, from the same schemas the MCP server validates with. */
export function aiWriteDefinitions(tools: AiWriteTool[]): OpenAiToolDef[] {
  return tools.map((name) => {
    const { $schema: _s, ...parameters } = z.toJSONSchema(z.strictObject(AI_WRITE_SCHEMAS[name])) as Record<string, unknown>;
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
    private readonly workflows: WorkflowsService,
    private readonly customFields: CustomFieldsService,
    private readonly customValues: CustomFieldValuesService,
  ) {}

  /**
   * Validates a write the AI asked for and checks it against the person's own work, without saving.
   * Throws the same Thai refusals as run(), so the AI can explain them before anyone is asked to confirm.
   */
  async check(user: AuthUser, name: AiWriteTool, raw: unknown): Promise<AiWriteProposal> {
    const schema = customFieldTool(name) ? z.strictObject(AI_WRITE_SCHEMAS[name]) : z.object(AI_WRITE_SCHEMAS[name]);
    const parsed = schema.safeParse(raw ?? {});
    if (!parsed.success) throw new BadRequestException(`ข้อมูลไม่ครบหรือไม่ถูกต้อง: ${parsed.error.issues.map((i) => `${i.path.join('.')} ${i.message}`).join('; ')}`);
    this.assertWritable(user);
    const args = parsed.data as Record<string, unknown>;
    const labels: AiWriteProposal['labels'] = {};
    if (customFieldTool(name)) {
      const prepared = await this.prepareCustomField(user, name, args);
      labels.customFields = prepared.lines;
      if (prepared.def) args.field = prepared.def.key;
      if (prepared.values) args.values = prepared.values;
      return { tool: name, args, labels };
    }
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
    if (customFieldTool(name)) return this.runCustomField(user, name, a, via);
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
    } else if (name === 'create_sop') {
      // Open to every member (owner's call 2026-11-12); the app's SOP screen keeps its own role limits.
      const sop = await this.prisma.$transaction(async (tx) => {
        const created = await tx.sop.create({ data: { firmId: user.firmId, title: a.title as string, content: a.content as string, category: (a.category as string | undefined) ?? null, updatedById: user.id, createdById: user.id }, select: { id: true, title: true, category: true } });
        await tx.auditLog.create({ data: this.audit(user, via, name, undefined, created.id) });
        return created;
      });
      return { ...sop, sopsUrl: `${origin}/sops`, message: 'สร้าง SOP แล้ว แก้ไขหรือลบได้ในแอป' };
    } else if (name === 'create_workflow') {
      // A template only — never starts a run or assigns anyone.
      const template = await this.workflows.createTemplate(user, { name: a.name as string, description: a.description as string | undefined, steps: a.steps as WorkflowStepDefinition[] });
      await this.prisma.auditLog.create({ data: this.audit(user, via, name, undefined, template.id) });
      return { id: template.id, name: template.name, steps: (template.steps as unknown as WorkflowStepDefinition[]).length,
        message: 'บันทึกชุดขั้นตอนงานแล้ว เริ่มใช้กับคดีได้ในแอป' };
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

  private async visibleFields(user: AuthUser, includeArchived = false): Promise<CustomFieldDefinitionDto[]> {
    return (await Promise.all((['CASE', 'CLIENT'] as const).map(entity => this.customFields.listVisible(user, entity, { includeArchived })))).flat();
  }

  private resolveField(defs: CustomFieldDefinitionDto[], name: string): CustomFieldDefinitionDto {
    const byKey = defs.find(d => d.key === name);
    if (byKey) return byKey;
    const found = defs.filter(d => d.label === name);
    if (found.length === 1) return found[0];
    throw new BadRequestException(`${found.length ? 'ชื่อช่องซ้ำ กรุณาระบุรหัสช่อง' : 'ไม่พบช่องข้อมูลนี้'} ช่องที่ใช้ได้: ${defs.map(d => d.label).join(', ') || 'ไม่มี'}`);
  }

  private async prepareCustomField(user: AuthUser, name: AiWriteTool, a: Record<string, unknown>): Promise<{
    def?: CustomFieldDefinitionDto; dto?: CreateCustomFieldDto | UpdateCustomFieldDto;
    values?: Record<string, unknown>; changedLabels?: string[]; lines: string[];
  }> {
    if (name === 'set_custom_field_values') {
      const entity = a.entity as CustomFieldEntity;
      const scope = this.caseFilter(user);
      const record = entity === 'CASE'
        ? await this.prisma.case.findFirst({ where: { AND: [scope, { id: a.id as string }] }, select: { id: true } })
        : await this.prisma.client.findFirst({ where: { id: a.id as string, firmId: user.firmId, OR: [
          { cases: { some: scope } }, { additionalCaseRoles: { some: { case: scope } } }, { caseCustomerRoles: { some: { case: scope } } },
        ] }, select: { id: true } });
      if (!record) throw new NotFoundException('ไม่พบข้อมูลนี้ในงานของคุณ');
      const defs = await this.customFields.listVisible(user, entity);
      const patch: Record<string, unknown> = {};
      const changedLabels: string[] = [];
      const lines: string[] = [`${entity === 'CASE' ? 'สำนวน' : 'ลูกความ'}: ${a.id}`];
      for (const [key, input] of Object.entries(a.values as Record<string, unknown>)) {
        const def = this.resolveField(defs, key);
        if (Object.prototype.hasOwnProperty.call(patch, def.key)) throw new BadRequestException('ระบุช่องข้อมูลเดียวกันซ้ำ กรุณาใช้รหัสหรือชื่อเพียงอย่างเดียว');
        let value = input;
        if (def.type === 'SELECT' && input !== null && input !== '') {
          const options = def.options.filter(o => !o.archived && (o.id === input || o.label === input));
          if (options.length !== 1) throw new BadRequestException(`ตัวเลือกไม่ถูกต้องสำหรับช่อง ${def.label} ตัวเลือกที่ใช้ได้: ${def.options.filter(o => !o.archived).map(o => o.label).join(', ')}`);
          value = options[0].id;
        }
        const checked = validateValue(def, value);
        if (!checked.ok) throw new BadRequestException(`ข้อมูลช่อง ${def.label} ไม่ถูกต้อง กรุณาระบุค่าให้ตรงชนิด ${def.type}`);
        patch[def.key] = checked.value;
        changedLabels.push(def.label);
        const shown = def.isSensitive ? '[ข้อมูลส่วนบุคคล]' : checked.value === null ? 'ล้างค่า' : def.type === 'SELECT' ? def.options.find(o => o.id === checked.value)!.label : String(checked.value);
        lines.push(`${def.label}: ${shown}`);
      }
      return { values: patch, changedLabels, lines };
    }
    const def = name === 'create_custom_field' ? undefined : this.resolveField(await this.visibleFields(user, name === 'restore_custom_field'), a.field as string);
    const visibility = def?.visibility ?? a.visibility;
    if (visibility === 'FIRM' && !hasFirmCapability(user.firmRole, 'manageFirmContent')) throw new ForbiddenException('คุณไม่มีสิทธิ์จัดการช่องข้อมูลของสำนักงาน');
    if (a.isSensitive !== undefined && def && a.isSensitive !== def.isSensitive) {
      const creator = await this.prisma.customFieldDefinition.findFirst({ where: { id: def.id, firmId: user.firmId }, select: { createdById: true } });
      if (creator?.createdById !== user.id) throw new ForbiddenException('เฉพาะผู้สร้างช่องข้อมูลเท่านั้นที่เปลี่ยนการปกปิดข้อมูลได้');
    }
    const { field: _field, caseTypeNames, ...metadata } = a;
    const dto = { ...metadata } as unknown as CreateCustomFieldDto | UpdateCustomFieldDto;
    if (caseTypeNames !== undefined) {
      const types = await this.prisma.caseType.findMany({ where: { firmId: user.firmId }, select: { id: true, name: true } });
      dto.caseTypeIds = (caseTypeNames as string[]).map(n => {
        const matches = types.filter(t => t.name === n);
        if (matches.length !== 1) throw new BadRequestException(`ไม่พบประเภทสำนวนนี้ ประเภทที่ใช้ได้: ${types.map(t => t.name).join(', ') || 'ไม่มี'}`);
        return matches[0].id;
      });
    }
    if (def && a.options !== undefined) {
      if (def.type !== 'SELECT') throw new BadRequestException('กำหนดตัวเลือกได้เฉพาะช่องชนิด SELECT');
      const desired = a.options as string[];
      if (new Set(desired).size !== desired.length) throw new BadRequestException('ชื่อตัวเลือกต้องไม่ซ้ำกัน');
      dto.options = desired.map(label => {
        const old = def.options.filter(o => !o.archived && o.label === label);
        if (old.length > 1) throw new BadRequestException('ชื่อตัวเลือกซ้ำ กรุณาแก้ไขในแอป');
        return old[0] ? { id: old[0].id, label } : { label };
      });
    }
    const names: Record<string, string> = { entityKind: 'ใช้กับ', visibility: 'การมองเห็น', label: 'ชื่อช่อง', type: 'ชนิดข้อมูล', options: 'ตัวเลือก', required: 'จำเป็นก่อนเลื่อนขั้น', caseTypeNames: 'ประเภทสำนวน', section: 'กลุ่ม', helpText: 'คำอธิบาย', isSensitive: 'ข้อมูลส่วนบุคคล' };
    const display: Record<string, string> = { CASE: 'สำนวน', CLIENT: 'ลูกความ', PERSONAL: 'เฉพาะฉัน', FIRM: 'ทั้งสำนักงาน', TEXT: 'ข้อความ', LONG_TEXT: 'ข้อความยาว', NUMBER: 'ตัวเลข', DATE: 'วันที่', SELECT: 'ตัวเลือก', BOOLEAN: 'ใช่หรือไม่' };
    const lines = [...(def ? [`ช่อง: ${def.label}`] : []), ...Object.entries(a).filter(([key]) => key !== 'field').map(([key, value]) => {
      const shown = Array.isArray(value) ? value.map(v => typeof v === 'object' ? (v as { label: string }).label : v).join(', ') : typeof value === 'boolean' ? value ? 'ใช่' : 'ไม่ใช่' : value === null ? 'ล้างค่า' : display[String(value)] ?? String(value);
      return `${names[key] ?? key}: ${shown}`;
    })];
    return { def, dto, lines };
  }

  private async runCustomField(user: AuthUser, name: AiWriteTool, raw: Record<string, unknown>, via: AiWriteVia): Promise<Record<string, unknown>> {
    try {
      const proposal = await this.check(user, name, raw);
      const prepared = await this.prepareCustomField(user, name, proposal.args);
      const source = via.auditPrefix === 'mcp' ? 'MCP' : 'AI';
      const options = { source, audit: (id: string) => this.audit(user, via, name, undefined, id) } as const;
      const url = `${this.links.originForSlug(user.firmSlug)}/settings/custom-fields`;
      if (name === 'set_custom_field_values') {
        await this.customValues.setValues(user, proposal.args.entity as CustomFieldEntity, proposal.args.id as string, prepared.values!, {
          source, auditMetadata: { ...via.auditMetadata, via: via.auditPrefix, tool: name, clientName: via.clientName },
        });
        return { changed: prepared.changedLabels, message: 'บันทึกข้อมูลเพิ่มเติมแล้ว' };
      }
      const definition = name === 'create_custom_field' ? await this.customFields.create(user, prepared.dto as CreateCustomFieldDto, options)
        : name === 'update_custom_field' ? await this.customFields.update(user, prepared.def!.id, prepared.dto as UpdateCustomFieldDto, options)
        : name === 'archive_custom_field' ? await this.customFields.archive(user, prepared.def!.id, options)
        : await this.customFields.restore(user, prepared.def!.id, options);
      return { ...definition, url, message: 'บันทึกช่องข้อมูลเพิ่มเติมแล้ว' };
    } catch (e) {
      if (!(e instanceof HttpException) || /[ก-๙]/.test(e.message)) throw e;
      const reasons: Record<string, string> = {
        'Cannot manage firm custom fields': 'คุณไม่มีสิทธิ์จัดการช่องข้อมูลของสำนักงาน',
        'Only the creator can change field sensitivity': 'เฉพาะผู้สร้างช่องข้อมูลเท่านั้นที่เปลี่ยนการปกปิดข้อมูลได้',
        'Only firm case fields can be required': 'กำหนดช่องจำเป็นได้เฉพาะช่องสำนวนของสำนักงาน',
        'Only case fields can specify case types': 'กำหนดประเภทสำนวนได้เฉพาะช่องของสำนวน',
        'Custom field not found': 'ไม่พบช่องข้อมูลนี้',
        'SELECT needs 1–50 options': 'ช่องตัวเลือกต้องมี 1–50 ตัวเลือก',
        'Only SELECT fields can have options': 'กำหนดตัวเลือกได้เฉพาะช่องชนิด SELECT',
      };
      const body = e.getResponse();
      throw new HttpException({ ...(typeof body === 'object' ? body : {}), message: reasons[e.message] ?? 'บันทึกข้อมูลเพิ่มเติมไม่สำเร็จ กรุณาตรวจสอบชนิดข้อมูล ตัวเลือก และจำนวนช่องที่ใช้ได้' }, e.getStatus());
    }
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
    create_custom_field: () => ['สร้างช่องข้อมูลเพิ่มเติม', ...(labels.customFields ?? [])],
    update_custom_field: () => ['แก้ไขช่องข้อมูลเพิ่มเติม', ...(labels.customFields ?? [])],
    archive_custom_field: () => ['เก็บถาวรช่องข้อมูลเพิ่มเติม', ...(labels.customFields ?? [])],
    restore_custom_field: () => ['คืนค่าช่องข้อมูลเพิ่มเติม', ...(labels.customFields ?? [])],
    set_custom_field_values: () => ['กรอกข้อมูลเพิ่มเติม', ...(labels.customFields ?? [])],
    create_task: () => ['📝 สร้างงาน', `ชื่องาน: ${a.title}`, caseLine, `กำหนดส่ง: ${a.dueDate ? thaiDay(a.dueDate as string) : 'ไม่ระบุ'}`, !!a.description && `รายละเอียด: ${clipText(a.description as string, 300)}`],
    complete_task: () => ['✅ ปิดงาน', `งาน: ${labels.task}`, caseLine],
    add_case_note: () => ['💬 เพิ่มบันทึกในคดี', caseLine, `ข้อความ: ${clipText(a.text as string, 500)}`],
    log_time: () => ['⏱️ ลงเวลาทำงาน', caseLine, `จำนวน: ${a.hours} ชม.`, `รายละเอียด: ${a.description}`, `วันที่: ${thaiDay((a.date as string | undefined) ?? new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' }).format(new Date()))}`, `คิดค่าบริการ: ${a.billable === false ? 'ไม่คิด' : 'ตามค่าเริ่มต้น'}`],
    propose_court_date: () => ['⚖️ เสนอวันนัดศาล', caseLine, `นัด: ${a.title}`, `วันเวลา: ${thaiDateTime(courtDate(a.startAt as string)!)}`, !!a.courtName && `ศาล: ${a.courtName}`, 'ยังไม่ลงปฏิทิน: ต้องกดยอมรับในหน้าคดีอีกครั้ง'],
    draft_expense: () => ['💸 ร่างเบิกค่าใช้จ่าย', `จำนวน: ${(a.amount as number).toLocaleString('th-TH')} บาท`, `รายการ: ${a.description}`, !!a.category && `หมวด: ${a.category}`, caseLine, 'บันทึกเป็นร่าง: แนบใบเสร็จและกดส่งเบิกในแอป'],
    request_leave: () => ['🌴 ยื่นลา', `ประเภท: ${({ SICK: 'ลาป่วย', PERSONAL: 'ลากิจ', VACATION: 'พักร้อน' } as Record<string, string>)[a.type as string] ?? a.type}`, `วันที่: ${thaiDay(a.startDate as string)} – ${thaiDay(a.endDate as string)}`],
    draft_notice: () => ['📄 ร่างหนังสือทวงถาม', a.caseId ? caseLine : `เรื่องรับ: ${labels.intake ?? 'ไม่มีชื่อเรื่อง'}`, `ถึง: ${a.recipient ?? 'ไม่ระบุ'}`, `กำหนดตอบ: ${a.deadline ? thaiDay(a.deadline as string) : 'ไม่ระบุ'}`, `เนื้อหา: ${clipText(a.content as string, 300)}`, 'บันทึกเป็นร่าง: ทนายตรวจแก้และกดออกหนังสือในแอป'],
    create_sop: () => ['📘 สร้าง SOP ของสำนักงาน', `ชื่อ: ${a.title}`, !!a.category && `หมวด: ${a.category}`, `ขั้นตอน: ${clipText(a.content as string, 500)}`],
    create_workflow: () => ['🧭 สร้างชุดขั้นตอนงาน', `ชื่อ: ${a.name}`,
      ...(a.steps as Array<{ title: string; durationDays: number; requiresReview?: boolean }>).map((s, i) => `${i + 1}. ${s.title} (${s.durationDays} วันทำการ${s.requiresReview ? ', ต้องตรวจ' : ''})`),
      'ยังไม่เริ่มใช้กับคดีใด: เริ่มได้ในแอป'],
  };
  return ['ตรวจสอบก่อนบันทึกครับ', '', ...rows[tool]().filter((r): r is string => !!r), '', 'กด "ยืนยัน" เพื่อบันทึก หรือ "ยกเลิก"'].join('\n');
}

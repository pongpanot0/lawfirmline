import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import {
  ActivityType,
  AuthUser,
  CARGO_CLAIM_PLAYBOOK_KEY,
  CARGO_CLAIM_PLAYBOOK_NAME,
  CARGO_CLAIM_PLAYBOOK_STEPS,
  CARGO_DOCUMENT_REQUIREMENTS,
  CargoPlaybookTemplate,
  CaseStage,
  DeadlineDayBasis,
} from '@lawfirm/shared';
import { PrismaService } from '../prisma/prisma.module';
import { Prisma } from '../generated/prisma';
import { CaseAccessService } from '../common/services/case-access.service';
import { AutomationLogService } from '../common/services/automation-log.service';
import { CaseFeedService } from '../common/services/case-feed.service';
import { DeadlineRulesService } from '../deadlines/deadline-rules.service';
import { AssignmentNotifierService } from '../notifications/assignment-notifier.service';
export interface ImportRow { clientName: string; caseRef: string; caseTitle: string }
export interface CheckedRow extends ImportRow { row: number; existingClientId: string | null; errors: string[] }
export interface Ledger { cases: { id: string; updatedAt: string }[]; clients: { id: string; updatedAt: string }[] }
export type FirmRoleStr = 'OWNER' | 'SENIOR_LAWYER' | 'LAWYER' | 'ASSISTANT';
export interface PlaybookStep {
  title: string;
  instructions: string;
  primaryRole?: FirmRoleStr;
  secondaryRole?: FirmRoleStr;
  stage?: CaseStage;
  offsetDays?: number;
  dayBasis?: 'CALENDAR' | 'BUSINESS';
}
export interface StageTaskProposal { title: string; description: string; dueDate: string | null; assigneeId: string | null; releaseName: string }
export interface StageTaskInput { title: string; description?: string; dueDate?: string | null; assigneeId?: string | null }
const json = (value: unknown): Prisma.InputJsonValue => JSON.parse(JSON.stringify(value));

/**
 * Who a playbook step's task goes to: prefer the primary role, then the
 * secondary role, each restricted first to firm members already on the case
 * team before any firm member with that role — only when nobody in the
 * office holds either role does it fall back to the case's lead lawyer.
 */
export function resolveAssignee(params: {
  primaryRole?: string;
  secondaryRole?: string;
  firmMembers: { userId: string; role: string }[];
  teamIds: Set<string>;
  ownerId: string;
}): string {
  const pick = (role?: string) => {
    if (!role) return undefined;
    const withRole = params.firmMembers.filter((m) => m.role === role);
    return withRole.find((m) => params.teamIds.has(m.userId))?.userId ?? withRole[0]?.userId;
  };
  return pick(params.primaryRole) ?? pick(params.secondaryRole) ?? params.ownerId;
}
@Injectable()
export class PracticeSetupService {
  constructor(
    private prisma: PrismaService,
    private access: CaseAccessService,
    private automationLog: AutomationLogService,
    private deadlineRules: DeadlineRulesService,
    private assignmentNotifier: AssignmentNotifierService,
    private caseFeed: CaseFeedService,
  ) {}
  private owner(user: AuthUser) { if (user.firmRole !== 'OWNER') throw new ForbiddenException('เจ้าของสำนักงานเท่านั้น / Firm owner required'); }
  async progress(user: AuthUser) {
    this.owner(user);
    const [members, clients, cases, invites, batches] = await Promise.all([
      this.prisma.firmMember.count({ where: { firmId: user.firmId } }), this.prisma.client.count({ where: { firmId: user.firmId } }), this.prisma.case.count({ where: { firmId: user.firmId } }),
      this.prisma.invitation.count({ where: { firmId: user.firmId, acceptedAt: null, expiresAt: { gt: new Date() } } }),
      this.prisma.dataImportBatch.findMany({ where: { firmId: user.firmId }, select: { id: true, status: true, createdAt: true, committedAt: true, undoneAt: true }, orderBy: { createdAt: 'desc' }, take: 30 }),
    ]);
    return { members, clients, cases, invites, batches };
  }
  private async checkRows(user: AuthUser, rows: ImportRow[], db: Prisma.TransactionClient = this.prisma): Promise<CheckedRow[]> {
    const clients = await db.client.findMany({ where: { firmId: user.firmId }, select: { id: true, name: true } });
    const cases = await db.case.findMany({ where: { firmId: user.firmId, ownRef: { in: rows.map(r => r.caseRef.trim()) } }, select: { ownRef: true } });
    const seen = new Set<string>();
    return rows.map((raw, index) => {
      const row = { clientName: raw.clientName.trim(), caseRef: raw.caseRef.trim(), caseTitle: raw.caseTitle.trim() };
      const errors: string[] = [];
      if (!row.clientName) errors.push('ไม่มีชื่อลูกความ / Missing client name');
      if (!!row.caseRef !== !!row.caseTitle) errors.push('คดีต้องมีทั้งเลขอ้างอิงและชื่อ / Case needs a reference and title');
      if (row.caseRef && (seen.has(row.caseRef) || cases.some(c => c.ownRef === row.caseRef))) errors.push('เลขคดีซ้ำ / Duplicate case reference');
      if (row.caseRef) seen.add(row.caseRef);
      const matching = clients.filter(c => c.name.normalize('NFKC').toLowerCase() === row.clientName.normalize('NFKC').toLowerCase());
      if (matching.length > 1) errors.push('พบลูกความชื่อเดียวกันหลายราย กรุณาแก้ชื่อในระบบก่อน / Ambiguous existing client name');
      return { ...row, row: index + 1, errors, existingClientId: matching.length === 1 ? matching[0].id : null };
    });
  }
  async previewImport(user: AuthUser, rows: ImportRow[]) {
    this.owner(user); const checked = await this.checkRows(user, rows);
    const batch = await this.prisma.dataImportBatch.create({ data: { firmId: user.firmId, createdById: user.id, rows: json(checked) } });
    return { id: batch.id, rows: checked, canCommit: checked.every(r => !r.errors.length) };
  }
  async commitImport(user: AuthUser, id: string) {
    this.owner(user);
    return this.prisma.$transaction(async db => {
      await db.$queryRaw`SELECT "id" FROM "Firm" WHERE "id" = ${user.firmId} FOR UPDATE`;
      const batch = await db.dataImportBatch.findFirst({ where: { id, firmId: user.firmId } });
      if (!batch) throw new NotFoundException('Batch unavailable');
      if (batch.status === 'COMMITTED') return { id, status: batch.status, ledger: batch.ledger };
      if (batch.status !== 'PREVIEW') throw new ConflictException('Batch is no longer a preview');
      const original = batch.rows as unknown as CheckedRow[];
      const rows = await this.checkRows(user, original, db);
      if (rows.some((r, i) => r.errors.length || r.existingClientId !== original[i].existingClientId)) throw new ConflictException('ข้อมูลเปลี่ยนหรือมีแถวผิด กรุณาตรวจตัวอย่างใหม่ / Data changed; preview again');
      const ledger: Ledger = { cases: [], clients: [] }; const newClients = new Map<string, string>();
      for (const r of rows) {
        const nameKey = r.clientName.normalize('NFKC').toLowerCase();
        let clientId = r.existingClientId ?? newClients.get(nameKey);
        if (!clientId) { const client = await db.client.create({ data: { firmId: user.firmId, name: r.clientName } }); clientId = client.id; newClients.set(nameKey, client.id); ledger.clients.push({ id: client.id, updatedAt: client.updatedAt.toISOString() }); }
        if (r.caseRef) { const c = await db.case.create({ data: { firmId: user.firmId, clientId, clientName: r.clientName, ownRef: r.caseRef, folderId: r.caseRef, title: r.caseTitle, leadLawyerId: user.id } }); ledger.cases.push({ id: c.id, updatedAt: c.updatedAt.toISOString() }); }
      }
      await db.dataImportBatch.update({ where: { id }, data: { status: 'COMMITTED', committedAt: new Date(), ledger: json(ledger) } });
      await db.auditLog.create({ data: { firmId: user.firmId, userId: user.id, action: 'DATA_IMPORT_COMMITTED', metadata: { batchId: id, caseCount: ledger.cases.length, clientCount: ledger.clients.length } } });
      return { id, status: 'COMMITTED', ledger };
    }, { timeout: 30000, isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }
  async undoImport(user: AuthUser, id: string) {
    this.owner(user);
    return this.prisma.$transaction(async db => {
      await db.$queryRaw`SELECT "id" FROM "Firm" WHERE "id" = ${user.firmId} FOR UPDATE`;
      const batch = await db.dataImportBatch.findFirst({ where: { id, firmId: user.firmId } });
      if (!batch) throw new NotFoundException('Batch unavailable');
      if (batch.status === 'UNDONE') return { undone: true };
      if (batch.status !== 'COMMITTED' || !batch.ledger) throw new BadRequestException('Only a committed batch can be undone');
      const ledger = batch.ledger as unknown as Ledger;
      for (const item of ledger.cases) {
        await db.$queryRaw`SELECT "id" FROM "Case" WHERE "id" = ${item.id} FOR UPDATE`;
        const c = await db.case.findFirst({ where: { id: item.id, firmId: user.firmId }, include: { _count: true } });
        if (!c || c.updatedAt.toISOString() !== item.updatedAt || Object.values(c._count).some(n => n > 0)) throw new ConflictException('คดีมีการแก้ไขหรือข้อมูลต่อเนื่องแล้ว ยกเลิกชุดนี้ไม่ได้ / Imported case changed or has dependent records');
      }
      await db.case.deleteMany({ where: { firmId: user.firmId, id: { in: ledger.cases.map(c => c.id) } } });
      for (const item of ledger.clients) {
        await db.$queryRaw`SELECT "id" FROM "Client" WHERE "id" = ${item.id} FOR UPDATE`;
        const c = await db.client.findFirst({ where: { id: item.id, firmId: user.firmId }, include: { _count: true } });
        if (!c || c.updatedAt.toISOString() !== item.updatedAt || Object.values(c._count).some(n => n > 0)) throw new ConflictException('ลูกความมีการใช้งานต่อแล้ว ยกเลิกชุดนี้ไม่ได้ / Imported client changed or is in use');
      }
      await db.client.deleteMany({ where: { firmId: user.firmId, id: { in: ledger.clients.map(c => c.id) } } });
      await db.dataImportBatch.update({ where: { id }, data: { status: 'UNDONE', undoneAt: new Date() } });
      await db.auditLog.create({ data: { firmId: user.firmId, userId: user.id, action: 'DATA_IMPORT_UNDONE', metadata: { batchId: id } } });
      return { undone: true };
    }, { timeout: 30000, isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }
  async listPlaybooks(user: AuthUser) { return this.prisma.playbookRelease.findMany({ where: { firmId: user.firmId }, orderBy: [{ name: 'asc' }, { version: 'desc' }], take: 200 }); }
  async publish(user: AuthUser, dto: { name: string; caseTypeId?: string; templateKey?: string; cargoTemplate?: CargoPlaybookTemplate; steps: PlaybookStep[] }) {
    this.owner(user);
    if (!dto.name.trim() || !dto.steps.length || dto.steps.some((s) => !s.title.trim())) throw new BadRequestException('ชื่อ Playbook และชื่อขั้นตอนห้ามว่าง / Name and step titles are required');
    if (dto.templateKey === CARGO_CLAIM_PLAYBOOK_KEY) {
      const requirements = dto.cargoTemplate?.requirements ?? [];
      if (!requirements.length || requirements.some((item) => !item.code.trim() || !item.label.trim()) || new Set(requirements.map((item) => item.code)).size !== requirements.length) {
        throw new BadRequestException('Cargo Playbook ต้องมีรายการเอกสารที่ code ไม่ซ้ำและชื่อไม่ว่าง');
      }
    } else if (dto.cargoTemplate) {
      throw new BadRequestException('Cargo template requires the Cargo Claim template key');
    }
    if (dto.caseTypeId && !(await this.prisma.caseType.count({ where: { id: dto.caseTypeId, firmId: user.firmId } }))) throw new BadRequestException('ไม่พบประเภทคดีนี้ในสำนักงาน / Case type not found in this firm');
    return this.prisma.$transaction(async db => {
      await db.$queryRaw`SELECT "id" FROM "Firm" WHERE "id" = ${user.firmId} FOR UPDATE`;
      const previous = await db.playbookRelease.findFirst({
        where: dto.templateKey
          ? { firmId: user.firmId, templateKey: dto.templateKey }
          : { firmId: user.firmId, name: dto.name.trim() },
        orderBy: { version: 'desc' },
      });
      // workType is a legacy required column, kept as a mirror of the
      // playbook's own name (its "work type") — caseTypeId is a separate,
      // optional link used only to auto-suggest this playbook on a case.
      const release = await db.playbookRelease.create({ data: { firmId: user.firmId, name: dto.name.trim(), workType: dto.name.trim(), caseTypeId: dto.caseTypeId ?? null, templateKey: dto.templateKey ?? null, cargoTemplate: dto.cargoTemplate ? json(dto.cargoTemplate) : undefined, steps: json(dto.steps), version: (previous?.version ?? 0) + 1, publishedById: user.id } });
      await db.auditLog.create({ data: { firmId: user.firmId, userId: user.id, action: 'PLAYBOOK_PUBLISHED', metadata: { releaseId: release.id, version: release.version } } }); return release;
    });
  }
  async ensureCargoPlaybook(user: AuthUser) {
    return this.prisma.$transaction(async db => {
      await db.$queryRaw`SELECT "id" FROM "Firm" WHERE "id" = ${user.firmId} FOR UPDATE`;
      const existing = await db.playbookRelease.findFirst({
        where: { firmId: user.firmId, templateKey: CARGO_CLAIM_PLAYBOOK_KEY },
        orderBy: { version: 'desc' },
      });
      if (existing) return existing;
      const template: CargoPlaybookTemplate = {
        requirements: CARGO_DOCUMENT_REQUIREMENTS.map((item) => ({ ...item })),
      };
      const release = await db.playbookRelease.create({
        data: {
          firmId: user.firmId,
          name: CARGO_CLAIM_PLAYBOOK_NAME,
          workType: CARGO_CLAIM_PLAYBOOK_NAME,
          templateKey: CARGO_CLAIM_PLAYBOOK_KEY,
          cargoTemplate: json(template),
          steps: json(CARGO_CLAIM_PLAYBOOK_STEPS),
          version: 1,
          publishedById: user.id,
        },
      });
      await db.auditLog.create({
        data: { firmId: user.firmId, userId: user.id, action: 'CARGO_PLAYBOOK_CREATED', metadata: { releaseId: release.id, version: 1 } },
      });
      return release;
    });
  }
  async previewPlaybook(user: AuthUser, caseId: string, releaseId: string, db: Prisma.TransactionClient = this.prisma) {
    const [c, release] = await Promise.all([db.case.findFirst({ where: { id: caseId, ...this.access.getCaseFilterForUser(user) } }), db.playbookRelease.findFirst({ where: { id: releaseId, firmId: user.firmId } })]);
    if (!c || !release) throw new NotFoundException('Case or playbook unavailable');
    if (c.status === 'CLOSED') throw new BadRequestException('Case is closed');
    const existing = await db.appliedPlaybook.findUnique({ where: { caseId_releaseId: { caseId, releaseId } } });
    const steps = release.steps as unknown as PlaybookStep[];
    return { release, existing, ownerId: c.leadLawyerId, steps };
  }
  async applyPlaybook(user: AuthUser, caseId: string, releaseId: string) {
    return this.prisma.$transaction(async db => {
      await db.$queryRaw`SELECT "id" FROM "Case" WHERE "id" = ${caseId} FOR UPDATE`;
      const preview = await this.previewPlaybook(user, caseId, releaseId, db);
      if (preview.existing) return preview.existing;
      const [team, firmMembers] = await Promise.all([
        db.caseAssignment.findMany({ where: { caseId }, select: { userId: true } }),
        db.firmMember.findMany({ where: { firmId: user.firmId }, select: { userId: true, role: true } }),
      ]);
      const teamIds = new Set([preview.ownerId, ...team.map(t => t.userId)]);
      const taskIds: string[] = [];
      for (const step of preview.steps) {
        const assigneeId = resolveAssignee({ primaryRole: step.primaryRole, secondaryRole: step.secondaryRole, firmMembers, teamIds, ownerId: preview.ownerId });
        const task = await db.task.create({ data: { caseId, title: step.title.trim(), description: step.instructions, assigneeId, createdById: user.id, labels: [`playbook:${releaseId}`] } });
        taskIds.push(task.id);
      }
      const applied = await db.appliedPlaybook.create({ data: { caseId, releaseId, startDate: new Date(), taskIds, appliedById: user.id } });
      await db.auditLog.create({ data: { firmId: user.firmId, userId: user.id, action: 'PLAYBOOK_APPLIED', metadata: { caseId, releaseId, taskIds } } }); return applied;
    }).then(async (applied) => {
      await this.automationLog.record({ firmId: user.firmId, automation: 'playbook-apply', trigger: { caseId, releaseId, by: user.id }, result: { taskIds: applied.taskIds } });
      return applied;
    });
  }

  /**
   * Steps due for a stage, drawn from every release already applied to the case
   * plus the latest version of each release matching the case's case type —
   * deduped by title so an applied release and its own case-type release don't
   * double up the same step.
   */
  async proposeStageTasks(user: AuthUser, caseId: string, stage: CaseStage, today: Date = new Date()): Promise<StageTaskProposal[]> {
    const c = await this.prisma.case.findFirst({ where: { id: caseId, ...this.access.getCaseFilterForUser(user) } });
    if (!c) throw new NotFoundException('Case not found');

    const [applied, byCaseType] = await Promise.all([
      this.prisma.appliedPlaybook.findMany({ where: { caseId }, include: { release: true } }),
      this.prisma.playbookRelease.findMany({ where: { firmId: user.firmId, caseTypeId: c.caseTypeId } }),
    ]);
    const latestByName = new Map<string, (typeof byCaseType)[number]>();
    for (const r of byCaseType) {
      const existing = latestByName.get(r.name);
      if (!existing || r.version > existing.version) latestByName.set(r.name, r);
    }
    const releases = [...applied.map((a) => a.release), ...latestByName.values()];

    const stepsByTitle = new Map<string, { step: PlaybookStep; releaseName: string }>();
    for (const release of releases) {
      for (const step of release.steps as unknown as PlaybookStep[]) {
        if (step.stage !== stage || stepsByTitle.has(step.title)) continue;
        stepsByTitle.set(step.title, { step, releaseName: release.name });
      }
    }
    if (!stepsByTitle.size) return [];

    const [team, firmMembers] = await Promise.all([
      this.prisma.caseAssignment.findMany({ where: { caseId }, select: { userId: true } }),
      this.prisma.firmMember.findMany({ where: { firmId: user.firmId }, select: { userId: true, role: true } }),
    ]);
    const teamIds = new Set([c.leadLawyerId, ...team.map((t) => t.userId)]);

    return Promise.all(
      [...stepsByTitle.values()].map(async ({ step, releaseName }) => ({
        title: step.title,
        description: step.instructions,
        dueDate:
          step.offsetDays == null
            ? null
            : this.deadlineRules.computeDueDate(
                today,
                step.offsetDays,
                (step.dayBasis ?? 'CALENDAR') as DeadlineDayBasis,
                await this.deadlineRules.loadHolidays(today, step.offsetDays, this.prisma),
              ),
        assigneeId: resolveAssignee({ primaryRole: step.primaryRole, secondaryRole: step.secondaryRole, firmMembers, teamIds, ownerId: c.leadLawyerId }),
        releaseName,
      })),
    );
  }

  /** Creates the confirmed subset of a stage's proposed tasks and notifies their assignees. */
  async createStageTasks(user: AuthUser, caseId: string, stage: CaseStage, tasks: StageTaskInput[]): Promise<{ created: number; taskIds: string[] }> {
    const c = await this.prisma.case.findFirst({ where: { id: caseId, ...this.access.getCaseFilterForUser(user) } });
    if (!c) throw new NotFoundException('Case not found');

    const assigneeIds = [...new Set(tasks.map((t) => t.assigneeId).filter((id): id is string => !!id))];
    if (assigneeIds.length) {
      const members = await this.prisma.firmMember.findMany({ where: { firmId: user.firmId, userId: { in: assigneeIds } }, select: { userId: true } });
      const memberIds = new Set(members.map((m) => m.userId));
      if (assigneeIds.some((id) => !memberIds.has(id))) throw new BadRequestException('ผู้รับผิดชอบต้องเป็นสมาชิกสำนักงาน / Assignee must be a firm member of this case');
    }

    const created = await Promise.all(
      tasks.map((t) =>
        this.prisma.task.create({
          data: {
            caseId,
            title: t.title.trim(),
            description: t.description ?? null,
            dueDate: t.dueDate ? new Date(t.dueDate) : null,
            assigneeId: t.assigneeId ?? null,
            createdById: user.id,
            labels: [`stage:${stage}`],
          },
        }),
      ),
    );
    const taskIds = created.map((t) => t.id);
    const userIds = [...new Set(created.map((t) => t.assigneeId).filter((id): id is string => !!id))];

    if (userIds.length) {
      try {
        await this.assignmentNotifier.notifyAssigned({
          firmId: user.firmId,
          userIds,
          actorUserId: user.id,
          summaryText: `งานใหม่จากขั้น ${stage}: ${taskIds.length} งาน`,
          entityPath: `/cases/${caseId}?tab=tasks`,
        });
      } catch {
        // LINE sends never fail the mutation that triggered them.
      }
    }

    await this.caseFeed.log({ caseId, userId: user.id, type: ActivityType.TASK, title: `สร้าง ${taskIds.length} งานจากขั้นคดี` });

    return { created: taskIds.length, taskIds };
  }
}

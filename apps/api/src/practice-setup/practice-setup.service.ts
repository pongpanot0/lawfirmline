import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AuthUser } from '@lawfirm/shared';
import { PrismaService } from '../prisma/prisma.module';
import { Prisma } from '../generated/prisma';
import { CaseAccessService } from '../common/services/case-access.service';
import { addBangkokDays } from '../common/utils/bangkok-time';
export interface ImportRow { clientName: string; caseRef: string; caseTitle: string }
export interface CheckedRow extends ImportRow { row: number; existingClientId: string | null; errors: string[] }
export interface Ledger { cases: { id: string; updatedAt: string }[]; clients: { id: string; updatedAt: string }[] }
export interface PlaybookStep { title: string; days: number; instructions: string; kind: 'TASK' | 'DOCUMENT' | 'APPROVAL'; parentIndex?: number; assigneeRole?: 'OWNER' | 'SENIOR_LAWYER' | 'LAWYER' | 'ASSISTANT' }
const json = (value: unknown): Prisma.InputJsonValue => JSON.parse(JSON.stringify(value));
@Injectable()
export class PracticeSetupService {
  constructor(private prisma: PrismaService, private access: CaseAccessService) {}
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
  async publish(user: AuthUser, dto: { name: string; workType: string; caseTypeId?: string; steps: PlaybookStep[] }) {
    this.owner(user);
    if (!dto.name.trim() || dto.steps.some((s, i) => !s.title.trim() || (s.parentIndex !== undefined && (s.parentIndex < 0 || s.parentIndex >= i)))) throw new BadRequestException('ชื่อและลำดับงานไม่ถูกต้อง / Invalid name or dependency order');
    if (dto.caseTypeId && !(await this.prisma.caseType.count({ where: { id: dto.caseTypeId, firmId: user.firmId } }))) throw new BadRequestException('ไม่พบประเภทคดีนี้ในสำนักงาน / Case type not found in this firm');
    return this.prisma.$transaction(async db => {
      await db.$queryRaw`SELECT "id" FROM "Firm" WHERE "id" = ${user.firmId} FOR UPDATE`;
      const previous = await db.playbookRelease.findFirst({ where: { firmId: user.firmId, name: dto.name.trim() }, orderBy: { version: 'desc' } });
      const release = await db.playbookRelease.create({ data: { firmId: user.firmId, name: dto.name.trim(), workType: dto.workType, caseTypeId: dto.caseTypeId ?? null, steps: json(dto.steps), version: (previous?.version ?? 0) + 1, publishedById: user.id } });
      await db.auditLog.create({ data: { firmId: user.firmId, userId: user.id, action: 'PLAYBOOK_PUBLISHED', metadata: { releaseId: release.id, version: release.version } } }); return release;
    });
  }
  async previewPlaybook(user: AuthUser, caseId: string, releaseId: string, startDate: string, db: Prisma.TransactionClient = this.prisma) {
    const [c, release] = await Promise.all([db.case.findFirst({ where: { id: caseId, ...this.access.getCaseFilterForUser(user) } }), db.playbookRelease.findFirst({ where: { id: releaseId, firmId: user.firmId } })]);
    if (!c || !release) throw new NotFoundException('Case or playbook unavailable');
    if (c.status === 'CLOSED') throw new BadRequestException('Case is closed');
    const existing = await db.appliedPlaybook.findUnique({ where: { caseId_releaseId: { caseId, releaseId } } });
    const steps = release.steps as unknown as PlaybookStep[];
    return { release, existing, ownerId: c.leadLawyerId, steps: steps.map(s => ({ ...s, dueAt: addBangkokDays(new Date(startDate), s.days).toISOString() })) };
  }
  async applyPlaybook(user: AuthUser, caseId: string, releaseId: string, startDate: string) {
    return this.prisma.$transaction(async db => {
      await db.$queryRaw`SELECT "id" FROM "Case" WHERE "id" = ${caseId} FOR UPDATE`;
      const preview = await this.previewPlaybook(user, caseId, releaseId, startDate, db);
      if (preview.existing) return preview.existing;
      // Role-based default assignee: prefer someone already on the case team
      // with the step's firm role, else any firm member with it, else the lead.
      const [team, firmMembers] = await Promise.all([
        db.caseAssignment.findMany({ where: { caseId }, select: { userId: true } }),
        db.firmMember.findMany({ where: { firmId: user.firmId }, select: { userId: true, role: true } }),
      ]);
      const teamIds = new Set([preview.ownerId, ...team.map(t => t.userId)]);
      const resolveAssignee = (role?: string) => {
        if (!role) return preview.ownerId;
        const withRole = firmMembers.filter(m => m.role === role);
        return withRole.find(m => teamIds.has(m.userId))?.userId ?? withRole[0]?.userId ?? preview.ownerId;
      };
      const taskIds: string[] = [];
      for (const step of preview.steps) { const task = await db.task.create({ data: { caseId, title: step.title.trim(), description: step.instructions, dueDate: new Date(step.dueAt), assigneeId: resolveAssignee(step.assigneeRole), createdById: user.id, labels: [`playbook:${preview.release.workType}`, `step:${step.kind}`], parentId: step.parentIndex !== undefined ? taskIds[step.parentIndex] : null } }); taskIds.push(task.id); }
      const applied = await db.appliedPlaybook.create({ data: { caseId, releaseId, startDate: new Date(startDate), taskIds, appliedById: user.id } });
      await db.auditLog.create({ data: { firmId: user.firmId, userId: user.id, action: 'PLAYBOOK_APPLIED', metadata: { caseId, releaseId, taskIds } } }); return applied;
    });
  }
}

import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { createHash, randomUUID } from 'crypto';
import { AuthUser } from '@lawfirm/shared';
import { PrismaService } from '../prisma/prisma.module';
import { Prisma } from '../generated/prisma';
import { CaseAccessService } from '../common/services/case-access.service';
import { FileStorageService } from '../common/services/file-storage.service';
import { PortalIdentity } from './client-portal-jwt.strategy';

export type WorkroomActor = { staff: AuthUser } | { portal: PortalIdentity };
export function portalRequestScope(user: PortalIdentity): Prisma.PortalIntakeSubmissionWhereInput {
  return { clientId: user.clientId, NOT: { revokedContactIds: { has: user.clientContactId } }, OR: [{ clientContactId: user.clientContactId }, { accessContactIds: { has: user.clientContactId } }] };
}
@Injectable()
export class PortalWorkroomService {
  constructor(private prisma: PrismaService, private access: CaseAccessService, private files: FileStorageService) {}
  private async scope(actor: WorkroomActor): Promise<Prisma.PortalIntakeSubmissionWhereInput> {
    if ('portal' in actor) return portalRequestScope(actor.portal);
    const u = actor.staff;
    return { client: { firmId: u.firmId }, ...(u.firmRole === 'OWNER' || u.firmRole === 'SENIOR_LAWYER' ? {} : { intake: await this.access.getIntakeFilterForUser(u) }) };
  }
  private async authorized(actor: WorkroomActor, id: string, db: Prisma.TransactionClient = this.prisma) {
    const s = await db.portalIntakeSubmission.findFirst({ where: { id, ...await this.scope(actor) } });
    if (!s) throw new NotFoundException('ไม่พบคำขอหรือไม่มีสิทธิ์ / Request unavailable');
    return s;
  }
  async list(user: AuthUser) {
    return this.prisma.portalIntakeSubmission.findMany({ where: await this.scope({ staff: user }), select: { id: true, title: true, referenceNumber: true, intakeId: true, submittedAt: true, deliveredAt: true }, orderBy: { submittedAt: 'desc' }, take: 200 });
  }
  async get(actor: WorkroomActor, id: string, before?: string) {
    const s = await this.authorized(actor, id);
    if (before && !await this.prisma.portalRequestMessage.findFirst({ where: { id: before, submissionId: id } })) throw new NotFoundException('Message cursor unavailable');
    const [messages, contacts, owner] = await Promise.all([
      this.prisma.portalRequestMessage.findMany({ where: { submissionId: id }, select: { id: true, authorId: true, authorKind: true, body: true, filename: true, size: true, createdAt: true }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 100, ...(before ? { cursor: { id: before }, skip: 1 } : {}) }),
      'staff' in actor ? this.prisma.clientContact.findMany({ where: { clientId: s.clientId, portalEnabled: true }, select: { id: true, name: true } }) : [],
      s.officeOwnerId ? this.prisma.user.findUnique({ where: { id: s.officeOwnerId }, select: { firstName: true, lastName: true } }) : null,
    ]);
    return { id: s.id, title: s.title, requestedDate: s.clientRequestedDate, scopeText: s.scopeText, proposedDate: s.proposedDate, agreedDate: s.agreedDate, commitmentVersion: s.commitmentVersion, accepted: s.commitmentVersion > 0 && s.acceptedCommitmentVersion === s.commitmentVersion, deliveredAt: s.deliveredAt, deliveryAcknowledgedAt: s.deliveryAcknowledgedAt, withdrawn: s.withdrawnByClient, owner: owner ? `${owner.firstName} ${owner.lastName}` : null, messages: [...messages].reverse(), nextCursor: messages.length === 100 ? messages[messages.length - 1].id : null, contacts,
      ...('staff' in actor ? { contactIds: [...new Set([s.clientContactId, ...s.accessContactIds])].filter(id => !s.revokedContactIds.includes(id)) } : {}) };
  }
  async message(actor: WorkroomActor, id: string, dto: { requestKey: string; body: string }, file?: Express.Multer.File) {
    await this.authorized(actor, id);
    if (!dto.body.trim() && !file) throw new BadRequestException('เพิ่มข้อความหรือไฟล์ / Add a message or file');
    const authorId = 'staff' in actor ? actor.staff.id : actor.portal.clientContactId;
    const authorKind = 'staff' in actor ? 'OFFICE' : 'CLIENT';
    const hash = createHash('sha256').update(JSON.stringify({ body: dto.body.trim(), file: file ? { digest: createHash('sha256').update(file.buffer).digest('hex'), name: file.originalname, mime: file.mimetype } : null })).digest('hex');
    const key = `portal-workroom/${id}/${randomUUID()}`;
    let stored: string | undefined;
    try {
      if (file) stored = await this.files.put(key, file.buffer, file.mimetype);
      const result = await this.prisma.$transaction(async db => {
        await db.$queryRaw`SELECT "id" FROM "PortalIntakeSubmission" WHERE "id" = ${id} FOR UPDATE`;
        const s = await this.authorized(actor, id, db);
        const existing = await db.portalRequestMessage.findUnique({ where: { submissionId_authorId_requestKey: { submissionId: id, authorId, requestKey: dto.requestKey } } });
        if (existing) {
          if (existing.contentHash !== hash) throw new ConflictException('ใช้รหัสส่งซ้ำกับเนื้อหาต่างกัน / Retry content changed');
          return { id: existing.id, duplicate: true };
        }
        if (s.withdrawnByClient) throw new BadRequestException('คำขอถูกถอนแล้ว / Request withdrawn');
        const row = await db.portalRequestMessage.create({ data: { submissionId: id, requestKey: dto.requestKey, contentHash: hash, authorId, authorKind, body: dto.body.trim(), filename: file ? Buffer.from(file.originalname, 'latin1').toString('utf8') : null, storagePath: stored, mimeType: file?.mimetype, size: file?.size } });
        return { id: row.id, duplicate: false };
      });
      if (result.duplicate && stored) await this.files.delete(stored);
      return result;
    } catch (e) { if (stored) await this.files.delete(stored); throw e; }
  }
  async file(actor: WorkroomActor, id: string, messageId: string) {
    await this.authorized(actor, id);
    const message = await this.prisma.portalRequestMessage.findFirst({ where: { id: messageId, submissionId: id } });
    if (!message?.storagePath || !message.filename) throw new NotFoundException('File unavailable');
    return { path: message.storagePath, filename: message.filename, mimeType: message.mimeType ?? 'application/octet-stream' };
  }
  async proposal(user: AuthUser, id: string, dto: { scopeText: string; proposedDate: string; version: number }) {
    if (user.firmRole === 'ASSISTANT') throw new ForbiddenException('ให้ทนายกำหนดขอบเขต / A lawyer must propose scope');
    return this.prisma.$transaction(async db => {
      await db.$queryRaw`SELECT "id" FROM "PortalIntakeSubmission" WHERE "id" = ${id} FOR UPDATE`;
      const s = await this.authorized({ staff: user }, id, db);
      if (!s.intakeId || s.withdrawnByClient || s.deliveredAt) throw new BadRequestException('รับเข้า F01 และตรวจสถานะก่อน / Receive into Intake before proposing scope');
      if (s.commitmentVersion !== dto.version) throw new ConflictException('ข้อเสนอเปลี่ยนแล้ว / Proposal changed');
      if (!dto.scopeText.trim()) throw new BadRequestException('ระบุขอบเขตงาน / Scope required');
      const updated = await db.portalIntakeSubmission.update({ where: { id }, data: { scopeText: dto.scopeText.trim(), proposedDate: new Date(dto.proposedDate), officeOwnerId: user.id, commitmentVersion: { increment: 1 }, acceptedCommitmentVersion: null, agreementAcceptedAt: null, agreedDate: null } });
      await db.auditLog.create({ data: { firmId: user.firmId, userId: user.id, action: 'PORTAL_SCOPE_PROPOSED', metadata: { submissionId: id, version: updated.commitmentVersion, scopeText: updated.scopeText, proposedDate: dto.proposedDate, previousScope: s.scopeText, previousAgreedDate: s.agreedDate?.toISOString() ?? null } } });
      return { version: updated.commitmentVersion };
    });
  }
  async accept(user: PortalIdentity, id: string, version: number, delivery = false) {
    return this.prisma.$transaction(async db => {
      await db.$queryRaw`SELECT "id" FROM "PortalIntakeSubmission" WHERE "id" = ${id} FOR UPDATE`;
      const s = await this.authorized({ portal: user }, id, db);
      if (s.withdrawnByClient || s.commitmentVersion !== version || !s.scopeText || !s.proposedDate) throw new ConflictException('ข้อเสนอเปลี่ยนหรือยังไม่มีข้อตกลง / Review the current proposal');
      if (delivery && !s.deliveredAt) throw new BadRequestException('ยังไม่ส่งมอบ / Not delivered');
      if ((delivery && s.deliveryAcknowledgedAt) || (!delivery && s.acceptedCommitmentVersion === version)) return { accepted: true };
      await db.portalIntakeSubmission.update({ where: { id }, data: delivery ? { deliveryAcknowledgedAt: new Date() } : { agreedDate: s.proposedDate, acceptedCommitmentVersion: version, agreementAcceptedAt: new Date() } });
      await db.portalRequestMessage.create({ data: { submissionId: id, requestKey: randomUUID(), contentHash: 'system', authorId: user.clientContactId, authorKind: 'SYSTEM', body: delivery ? 'ลูกค้ายืนยันได้รับงานแล้ว / Client acknowledged delivery' : `ลูกค้ายอมรับขอบเขตรุ่น ${version} และวันที่ ${s.proposedDate.toISOString().slice(0,10)} / Client accepted scope and delivery date` } });
      return { accepted: true };
    });
  }
  async deliver(user: AuthUser, id: string, messageId: string) {
    return this.prisma.$transaction(async db => {
      await db.$queryRaw`SELECT "id" FROM "PortalIntakeSubmission" WHERE "id" = ${id} FOR UPDATE`;
      const s = await this.authorized({ staff: user }, id, db);
      if (!s.agreedDate || s.acceptedCommitmentVersion !== s.commitmentVersion || s.withdrawnByClient) throw new BadRequestException('ต้องตกลงขอบเขตก่อนส่งมอบ / Agree scope before delivery');
      if (s.deliveredAt) return { delivered: true };
      if (!await db.portalRequestMessage.count({ where: { id: messageId, submissionId: id, authorKind: 'OFFICE' } })) throw new BadRequestException('ส่งข้อความหรือไฟล์งานก่อน / Add the deliverable message or file first');
      await db.portalIntakeSubmission.update({ where: { id }, data: { deliveredAt: new Date() } });
      await db.auditLog.create({ data: { firmId: user.firmId, userId: user.id, action: 'PORTAL_WORK_DELIVERED', metadata: { submissionId: id, version: s.commitmentVersion, messageId } } });
      return { delivered: true };
    });
  }
  async handover(user: AuthUser, id: string, dto: { fromContactId: string; toContactId: string }) {
    if (!['OWNER', 'SENIOR_LAWYER'].includes(user.firmRole)) throw new ForbiddenException('เจ้าของหรือทนายอาวุโสเท่านั้น / Owner or senior lawyer required');
    if (dto.fromContactId === dto.toContactId) throw new BadRequestException('เลือกผู้ติดต่อคนใหม่ / Select a different contact');
    return this.prisma.$transaction(async db => {
      await db.$queryRaw`SELECT "id" FROM "PortalIntakeSubmission" WHERE "id" = ${id} FOR UPDATE`;
      const s = await this.authorized({ staff: user }, id, db);
      if (![s.clientContactId, ...s.accessContactIds].includes(dto.fromContactId) || s.revokedContactIds.includes(dto.fromContactId)) throw new BadRequestException('ผู้ติดต่อเดิมไม่มีสิทธิ์แล้ว / Previous contact is no longer active');
      const contact = await db.clientContact.findFirst({ where: { id: dto.toContactId, clientId: s.clientId, portalEnabled: true } });
      if (!contact) throw new BadRequestException('เลือกผู้ติดต่อในลูกความรายเดียวกัน / Contact must belong to this client');
      await db.portalIntakeSubmission.update({ where: { id }, data: { accessContactIds: [...new Set([...s.accessContactIds, dto.toContactId])], revokedContactIds: [...new Set([...s.revokedContactIds.filter(c => c !== dto.toContactId), dto.fromContactId])] } });
      await db.auditLog.create({ data: { firmId: user.firmId, userId: user.id, action: 'PORTAL_REQUEST_HANDOVER', metadata: { submissionId: id, ...dto, sharedHistory: 'selected-request' } } });
      return { updated: true };
    });
  }
}

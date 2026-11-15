import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ActivityType, AuthUser, caseStageIndex, computeFeePackage, FeeComponent, FeeInputs, FeeMilestone, hasFirmCapability, MONEY_MAX, splitMilestones, validateFeePackage } from '@lawfirm/shared';
import { MilestoneStatus, NotificationCategory, Prisma, TaxClass } from '../generated/prisma';
import { PrismaService } from '../prisma/prisma.module';
import { CaseFeedService } from '../common/services/case-feed.service';
import { AssignmentNotifierService } from '../notifications/assignment-notifier.service';
import { CloseOutFeeDto, CreateFeePackageDto, PreviewFeePackageDto, SetCaseFeeDto, UpdateFeePackageDto } from './dto/fee-packages.dto';

type PackageSnapshot = { name: string; version: number; components: FeeComponent[]; milestones: FeeMilestone[] };
const json = (value: unknown) => value as Prisma.InputJsonValue;
const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const reached = (stage: string, current: string) => caseStageIndex(stage) >= 0 && caseStageIndex(stage) <= caseStageIndex(current);

@Injectable()
export class FeePackagesService {
  constructor(private prisma: PrismaService, private caseFeed: CaseFeedService, private notifier: AssignmentNotifierService) {}

  private authorize(user: AuthUser, writePackage = false) {
    if (!hasFirmCapability(user.firmRole, writePackage ? 'manageSubscription' : 'manageInvoices')) throw new ForbiddenException('ไม่มีสิทธิ์จัดการค่าธรรมเนียม');
  }

  private validate(components: unknown, milestones: unknown) {
    const errors = validateFeePackage({ components, milestones });
    if (errors.length) throw new BadRequestException(errors);
  }

  private async caseType(db: Prisma.TransactionClient, firmId: string, id: string) {
    if (!await db.caseType.findFirst({ where: { id, firmId } })) throw new BadRequestException('ไม่พบประเภทคดีของสำนักงาน');
  }

  private async activePackage(db: Prisma.TransactionClient, firmId: string, id: string) {
    const item = await db.feePackage.findFirst({ where: { id, firmId, archivedAt: null } });
    if (!item) throw new NotFoundException('ไม่พบแพ็กเกจของสำนักงาน');
    return item;
  }

  async list(user: AuthUser, caseTypeId?: string) {
    this.authorize(user);
    if (caseTypeId) await this.caseType(this.prisma, user.firmId, caseTypeId);
    return this.prisma.feePackage.findMany({ where: { firmId: user.firmId, archivedAt: null, ...(caseTypeId ? { caseTypeId } : {}) }, orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }, { id: 'asc' }] });
  }

  async create(user: AuthUser, dto: CreateFeePackageDto) {
    this.authorize(user, true);
    this.validate(dto.components, dto.milestones);
    await this.caseType(this.prisma, user.firmId, dto.caseTypeId);
    return this.prisma.feePackage.create({ data: { ...dto, components: json(dto.components), milestones: json(dto.milestones), firmId: user.firmId, createdById: user.id } });
  }

  update(user: AuthUser, id: string, dto: UpdateFeePackageDto) {
    this.authorize(user, true);
    return this.prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT "id" FROM "FeePackage" WHERE "id" = ${id} AND "firmId" = ${user.firmId} FOR UPDATE`;
      const item = await this.activePackage(tx, user.firmId, id);
      this.validate(dto.components ?? item.components, dto.milestones ?? item.milestones);
      if (dto.caseTypeId) await this.caseType(tx, user.firmId, dto.caseTypeId);
      return tx.feePackage.update({ where: { id, firmId: user.firmId }, data: {
        ...dto, components: dto.components === undefined ? undefined : json(dto.components),
        milestones: dto.milestones === undefined ? undefined : json(dto.milestones), version: { increment: 1 },
      } });
    });
  }

  async archive(user: AuthUser, id: string) {
    this.authorize(user, true);
    await this.activePackage(this.prisma, user.firmId, id);
    return this.prisma.feePackage.update({ where: { id, firmId: user.firmId }, data: { archivedAt: new Date(), version: { increment: 1 } } });
  }

  preview(user: AuthUser, dto: PreviewFeePackageDto) {
    this.authorize(user);
    this.validate(dto.components, dto.milestones ?? []);
    const result = this.compute(dto.components, dto.inputs);
    const amounts = splitMilestones(result.total, dto.milestones ?? []);
    return { ...result, milestones: (dto.milestones ?? []).map((m, i) => ({ ...m, amount: amounts[i] })) };
  }

  private compute(components: FeeComponent[], inputs: FeeInputs) {
    try { return computeFeePackage(components, inputs); }
    catch (error) { throw new BadRequestException(error instanceof Error ? error.message : 'ข้อมูลคำนวณไม่ถูกต้อง'); }
  }

  private async legalCase(db: Prisma.TransactionClient, firmId: string, caseId: string, lock = false) {
    if (lock) await db.$queryRaw`SELECT "id" FROM "Case" WHERE "id" = ${caseId} AND "firmId" = ${firmId} FOR UPDATE`;
    const item = await db.case.findFirst({ where: { id: caseId, firmId, deletedAt: null } });
    if (!item) throw new NotFoundException('ไม่พบคดี');
    return item;
  }

  private async fee(db: Prisma.TransactionClient, firmId: string, caseId: string, stage: string) {
    const fee = await db.caseFee.findFirst({ where: { caseId, firmId }, include: { milestones: { where: { firmId, caseId }, orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }] } } });
    return fee ? { ...fee, milestones: fee.milestones.map(m => ({ ...m, reached: reached(m.stage, stage) })) } : null;
  }

  async getCaseFee(user: AuthUser, caseId: string) {
    this.authorize(user);
    const legalCase = await this.legalCase(this.prisma, user.firmId, caseId);
    return this.fee(this.prisma, user.firmId, caseId, legalCase.stage);
  }

  setCaseFee(user: AuthUser, caseId: string, dto: SetCaseFeeDto) {
    this.authorize(user);
    return this.prisma.$transaction(async tx => {
      const legalCase = await this.legalCase(tx, user.firmId, caseId, true);
      const before = await this.fee(tx, user.firmId, caseId, legalCase.stage);
      const source = dto.packageId ? await this.activePackage(tx, user.firmId, dto.packageId) : null;
      if (source && source.caseTypeId !== legalCase.caseTypeId) throw new BadRequestException('แพ็กเกจไม่ตรงกับประเภทคดี');
      const snapshot: PackageSnapshot | null = source ? { name: source.name, version: source.version, components: source.components as unknown as FeeComponent[], milestones: source.milestones as unknown as FeeMilestone[] }
        : before?.packageSnapshot as unknown as PackageSnapshot ?? null;
      const computed = snapshot ? this.compute(snapshot.components, dto.inputs) : null;
      if (computed?.requiredInputs.some(key => (key.startsWith('unit:') ? dto.inputs.units?.[key.slice(5)] : dto.inputs[key as 'claimAmount' | 'recoveryAmount']) === undefined)) throw new BadRequestException('กรอกข้อมูลที่แพ็กเกจใช้คำนวณให้ครบ');
      const standardAmount = computed?.total ?? before?.standardAmount ?? dto.agreedAmount;
      const agreedAmount = dto.agreedAmount ?? standardAmount;
      if (agreedAmount === undefined || standardAmount === undefined || !Number.isFinite(agreedAmount) || agreedAmount < 0 || agreedAmount > MONEY_MAX || round2(agreedAmount) !== agreedAmount) throw new BadRequestException('ระบุค่าธรรมเนียมที่ตกลงให้ถูกต้อง');
      const reason = dto.overrideReason?.trim() || null;
      if (agreedAmount !== standardAmount && !reason) throw new BadRequestException('ระบุเหตุผลที่แก้ราคา');
      const milestones = snapshot?.milestones ?? [];
      const retained = before?.milestones.filter(m => m.status !== MilestoneStatus.PENDING) ?? [];
      // Settled/closed instalments retain their identity and amount; distribute only the remaining agreement.
      const remaining = round2(agreedAmount - retained.reduce((sum, m) => sum + m.amount, 0));
      const packageId = source?.id ?? before?.packageId ?? null;
      const previousMilestones = (before?.packageSnapshot as unknown as PackageSnapshot | null)?.milestones ?? [];
      const sourceId = (m: { sortOrder: number }) => packageId === before?.packageId ? previousMilestones[m.sortOrder]?.id : undefined;
      const pending = milestones.map((m, sortOrder) => ({ ...m, sortOrder })).filter(m => !retained.some(r => sourceId(r) === m.id));
      if (remaining < 0 || (milestones.length > 0 && !pending.length && remaining !== 0)) throw new BadRequestException('ยอดที่ตกลงต้องครอบคลุมงวดที่จัดการแล้ว');
      const percent = pending.reduce((sum, m) => sum + m.percent, 0);
      if (pending.length && remaining > 0 && percent === 0) throw new BadRequestException('งวดที่เหลือต้องมีสัดส่วนมากกว่า 0');
      const amounts = splitMilestones(remaining, pending.map(m => ({ ...m, percent: percent ? m.percent * 100 / percent : 0 })));
      const data = { packageId, packageSnapshot: snapshot ? json(snapshot) : Prisma.DbNull,
        inputs: json(dto.inputs), standardAmount, agreedAmount, overrideReason: reason, feeTaxClass: source?.feeTaxClass ?? before?.feeTaxClass ?? TaxClass.LITIGATION_EXEMPT, updatedById: user.id };
      const fee = before ? await tx.caseFee.update({ where: { id: before.id, firmId: user.firmId }, data })
        : await tx.caseFee.create({ data: { ...data, firmId: user.firmId, caseId } });
      // sortOrder also locates the source ID in the saved snapshot; keep that mapping after package reordering.
      for (const [index, m] of retained.entries()) {
        const position = milestones.findIndex(item => item.id === sourceId(m));
        const sortOrder = position < 0 ? milestones.length + index : position;
        if (sortOrder !== m.sortOrder) await tx.caseFeeMilestone.update({ where: { id: m.id, firmId: user.firmId, caseId }, data: { sortOrder } });
      }
      await tx.caseFeeMilestone.deleteMany({ where: { firmId: user.firmId, caseId, caseFeeId: fee.id, status: MilestoneStatus.PENDING } });
      if (pending.length) await tx.caseFeeMilestone.createMany({ data: pending.map((m, i) => {
        const previous = before?.milestones.find(p => sourceId(p) === m.id && p.status === MilestoneStatus.PENDING && p.label === m.label && p.stage === m.stage);
        return { ...(previous ? { id: previous.id, notifiedAt: previous.notifiedAt, reachedAt: previous.reachedAt } : {}),
          firmId: user.firmId, caseId, caseFeeId: fee.id, label: m.label, stage: m.stage, percent: m.percent, amount: amounts[i], sortOrder: m.sortOrder };
      }) });
      await tx.case.update({ where: { id: caseId, firmId: user.firmId }, data: { estimatedFee: agreedAmount } });
      await tx.auditLog.create({ data: { firmId: user.firmId, userId: user.id, action: 'CASE_FEE_CHANGED', metadata: {
        caseId, from: before ? { standardAmount: before.standardAmount, agreedAmount: before.agreedAmount, packageId: before.packageId } : null,
        to: { standardAmount, agreedAmount, packageId: data.packageId }, reason,
      } } });
      await this.caseFeed.log({ caseId, userId: user.id, type: ActivityType.NOTE, title: 'แก้ไขค่าธรรมเนียมคดี', description: `ตกลง ฿${agreedAmount.toFixed(2)}${reason ? ` · ${reason}` : ''}` }, tx);
      return this.fee(tx, user.firmId, caseId, legalCase.stage);
    });
  }

  closeOut(user: AuthUser, caseId: string, dto: CloseOutFeeDto) {
    this.authorize(user);
    return this.prisma.$transaction(async tx => {
      const legalCase = await this.legalCase(tx, user.firmId, caseId, true);
      if (new Set(dto.items.map(i => i.milestoneId)).size !== dto.items.length) throw new BadRequestException('เลือกงวดซ้ำ');
      for (const item of dto.items) {
        const m = await tx.caseFeeMilestone.findFirst({ where: { id: item.milestoneId, firmId: user.firmId, caseId, invoiceId: null, status: { in: ['PENDING', 'PARTIAL'] } } });
        if (!m) throw new BadRequestException('ไม่พบงวดที่ยังเรียกเก็บได้ในคดีนี้');
        const reason = item.reason?.trim() || null;
        if (item.action === 'WAIVE' && !reason) throw new BadRequestException('ระบุเหตุผลที่ยกเว้นค่าธรรมเนียม');
        if (item.action === 'PARTIAL' && (item.amount === undefined || !Number.isFinite(item.amount) || item.amount < 0 || item.amount > m.amount || round2(item.amount) !== item.amount)) throw new BadRequestException('ยอดเก็บบางส่วนต้องไม่เกินยอดงวด');
        await tx.caseFeeMilestone.update({ where: { id: m.id, firmId: user.firmId, caseId }, data: {
          status: item.action === 'WAIVE' ? 'WAIVED' : item.action === 'PARTIAL' ? 'PARTIAL' : 'PENDING',
          closeAmount: item.action === 'WAIVE' ? 0 : item.action === 'PARTIAL' ? item.amount : m.amount, closeReason: reason,
        } });
      }
      return this.fee(tx, user.firmId, caseId, legalCase.stage);
    });
  }

  async milestonesDue(user: AuthUser) {
    this.authorize(user);
    const rows = await this.prisma.caseFeeMilestone.findMany({ where: { firmId: user.firmId, invoiceId: null, status: { in: ['PENDING', 'PARTIAL'] }, case: { firmId: user.firmId, deletedAt: null } },
      include: { case: { select: { id: true, ownRef: true, title: true, stage: true } }, caseFee: { select: { feeTaxClass: true } } }, orderBy: [{ caseId: 'asc' }, { sortOrder: 'asc' }] });
    return rows.filter(m => reached(m.stage, m.case.stage)).map(m => ({ ...m, reached: true }));
  }

  async onStageChanged(caseId: string, firmId: string) {
    const due = await this.prisma.$transaction(async tx => {
      const legalCase = await this.legalCase(tx, firmId, caseId, true);
      const rows = await tx.caseFeeMilestone.findMany({ where: { firmId, caseId, status: 'PENDING', invoiceId: null, notifiedAt: null }, orderBy: { sortOrder: 'asc' } });
      const due = rows.filter(m => reached(m.stage, legalCase.stage));
      const now = new Date();
      // shortcut: notification claims are at-most-once; use an outbox if delivery retries are required.
      for (const m of due) await tx.caseFeeMilestone.update({ where: { id: m.id, firmId, caseId }, data: { reachedAt: m.reachedAt ?? now, notifiedAt: now } });
      return { legalCase, milestones: due };
    });
    for (const m of due.milestones) {
      const params = { firmId, actorUserId: '', category: NotificationCategory.BILLING,
        summaryText: `ถึงงวด ${m.label} ของคดี ${due.legalCase.ownRef} · ฿${(m.closeAmount ?? m.amount).toLocaleString('th-TH', { minimumFractionDigits: 2 })} — ออกใบแจ้งหนี้ได้`, entityPath: `/cases/${caseId}?tab=billing` };
      // Exclude the lead from the owners call: a lead who is also owner receives one message.
      await this.notifier.notifyFirmOwners({ ...params, actorUserId: due.legalCase.leadLawyerId });
      await this.notifier.notifyAssigned({ ...params, userIds: [due.legalCase.leadLawyerId] });
    }
  }
}

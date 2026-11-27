import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  ActivityType,
  AnswerDeadlineItem,
  AnswerExtensionStatus,
  AuthUser,
  CaseStatus,
  CourtFollowUpItem,
  CourtFollowUpKind,
  CourtLevel,
  COURT_FOLLOW_UP_LABELS,
  PartyRole,
  SERVICE_METHOD_LABELS,
  ServiceMethod,
  answerDueDate,
} from '@lawfirm/shared';
import { Case, CourtFollowUp, Prisma } from '../generated/prisma';
import { PrismaService } from '../prisma/prisma.module';
import { CaseFeedService } from '../common/services/case-feed.service';
import { syncManagedDeadlineEvent } from '../common/managed-deadline-event';
import { addBangkokDays, bangkokDayKey, courtCloseAt, formatBangkokDateThai } from '../common/utils/bangkok-time';
import { CreateAnswerExtensionDto, RecordCourtFollowUpDto, UpdateAnswerExtensionDto } from './dto/court-workflow.dto';
import { currentLevel } from './proceeding-mirror';

type ReminderTarget = 'follow-ups' | 'answer-deadline';
type WorkflowCase = Pick<Case, 'id' | 'partyRole' | 'courtLevel' | 'answerDueAt' | 'answerDeadlineEventId'>;

const ANSWER_DEADLINE_TITLE = 'ครบกำหนดยื่นคำให้การ';

function isDefendantSide(legalCase: WorkflowCase) {
  return legalCase.partyRole === PartyRole.DEFENDANT || legalCase.partyRole === PartyRole.RESPONDENT;
}

function followUpItem(row: CourtFollowUp): CourtFollowUpItem {
  return {
    kind: row.kind,
    dueAt: row.dueAt.toISOString(),
    doneAt: row.doneAt?.toISOString() ?? null,
    lastResult: row.lastResult,
    attempts: row.attempts,
  };
}

@Injectable()
export class CourtWorkflowService {
  private readonly logger = new Logger(CourtWorkflowService.name);

  constructor(private prisma: PrismaService, private caseFeed: CaseFeedService) {}

  private async loadCase(db: Prisma.TransactionClient, user: AuthUser, caseId: string, write = false) {
    if (write) {
      // Serialize edits on the case so grant validation and reminder links use current values.
      await db.$queryRaw`SELECT "id" FROM "Case" WHERE "id" = ${caseId} AND "firmId" = ${user.firmId} AND "deletedAt" IS NULL FOR NO KEY UPDATE`;
    }
    const legalCase = await db.case.findFirst({
      where: { id: caseId, firmId: user.firmId, deletedAt: null },
      select: {
        id: true, status: true, partyRole: true, courtLevel: true,
        answerDueAt: true, answerDeadlineEventId: true,
      },
    });
    if (!legalCase) throw new NotFoundException('Case not found');
    if (write && (legalCase.status === CaseStatus.CLOSED || legalCase.status === CaseStatus.ARCHIVED)) {
      throw new BadRequestException('คดีปิดแล้ว');
    }
    return legalCase;
  }

  async recordFiling(
    tx: Prisma.TransactionClient, user: AuthUser, caseId: string, level: CourtLevel, filedAt: Date,
  ): Promise<ReminderTarget | undefined> {
    if (level !== CourtLevel.TRIAL) return;
    // Take the proceeding lock first, in the same order as mirroring and judgment.
    const [previous] = await tx.$queryRaw<{ filedAt: Date | null }[]>`
      SELECT "filedAt" FROM "CaseProceeding"
      WHERE "caseId" = ${caseId} AND "courtLevel" = ${level}::"CourtLevel"
      FOR NO KEY UPDATE
    `;
    const legalCase = await this.loadCase(tx, user, caseId, true);
    if (isDefendantSide(legalCase)) return;

    const changed = !previous?.filedAt || bangkokDayKey(previous.filedAt) !== bangkokDayKey(filedAt);
    await this.scheduleFilingFollowUp(tx, user.id, caseId, CourtFollowUpKind.ACCEPTANCE, addBangkokDays(filedAt, 7), changed);
    await this.scheduleFilingFollowUp(tx, user.id, caseId, CourtFollowUpKind.SERVICE, addBangkokDays(filedAt, 14), changed);
    return 'follow-ups';
  }

  async recordService(
    tx: Prisma.TransactionClient, user: AuthUser, caseId: string, servedAt: Date, method: ServiceMethod,
  ): Promise<ReminderTarget | undefined> {
    const legalCase = await this.loadCase(tx, user, caseId, true);
    const answerAt = answerDueDate(servedAt, method);
    if (isDefendantSide(legalCase)) {
      await tx.case.update({ where: { id: caseId }, data: { answerDueAt: answerAt } });
      return 'answer-deadline';
    }
    if (currentLevel(legalCase) !== CourtLevel.TRIAL) return;

    const service = CourtFollowUpKind.SERVICE;
    const result = { doneAt: servedAt, lastResult: `ส่งหมายแล้ว (${SERVICE_METHOD_LABELS[method]})` };
    await tx.courtFollowUp.upsert({
      where: { caseId_kind: { caseId, kind: service } },
      create: { caseId, kind: service, createdById: user.id, dueAt: courtCloseAt(bangkokDayKey(servedAt)), ...result },
      update: result,
    });
    const answer = CourtFollowUpKind.ANSWER;
    const dueAt = courtCloseAt(bangkokDayKey(answerAt));
    await tx.courtFollowUp.upsert({
      where: { caseId_kind: { caseId, kind: answer } },
      create: { caseId, kind: answer, createdById: user.id, dueAt },
      update: { dueAt },
    });
    return 'follow-ups';
  }

  async syncAfterProceeding(user: AuthUser, caseId: string, target: ReminderTarget) {
    try {
      await this.prisma.$transaction(async (tx) => {
        const legalCase = await this.loadCase(tx, user, caseId, true);
        if (target === 'follow-ups') {
          const rows = await tx.courtFollowUp.findMany({ where: { caseId } });
          for (const row of rows) await this.syncFollowUp(tx, legalCase, row);
        } else {
          await this.syncAnswerDeadline(tx, legalCase);
        }
      });
    } catch (err) {
      this.logger.warn(`court workflow reminder sync failed for case ${caseId}: ${(err as Error).message}`);
    }
  }

  private async scheduleFilingFollowUp(
    tx: Prisma.TransactionClient,
    createdById: string,
    caseId: string,
    kind: CourtFollowUpKind,
    dueDay: Date,
    moveOpen: boolean,
  ) {
    const dueAt = courtCloseAt(bangkokDayKey(dueDay));
    await tx.courtFollowUp.upsert({
      where: { caseId_kind: { caseId, kind } },
      create: { caseId, kind, dueAt, createdById },
      update: {},
    });
    if (moveOpen) {
      await tx.courtFollowUp.updateMany({
        where: { caseId, kind, doneAt: null, dueAt: { not: dueAt } }, data: { dueAt },
      });
    }
  }

  private async syncFollowUp(tx: Prisma.TransactionClient, legalCase: WorkflowCase, row: CourtFollowUp) {
    const eventId = await syncManagedDeadlineEvent(
      tx, legalCase.id, row.calendarEventId, row.doneAt ? null : row.dueAt, COURT_FOLLOW_UP_LABELS[row.kind],
    );
    if (eventId !== row.calendarEventId) {
      await tx.courtFollowUp.update({ where: { id: row.id }, data: { calendarEventId: eventId } });
    }
  }

  async listFollowUps(user: AuthUser, caseId: string): Promise<CourtFollowUpItem[]> {
    await this.loadCase(this.prisma, user, caseId);
    const rows = await this.prisma.courtFollowUp.findMany({ where: { caseId }, orderBy: { kind: 'asc' } });
    return rows.map(followUpItem);
  }

  async recordFollowUpResult(user: AuthUser, caseId: string, kind: CourtFollowUpKind, dto: RecordCourtFollowUpDto) {
    const result = dto.result.trim();
    if (!result) throw new BadRequestException('กรุณาระบุผลการโทรถามศาล');

    return this.prisma.$transaction(async (tx) => {
      const legalCase = await this.loadCase(tx, user, caseId, true);
      if (isDefendantSide(legalCase) || currentLevel(legalCase) !== CourtLevel.TRIAL) {
        throw new BadRequestException('ติดตามการยื่นฟ้องได้เฉพาะฝ่ายโจทก์ในศาลชั้นต้น');
      }

      const where = { caseId_kind: { caseId, kind } };
      if (!await tx.courtFollowUp.findUnique({ where, select: { id: true } })) {
        throw new NotFoundException('Court follow-up not found');
      }
      const now = new Date();
      const row = await tx.courtFollowUp.update({
        where,
        data: {
          lastResult: result,
          attempts: { increment: 1 },
          doneAt: dto.done ? now : null,
          ...(dto.done ? {} : { dueAt: courtCloseAt(bangkokDayKey(addBangkokDays(now, dto.retryInDays ?? 7))) }),
        },
      });

      await this.caseFeed.log({
        caseId, userId: user.id, type: ActivityType.DEADLINE,
        title: COURT_FOLLOW_UP_LABELS[kind], description: result, at: now,
      }, tx);
      await this.syncFollowUp(tx, legalCase, row);
      return followUpItem(row);
    });
  }

  private async answerDeadline(db: Prisma.TransactionClient, legalCase: WorkflowCase, ignoreExtensionId?: string) {
    const extensions = await db.answerExtension.findMany({
      where: { caseId: legalCase.id },
      orderBy: [{ filedAt: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
    });
    let latestGrant: Date | null = null;
    for (const extension of extensions) {
      if (extension.id === ignoreExtensionId) continue;
      if (extension.status === AnswerExtensionStatus.GRANTED && extension.grantedUntil &&
        (!latestGrant || extension.grantedUntil > latestGrant)) {
        latestGrant = extension.grantedUntil;
      }
    }
    const effectiveDueAt = latestGrant ?? legalCase.answerDueAt;
    return {
      answerDueAt: legalCase.answerDueAt,
      effectiveDueAt,
      fileBy: effectiveDueAt ? addBangkokDays(effectiveDueAt, -1) : null,
      extensions,
    };
  }

  private async syncAnswerDeadline(db: Prisma.TransactionClient, legalCase: WorkflowCase) {
    const deadline = await this.answerDeadline(db, legalCase);
    const eventId = await syncManagedDeadlineEvent(
      db, legalCase.id, legalCase.answerDeadlineEventId, deadline.effectiveDueAt, ANSWER_DEADLINE_TITLE,
      deadline.fileBy ? `ยื่นไม่เกิน ${formatBangkokDateThai(deadline.fileBy)}` : null,
    );
    if (eventId !== legalCase.answerDeadlineEventId) {
      await db.case.update({ where: { id: legalCase.id }, data: { answerDeadlineEventId: eventId } });
    }
    return deadline;
  }

  private deadlineItem(deadline: Awaited<ReturnType<CourtWorkflowService['answerDeadline']>>): AnswerDeadlineItem {
    return {
      answerDueAt: deadline.answerDueAt?.toISOString() ?? null,
      effectiveDueAt: deadline.effectiveDueAt?.toISOString() ?? null,
      fileBy: deadline.fileBy?.toISOString() ?? null,
      extensions: deadline.extensions.map(({ id, filedAt, requestedUntil, status, grantedUntil }) => ({
        id,
        filedAt: filedAt.toISOString(),
        requestedUntil: requestedUntil.toISOString(),
        status,
        grantedUntil: grantedUntil?.toISOString() ?? null,
      })),
    };
  }

  async getAnswerDeadline(user: AuthUser, caseId: string) {
    const legalCase = await this.loadCase(this.prisma, user, caseId);
    return this.deadlineItem(await this.answerDeadline(this.prisma, legalCase));
  }

  private async changeAnswerDeadline(
    user: AuthUser,
    caseId: string,
    change: (tx: Prisma.TransactionClient, legalCase: WorkflowCase) => Promise<void>,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const legalCase = await this.loadCase(tx, user, caseId, true);
      if (!isDefendantSide(legalCase)) throw new BadRequestException('กำหนดยื่นคำให้การใช้สำหรับฝ่ายจำเลยหรือผู้คัดค้าน');
      await change(tx, legalCase);
      return this.deadlineItem(await this.syncAnswerDeadline(tx, legalCase));
    });
  }

  setAnswerDeadline(user: AuthUser, caseId: string, answerDueAt: string) {
    return this.changeAnswerDeadline(user, caseId, async (tx, legalCase) => {
      legalCase.answerDueAt = new Date(answerDueAt);
      await tx.case.update({ where: { id: caseId }, data: { answerDueAt: legalCase.answerDueAt } });
    });
  }

  createAnswerExtension(user: AuthUser, caseId: string, dto: CreateAnswerExtensionDto) {
    return this.changeAnswerDeadline(user, caseId, async (tx) => {
      await tx.answerExtension.create({
        data: { caseId, createdById: user.id, filedAt: new Date(dto.filedAt), requestedUntil: new Date(dto.requestedUntil) },
      });
    });
  }

  updateAnswerExtension(user: AuthUser, caseId: string, extId: string, dto: UpdateAnswerExtensionDto) {
    return this.changeAnswerDeadline(user, caseId, async (tx, legalCase) => {
      const { extensions } = await this.answerDeadline(tx, legalCase);
      if (!extensions.some(({ id }) => id === extId)) throw new NotFoundException('Answer extension not found');
      // Compare against the deadline without this extension's own grant, so a typo in it can be corrected downward.
      const { effectiveDueAt } = await this.answerDeadline(tx, legalCase, extId);

      let grantedUntil: Date | null = null;
      if (dto.status === AnswerExtensionStatus.GRANTED) {
        if (!dto.grantedUntil) throw new BadRequestException('กรุณาระบุวันที่ศาลอนุญาตให้ขยายถึง');
        grantedUntil = new Date(dto.grantedUntil);
        if (effectiveDueAt && bangkokDayKey(grantedUntil) < bangkokDayKey(effectiveDueAt)) {
          throw new BadRequestException('วันที่ศาลอนุญาตต้องไม่ก่อนกำหนดยื่นคำให้การเดิม');
        }
      }
      await tx.answerExtension.update({ where: { id: extId, caseId }, data: { status: dto.status, grantedUntil } });
    });
  }
}

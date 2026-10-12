import { BadRequestException, forwardRef, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  ActivityType,
  AuthUser,
  COURT_LEVEL_LABELS,
  CaseStage,
  CaseStatus,
  CourtLevel,
  DeadlineTrigger,
  JUDGMENT_OUTCOME_LABELS,
  SERVICE_METHOD_LABELS,
  ServiceMethod,
  caseStageIndex,
} from '@lawfirm/shared';
import { PrismaService } from '../prisma/prisma.module';
import { NotificationCategory, Prisma } from '../generated/prisma';
import { CaseFeedService } from '../common/services/case-feed.service';
import { DeadlineRulesService } from '../deadlines/deadline-rules.service';
import { AssignmentNotifierService } from '../notifications/assignment-notifier.service';
import { syncLimitationReminder } from '../common/limitation-reminder';
import { formatBangkokDateThai } from '../common/utils/bangkok-time';
import {
  currentLevel,
  ensureProceeding,
  mirrorProceeding,
  saveCaseNumbers,
  snapshotCurrentLevel,
  sortProceedings,
} from './proceeding-mirror';
import {
  RecordAppealServedDto,
  RecordFilingDto,
  RecordJudgmentDto,
  RecordServiceDto,
  UpdateProceedingDto,
} from './dto/proceeding.dto';

const blank = (value?: string) => (value?.trim() ? value.trim() : undefined);
const key = (caseId: string, courtLevel: CourtLevel) => ({ caseId_courtLevel: { caseId, courtLevel } });

type OpenCase = Awaited<ReturnType<CaseProceedingsService['openCase']>>;

/**
 * The court-side facts of a case (filing, service, judgment, appeal copy). Each
 * one is a procedural clock: recording it fires the matching deadline trigger,
 * which only ever raises PENDING suggestions for the lead lawyer to confirm.
 *
 * The engine runs before the save and outside the transaction: it sends its own
 * notice to the lead, and a failed save retried later is deduped by its PENDING
 * check, whereas a save that committed before a failed trigger would leave the
 * judgment's double-submit guard blocking the clock for good.
 */
@Injectable()
export class CaseProceedingsService {
  private readonly logger = new Logger(CaseProceedingsService.name);

  constructor(
    private prisma: PrismaService,
    private caseFeed: CaseFeedService,
    @Inject(forwardRef(() => DeadlineRulesService)) private deadlines: DeadlineRulesService,
    private notifier: AssignmentNotifierService,
  ) {}

  private async openCase(user: AuthUser, caseId: string, allowClosed = false) {
    const legalCase = await this.prisma.case.findFirst({
      where: { id: caseId, firmId: user.firmId, deletedAt: null },
      select: {
        id: true, firmId: true, caseTypeId: true, status: true, stage: true, courtLevel: true,
        courtName: true, blackCaseNumber: true, redCaseNumber: true, ownRef: true, leadLawyerId: true,
      },
    });
    if (!legalCase) throw new NotFoundException('Case not found');
    if (!allowClosed && (legalCase.status === CaseStatus.CLOSED || legalCase.status === CaseStatus.ARCHIVED)) {
      throw new BadRequestException('คดีปิดแล้ว');
    }
    return legalCase;
  }

  /**
   * The proceeding row at `level`, created when missing. At the case's own level the
   * case's current numbers are kept first, so mirroring afterwards never blanks them.
   */
  private prepare(tx: Prisma.TransactionClient, legalCase: OpenCase, level: CourtLevel) {
    return level === currentLevel(legalCase)
      ? snapshotCurrentLevel(tx, legalCase)
      : ensureProceeding(tx, legalCase.id, level);
  }

  private fire(
    user: AuthUser,
    legalCase: OpenCase,
    trigger: DeadlineTrigger,
    triggerDate: Date,
    extra: { courtLevel?: CourtLevel; serviceMethod?: ServiceMethod; notify?: boolean } = {},
  ) {
    return this.deadlines.applyTrigger({
      caseId: legalCase.id,
      firmId: legalCase.firmId,
      caseTypeId: legalCase.caseTypeId,
      trigger,
      triggerDate,
      // No calendar event behind these; the engine dedupes on PENDING rows instead.
      triggerEventId: null,
      createdById: user.id,
      ...extra,
    });
  }

  /**
   * A re-recorded date must not leave the old date's PENDING cards behind: the engine
   * skips a rule that already has one, so the stale date would win. Confirmed and
   * dismissed cards stay. Rules for that level and level-less rules go. Only for
   * filing and judgment, which happen once per level; service and appeal copy can
   * repeat for different parties, so they never clear.
   */
  private clearPending(caseId: string, trigger: DeadlineTrigger, courtLevel: CourtLevel) {
    return this.prisma.documentDateSuggestion.deleteMany({
      where: {
        caseId,
        status: 'PENDING',
        source: 'RULE',
        triggerEventId: null,
        deadlineRule: { trigger, OR: [{ courtLevel }, { courtLevel: null }] },
      },
    });
  }

  /** Move forward to `to` only if the case is earlier; never backwards. */
  private async advanceStage(tx: Prisma.TransactionClient, user: AuthUser, legalCase: OpenCase, to: CaseStage) {
    if (caseStageIndex(legalCase.stage) >= caseStageIndex(to)) return;
    await tx.case.update({ where: { id: legalCase.id }, data: { stage: to, stageChangedAt: new Date() } });
    await this.caseFeed.log(
      {
        caseId: legalCase.id,
        userId: user.id,
        type: ActivityType.STAGE_CHANGE,
        title: `ขั้นตอนคดี: ${legalCase.stage} → ${to}`,
        stageTransition: { from: legalCase.stage, to, status: legalCase.status },
      },
      tx,
    );
  }

  /** Filing, judgment and number edits change whether the ครบอายุความ reminder is wanted; a failure never breaks them. */
  private async syncLimitation(caseId: string) {
    try {
      await syncLimitationReminder(this.prisma, caseId);
    } catch (err) {
      this.logger.warn(`limitation reminder sync failed for case ${caseId}: ${(err as Error).message}`);
    }
  }

  async list(user: AuthUser, caseId: string) {
    await this.openCase(user, caseId, true);
    return sortProceedings(await this.prisma.caseProceeding.findMany({ where: { caseId } }));
  }

  async update(user: AuthUser, caseId: string, courtLevel: CourtLevel, dto: UpdateProceedingDto) {
    const legalCase = await this.openCase(user, caseId);
    const proceeding = await this.prisma.$transaction(async (tx) => {
      await this.prepare(tx, legalCase, courtLevel);
      await saveCaseNumbers(tx, caseId, courtLevel, dto);
      if (courtLevel === currentLevel(legalCase)) await mirrorProceeding(tx, caseId);
      return tx.caseProceeding.findUnique({ where: key(caseId, courtLevel) });
    });
    await this.syncLimitation(caseId);
    return proceeding;
  }

  async recordFiling(user: AuthUser, caseId: string, dto: RecordFilingDto) {
    const legalCase = await this.openCase(user, caseId);
    const level = dto.courtLevel ?? currentLevel(legalCase);
    const filedAt = new Date(dto.filedAt);

    const before = await this.prisma.caseProceeding.findUnique({ where: key(caseId, level) });
    if (before?.filedAt && before.filedAt.getTime() !== filedAt.getTime()) {
      await this.clearPending(caseId, DeadlineTrigger.FILED, level);
    }
    const suggestions = await this.fire(user, legalCase, DeadlineTrigger.FILED, filedAt, { courtLevel: level });
    const proceeding = await this.prisma.$transaction(async (tx) => {
      await this.prepare(tx, legalCase, level);
      const row = await tx.caseProceeding.upsert({
        where: key(caseId, level),
        create: { caseId, courtLevel: level, filedAt },
        update: {
          filedAt,
          ...(blank(dto.blackCaseNumber) ? { blackCaseNumber: blank(dto.blackCaseNumber) } : {}),
          ...(blank(dto.courtName) ? { courtName: blank(dto.courtName) } : {}),
        },
      });
      if (level === currentLevel(legalCase)) await mirrorProceeding(tx, caseId);
      await this.caseFeed.log(
        {
          caseId, userId: user.id, type: ActivityType.FILING,
          title: `ยื่นฟ้อง${row.blackCaseNumber ? ` คดีหมายเลขดำที่ ${row.blackCaseNumber}` : ''}`,
          at: filedAt,
        },
        tx,
      );
      await this.advanceStage(tx, user, legalCase, CaseStage.FILING);
      return row;
    });
    await this.syncLimitation(caseId);
    return { proceeding, suggestions };
  }

  async recordService(user: AuthUser, caseId: string, dto: RecordServiceDto) {
    const legalCase = await this.openCase(user, caseId);
    const servedAt = new Date(dto.servedAt);
    // Never clears pending cards: each defendant served on its own day needs its own
    // answer deadline (ม.177). The engine dedupes per rule and due day.
    const suggestions = await this.fire(user, legalCase, DeadlineTrigger.COMPLAINT_SERVED, servedAt, {
      serviceMethod: dto.method,
    });
    await this.caseFeed.log({
      caseId, userId: user.id, type: ActivityType.DEADLINE,
      title: `ส่งหมายเรียกและสำเนาคำฟ้องแล้ว (${SERVICE_METHOD_LABELS[dto.method]})`,
      at: servedAt,
    });
    const proceeding = await this.prisma.caseProceeding.findUnique({ where: key(caseId, currentLevel(legalCase)) });
    return { proceeding, suggestions };
  }

  async recordJudgment(user: AuthUser, caseId: string, dto: RecordJudgmentDto) {
    const legalCase = await this.openCase(user, caseId);
    const judgmentAt = new Date(dto.judgmentAt);

    // A double-submitted form (same level, same date) must not fire a second set of
    // deadlines, log twice or notify twice; it only re-saves the details, so a
    // corrected outcome or amount still lands (logged as a correction). A new date
    // replaces the old date's pending deadlines.
    // ponytail: two truly simultaneous requests can both pass this read; the engine's
    // PENDING check still stops duplicate suggestions — add a row lock if the double notice matters.
    const before = await this.prisma.caseProceeding.findUnique({ where: key(caseId, dto.courtLevel) });
    const repeat = before?.judgmentAt?.getTime() === judgmentAt.getTime();

    const corrected =
      repeat &&
      (before.judgmentOutcome !== dto.outcome ||
        (before.judgmentAmount == null ? null : Number(before.judgmentAmount)) !== (dto.amount ?? null) ||
        (blank(dto.redCaseNumber) !== undefined && blank(dto.redCaseNumber) !== before.redCaseNumber) ||
        (dto.note?.trim() || null) !== (before.judgmentNote ?? null));

    if (before?.judgmentAt && !repeat) await this.clearPending(caseId, DeadlineTrigger.JUDGMENT, dto.courtLevel);
    // notify: false — the judgment notice below already names the deadline.
    const suggestions = repeat
      ? 0
      : await this.fire(user, legalCase, DeadlineTrigger.JUDGMENT, judgmentAt, { courtLevel: dto.courtLevel, notify: false });
    const details = {
      judgmentAt,
      judgmentOutcome: dto.outcome,
      judgmentAmount: dto.amount ?? null,
      judgmentNote: dto.note?.trim() || null,
      ...(blank(dto.redCaseNumber) ? { redCaseNumber: blank(dto.redCaseNumber) } : {}),
    };
    const proceeding = await this.prisma.$transaction(async (tx) => {
      await this.prepare(tx, legalCase, dto.courtLevel);
      const row = await tx.caseProceeding.upsert({
        where: key(caseId, dto.courtLevel),
        create: { caseId, courtLevel: dto.courtLevel, ...details },
        update: details,
      });
      if (dto.courtLevel === currentLevel(legalCase)) await mirrorProceeding(tx, caseId);
      if (!repeat) {
        await this.caseFeed.log(
          {
            caseId, userId: user.id, type: ActivityType.COURT_DATE,
            title: `คำพิพากษา${COURT_LEVEL_LABELS[dto.courtLevel]}: ${JUDGMENT_OUTCOME_LABELS[dto.outcome]}`,
            description: dto.note?.trim() || undefined,
            at: judgmentAt,
          },
          tx,
        );
        await this.advanceStage(tx, user, legalCase, CaseStage.AWAITING_JUDGMENT);
      } else if (corrected) {
        await this.caseFeed.log(
          {
            caseId, userId: user.id, type: ActivityType.COURT_DATE,
            title: `แก้ไขคำพิพากษา${COURT_LEVEL_LABELS[dto.courtLevel]}: ${JUDGMENT_OUTCOME_LABELS[dto.outcome]}`,
          },
          tx,
        );
      }
      return row;
    });
    await this.syncLimitation(caseId);
    if (repeat) return { proceeding, suggestions: 0 };

    // The deadline the lead must act on next: the earliest pending one this level's judgment opened.
    const next =
      dto.courtLevel === CourtLevel.SUPREME
        ? null
        : await this.prisma.documentDateSuggestion.findFirst({
            where: {
              caseId,
              status: 'PENDING',
              source: 'RULE',
              deadlineRule: { trigger: DeadlineTrigger.JUDGMENT, courtLevel: dto.courtLevel },
            },
            orderBy: { suggestedDate: 'asc' },
            select: { suggestedDate: true },
          });
    const what = dto.courtLevel === CourtLevel.TRIAL ? 'ครบกำหนดอุทธรณ์' : 'ครบกำหนดฎีกา';
    // After the commit: a slow notifier must never hold the transaction open.
    await this.notifier.notifyAssigned({
      firmId: legalCase.firmId,
      userIds: [legalCase.leadLawyerId],
      actorUserId: '',
      category: NotificationCategory.CASE,
      summaryText: [
        `บันทึกคำพิพากษาแล้ว${next ? ` — ${what} ${formatBangkokDateThai(next.suggestedDate)}` : ''}`,
        `คดี ${legalCase.ownRef} · ${JUDGMENT_OUTCOME_LABELS[dto.outcome]}`,
      ].join('\n'),
      entityPath: `/cases/${caseId}?tab=calendar`,
    });
    return { proceeding, suggestions };
  }

  async recordAppealServed(user: AuthUser, caseId: string, dto: RecordAppealServedDto) {
    const legalCase = await this.openCase(user, caseId);
    const servedAt = new Date(dto.servedAt);
    // Several parties may appeal: like service, never clears (see recordService).
    const suggestions = await this.fire(user, legalCase, DeadlineTrigger.APPEAL_SERVED, servedAt);
    await this.caseFeed.log({
      caseId, userId: user.id, type: ActivityType.DEADLINE, title: 'ได้รับสำเนาอุทธรณ์', at: servedAt,
    });
    return { proceeding: null, suggestions };
  }
}

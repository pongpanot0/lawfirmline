import { BadRequestException, ConflictException, ForbiddenException, forwardRef, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  AuthUser,
  CourtEventKind,
  CourtLevel,
  DateSuggestionSource,
  DEFAULT_DEADLINE_RULES,
  DateSuggestionStatus,
  DeadlineDayBasis,
  DeadlineTrigger,
  EventType,
  ServiceMethod,
  deadlineRuleApplies,
  effectiveDeadlineRules,
  hasFirmCapability,
} from '@lawfirm/shared';
import { platformAdminEmails } from '../common/guards/platform-admin.guard';
import { PrismaService } from '../prisma/prisma.module';
import { NotificationCategory, Prisma } from '../generated/prisma';
import { AssignmentNotifierService } from '../notifications/assignment-notifier.service';
import { CreateDeadlineRuleDto, UpdateDeadlineRuleDto } from './dto/deadline-rule.dto';
import {
  addBangkokDays,
  addBangkokMonths,
  bangkokDayKey,
  bangkokDayStart,
  courtCloseAt,
  formatBangkokDateThai,
  isBangkokWeekend,
} from '../common/utils/bangkok-time';

/** Guard against a mis-entered rule walking the calendar forever. */
const MAX_OFFSET_DAYS = 3650;
/** Extra days of holiday data to load, to cover roll-forward past the offset. */
const HOLIDAY_PADDING_DAYS = 45;

/** How far from the trigger a rule can reach, in days — sizes the holiday window. */
export function ruleSpanDays(rule: { offsetDays: number; dayBasis: string; adjustDays?: number }): number {
  const reach = rule.dayBasis === DeadlineDayBasis.MONTHS ? Math.abs(rule.offsetDays) * 31 : Math.abs(rule.offsetDays);
  return reach + Math.abs(rule.adjustDays ?? 0);
}

/** Accepts either the client or an open transaction, as elsewhere in the app. */
type PrismaClientLike = PrismaService | Prisma.TransactionClient;

export interface DeadlineTriggerContext {
  caseId: string;
  firmId: string;
  caseTypeId: string | null;
  trigger: DeadlineTrigger;
  triggerDate: Date;
  triggerEventId: string | null;
  createdById: string;
  /** COURT_DATE: what kind of sitting the event is. */
  courtEventKind?: CourtEventKind | null;
  /** JUDGMENT: the level of the court that ruled; defaults to Case.courtLevel. */
  courtLevel?: CourtLevel | null;
  /** COMPLAINT_SERVED: รับเอง or ปิดหมาย. */
  serviceMethod?: ServiceMethod | null;
  /** false = the caller sends its own notice naming the deadline (default true). */
  notify?: boolean;
}

/**
 * Turns "N days from <event>" procedure into dated suggestions.
 *
 * Deliberately deterministic — no model is involved, so a deadline can never be
 * invented. And it never writes to the calendar itself: every derived date
 * lands in `DocumentDateSuggestion` for a lawyer to confirm, because a silently
 * created deadline that is wrong is worse than none.
 */
@Injectable()
export class DeadlineRulesService {
  private readonly logger = new Logger(DeadlineRulesService.name);

  constructor(
    private prisma: PrismaService,
    @Inject(forwardRef(() => AssignmentNotifierService))
    private notifier: AssignmentNotifierService,
  ) {}

  /**
   * Starter platform rules. Offsets follow common Thai civil procedure;
   * they are suggestions a lawyer confirms — never applied to a calendar alone.
   */
  async provisionDefaults(client: PrismaClientLike = this.prisma): Promise<void> {
    const existing = await client.deadlineRule.count();
    if (existing > 0) return;

    await client.deadlineRule.createMany({
      data: DEFAULT_DEADLINE_RULES.map((rule) => ({ ...rule })),
      skipDuplicates: true,
    });
  }

  private canEdit(user: AuthUser, firmId: string | null): boolean {
    if (firmId === null) return platformAdminEmails().has((user.email ?? '').toLowerCase());
    return firmId === user.firmId && hasFirmCapability(user.firmRole, 'manageFirmContent');
  }

  private assertCanEdit(user: AuthUser, firmId: string | null): void {
    if (this.canEdit(user, firmId)) return;
    throw new ForbiddenException(
      firmId === null ? 'ข้อมูลส่วนกลางแก้ได้เฉพาะผู้ดูแลระบบ' : 'ไม่มีสิทธิ์แก้กฎวันครบกำหนดของสำนักงาน',
    );
  }

  /** A rule this caller can see: global, or their own firm's. */
  private async findVisible(user: AuthUser, id: string) {
    const rule = await this.prisma.deadlineRule.findFirst({
      where: { id, OR: [{ firmId: null }, { firmId: user.firmId }] },
      select: { id: true, firmId: true },
    });
    if (!rule) throw new NotFoundException('Deadline rule not found');
    return rule;
  }

  async list(user: AuthUser) {
    await this.provisionDefaults();
    const rows = await this.prisma.deadlineRule.findMany({
      where: { OR: [{ firmId: null }, { firmId: user.firmId }] },
      orderBy: [{ trigger: 'asc' }, { offsetDays: 'asc' }],
    });
    return rows.map((row) => ({ ...row, canEdit: this.canEdit(user, row.firmId) }));
  }

  async create(user: AuthUser, dto: CreateDeadlineRuleDto) {
    const firmId = dto.global ? null : user.firmId;
    this.assertCanEdit(user, firmId);
    const label = dto.label.trim();
    if (!label) throw new BadRequestException('ต้องระบุชื่อกำหนด');
    const clash = await this.prisma.deadlineRule.findFirst({
      where: { firmId, trigger: dto.trigger, label },
      select: { id: true },
    });
    if (clash) throw new ConflictException('มีกฎชื่อนี้สำหรับเหตุนี้อยู่แล้ว');
    return this.prisma.deadlineRule.create({
      data: {
        firmId,
        caseTypeId: null,
        trigger: dto.trigger,
        label,
        offsetDays: dto.offsetDays,
        dayBasis: dto.dayBasis ?? DeadlineDayBasis.CALENDAR,
        adjustDays: dto.adjustDays ?? 0,
        courtEventKind: dto.courtEventKind ?? null,
        courtLevel: dto.courtLevel ?? null,
        partySide: dto.partySide ?? null,
        serviceMethod: dto.serviceMethod ?? null,
        isActive: dto.isActive ?? true,
      },
    });
  }

  async update(user: AuthUser, id: string, dto: UpdateDeadlineRuleDto) {
    const rule = await this.findVisible(user, id);
    this.assertCanEdit(user, rule.firmId);
    const { caseTypeId: _ignored, ...data } = dto as UpdateDeadlineRuleDto & { caseTypeId?: string | null };
    await this.prisma.deadlineRule.update({ where: { id }, data });
    return { updated: true };
  }

  async remove(user: AuthUser, id: string) {
    const rule = await this.findVisible(user, id);
    this.assertCanEdit(user, rule.firmId);
    await this.prisma.deadlineRule.delete({ where: { id } });
    return { deleted: true };
  }

  /**
   * Fires a trigger that has no calendar event behind it (judgment read, order
   * received, complaint served) for one case.
   */
  async applyTriggerForCase(
    user: AuthUser,
    caseId: string,
    dto: { trigger: DeadlineTrigger; triggerDate: string },
  ): Promise<{ created: number }> {
    const legalCase = await this.prisma.case.findFirst({
      where: { id: caseId, firmId: user.firmId },
      select: { id: true, firmId: true, caseTypeId: true },
    });
    if (!legalCase) throw new NotFoundException('Case not found');

    const created = await this.applyTrigger({
      caseId: legalCase.id,
      firmId: legalCase.firmId,
      caseTypeId: legalCase.caseTypeId,
      trigger: dto.trigger,
      triggerDate: new Date(dto.triggerDate),
      // Manual clocks have no calendar event; idempotency uses PENDING rows
      // for this case + rule instead of the (triggerEventId, deadlineRuleId) unique.
      triggerEventId: null,
      createdById: user.id,
    });
    return { created };
  }

  /**
   * @returns how many suggestions were created. Calendar-backed runs are
   *   deduped by `(triggerEventId, deadlineRuleId)`. Manual runs (`triggerEventId`
   *   null) skip a rule only when a PENDING suggestion for it is already due on the
   *   same Bangkok day — so each defendant served on a different day gets its own
   *   deadline, while a double submit creates nothing. Postgres unique indexes do not
   *   treat NULL as equal, so `skipDuplicates` alone cannot stop a second manual fire.
   */
  async applyTrigger(context: DeadlineTriggerContext, client: PrismaClientLike = this.prisma): Promise<number> {
    const legalCase = await client.case.findUnique({
      where: { id: context.caseId },
      select: { partyRole: true, courtLevel: true, leadLawyerId: true, ownRef: true },
    });
    const candidates = await client.deadlineRule.findMany({
      where: {
        trigger: context.trigger,
        // Case-type-specific rules are not offered in this pass.
        caseTypeId: null,
        OR: [{ firmId: null }, { firmId: context.firmId }],
      },
    });
    const rules = effectiveDeadlineRules(candidates, context.firmId).filter((rule) =>
      deadlineRuleApplies(rule, {
        courtEventKind: context.courtEventKind ?? null,
        courtLevel: context.courtLevel ?? legalCase?.courtLevel ?? null,
        partyRole: legalCase?.partyRole ?? null,
        serviceMethod: context.serviceMethod ?? null,
      }),
    );
    if (rules.length === 0) return 0;

    const holidays = await this.loadHolidays(
      context.triggerDate,
      Math.max(...rules.map(ruleSpanDays)),
      client,
    );

    const computed = rules.map((rule) => ({
      caseId: context.caseId,
      label: rule.label,
      suggestedDate: courtCloseAt(
        this.computeDueDate(
          context.triggerDate,
          rule.offsetDays,
          rule.dayBasis as DeadlineDayBasis,
          holidays,
          rule.adjustDays ?? 0,
        ),
      ),
      eventType: EventType.DEADLINE,
      sourceExcerpt: null,
      source: DateSuggestionSource.RULE,
      status: DateSuggestionStatus.PENDING,
      deadlineRuleId: rule.id,
      triggerEventId: context.triggerEventId,
      createdById: context.createdById,
    }));
    const data = await this.withoutPendingDuplicates(context.caseId, computed, context.triggerEventId, client);
    if (data.length === 0) return 0;

    const result = await client.documentDateSuggestion.createMany({
      data: data as never,
      skipDuplicates: true,
    });

    if (result.count > 0 && legalCase && context.notify !== false) {
      // System notice (actor ''): the lead hears about it even when they entered the trigger.
      // Inside a caller's transaction (client !== this.prisma) the push/LINE calls must not hold
      // the tx open — fire and forget there (the notifier swallows its own errors).
      // ponytail: the inbox row is written outside that tx — a rolled-back trigger can leave one
      // stale notice; move to an outbox if that ever matters.
      const notice = this.notifier.notifyAssigned({
        firmId: context.firmId,
        userIds: [legalCase.leadLawyerId],
        actorUserId: '',
        category: NotificationCategory.CALENDAR,
        summaryText: [
          `วันครบกำหนดรอยืนยัน ${result.count} รายการ — คดี ${legalCase.ownRef}`,
          ...data.map((row) => `${row.label}: ${formatBangkokDateThai(row.suggestedDate)}`),
        ].join('\n'),
        entityPath: `/cases/${context.caseId}?tab=calendar`,
      });
      if (client === this.prisma) await notice;
      else void notice;
    }
    return result.count;
  }

  /**
   * Drop rows that a PENDING suggestion on the case already covers.
   * Calendar-backed: one card per rule per trigger event, whatever its date.
   * Manual: one card per rule per due day (Bangkok).
   */
  private async withoutPendingDuplicates<T extends { deadlineRuleId: string; suggestedDate: Date }>(
    caseId: string,
    rows: T[],
    triggerEventId: string | null,
    client: PrismaClientLike = this.prisma,
  ): Promise<T[]> {
    const existing = await client.documentDateSuggestion.findMany({
      where: {
        caseId,
        status: DateSuggestionStatus.PENDING,
        source: DateSuggestionSource.RULE,
        deadlineRuleId: { in: rows.map((r) => r.deadlineRuleId) },
        ...(triggerEventId ? { triggerEventId } : { triggerEventId: null }),
      },
      select: { deadlineRuleId: true, suggestedDate: true },
    });
    const keyOf = (ruleId: string | null, due: Date) => (triggerEventId ? `${ruleId}` : `${ruleId}|${bangkokDayKey(due)}`);
    const blocked = new Set(existing.map((row) => keyOf(row.deadlineRuleId, row.suggestedDate)));
    return rows.filter((row) => !blocked.has(keyOf(row.deadlineRuleId, row.suggestedDate)));
  }

  /**
   * @param offset days (CALENDAR/BUSINESS) or months (MONTHS); negative = before the trigger.
   * @param adjustDays calendar days added after the offset (e.g. −90).
   * @returns the due date as a `YYYY-MM-DD` Bangkok day, always a working day.
   *   A period after the trigger that ends on a weekend/holiday runs to the next
   *   working day (ม.193/8); a deadline *before* the trigger moves back to the
   *   previous working day so it is never missed.
   */
  computeDueDate(
    triggerDate: Date,
    offset: number,
    dayBasis: DeadlineDayBasis,
    holidays: Set<string>,
    adjustDays = 0,
  ): string {
    const amount = Math.max(-MAX_OFFSET_DAYS, Math.min(offset, MAX_OFFSET_DAYS));
    const backward = amount < 0 || adjustDays < 0;
    let cursor = bangkokDayStart(triggerDate);

    if (dayBasis === DeadlineDayBasis.BUSINESS) {
      const step = amount < 0 ? -1 : 1;
      let remaining = Math.abs(amount);
      while (remaining > 0) {
        cursor = addBangkokDays(cursor, step);
        if (this.isWorkingDay(cursor, holidays)) remaining--;
      }
    } else if (dayBasis === DeadlineDayBasis.MONTHS) {
      cursor = addBangkokMonths(cursor, amount);
    } else {
      cursor = addBangkokDays(cursor, amount);
    }
    cursor = addBangkokDays(cursor, adjustDays);

    const roll = backward ? -1 : 1;
    while (!this.isWorkingDay(cursor, holidays)) {
      cursor = addBangkokDays(cursor, roll);
    }
    return bangkokDayKey(cursor);
  }

  private isWorkingDay(date: Date, holidays: Set<string>): boolean {
    return !isBangkokWeekend(date) && !holidays.has(bangkokDayKey(date));
  }

  /** Loads holidays on both sides of `from` — rules may count backwards. */
  async loadHolidays(from: Date, spanDays: number, client: PrismaClientLike = this.prisma): Promise<Set<string>> {
    const start = bangkokDayStart(from);
    // Business-day counting can run well past the nominal offset, so load a
    // generous window rather than risk missing a holiday mid-count.
    const span = Math.min(spanDays, MAX_OFFSET_DAYS) * 2 + HOLIDAY_PADDING_DAYS;
    const rows = await client.publicHoliday.findMany({
      where: { date: { gte: addBangkokDays(start, -span), lte: addBangkokDays(start, span) } },
      select: { date: true },
    });
    return new Set(rows.map((row) => bangkokDayKey(row.date)));
  }
}

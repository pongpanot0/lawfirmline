import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  AuthUser,
  DateSuggestionSource,
  DateSuggestionStatus,
  DeadlineDayBasis,
  DeadlineTrigger,
  EventType,
} from '@lawfirm/shared';
import { PrismaService } from '../prisma/prisma.module';
import { Prisma } from '../generated/prisma';
import { CreateDeadlineRuleDto, UpdateDeadlineRuleDto } from './dto/deadline-rule.dto';
import {
  addBangkokDays,
  bangkokDayKey,
  bangkokDayStart,
  isBangkokWeekend,
} from '../common/utils/bangkok-time';

/** Guard against a mis-entered rule walking the calendar forever. */
const MAX_OFFSET_DAYS = 3650;
/** Extra days of holiday data to load, to cover roll-forward past the offset. */
const HOLIDAY_PADDING_DAYS = 45;

/** Accepts either the client or an open transaction, as elsewhere in the app. */
type PrismaClientLike = PrismaService | Prisma.TransactionClient;

const DEFAULT_RULES = [
  {
    trigger: DeadlineTrigger.COMPLAINT_SERVED,
    label: 'ยื่นคำให้การ',
    offsetDays: 15,
    dayBasis: DeadlineDayBasis.CALENDAR,
  },
  {
    trigger: DeadlineTrigger.JUDGMENT,
    label: 'ยื่นอุทธรณ์',
    offsetDays: 30,
    dayBasis: DeadlineDayBasis.CALENDAR,
  },
  {
    trigger: DeadlineTrigger.ORDER_RECEIVED,
    label: 'โต้แย้งคำสั่งศาล',
    offsetDays: 15,
    dayBasis: DeadlineDayBasis.CALENDAR,
  },
  {
    trigger: DeadlineTrigger.COURT_DATE,
    label: 'สรุปผลนัดและรายงานลูกความ',
    offsetDays: 3,
    dayBasis: DeadlineDayBasis.BUSINESS,
  },
] as const;

export interface DeadlineTriggerContext {
  caseId: string;
  firmId: string;
  caseTypeId: string | null;
  trigger: DeadlineTrigger;
  triggerDate: Date;
  triggerEventId: string | null;
  createdById: string;
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

  constructor(private prisma: PrismaService) {}

  /**
   * Starter platform rules. Offsets follow common Thai civil procedure;
   * they are suggestions a lawyer confirms — never applied to a calendar alone.
   */
  async provisionDefaults(client: PrismaClientLike = this.prisma): Promise<void> {
    const existing = await client.deadlineRule.count();
    if (existing > 0) return;

    await client.deadlineRule.createMany({
      data: DEFAULT_RULES.map((rule) => ({ ...rule })),
      skipDuplicates: true,
    });
  }

  async list(_user: AuthUser) {
    await this.provisionDefaults();

    return this.prisma.deadlineRule.findMany({
      orderBy: [{ trigger: 'asc' }, { offsetDays: 'asc' }],
    });
  }

  create(_user: AuthUser, dto: CreateDeadlineRuleDto) {
    // Platform-global rules only in this pass — ignore per-firm caseType links.
    return this.prisma.deadlineRule.create({
      data: {
        caseTypeId: null,
        trigger: dto.trigger,
        label: dto.label,
        offsetDays: dto.offsetDays,
        dayBasis: dto.dayBasis ?? DeadlineDayBasis.CALENDAR,
        isActive: dto.isActive ?? true,
      },
    });
  }

  async update(_user: AuthUser, id: string, dto: UpdateDeadlineRuleDto) {
    const { caseTypeId: _ignored, ...rest } = dto as UpdateDeadlineRuleDto & {
      caseTypeId?: string | null;
    };
    const result = await this.prisma.deadlineRule.updateMany({
      where: { id },
      data: { ...rest, caseTypeId: null },
    });
    if (result.count === 0) throw new NotFoundException('Deadline rule not found');
    return { updated: true };
  }

  async remove(_user: AuthUser, id: string) {
    const result = await this.prisma.deadlineRule.deleteMany({
      where: { id },
    });
    if (result.count === 0) throw new NotFoundException('Deadline rule not found');
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
   *   null) skip any rule that already has a PENDING suggestion on the case —
   *   Postgres unique indexes do not treat NULL as equal, so `skipDuplicates`
   *   alone cannot stop a second manual fire.
   */
  async applyTrigger(context: DeadlineTriggerContext): Promise<number> {
    const rules = await this.prisma.deadlineRule.findMany({
      where: {
        trigger: context.trigger,
        isActive: true,
        // Global catalog: only null caseType rules in this pass.
        caseTypeId: null,
      },
    });
    if (rules.length === 0) return 0;

    const openRules = await this.rulesWithoutPendingSuggestion(context.caseId, rules, context.triggerEventId);
    if (openRules.length === 0) return 0;

    const holidays = await this.loadHolidays(
      context.triggerDate,
      Math.max(...openRules.map((r) => r.offsetDays)),
    );

    const data = openRules.map((rule) => ({
      caseId: context.caseId,
      label: rule.label,
      suggestedDate: new Date(
        `${this.computeDueDate(
          context.triggerDate,
          rule.offsetDays,
          rule.dayBasis as DeadlineDayBasis,
          holidays,
        )}T00:00:00.000Z`,
      ),
      eventType: EventType.DEADLINE,
      sourceExcerpt: null,
      source: DateSuggestionSource.RULE,
      status: DateSuggestionStatus.PENDING,
      deadlineRuleId: rule.id,
      triggerEventId: context.triggerEventId,
      createdById: context.createdById,
    }));

    const result = await this.prisma.documentDateSuggestion.createMany({
      data: data as never,
      skipDuplicates: true,
    });
    return result.count;
  }

  /**
   * Drop rules that already have a PENDING suggestion for this case.
   * Calendar-backed: only rows tied to the same trigger event count.
   * Manual: any PENDING for the rule on the case blocks a second card.
   */
  private async rulesWithoutPendingSuggestion<T extends { id: string }>(
    caseId: string,
    rules: T[],
    triggerEventId: string | null,
  ): Promise<T[]> {
    const existing = await this.prisma.documentDateSuggestion.findMany({
      where: {
        caseId,
        status: DateSuggestionStatus.PENDING,
        source: DateSuggestionSource.RULE,
        deadlineRuleId: { in: rules.map((r) => r.id) },
        ...(triggerEventId ? { triggerEventId } : { triggerEventId: null }),
      },
      select: { deadlineRuleId: true },
    });
    const blocked = new Set(
      existing.map((row) => row.deadlineRuleId).filter((id): id is string => id != null),
    );
    return rules.filter((rule) => !blocked.has(rule.id));
  }

  /**
   * @param holidays `YYYY-MM-DD` Bangkok days that are public holidays.
   * @returns the due date as a `YYYY-MM-DD` Bangkok day, always a working day —
   *   a period that would end on a weekend or holiday runs to the next one.
   */
  computeDueDate(
    triggerDate: Date,
    offsetDays: number,
    dayBasis: DeadlineDayBasis,
    holidays: Set<string>,
  ): string {
    const offset = Math.min(Math.max(offsetDays, 0), MAX_OFFSET_DAYS);
    let cursor = bangkokDayStart(triggerDate);

    if (dayBasis === DeadlineDayBasis.BUSINESS) {
      let remaining = offset;
      while (remaining > 0) {
        cursor = addBangkokDays(cursor, 1);
        if (this.isWorkingDay(cursor, holidays)) remaining--;
      }
    } else {
      cursor = addBangkokDays(cursor, offset);
    }

    while (!this.isWorkingDay(cursor, holidays)) {
      cursor = addBangkokDays(cursor, 1);
    }
    return bangkokDayKey(cursor);
  }

  private isWorkingDay(date: Date, holidays: Set<string>): boolean {
    return !isBangkokWeekend(date) && !holidays.has(bangkokDayKey(date));
  }

  private async loadHolidays(from: Date, maxOffsetDays: number): Promise<Set<string>> {
    const start = bangkokDayStart(from);
    // Business-day counting can run well past the nominal offset, so load a
    // generous window rather than risk missing a holiday mid-count.
    const span = Math.min(maxOffsetDays, MAX_OFFSET_DAYS) * 2 + HOLIDAY_PADDING_DAYS;
    const rows = await this.prisma.publicHoliday.findMany({
      where: { date: { gte: start, lte: addBangkokDays(start, span) } },
      select: { date: true },
    });
    return new Set(rows.map((row) => bangkokDayKey(row.date)));
  }
}

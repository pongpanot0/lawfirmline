import { Injectable, Logger } from '@nestjs/common';
import { AuthUser, FirmRole, hasFirmCapability } from '@lawfirm/shared';
import { PrismaService } from '../prisma/prisma.module';
import { CaseAccessService } from '../common/services/case-access.service';
import { TimeSuggestionsService } from '../billing/time-suggestions.service';
import { addBangkokDays, bangkokDayKey } from '../common/utils/bangkok-time';
import { computeMemberMetrics, groupCollectedRatio, MetricsPeriod, periodRange } from '../operations/firm-metrics';

type Sums = {
  workedHours: number;
  workedAmount: number;
  invoicedHours: number;
  invoicedAmount: number;
  collectedHours: number;
  collectedAmount: number;
};
const emptySums = (): Sums => ({
  workedHours: 0, workedAmount: 0, invoicedHours: 0, invoicedAmount: 0, collectedHours: 0, collectedAmount: 0,
});

@Injectable()
export class ReportsService {
  private readonly logger = new Logger(ReportsService.name);

  constructor(
    private prisma: PrismaService,
    private caseAccess: CaseAccessService,
    private timeSuggestions: TimeSuggestionsService,
  ) {}

  /** Utilization / realization / collection per member and for the firm (spec F2). */
  async getFirmMetrics(user: AuthUser, period: MetricsPeriod, now: Date = new Date()) {
    const { firmId } = user;
    const { from, to, months } = periodRange(period, now);

    const [members, entries] = await Promise.all([
      this.prisma.firmMember.findMany({
        where: { firmId },
        select: {
          userId: true,
          role: true,
          monthlyBillableTargetHours: true,
          user: { select: { firstName: true, lastName: true } },
        },
      }),
      this.prisma.timeEntry.findMany({
        where: { case: { firmId }, billable: true, date: { gte: from, lt: to } },
        select: {
          userId: true,
          hours: true,
          rate: true,
          invoice: { select: { id: true, status: true, splitGroupId: true } },
        },
      }),
    ]);

    // Invoiced = on a non-DRAFT invoice. Group = invoices sharing splitGroupId; no splitGroupId = the invoice alone.
    const groupOf = (inv: { id: string; splitGroupId: string | null }) => inv.splitGroupId ?? inv.id;
    const invoiced = entries.filter((e) => e.invoice && e.invoice.status !== 'DRAFT');
    const splitIds = [...new Set(invoiced.map((e) => e.invoice!.splitGroupId).filter((g): g is string => !!g))];
    const singleIds = [...new Set(invoiced.filter((e) => !e.invoice!.splitGroupId).map((e) => e.invoice!.id))];

    const ratioByGroup = new Map<string, number>();
    if (invoiced.length > 0) {
      const groupInvoices = await this.prisma.invoice.findMany({
        where: { firmId, OR: [{ splitGroupId: { in: splitIds } }, { id: { in: singleIds } }] },
        select: { id: true, splitGroupId: true, totalAmount: true },
      });
      const payments = await this.prisma.invoicePayment.findMany({
        where: { firmId, invoiceId: { in: groupInvoices.map((i) => i.id) } },
        select: { invoiceId: true, amount: true },
      });
      const groupByInvoice = new Map(groupInvoices.map((i) => [i.id, groupOf(i)]));
      const totals = new Map<string, { paid: number; total: number }>();
      const slot = (g: string) => totals.get(g) ?? totals.set(g, { paid: 0, total: 0 }).get(g)!;
      for (const i of groupInvoices) slot(groupOf(i)).total += i.totalAmount;
      for (const p of payments) {
        const g = groupByInvoice.get(p.invoiceId);
        if (g) slot(g).paid += p.amount;
      }
      for (const [g, t] of totals) ratioByGroup.set(g, groupCollectedRatio(t.paid, t.total));
    }

    const sums = new Map<string, Sums>();
    for (const e of entries) {
      const s = sums.get(e.userId) ?? sums.set(e.userId, emptySums()).get(e.userId)!;
      s.workedHours += e.hours;
      s.workedAmount += e.hours * e.rate;
      if (e.invoice && e.invoice.status !== 'DRAFT') {
        const collected = ratioByGroup.get(groupOf(e.invoice)) ?? 0;
        s.invoicedHours += e.hours;
        s.invoicedAmount += e.hours * e.rate;
        s.collectedHours += e.hours * collected;
        s.collectedAmount += e.hours * e.rate * collected;
      }
    }

    const rows = [];
    for (const m of members) {
      const s = sums.get(m.userId) ?? emptySums();
      const targetMonthly = m.monthlyBillableTargetHours ?? null;
      rows.push({
        userId: m.userId,
        name: `${m.user.firstName} ${m.user.lastName}`.trim(),
        targetMonthly,
        ...s,
        ...computeMemberMetrics({ ...s, targetMonthly, months }),
        pendingDrafts7d: await this.pendingDrafts7d(firmId, m.userId, m.role as FirmRole, now),
      });
    }

    // Firm row covers every entry in the firm (including ex-members); utilization only counts
    // hours of members who have a target, so untargeted work does not inflate it.
    const firm = emptySums();
    for (const s of sums.values()) for (const k of Object.keys(firm) as (keyof Sums)[]) firm[k] += s[k];
    const targeted = rows.filter((r) => r.targetMonthly);
    const firmTarget = targeted.length ? targeted.reduce((a, r) => a + (r.targetMonthly as number), 0) : null;
    const firmRatios = computeMemberMetrics({ ...firm, targetMonthly: firmTarget, months });
    firmRatios.utilization = computeMemberMetrics({
      ...firm,
      workedHours: targeted.reduce((a, r) => a + r.workedHours, 0),
      targetMonthly: firmTarget,
      months,
    }).utilization;

    return {
      period,
      from: bangkokDayKey(from),
      to: bangkokDayKey(new Date(to.getTime() - 1)),
      timeBasedBilling: firm.invoicedHours > 0,
      firm: { targetMonthly: firmTarget, ...firm, ...firmRatios },
      members: rows,
    };
  }

  /** Count of unconfirmed drafts over the last 7 Bangkok days (today included). */
  // ponytail: N members x 7 suggest() calls per request; cache or batch if the dashboard gets slow
  private async pendingDrafts7d(firmId: string, userId: string, firmRole: FirmRole, now: Date): Promise<number> {
    const authUser = { id: userId, firmId, firmRole } as AuthUser;
    try {
      const days = Array.from({ length: 7 }, (_, i) => bangkokDayKey(addBangkokDays(now, -i)));
      const lists = await Promise.all(days.map((d) => this.timeSuggestions.suggest(authUser, d)));
      return lists.reduce((n, l) => n + l.length, 0);
    } catch (error) {
      this.logger.warn(`pending drafts failed for user ${userId}: ${(error as Error).message}`);
      return 0;
    }
  }

  private getExpenseFilter(firmId: string, user: AuthUser) {
    const firmFilter = {
      OR: [
        { case: { firmId } },
        { caseId: null, user: { firmMembers: { some: { firmId } } } },
      ],
    };

    // Drafts are private notes until claimed — never roll them into reports.
    const submittedOnly = { status: { not: 'DRAFT' as const } };

    if (hasFirmCapability(user.firmRole, 'viewFirmReports')) {
      return { AND: [firmFilter, submittedOnly] };
    }

    return { AND: [firmFilter, submittedOnly, { userId: user.id }] };
  }

  async getSummary(user: AuthUser) {
    const { firmId } = user;
    const caseFilter = this.caseAccess.getCaseFilterForFinancials(user);
    const expenseFilter = this.getExpenseFilter(firmId, user);
    const now = new Date();
    const year = now.getFullYear();
    const ytdStart = new Date(year, 0, 1);
    const lastYearStart = new Date(year - 1, 0, 1);
    const sixMonthsAgo = new Date(year, now.getMonth() - 5, 1);

    const [
      casesClosedYtd,
      casesClosedLastYear,
      totalCases,
      closedCases,
      closedCasesWithDates,
      caseVolumeRaw,
      timeEntries,
      courtEvents,
      expenses,
    ] = await Promise.all([
      this.prisma.case.count({
        where: { ...caseFilter, status: 'CLOSED', closedAt: { gte: ytdStart } },
      }),
      this.prisma.case.count({
        where: {
          ...caseFilter,
          status: 'CLOSED',
          closedAt: { gte: lastYearStart, lt: ytdStart },
        },
      }),
      this.prisma.case.count({ where: caseFilter }),
      this.prisma.case.count({ where: { ...caseFilter, status: 'CLOSED' } }),
      this.prisma.case.findMany({
        where: { ...caseFilter, closedAt: { not: null } },
        select: { openedAt: true, closedAt: true },
      }),
      this.prisma.case.groupBy({
        by: ['caseTypeId'],
        where: caseFilter,
        _count: { id: true },
      }),
      this.prisma.timeEntry.findMany({
        where: { case: caseFilter, billable: true },
        include: {
          user: { select: { id: true, firstName: true, lastName: true } },
        },
      }),
      this.prisma.calendarEvent.findMany({
        where: {
          case: caseFilter,
          type: 'COURT_DATE',
          startAt: { gte: sixMonthsAgo },
        },
        select: { startAt: true },
        orderBy: { startAt: 'asc' },
      }),
      this.prisma.expense.findMany({
        where: expenseFilter,
        select: { amount: true, status: true, category: true },
      }),
    ]);

    const typeIds = caseVolumeRaw
      .map((row) => row.caseTypeId)
      .filter((id): id is string => id !== null);
    const caseTypes =
      typeIds.length > 0
        ? await this.prisma.caseType.findMany({
            where: { firmId, id: { in: typeIds } },
            select: { id: true, name: true },
          })
        : [];
    const typeNameById = new Map(caseTypes.map((t) => [t.id, t.name]));

    const caseVolumeByType = caseVolumeRaw
      .map((row) => ({
        label: row.caseTypeId
          ? (typeNameById.get(row.caseTypeId) ?? 'Unknown')
          : 'Uncategorized',
        count: row._count.id,
      }))
      .sort((a, b) => b.count - a.count);

    const revenueByLawyerMap = new Map<
      string,
      { lawyerName: string; hours: number; revenue: number }
    >();
    for (const entry of timeEntries) {
      const key = entry.user.id;
      const existing = revenueByLawyerMap.get(key) ?? {
        lawyerName: `${entry.user.firstName} ${entry.user.lastName}`,
        hours: 0,
        revenue: 0,
      };
      existing.hours += entry.hours;
      existing.revenue += entry.hours * entry.rate;
      revenueByLawyerMap.set(key, existing);
    }
    const revenueByLawyer = [...revenueByLawyerMap.values()].sort(
      (a, b) => b.revenue - a.revenue,
    );

    const courtAppearancesByMonth = this.groupEventsByMonth(courtEvents);

    const expenseSummary = {
      total: expenses.reduce((sum, e) => sum + e.amount, 0),
      approved: expenses
        .filter((e) => e.status === 'APPROVED' || e.status === 'PAID')
        .reduce((sum, e) => sum + e.amount, 0),
      pending: expenses
        .filter((e) => e.status === 'PENDING')
        .reduce((sum, e) => sum + e.amount, 0),
      byCategory: this.groupExpensesByCategory(expenses),
    };

    const avgCaseDurationMonths =
      closedCasesWithDates.length > 0
        ? this.averageCaseDurationMonths(closedCasesWithDates)
        : null;

    return {
      firmId,
      firmName: user.firmName,
      scope: hasFirmCapability(user.firmRole, 'viewFirmReports') ? 'firm' : 'user',
      kpis: {
        casesClosedYtd,
        casesClosedChange: casesClosedYtd - casesClosedLastYear,
        winRate: totalCases > 0 ? Math.round((closedCases / totalCases) * 100) : 0,
        avgCaseDurationMonths,
      },
      caseVolumeByType,
      revenueByLawyer,
      courtAppearancesByMonth,
      expenseSummary,
    };
  }

  private averageCaseDurationMonths(
    cases: Array<{ openedAt: Date; closedAt: Date | null }>,
  ) {
    const totalMonths = cases.reduce((sum, c) => {
      if (!c.closedAt) return sum;
      const diffMs = c.closedAt.getTime() - c.openedAt.getTime();
      return sum + diffMs / (1000 * 60 * 60 * 24 * 30.44);
    }, 0);
    return Math.round((totalMonths / cases.length) * 10) / 10;
  }

  private groupEventsByMonth(events: Array<{ startAt: Date }>) {
    const counts = new Map<string, number>();
    for (const event of events) {
      const key = `${event.startAt.getFullYear()}-${String(event.startAt.getMonth() + 1).padStart(2, '0')}`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return [...counts.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, count]) => ({ month, count }));
  }

  private groupExpensesByCategory(
    expenses: Array<{ amount: number; category: string | null }>,
  ) {
    const totals = new Map<string, number>();
    for (const expense of expenses) {
      const key = expense.category?.trim() || 'Other';
      totals.set(key, (totals.get(key) ?? 0) + expense.amount);
    }
    return [...totals.entries()]
      .map(([category, amount]) => ({ category, amount }))
      .sort((a, b) => b.amount - a.amount);
  }
}

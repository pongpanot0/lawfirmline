import { Injectable } from '@nestjs/common';
import { AuthUser, FirmRole } from '@lawfirm/shared';
import { PrismaService } from '../prisma/prisma.module';
import { CaseAccessService } from '../common/services/case-access.service';

@Injectable()
export class ReportsService {
  constructor(
    private prisma: PrismaService,
    private caseAccess: CaseAccessService,
  ) {}

  private getExpenseFilter(firmId: string, user: AuthUser) {
    const firmFilter = {
      OR: [
        { case: { firmId } },
        { caseId: null, user: { firmMembers: { some: { firmId } } } },
      ],
    };

    // Drafts are private notes until claimed — never roll them into reports.
    const submittedOnly = { status: { not: 'DRAFT' as const } };

    if (user.firmRole === FirmRole.OWNER) {
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
      scope: user.firmRole === FirmRole.OWNER ? 'firm' : 'user',
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

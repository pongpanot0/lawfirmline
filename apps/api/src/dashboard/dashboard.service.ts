import { Injectable } from '@nestjs/common';
import { AuthUser, FirmRole } from '@lawfirm/shared';
import { PrismaService } from '../prisma/prisma.module';
import { CaseAccessService } from '../common/services/case-access.service';
import { BillingService } from '../billing/billing.service';

@Injectable()
export class DashboardService {
  constructor(
    private prisma: PrismaService,
    private caseAccess: CaseAccessService,
    private billingService: BillingService,
  ) {}

  private getFirmExpenseFilter(firmId: string) {
    return {
      OR: [
        { case: { firmId } },
        { caseId: null, user: { firmMembers: { some: { firmId } } } },
      ],
    };
  }

  async getStats(user: AuthUser) {
    const caseFilter = this.caseAccess.getCaseFilterForUser(user);
    const firmExpenseFilter = this.getFirmExpenseFilter(user.firmId);
    const isOwner = user.firmRole === FirmRole.OWNER;
    const expenseScope = isOwner
      ? firmExpenseFilter
      : { userId: user.id, ...firmExpenseFilter };
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const [totalCases, openCases, upcomingEvents, overdueTasks, myTasks] =
      await Promise.all([
        this.prisma.case.count({ where: caseFilter }),
        this.prisma.case.count({
          where: { ...caseFilter, status: { not: 'CLOSED' } },
        }),
        this.prisma.calendarEvent.count({
          where: {
            case: caseFilter,
            startAt: { gte: now },
          },
        }),
        this.prisma.task.count({
          where: {
            case: caseFilter,
            status: { not: 'DONE' },
            dueDate: { lt: now },
            ...this.caseAccess.getTaskFilterForUser(user),
          },
        }),
        this.prisma.task.count({
          where: {
            case: caseFilter,
            status: { not: 'DONE' },
            ...this.caseAccess.getTaskFilterForUser(user),
          },
        }),
      ]);

    const [pendingExpenseCount, pendingReimbursementList, timeEntries, caseProfits] =
      await Promise.all([
        this.prisma.expense.count({
          where: { ...expenseScope, status: 'PENDING' },
        }),
        this.prisma.expense.findMany({
          where: isOwner
            ? { ...firmExpenseFilter, status: { in: ['PENDING', 'APPROVED'] } }
            : { userId: user.id, ...firmExpenseFilter },
          take: 5,
          orderBy: { createdAt: 'desc' },
          include: {
            user: { select: { firstName: true, lastName: true } },
            case: { select: { ownRef: true, title: true } },
          },
        }),
        this.prisma.timeEntry.findMany({
          where: { case: caseFilter, billable: true },
          select: { hours: true, rate: true, date: true },
        }),
        this.billingService.getCaseProfits(user),
      ]);

    const monthlyRevenue = timeEntries
      .filter((entry) => entry.date >= monthStart)
      .reduce((sum, entry) => sum + entry.hours * entry.rate, 0);

    const totalNetProfit = caseProfits.reduce((sum, row) => sum + row.profit, 0);

    const recentCases = await this.prisma.case.findMany({
      where: caseFilter,
      take: 5,
      orderBy: { updatedAt: 'desc' },
      include: {
        leadLawyer: {
          select: { firstName: true, lastName: true },
        },
      },
    });

    const upcomingHearings = await this.prisma.calendarEvent.findMany({
      where: {
        case: caseFilter,
        startAt: { gte: now },
        type: 'COURT_DATE',
      },
      take: 5,
      orderBy: { startAt: 'asc' },
      include: {
        case: {
          select: {
            ownRef: true,
            title: true,
            courtName: true,
            clientName: true,
            client: { select: { name: true } },
          },
        },
      },
    });

    return {
      firmId: user.firmId,
      firmName: user.firmName,
      role: user.role,
      stats: {
        totalCases,
        openCases,
        upcomingEvents,
        overdueTasks,
        myTasks,
        pendingExpenses: pendingExpenseCount,
        monthlyRevenue,
        totalNetProfit,
      },
      caseProfits: caseProfits.slice(0, 8),
      recentCases,
      upcomingHearings,
      pendingReimbursements: pendingReimbursementList,
    };
  }
}

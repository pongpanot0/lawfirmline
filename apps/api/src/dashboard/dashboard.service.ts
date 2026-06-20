import { Injectable } from '@nestjs/common';
import { AuthUser, Role } from '@lawfirm/shared';
import { PrismaService } from '../prisma/prisma.module';
import { CaseAccessService } from '../common/services/case-access.service';

@Injectable()
export class DashboardService {
  constructor(
    private prisma: PrismaService,
    private caseAccess: CaseAccessService,
  ) {}

  async getStats(user: AuthUser) {
    const caseFilter = this.caseAccess.getCaseFilterForUser(user);
    const now = new Date();

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
          },
        }),
        user.role === Role.CLERK
          ? this.prisma.task.count({
              where: {
                assigneeId: user.id,
                status: { not: 'DONE' },
              },
            })
          : this.prisma.task.count({
              where: {
                case: caseFilter,
                status: { not: 'DONE' },
                OR: [
                  { assigneeId: user.id },
                  ...(user.role === Role.ADMIN ? [{}] : []),
                ],
              },
            }),
      ]);

    const expenseFilter =
      user.role === Role.ADMIN
        ? {}
        : { userId: user.id };

    const [pendingExpenseCount, pendingReimbursementList] = await Promise.all([
      this.prisma.expense.count({
        where: { ...expenseFilter, status: 'PENDING' },
      }),
      user.role === Role.ADMIN
        ? this.prisma.expense.findMany({
            where: { status: { in: ['PENDING', 'APPROVED'] } },
            take: 5,
            orderBy: { createdAt: 'desc' },
            include: {
              user: { select: { firstName: true, lastName: true } },
              case: { select: { caseNumber: true, title: true } },
            },
          })
        : this.prisma.expense.findMany({
            where: { userId: user.id },
            take: 5,
            orderBy: { createdAt: 'desc' },
            include: {
              case: { select: { caseNumber: true, title: true } },
            },
          }),
    ]);

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
        case: { select: { caseNumber: true, title: true } },
      },
    });

    return {
      role: user.role,
      stats: {
        totalCases,
        openCases,
        upcomingEvents,
        overdueTasks,
        myTasks,
        pendingExpenses: pendingExpenseCount,
      },
      recentCases,
      upcomingHearings,
      pendingReimbursements: pendingReimbursementList,
    };
  }
}

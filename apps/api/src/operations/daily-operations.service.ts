import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AssignmentType, AuthUser, FirmRole, PersonWorkload, TaskStatus, TaskWorkType, TeamRadar, taskPoints } from '@lawfirm/shared';
import { Prisma } from '../generated/prisma';
import { PrismaService } from '../prisma/prisma.module';
import { TasksService } from '../tasks/tasks.service';
import { bangkokDateOnly, bangkokDayKey, bangkokDayStart } from '../common/utils/bangkok-time';
import { AssignDailyTaskDto, CreateDailyTaskDto } from './dto/daily-operations.dto';

const DAY_MS = 86400000;

/** Who attends an event: its assignee (else the case lead) plus any co-assignees — same rule reminders use. */
function attends(e: { assigneeId: string | null; case: { leadLawyerId: string }; assignees: { userId: string }[] }, userId: string) {
  return (e.assigneeId ?? e.case.leadLawyerId) === userId || e.assignees.some((a) => a.userId === userId);
}

/** The Bangkok day a task occupies: the planned work day, else its deadline. */
function taskDay(t: { scheduledFor: Date | null; dueDate: Date | null }) {
  return t.scheduledFor ? t.scheduledFor.toISOString().slice(0, 10) : t.dueDate ? bangkokDayKey(t.dueDate) : null;
}

/** Explicit tenancy for new tasks; ambiguous legacy personal work stays off the firm board. */
export function dailyTaskScope(firmId: string): Prisma.TaskWhereInput {
  return { OR: [
    { firmId, OR: [{ caseId: null }, { case: { firmId, deletedAt: null } }] },
    { firmId: null, case: { firmId, deletedAt: null } },
    { firmId: null, caseId: null, intake: { firmId } },
    { firmId: null, caseId: null, intakeId: null, createdBy: { firmMembers: {
      some: { firmId }, every: { firmId },
    } } },
  ] };
}

@Injectable()
export class DailyOperationsService {
  constructor(private prisma: PrismaService, private tasks: TasksService) {}

  private owner(user: AuthUser) {
    if (user.firmRole !== FirmRole.OWNER) throw new ForbiddenException('เฉพาะ Owner');
  }

  async board(user: AuthUser, date: string) {
    this.owner(user);
    const start = new Date(`${date}T00:00:00+07:00`);
    const end = new Date(start.getTime() + 86400000);
    const dateOnly = new Date(`${date}T00:00:00Z`);
    const [members, rows, leaves, events, cases] = await Promise.all([
      this.prisma.firmMember.findMany({ where: { firmId: user.firmId }, include: { user: { select: { id: true, firstName: true, lastName: true, email: true } } }, orderBy: { user: { firstName: 'asc' } } }),
      this.prisma.task.findMany({ where: { AND: [dailyTaskScope(user.firmId), { OR: [
        { status: { not: TaskStatus.DONE } }, { completedAt: { gte: start, lt: end } },
      ] }] }, include: {
        case: { select: { id: true, ownRef: true, title: true } }, onHold: true,
        blockedBy: { select: { title: true, status: true } },
        assignmentLogs: { orderBy: { createdAt: 'desc' }, take: 1 },
        comments: { where: { kind: 'DAILY_UPDATE', createdAt: { lt: end } }, orderBy: { createdAt: 'desc' }, take: 1,
          include: { author: { select: { firstName: true, lastName: true } } } },
      }, orderBy: [{ queuePosition: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }] }),
      this.prisma.leaveRequest.findMany({ where: { firmId: user.firmId, status: 'APPROVED', startDate: { lte: dateOnly }, endDate: { gte: dateOnly } }, select: { userId: true } }),
      this.prisma.calendarEvent.findMany({ where: { case: { firmId: user.firmId, deletedAt: null }, startAt: { lt: end }, OR: [{ endAt: { gte: start } }, { endAt: null, startAt: { gte: start } }] }, include: { assignees: true, case: { select: { leadLawyerId: true } } }, orderBy: { startAt: 'asc' } }),
      this.prisma.case.findMany({ where: { firmId: user.firmId, deletedAt: null, status: { not: 'CLOSED' } }, select: { id: true, ownRef: true, title: true }, orderBy: { ownRef: 'asc' } }),
    ]);
    return {
      date, fetchedAt: new Date().toISOString(), cases,
      members: members.map((m) => ({ ...m.user, userId: m.userId, role: m.role, workTypes: m.taskWorkTypes,
        onLeave: leaves.some((l) => l.userId === m.userId),
        appointments: events.filter((e) => attends(e, m.userId)).map((e) => ({ id: e.id, title: e.title, startAt: e.startAt, endAt: e.endAt })),
      })),
      tasks: rows.map((t) => ({ id: t.id, title: t.title, status: t.status, priority: t.priority,
        assigneeId: t.assigneeId, workerId: (t.status === TaskStatus.PENDING_REVIEW || t.status === TaskStatus.DONE) && t.assignmentLogs[0]?.action === 'HANDED_OFF' ? t.assignmentLogs[0].fromUserId ?? t.assigneeId : t.assigneeId,
        reviewerId: t.reviewerId, requiresReview: t.requiresReview, caseId: t.caseId, case: t.case,
        workType: t.workType, size: t.size, dueDate: t.dueDate, scheduledFor: t.scheduledFor, queuePosition: t.queuePosition,
        assignedAt: t.assignedAt, acknowledgedAt: t.acknowledgedAt, completedAt: t.completedAt,
        planConfirmedAt: t.planConfirmedAt,
        blocker: t.comments[0]?.body.split('\nติดอะไร: ')[1]?.trim() && t.comments[0].body.split('\nติดอะไร: ')[1].trim() !== 'ไม่มี' ? t.comments[0].body.split('\nติดอะไร: ')[1].trim() : null,
        holdReason: t.onHold && !t.onHold.endedAt ? t.onHold.reason : null,
        blockedBy: t.blockedBy && t.blockedBy.status !== TaskStatus.DONE ? t.blockedBy.title : null,
        latestUpdate: t.comments[0] ? { body: t.comments[0].body, createdAt: t.comments[0].createdAt, authorId: t.comments[0].authorId, authorName: `${t.comments[0].author.firstName} ${t.comments[0].author.lastName}` } : null,
      })),
    };
  }

  /** Seven Bangkok days from `date`, per member: planned work (points), hearings, and leave. */
  async radar(user: AuthUser, date: string): Promise<TeamRadar> {
    this.owner(user);
    const start = new Date(`${date}T00:00:00+07:00`);
    const end = new Date(start.getTime() + 7 * DAY_MS);
    const days = Array.from({ length: 7 }, (_, i) => bangkokDayKey(new Date(start.getTime() + i * DAY_MS)));
    const dateOnly = (day: string) => new Date(`${day}T00:00:00Z`);
    const now = new Date();
    const [members, tasks, leaves, events] = await Promise.all([
      this.prisma.firmMember.findMany({ where: { firmId: user.firmId }, include: { user: { select: { firstName: true, lastName: true } } }, orderBy: { user: { firstName: 'asc' } } }),
      this.prisma.task.findMany({ where: { AND: [dailyTaskScope(user.firmId), { assigneeId: { not: null }, status: { not: TaskStatus.DONE } }] }, select: { assigneeId: true, status: true, size: true, dueDate: true, scheduledFor: true } }),
      this.prisma.leaveRequest.findMany({ where: { firmId: user.firmId, status: 'APPROVED', startDate: { lte: dateOnly(days[6]) }, endDate: { gte: dateOnly(days[0]) } }, select: { userId: true, startDate: true, endDate: true } }),
      this.prisma.calendarEvent.findMany({ where: { case: { firmId: user.firmId, deletedAt: null }, startAt: { gte: start, lt: end } }, select: { startAt: true, assigneeId: true, assignees: { select: { userId: true } }, case: { select: { leadLawyerId: true } } } }),
    ]);
    return {
      start: date, days,
      members: members.map((m) => {
        const mine = tasks.filter((t) => t.assigneeId === m.userId);
        // After a hand-off the reviewer holds the task; that is review work, not queue work.
        const open = mine.filter((t) => t.status !== TaskStatus.PENDING_REVIEW);
        const myEvents = events.filter((e) => attends(e, m.userId));
        return {
          userId: m.userId, firstName: m.user.firstName, lastName: m.user.lastName, role: m.role,
          openCount: open.length,
          openPoints: open.reduce((sum, t) => sum + taskPoints(t.size), 0),
          overdueCount: open.filter((t) => t.dueDate && t.dueDate < now).length,
          reviewCount: mine.length - open.length,
          unscheduledCount: open.filter((t) => !taskDay(t)).length,
          days: days.map((day) => {
            const onDay = open.filter((t) => taskDay(t) === day);
            return {
              date: day,
              taskCount: onDay.length,
              points: onDay.reduce((sum, t) => sum + taskPoints(t.size), 0),
              eventCount: myEvents.filter((e) => bangkokDayKey(e.startAt) === day).length,
              onLeave: leaves.some((l) => l.userId === m.userId && l.startDate <= dateOnly(day) && l.endDate >= dateOnly(day)),
            };
          }),
        };
      }),
    };
  }

  /** Everything one member is carrying, for the owner deciding whether to hand them more. */
  async person(user: AuthUser, userId: string): Promise<PersonWorkload> {
    this.owner(user);
    const member = await this.prisma.firmMember.findUnique({ where: { firmId_userId: { firmId: user.firmId, userId } }, include: { user: { select: { firstName: true, lastName: true } } } });
    if (!member) throw new NotFoundException('ไม่พบสมาชิกในสำนักงาน');
    const now = new Date();
    const [tasks, cases, events, leaves] = await Promise.all([
      this.prisma.task.findMany({ where: { AND: [dailyTaskScope(user.firmId), { assigneeId: userId, status: { not: TaskStatus.DONE } }] }, select: {
        id: true, title: true, status: true, dueDate: true, scheduledFor: true, size: true,
        case: { select: { id: true, ownRef: true, title: true } }, onHold: { select: { reason: true, endedAt: true } },
      }, orderBy: [{ queuePosition: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }] }),
      this.prisma.case.findMany({ where: { firmId: user.firmId, deletedAt: null, status: { not: 'CLOSED' }, OR: [
        { leadLawyerId: userId }, { assignments: { some: { userId, assignmentType: AssignmentType.BUDDY } } },
      ] }, select: { id: true, ownRef: true, title: true, status: true, leadLawyerId: true }, orderBy: { ownRef: 'asc' } }),
      this.prisma.calendarEvent.findMany({ where: { case: { firmId: user.firmId, deletedAt: null }, startAt: { gte: bangkokDayStart(now), lt: new Date(bangkokDayStart(now).getTime() + 7 * DAY_MS) } }, select: {
        id: true, title: true, startAt: true, endAt: true, courtName: true, assigneeId: true, assignees: { select: { userId: true } }, case: { select: { leadLawyerId: true } },
      }, orderBy: { startAt: 'asc' } }),
      this.prisma.leaveRequest.findMany({ where: { firmId: user.firmId, userId, status: 'APPROVED', endDate: { gte: bangkokDateOnly(now) } }, select: { id: true, type: true, startDate: true, endDate: true }, orderBy: { startDate: 'asc' }, take: 5 }),
    ]);
    const open = tasks.filter((t) => t.status !== TaskStatus.PENDING_REVIEW);
    return {
      userId, firstName: member.user.firstName, lastName: member.user.lastName, role: member.role,
      tasks: open.map((t) => ({
        id: t.id, title: t.title, status: t.status, size: t.size as PersonWorkload['tasks'][number]['size'], case: t.case,
        dueDate: t.dueDate?.toISOString() ?? null, scheduledFor: t.scheduledFor?.toISOString().slice(0, 10) ?? null,
        overdue: !!t.dueDate && t.dueDate < now,
        holdReason: t.onHold && !t.onHold.endedAt ? t.onHold.reason : null,
      })),
      reviews: tasks.filter((t) => t.status === TaskStatus.PENDING_REVIEW).map((t) => ({ id: t.id, title: t.title, dueDate: t.dueDate?.toISOString() ?? null })),
      cases: cases.map((c) => ({ id: c.id, ownRef: c.ownRef, title: c.title, status: c.status, role: c.leadLawyerId === userId ? 'LEAD' : 'BUDDY' })),
      events: events.filter((e) => attends(e, userId)).map((e) => ({ id: e.id, title: e.title, startAt: e.startAt.toISOString(), endAt: e.endAt?.toISOString() ?? null, courtName: e.courtName })),
      leaves: leaves.map((l) => ({ id: l.id, type: l.type, startDate: l.startDate.toISOString().slice(0, 10), endDate: l.endDate.toISOString().slice(0, 10) })),
    };
  }

  async workTypes(user: AuthUser, userId: string, workTypes: TaskWorkType[]) {
    this.owner(user);
    const member = await this.prisma.firmMember.findUnique({ where: { firmId_userId: { firmId: user.firmId, userId } } });
    if (!member) throw new NotFoundException('ไม่พบสมาชิกในสำนักงาน');
    return this.prisma.firmMember.update({ where: { id: member.id }, data: { taskWorkTypes: workTypes } });
  }

  private async position(user: AuthUser, assigneeId: string | undefined, first: boolean) {
    const range = await this.prisma.task.aggregate({ where: { AND: [dailyTaskScope(user.firmId), { assigneeId: assigneeId ?? null, status: { notIn: [TaskStatus.DONE, TaskStatus.PENDING_REVIEW] } }] }, _min: { queuePosition: true }, _max: { queuePosition: true } });
    return first ? (range._min.queuePosition ?? 0) - 1 : (range._max.queuePosition ?? 0) + 1;
  }

  async create(user: AuthUser, dto: CreateDailyTaskDto) {
    this.owner(user);
    if (dto.caseId && !await this.prisma.case.findFirst({ where: { id: dto.caseId, firmId: user.firmId, deletedAt: null } })) throw new NotFoundException('ไม่พบคดีในสำนักงาน');
    const position = await this.position(user, dto.assigneeId, dto.placeFirst ?? false);
    const { caseId, placeFirst: _placeFirst, ...data } = dto;
    return this.tasks.create(user, caseId ?? null, data, undefined, undefined, position);
  }

  async assign(user: AuthUser, taskId: string, dto: AssignDailyTaskDto) {
    this.owner(user);
    const task = await this.inFirm(user, taskId);
    if ([TaskStatus.DONE, TaskStatus.PENDING_REVIEW].includes(task.status as TaskStatus)) throw new BadRequestException('มอบหมายได้เฉพาะงานที่ยังไม่ส่งตรวจหรือเสร็จ');
    if (task.requiresReview && task.reviewerId === dto.assigneeId) throw new BadRequestException('ผู้ทำงานและผู้ตรวจต้องเป็นคนละคน');
    const position = await this.position(user, dto.assigneeId, dto.placeFirst ?? false);
    await this.tasks.update(taskId, { assigneeId: dto.assigneeId, ...(dto.size && { size: dto.size }) }, user, task.caseId ?? undefined);
    return this.prisma.task.update({ where: { id: taskId }, data: { queuePosition: position } });
  }

  private async inFirm(user: AuthUser, taskId: string) {
    const task = await this.prisma.task.findFirst({ where: { AND: [{ id: taskId }, dailyTaskScope(user.firmId)] } });
    if (!task) throw new NotFoundException('ไม่พบงานในสำนักงาน');
    return task;
  }

  async move(user: AuthUser, taskId: string, direction: 'UP' | 'DOWN') {
    this.owner(user);
    const task = await this.inFirm(user, taskId);
    if (!task.assigneeId || [TaskStatus.DONE, TaskStatus.PENDING_REVIEW].includes(task.status as TaskStatus)) throw new BadRequestException('จัดลำดับได้เฉพาะงานระหว่างทำ');
    // ponytail: serializable transaction for a small office queue; retry in the UI if two owners reorder together.
    return this.prisma.$transaction(async (tx) => {
      const queue = await tx.task.findMany({ where: { AND: [dailyTaskScope(user.firmId), { assigneeId: task.assigneeId, status: { notIn: [TaskStatus.DONE, TaskStatus.PENDING_REVIEW] } }] }, orderBy: [{ queuePosition: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }] });
      const from = queue.findIndex((t) => t.id === taskId);
      const to = from + (direction === 'UP' ? -1 : 1);
      if (from < 0 || to < 0 || to >= queue.length) return { changed: false };
      [queue[from], queue[to]] = [queue[to], queue[from]];
      for (const [index, row] of queue.entries()) await tx.task.update({ where: { id: row.id }, data: { queuePosition: index } });
      await tx.taskComment.create({ data: { taskId, authorId: user.id, kind: 'SYSTEM', body: `Owner ปรับลำดับงาน${direction === 'UP' ? 'ขึ้น' : 'ลง'} โดยคงกำหนดส่งเดิม` } });
      return { changed: true };
    }, { isolationLevel: 'Serializable' });
  }
}

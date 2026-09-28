import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AuthUser, FirmRole, TaskStatus, TaskWorkType } from '@lawfirm/shared';
import { Prisma } from '../generated/prisma';
import { PrismaService } from '../prisma/prisma.module';
import { TasksService } from '../tasks/tasks.service';
import { AssignDailyTaskDto, CreateDailyTaskDto } from './dto/daily-operations.dto';

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
        appointments: events.filter((e) => (e.assigneeId ?? e.case.leadLawyerId) === m.userId || e.assignees.some((a) => a.userId === m.userId)).map((e) => ({ id: e.id, title: e.title, startAt: e.startAt, endAt: e.endAt })),
      })),
      tasks: rows.map((t) => ({ id: t.id, title: t.title, status: t.status, priority: t.priority,
        assigneeId: t.assigneeId, workerId: (t.status === TaskStatus.PENDING_REVIEW || t.status === TaskStatus.DONE) && t.assignmentLogs[0]?.action === 'HANDED_OFF' ? t.assignmentLogs[0].fromUserId ?? t.assigneeId : t.assigneeId,
        reviewerId: t.reviewerId, requiresReview: t.requiresReview, caseId: t.caseId, case: t.case,
        workType: t.workType, dueDate: t.dueDate, scheduledFor: t.scheduledFor, queuePosition: t.queuePosition,
        assignedAt: t.assignedAt, acknowledgedAt: t.acknowledgedAt, completedAt: t.completedAt,
        planConfirmedAt: t.planConfirmedAt,
        blocker: t.comments[0]?.body.split('\nติดอะไร: ')[1]?.trim() && t.comments[0].body.split('\nติดอะไร: ')[1].trim() !== 'ไม่มี' ? t.comments[0].body.split('\nติดอะไร: ')[1].trim() : null,
        holdReason: t.onHold && !t.onHold.endedAt ? t.onHold.reason : null,
        blockedBy: t.blockedBy && t.blockedBy.status !== TaskStatus.DONE ? t.blockedBy.title : null,
        latestUpdate: t.comments[0] ? { body: t.comments[0].body, createdAt: t.comments[0].createdAt, authorId: t.comments[0].authorId, authorName: `${t.comments[0].author.firstName} ${t.comments[0].author.lastName}` } : null,
      })),
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
    await this.tasks.update(taskId, { assigneeId: dto.assigneeId }, user, task.caseId ?? undefined);
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

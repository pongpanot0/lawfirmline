import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { TaskSource } from '../generated/prisma';
import {
  ActivityType,
  AssignmentType,
  AuthUser,
  FirmRole,
  TaskLogAction,
  TaskStatus,
} from '@lawfirm/shared';
import { PrismaService } from '../prisma/prisma.module';
import { CaseAccessService } from '../common/services/case-access.service';
import { CreateTaskDto, UpdateTaskDto } from './dto/task.dto';
import { StartTaskOnHoldDto, UpdateTaskOnHoldDto } from './dto/task-on-hold.dto';
import {
  HandoffStandaloneTaskDto,
  HandoffTaskDto,
  ReassignTaskDto,
  RejectTaskDto,
} from './dto/task-handoff.dto';

type CaseForAccess = { id: string; leadLawyerId: string };

@Injectable()
export class TasksService {
  constructor(
    private prisma: PrismaService,
    private caseAccess: CaseAccessService,
  ) {}

  private taskInclude = {
    assignee: {
      select: { id: true, firstName: true, lastName: true, email: true },
    },
    createdBy: {
      select: { id: true, firstName: true, lastName: true },
    },
    onHold: true,
    assignmentLogs: {
      orderBy: { createdAt: 'asc' as const },
      include: {
        fromUser: { select: { id: true, firstName: true, lastName: true } },
        toUser: { select: { id: true, firstName: true, lastName: true } },
        performedBy: { select: { id: true, firstName: true, lastName: true } },
      },
    },
  };

  private assertLeadOrOwner(user: AuthUser, legalCase: CaseForAccess) {
    if (user.firmRole === FirmRole.OWNER) return;
    if (legalCase.leadLawyerId === user.id) return;
    throw new ForbiddenException('เฉพาะทนายความหลักของคดี (Lead) หรือ Owner เท่านั้นที่ทำรายการนี้ได้');
  }

  private async ensureCaseMembership(caseId: string, userId: string) {
    const legalCase = await this.prisma.case.findUnique({ where: { id: caseId } });
    if (!legalCase || legalCase.leadLawyerId === userId) return;

    await this.prisma.caseAssignment.upsert({
      where: {
        caseId_userId_assignmentType: {
          caseId,
          userId,
          assignmentType: AssignmentType.BUDDY,
        },
      },
      create: { caseId, userId, assignmentType: AssignmentType.BUDDY },
      update: {},
    });
  }

  private async logAssignment(params: {
    taskId: string;
    action: TaskLogAction;
    toUserId: string;
    performedById: string;
    fromUserId?: string | null;
    note?: string | null;
    stageDueDate?: Date | null;
  }) {
    await this.prisma.taskAssignmentLog.create({
      data: {
        taskId: params.taskId,
        action: params.action,
        toUserId: params.toUserId,
        performedById: params.performedById,
        fromUserId: params.fromUserId ?? undefined,
        note: params.note ?? undefined,
        stageDueDate: params.stageDueDate ?? undefined,
      },
    });
  }

  private async logActivity(caseId: string | null, title: string, createdById: string) {
    if (!caseId) return;
    await this.prisma.caseActivity.create({
      data: { caseId, title, type: ActivityType.TASK, createdById },
    });
  }

  async findByCase(caseId: string, user: AuthUser) {
    return this.prisma.task.findMany({
      where: { caseId, ...this.caseAccess.getTaskFilterForUser(user) },
      include: this.taskInclude,
      orderBy: { createdAt: 'desc' },
    });
  }

  async findMine(user: AuthUser) {
    return this.prisma.task.findMany({
      where: {
        caseId: null,
        assignee: { firmMembers: { some: { firmId: user.firmId } } },
        ...this.caseAccess.getTaskFilterForUser(user),
      },
      include: this.taskInclude,
      orderBy: { createdAt: 'desc' },
    });
  }

  async assertStandaloneOwnership(id: string, user: AuthUser) {
    const task = await this.prisma.task.findUnique({ where: { id } });
    if (!task || task.caseId !== null) throw new NotFoundException('Task not found');
    if (task.assigneeId !== user.id && task.createdById !== user.id) {
      throw new ForbiddenException('You do not have access to this task');
    }
  }

  async findOne(id: string) {
    const task = await this.prisma.task.findUnique({
      where: { id },
      include: this.taskInclude,
    });
    if (!task) throw new NotFoundException('Task not found');
    return task;
  }

  async create(
    user: AuthUser,
    caseId: string | null,
    dto: CreateTaskDto,
    source: TaskSource = TaskSource.WEB,
  ) {
    const task = await this.prisma.task.create({
      data: {
        caseId,
        title: dto.title,
        description: dto.description,
        assigneeId: dto.assigneeId,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
        status: dto.status,
        createdById: user.id,
        source,
      },
      include: this.taskInclude,
    });

    if (caseId && dto.assigneeId) {
      await this.ensureCaseMembership(caseId, dto.assigneeId);
      await this.logAssignment({
        taskId: task.id,
        action: TaskLogAction.ASSIGNED,
        toUserId: dto.assigneeId,
        performedById: user.id,
        stageDueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
      });
      if (dto.assigneeId !== user.id) {
        await this.logActivity(caseId, `มอบหมายงาน "${task.title}" ให้ทำ`, user.id);
      }
    }

    return this.findOne(task.id);
  }

  async update(id: string, dto: UpdateTaskDto, user: AuthUser) {
    const task = await this.findOne(id);

    if (dto.status === TaskStatus.PENDING_REVIEW || dto.status === TaskStatus.NEEDS_REVISION) {
      throw new BadRequestException(
        'ใช้ปุ่ม "ส่งต่อให้ Senior" หรือ "ตีกลับ" สำหรับสถานะนี้ ไม่สามารถตั้งค่าตรงนี้ได้',
      );
    }

    // Hiding the button is not what keeps someone else's work out of reach.
    // A standalone todo already refuses a stranger; a case task did not, so
    // anyone with access to the case could close another lawyer's work.
    // The rule matches what the board offers: your own, or nobody's — and the
    // lead lawyer or owner, who may reassign it in the first place.
    if (dto.status !== undefined && task.assigneeId && task.assigneeId !== user.id) {
      const legalCase = task.caseId
        ? await this.prisma.case.findUnique({ where: { id: task.caseId } })
        : null;
      if (!legalCase) {
        throw new ForbiddenException('เปลี่ยนสถานะได้เฉพาะงานของตัวเอง');
      }
      this.assertLeadOrOwner(user, legalCase);
    }

    if (dto.assigneeId && task.caseId) {
      const legalCase = await this.prisma.case.findUnique({ where: { id: task.caseId } });
      if (!legalCase) throw new NotFoundException('Case not found');
      this.assertLeadOrOwner(user, legalCase);
      await this.ensureCaseMembership(task.caseId, dto.assigneeId);
      if (dto.assigneeId !== task.assigneeId) {
        await this.logAssignment({
          taskId: task.id,
          action: TaskLogAction.ASSIGNED,
          fromUserId: task.assigneeId,
          toUserId: dto.assigneeId,
          performedById: user.id,
        });
        await this.logActivity(task.caseId, `มอบหมายงาน "${task.title}" ใหม่`, user.id);
      }
    }

    return this.prisma.task.update({
      where: { id },
      data: {
        ...dto,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
      },
      include: this.taskInclude,
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.prisma.task.delete({ where: { id } });
    return { deleted: true };
  }

  async handoff(caseId: string, taskId: string, user: AuthUser, dto: HandoffTaskDto) {
    const task = await this.prisma.task.findFirst({ where: { id: taskId, caseId } });
    if (!task) throw new NotFoundException('ไม่พบงานนี้');

    const legalCase = await this.prisma.case.findUnique({ where: { id: caseId } });
    if (!legalCase) throw new NotFoundException('Case not found');

    if (user.id === legalCase.leadLawyerId) {
      throw new BadRequestException('คุณเป็น Senior lawyer ของคดีนี้อยู่แล้ว ไม่ต้องส่งต่อ');
    }
    if (task.assigneeId && task.assigneeId !== user.id) {
      throw new ForbiddenException('คุณไม่ใช่ผู้รับผิดชอบงานนี้');
    }
    const allowedStatuses: TaskStatus[] = [
      TaskStatus.TODO,
      TaskStatus.IN_PROGRESS,
      TaskStatus.NEEDS_REVISION,
      TaskStatus.DONE,
    ];
    if (!allowedStatuses.includes(task.status as TaskStatus)) {
      throw new BadRequestException('งานนี้ไม่อยู่ในสถานะที่ส่งต่อได้');
    }

    await this.prisma.task.update({
      where: { id: taskId },
      data: { status: TaskStatus.PENDING_REVIEW, assigneeId: legalCase.leadLawyerId },
    });

    await this.logAssignment({
      taskId,
      action: TaskLogAction.HANDED_OFF,
      fromUserId: user.id,
      toUserId: legalCase.leadLawyerId,
      performedById: user.id,
      note: dto.note,
      stageDueDate: dto.stageDueDate ? new Date(dto.stageDueDate) : undefined,
    });
    await this.logActivity(caseId, `ส่งงาน "${task.title}" ให้ Senior lawyer ตรวจ`, user.id);

    return this.findOne(taskId);
  }

  async accept(caseId: string, taskId: string, user: AuthUser) {
    const task = await this.prisma.task.findFirst({ where: { id: taskId, caseId } });
    if (!task) throw new NotFoundException('ไม่พบงานนี้');

    const legalCase = await this.prisma.case.findUnique({ where: { id: caseId } });
    if (!legalCase) throw new NotFoundException('Case not found');
    this.assertLeadOrOwner(user, legalCase);

    if (task.status !== TaskStatus.PENDING_REVIEW) {
      throw new BadRequestException('งานนี้ไม่ได้อยู่ในสถานะรอตรวจ');
    }

    await this.prisma.task.update({
      where: { id: taskId },
      data: { status: TaskStatus.DONE },
    });
    await this.logActivity(caseId, `ปิดงาน "${task.title}"`, user.id);

    return this.findOne(taskId);
  }

  async reject(caseId: string, taskId: string, user: AuthUser, dto: RejectTaskDto) {
    const task = await this.prisma.task.findFirst({ where: { id: taskId, caseId } });
    if (!task) throw new NotFoundException('ไม่พบงานนี้');

    const legalCase = await this.prisma.case.findUnique({ where: { id: caseId } });
    if (!legalCase) throw new NotFoundException('Case not found');
    this.assertLeadOrOwner(user, legalCase);

    if (task.status !== TaskStatus.PENDING_REVIEW) {
      throw new BadRequestException('งานนี้ไม่ได้อยู่ในสถานะรอตรวจ');
    }

    const lastHandoff = await this.prisma.taskAssignmentLog.findFirst({
      where: { taskId, action: TaskLogAction.HANDED_OFF },
      orderBy: { createdAt: 'desc' },
    });
    const returnToUserId = lastHandoff?.fromUserId ?? task.createdById;

    await this.prisma.task.update({
      where: { id: taskId },
      data: { status: TaskStatus.NEEDS_REVISION, assigneeId: returnToUserId },
    });

    await this.logAssignment({
      taskId,
      action: TaskLogAction.REJECTED,
      fromUserId: user.id,
      toUserId: returnToUserId,
      performedById: user.id,
      note: dto.reason,
    });
    await this.logActivity(caseId, `ตีกลับงาน "${task.title}": ${dto.reason}`, user.id);

    return this.findOne(taskId);
  }

  async reassign(caseId: string, taskId: string, user: AuthUser, dto: ReassignTaskDto) {
    const task = await this.prisma.task.findFirst({ where: { id: taskId, caseId } });
    if (!task) throw new NotFoundException('ไม่พบงานนี้');

    const legalCase = await this.prisma.case.findUnique({ where: { id: caseId } });
    if (!legalCase) throw new NotFoundException('Case not found');
    this.assertLeadOrOwner(user, legalCase);

    await this.ensureCaseMembership(caseId, dto.assigneeId);

    await this.prisma.task.update({
      where: { id: taskId },
      data: { assigneeId: dto.assigneeId },
    });

    await this.logAssignment({
      taskId,
      action: TaskLogAction.ASSIGNED,
      fromUserId: task.assigneeId,
      toUserId: dto.assigneeId,
      performedById: user.id,
      stageDueDate: dto.stageDueDate ? new Date(dto.stageDueDate) : undefined,
    });
    await this.logActivity(caseId, `มอบหมายงาน "${task.title}" ใหม่`, user.id);

    return this.findOne(taskId);
  }

  async handoffStandalone(taskId: string, user: AuthUser, dto: HandoffStandaloneTaskDto) {
    const task = await this.prisma.task.findFirst({ where: { id: taskId, caseId: null } });
    if (!task) throw new NotFoundException('ไม่พบงานนี้');

    if (task.assigneeId !== user.id) {
      throw new ForbiddenException('คุณไม่ใช่ผู้รับผิดชอบงานนี้');
    }
    if (dto.reviewerId === user.id) {
      throw new BadRequestException('ไม่สามารถส่งงานให้ตัวเองตรวจได้');
    }
    // A reviewer id comes straight from the client; only someone in the
    // caller's own firm may be handed one of its tasks.
    const reviewerInFirm = await this.prisma.firmMember.count({
      where: { firmId: user.firmId, userId: dto.reviewerId },
    });
    if (reviewerInFirm === 0) {
      throw new BadRequestException('ผู้ตรวจที่เลือกไม่ได้อยู่ในสำนักงานของคุณ');
    }
    const allowedStatuses: TaskStatus[] = [
      TaskStatus.TODO,
      TaskStatus.IN_PROGRESS,
      TaskStatus.NEEDS_REVISION,
    ];
    if (!allowedStatuses.includes(task.status as TaskStatus)) {
      throw new BadRequestException('งานนี้ไม่อยู่ในสถานะที่ส่งต่อได้');
    }

    await this.prisma.task.update({
      where: { id: taskId },
      data: { status: TaskStatus.PENDING_REVIEW, assigneeId: dto.reviewerId },
    });

    await this.logAssignment({
      taskId,
      action: TaskLogAction.HANDED_OFF,
      fromUserId: user.id,
      toUserId: dto.reviewerId,
      performedById: user.id,
      note: dto.note,
      stageDueDate: dto.stageDueDate ? new Date(dto.stageDueDate) : undefined,
    });

    return this.findOne(taskId);
  }

  async acceptStandalone(taskId: string, user: AuthUser) {
    const task = await this.prisma.task.findFirst({ where: { id: taskId, caseId: null } });
    if (!task) throw new NotFoundException('ไม่พบงานนี้');

    if (task.assigneeId !== user.id) {
      throw new ForbiddenException('คุณไม่ใช่ผู้ตรวจงานนี้');
    }
    if (task.status !== TaskStatus.PENDING_REVIEW) {
      throw new BadRequestException('งานนี้ไม่ได้อยู่ในสถานะรอตรวจ');
    }

    await this.prisma.task.update({
      where: { id: taskId },
      data: { status: TaskStatus.DONE },
    });

    return this.findOne(taskId);
  }

  async rejectStandalone(taskId: string, user: AuthUser, dto: RejectTaskDto) {
    const task = await this.prisma.task.findFirst({ where: { id: taskId, caseId: null } });
    if (!task) throw new NotFoundException('ไม่พบงานนี้');

    if (task.assigneeId !== user.id) {
      throw new ForbiddenException('คุณไม่ใช่ผู้ตรวจงานนี้');
    }
    if (task.status !== TaskStatus.PENDING_REVIEW) {
      throw new BadRequestException('งานนี้ไม่ได้อยู่ในสถานะรอตรวจ');
    }

    const lastHandoff = await this.prisma.taskAssignmentLog.findFirst({
      where: { taskId, action: TaskLogAction.HANDED_OFF },
      orderBy: { createdAt: 'desc' },
    });
    const returnToUserId = lastHandoff?.fromUserId ?? task.createdById;

    await this.prisma.task.update({
      where: { id: taskId },
      data: { status: TaskStatus.NEEDS_REVISION, assigneeId: returnToUserId },
    });

    await this.logAssignment({
      taskId,
      action: TaskLogAction.REJECTED,
      fromUserId: user.id,
      toUserId: returnToUserId,
      performedById: user.id,
      note: dto.reason,
    });

    return this.findOne(taskId);
  }

  async startOnHold(caseId: string, taskId: string, user: AuthUser, dto: StartTaskOnHoldDto) {
    const task = await this.prisma.task.findFirst({
      where: { id: taskId, caseId },
      include: { onHold: true },
    });
    if (!task) {
      throw new NotFoundException('ไม่พบงานนี้');
    }
    if (task.onHold && !task.onHold.endedAt) {
      throw new BadRequestException('งานนี้อยู่ในสถานะ On hold อยู่แล้ว');
    }

    return this.prisma.taskOnHold.create({
      data: {
        taskId,
        reason: dto.reason,
        followerUserId: dto.followerUserId,
        nextFollowUpAt: dto.nextFollowUpAt ? new Date(dto.nextFollowUpAt) : undefined,
        createdById: user.id,
      },
    });
  }

  async updateOnHold(caseId: string, taskId: string, dto: UpdateTaskOnHoldDto) {
    const hold = await this.prisma.taskOnHold.findFirst({
      where: { taskId, task: { caseId } },
    });
    if (!hold || hold.endedAt) {
      throw new NotFoundException('ไม่พบสถานะ On hold ที่ยังใช้งานอยู่สำหรับงานนี้');
    }

    return this.prisma.taskOnHold.update({
      where: { id: hold.id },
      data: {
        followerUserId: dto.followerUserId ?? hold.followerUserId,
        lastFollowUpAt: dto.lastFollowUpAt ? new Date(dto.lastFollowUpAt) : hold.lastFollowUpAt,
        nextFollowUpAt: dto.nextFollowUpAt ? new Date(dto.nextFollowUpAt) : hold.nextFollowUpAt,
        notes: dto.notes ?? hold.notes,
      },
    });
  }

  async resumeFromOnHold(caseId: string, taskId: string) {
    const hold = await this.prisma.taskOnHold.findFirst({
      where: { taskId, task: { caseId } },
    });
    if (!hold || hold.endedAt) {
      throw new NotFoundException('ไม่พบสถานะ On hold ที่ยังใช้งานอยู่สำหรับงานนี้');
    }

    return this.prisma.taskOnHold.update({
      where: { id: hold.id },
      data: { endedAt: new Date() },
    });
  }
}

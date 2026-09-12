import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, TaskSource } from '../generated/prisma';
import {
  ActivityType,
  AssignmentType,
  AuthUser,
  FirmRole,
  TaskLogAction,
  TaskPriority,
  TaskStatus,
  normalizeTaskLabels,
} from '@lawfirm/shared';
import { PrismaService } from '../prisma/prisma.module';
import { CaseAccessService } from '../common/services/case-access.service';
import { FileStorageService } from '../common/services/file-storage.service';
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
  private readonly logger = new Logger(TasksService.name);

  constructor(
    private prisma: PrismaService,
    private caseAccess: CaseAccessService,
    private fileStorage: FileStorageService,
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

  /**
   * Board cards need the counts, not the rows: a parent with 12 subtasks
   * would otherwise ship 12 nested objects per card.
   */
  private boardInclude = {
    ...this.taskInclude,
    subtasks: { select: { status: true } },
    _count: { select: { attachments: true, comments: true } },
  };

  private toBoardItem<
    T extends { subtasks?: { status: string }[]; _count?: { attachments: number; comments: number } },
  >(task: T) {
    const { subtasks, _count, ...rest } = task;
    const subtaskRows = subtasks ?? [];
    const counts = _count ?? { attachments: 0, comments: 0 };
    return {
      ...rest,
      subtaskCount: subtaskRows.length,
      subtaskDoneCount: subtaskRows.filter((s) => s.status === TaskStatus.DONE).length,
      attachmentCount: counts.attachments,
      commentCount: counts.comments,
    };
  }

  /** Maps the shared normalizer's codes onto API errors; `undefined` means "field not sent". */
  labelsFromDto(labels?: unknown): string[] | undefined {
    if (labels === undefined) return undefined;
    try {
      return normalizeTaskLabels(labels);
    } catch (error) {
      const code = error instanceof Error ? error.message : '';
      throw new BadRequestException(
        code === 'TASK_LABELS_TOO_MANY' ? 'ใส่ label ได้ไม่เกิน 10 รายการ' : 'label ยาวได้ไม่เกิน 30 ตัวอักษร',
      );
    }
  }

  /**
   * A standalone task carries no `firmId`; its tenancy is whatever firm the
   * assignee or creator belongs to — the same derivation `findMine` uses.
   */
  private standaloneFirmScope(user: AuthUser): Prisma.TaskWhereInput {
    return {
      OR: [
        { assignee: { firmMembers: { some: { firmId: user.firmId } } } },
        { createdBy: { firmMembers: { some: { firmId: user.firmId } } } },
      ],
    };
  }

  /**
   * The one access rule for `/tasks/:id/*`: a case task follows case
   * membership, a personal task its assignee/creator plus whatever the
   * caller's board already lists (a senior sees their lawyers' cards).
   * Returns the row so callers do not fetch it twice.
   */
  async assertAccess(taskId: string, user: AuthUser) {
    const task = await this.prisma.task.findUnique({ where: { id: taskId } });
    if (!task) throw new NotFoundException('Task not found');
    if (task.caseId) {
      if (!(await this.caseAccess.canAccessCase(user, task.caseId))) {
        throw new ForbiddenException('You do not have access to this task');
      }
      return task;
    }

    // Tenancy first: another firm's todo must look like it does not exist,
    // owner included — OWNER is only an owner of their own firm.
    const inFirm = await this.prisma.task.findFirst({
      where: { id: taskId, caseId: null, ...this.standaloneFirmScope(user) },
      select: { id: true },
    });
    if (!inFirm) throw new NotFoundException('Task not found');

    if (user.firmRole === FirmRole.OWNER) return task;
    if (task.assigneeId === user.id || task.createdById === user.id) return task;

    // Anything the board shows must open; otherwise seniors get a 403 on a
    // card they can see.
    const visible = await this.prisma.task.findFirst({
      where: { id: taskId, caseId: null, ...this.caseAccess.getTaskFilterForUser(user) },
      select: { id: true },
    });
    if (!visible) throw new ForbiddenException('You do not have access to this task');
    return task;
  }

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
    const tasks = await this.prisma.task.findMany({
      where: { caseId, parentId: null, ...this.caseAccess.getTaskFilterForUser(user) },
      include: this.boardInclude,
      orderBy: { createdAt: 'desc' },
    });
    return tasks.map((task) => this.toBoardItem(task));
  }

  async findMine(user: AuthUser) {
    const tasks = await this.prisma.task.findMany({
      where: {
        caseId: null,
        parentId: null,
        assignee: { firmMembers: { some: { firmId: user.firmId } } },
        ...this.caseAccess.getTaskFilterForUser(user),
      },
      include: this.boardInclude,
      orderBy: { createdAt: 'desc' },
    });
    return tasks.map((task) => this.toBoardItem(task));
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
        priority: dto.priority ?? TaskPriority.MEDIUM,
        labels: this.labelsFromDto(dto.labels) ?? [],
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

  async update(id: string, dto: UpdateTaskDto, user: AuthUser, caseId?: string) {
    // The case guard only proves the caller may touch THIS case; without
    // binding the task to it, any task id in the database would be editable.
    if (caseId) {
      const inCase = await this.prisma.task.findFirst({
        where: { id, caseId },
        select: { id: true },
      });
      if (!inCase) throw new NotFoundException('ไม่พบงานนี้');
    }
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
        labels: this.labelsFromDto(dto.labels),
        dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
      },
      include: this.taskInclude,
    });
  }

  async remove(id: string, caseId?: string) {
    // The case guard only proves the caller may touch THIS case; without
    // binding the task to it, any task id in the database would be deletable.
    if (caseId) {
      const inCase = await this.prisma.task.findFirst({
        where: { id, caseId },
        select: { id: true },
      });
      if (!inCase) throw new NotFoundException('ไม่พบงานนี้');
    }
    // The rows cascade with the task; the bytes behind them do not, so they
    // would sit in storage forever with nothing left pointing at them.
    const task = await this.prisma.task.findUnique({
      where: { id },
      include: {
        attachments: { select: { storagePath: true } },
        subtasks: { select: { attachments: { select: { storagePath: true } } } },
      },
    });
    if (!task) throw new NotFoundException('Task not found');

    const storagePaths = [
      ...task.attachments.map((a) => a.storagePath),
      ...task.subtasks.flatMap((s) => s.attachments.map((a) => a.storagePath)),
    ];
    for (const storagePath of storagePaths) {
      try {
        await this.fileStorage.delete(storagePath);
      } catch (err) {
        this.logger.warn(
          `Failed to remove ${storagePath}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

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

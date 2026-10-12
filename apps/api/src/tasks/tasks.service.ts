import { ModuleRef } from '@nestjs/core';
import { WorkflowsService } from '../workflows/workflows.service';
import { assertFirmRefs } from '../common/firm-refs';
import { canCompleteFromLine, canHandoffFromLine, lineActions } from '../notifications/line-actions';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { NotificationCategory, Prisma, Task, TaskSource } from '../generated/prisma';
import {
  ActivityType,
  AssignmentType,
  AuthUser,
  FirmRole,
  canAssignFirmRole,
  canDelegateTask,
  hasFirmCapability,
  effectiveReviewerId,
  isEligibleReviewer,
  TASK_HANDOFF_NOTE_MIN,
  TaskLogAction,
  TaskPriority,
  TaskStatus,
  normalizeTaskLabels,
  TaskRoutineDefinition,
  TaskRoutineSnapshot,
  taskRoutineSnapshot,
  routineMissing,
  dailyUpdateParts,
} from '@lawfirm/shared';
import { PrismaService } from '../prisma/prisma.module';
import { CaseAccessService } from '../common/services/case-access.service';
import { FileStorageService } from '../common/services/file-storage.service';
import { AssignmentNotifierService, NotifyParams } from '../notifications/assignment-notifier.service';
import { taskAppRoute } from '../notifications/app-route';
import {
  formatCaseNotificationReference,
  formatIntakeNotificationReference,
} from '../notifications/reference-label';
import { reviewQueueWhere } from './review-queue';
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
    private assignmentNotifier: AssignmentNotifierService,
    private moduleRef: ModuleRef,
  ) {}

  private taskInclude = {
    assignee: {
      select: { id: true, firstName: true, lastName: true, email: true },
    },
    createdBy: {
      select: { id: true, firstName: true, lastName: true },
    },
    reviewer: { select: { id: true, firstName: true, lastName: true } },
    observers: {
      select: { id: true, userId: true, user: { select: { id: true, firstName: true, lastName: true } }, createdAt: true },
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
    assignee: { select: { id: true, firstName: true, lastName: true, email: true } },
    createdBy: { select: { id: true, firstName: true, lastName: true } },
    reviewer: { select: { id: true, firstName: true, lastName: true } },
    onHold: { select: { reason: true, endedAt: true } },
    subtasks: { select: { status: true } },
    _count: { select: { attachments: true, comments: true, observers: true } },
    assignmentLogs: { where: { action: TaskLogAction.HANDED_OFF }, orderBy: { createdAt: 'desc' as const }, take: 1, select: { fromUserId: true } },
  };

  private toBoardItem<
    T extends { subtasks?: { status: string }[]; _count?: { attachments: number; comments: number }; assignmentLogs?: { fromUserId: string | null }[] },
  >(task: T) {
    const { subtasks, _count, assignmentLogs, ...rest } = task;
    const subtaskRows = subtasks ?? [];
    const counts = _count ?? { attachments: 0, comments: 0 };
    return {
      ...rest,
      handedOffById: assignmentLogs?.[0]?.fromUserId ?? null,
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
        { firmId: user.firmId },
        { firmId: null, assignee: { firmMembers: { some: { firmId: user.firmId } } } },
        { firmId: null, createdBy: { firmMembers: { some: { firmId: user.firmId } } } },
      ],
    };
  }

  /**
   * The one access rule for `/tasks/:id/*`: a case task follows case
   * membership, a personal task its assignee/creator plus whatever the
   * caller's board already lists (a senior sees their lawyers' cards).
   * Returns the row so callers do not fetch it twice.
   */
  /** Firm members (not external) among userIds who pass the same access check as opening the task. */
  async filterUsersWhoCanSeeTask(taskId: string, userIds: string[], firmId: string): Promise<string[]> {
    if (!userIds.length) return [];
    const members = await this.prisma.firmMember.findMany({
      where: { firmId, role: { not: FirmRole.EXTERNAL }, userId: { in: userIds } },
      select: { userId: true, role: true },
    });
    const seen = await Promise.all(members.map(async (m) => {
      try {
        await this.assertAccess(taskId, { id: m.userId, firmId, firmRole: m.role } as AuthUser);
        return m.userId;
      } catch {
        return null;
      }
    }));
    return seen.filter((id): id is string => !!id);
  }

  /** LINE knows only a task id; route to the case or standalone review action the web uses. */
  async handoffById(taskId: string, user: AuthUser, note: string) {
    const task = await this.assertAccess(taskId, user);
    if (task.caseId) return this.handoff(task.caseId, taskId, user, { note });
    if (!task.reviewerId) throw new BadRequestException('งานนี้ยังไม่ได้เลือกผู้ตรวจ ส่งตรวจจากแอปหรือเว็บแทน');
    return this.handoffStandalone(taskId, user, { reviewerId: task.reviewerId, note });
  }

  async acceptById(taskId: string, user: AuthUser) {
    const task = await this.assertAccess(taskId, user);
    return task.caseId ? this.accept(task.caseId, taskId, user) : this.acceptStandalone(taskId, user);
  }

  async rejectById(taskId: string, user: AuthUser, reason: string) {
    const task = await this.assertAccess(taskId, user);
    return task.caseId ? this.reject(task.caseId, taskId, user, { reason }) : this.rejectStandalone(taskId, user, { reason });
  }

  async assertAccess(taskId: string, user: AuthUser) {
    const task = await this.prisma.task.findUnique({ where: { id: taskId } });
    if (!task) throw new NotFoundException('Task not found');
    if (task.firmId && task.firmId !== user.firmId) throw new NotFoundException('Task not found');
    if (task.caseId) {
      if (!(await this.caseAccess.canAccessCase(user, task.caseId))) {
        const delivered = await this.prisma.task.findFirst({
          where: { id: taskId, ...this.caseAccess.getTaskAccessFilterForUser(user) }, select: { id: true },
        });
        if (!delivered) throw new ForbiddenException('You do not have access to this task');
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

    if (hasFirmCapability(user.firmRole, 'viewAllCases')) return task;
    if (task.assigneeId === user.id || task.createdById === user.id) return task;
    if (task.reviewerId === user.id) return task;
    // Sending for review changes the assignee; the sender still needs to follow the delivered work.
    if ([TaskStatus.PENDING_REVIEW, TaskStatus.DONE].includes(task.status as TaskStatus)) {
      const delivered = await this.prisma.taskAssignmentLog.findFirst({ where: { taskId, action: TaskLogAction.HANDED_OFF, fromUserId: user.id } });
      if (delivered) return task;
    }

    // Check if user is an observer
    const isObserver = await this.prisma.taskObserver.findFirst({
      where: { taskId, userId: user.id },
      select: { id: true },
    });
    if (isObserver) return task;

    // Anything the board shows must open; otherwise seniors get a 403 on a
    // card they can see.
    const visible = await this.prisma.task.findFirst({
      where: { id: taskId, caseId: null, ...this.caseAccess.getTaskAccessFilterForUser(user) },
      select: { id: true },
    });
    if (!visible) throw new ForbiddenException('You do not have access to this task');
    return task;
  }

  /**
   * Accept/reject follow the reviewer, never the assignee: the named reviewer,
   * else the case lead. A reviewer-less case task may also be closed by the
   * OWNER, so a lead who left the case never strands it.
   */
  private assertReviewer(task: { reviewerId: string | null; assigneeId: string | null }, leadLawyerId: string | null, user: AuthUser) {
    if (task.assigneeId === user.id) throw new ForbiddenException('ผู้ทำงานตรวจงานของตัวเองไม่ได้');
    if (user.firmRole === FirmRole.OFFICE_MANAGER) throw new ForbiddenException('เฉพาะผู้ตรวจของงานนี้เท่านั้น');
    if (effectiveReviewerId(task, leadLawyerId) === user.id) return;
    if (!task.reviewerId && leadLawyerId && user.firmRole === FirmRole.OWNER) return;
    throw new ForbiddenException('เฉพาะผู้ตรวจของงานนี้เท่านั้น');
  }

  private assertLeadOrOwner(user: AuthUser, legalCase: CaseForAccess) {
    if (hasFirmCapability(user.firmRole, 'runOperations')) return;
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

  private async referenceLine(caseId?: string | null, intakeId?: string | null): Promise<string | null> {
    if (caseId) {
      const legalCase = await this.prisma.case.findUnique({
        where: { id: caseId },
        select: { ownRef: true, blackCaseNumber: true, redCaseNumber: true },
      });
      return legalCase && formatCaseNotificationReference(legalCase);
    }
    if (intakeId) {
      const intake = await this.prisma.intake.findUnique({ where: { id: intakeId }, select: { case: { select: { ownRef: true } } } });
      return formatIntakeNotificationReference(intake?.case?.ownRef);
    }
    return null;
  }

  private async taskAssignmentSummary(title: string, caseId?: string | null, intakeId?: string | null) {
    const reference = await this.referenceLine(caseId, intakeId);
    return `📌 คุณได้รับมอบหมายงานใหม่\nงาน: ${title}${reference ? `\n${reference}` : ''}`;
  }

  private async notifyWorker(task: { id: string; title: string; caseId: string | null; assigneeId: string | null }, user: AuthUser, summaryText: string) {
    if (!task.assigneeId) return;
    await this.assignmentNotifier.notifyAssigned({
      firmId: user.firmId,
      userIds: [task.assigneeId],
      actorUserId: user.id,
      category: NotificationCategory.TASK,
      summaryText,
      entityPath: task.caseId ? `/cases/${task.caseId}` : '/todos',
      appPath: taskAppRoute(task.id),
    });
  }

  /** Note, attachment gate and routine checks shared by both handoff routes; TODO is first recorded as IN_PROGRESS. */
  private async prepareHandoff(task: Task, user: AuthUser, note: string | undefined): Promise<string> {
    const trimmed = (note ?? '').trim();
    if (trimmed.length < TASK_HANDOFF_NOTE_MIN) {
      throw new BadRequestException(`เขียนหมายเหตุถึงผู้ตรวจอย่างน้อย ${TASK_HANDOFF_NOTE_MIN} ตัวอักษร`);
    }
    if (task.requiresAttachment && !(await this.prisma.taskAttachment.count({ where: { taskId: task.id } }))) {
      throw new BadRequestException('งานนี้ต้องแนบไฟล์ผลงานก่อนส่งตรวจ');
    }
    await this.assertRoutineReady(task);
    if (task.status === TaskStatus.TODO) {
      await this.updateWithHistory({ where: { id: task.id }, data: { status: TaskStatus.IN_PROGRESS } }, user);
    }
    return trimmed;
  }

  private async notifyReviewer(task: { id: string; title: string; caseId: string | null }, reviewerId: string, user: AuthUser, note: string) {
    try {
      const [worker, reference] = await Promise.all([
        this.prisma.user.findUnique({ where: { id: user.id }, select: { firstName: true, lastName: true } }),
        this.referenceLine(task.caseId),
      ]);
      await this.assignmentNotifier.notifyAssigned({
        firmId: user.firmId,
        userIds: [reviewerId],
        actorUserId: user.id,
        category: NotificationCategory.TASK,
        summaryText: `📋 ส่งงานให้ตรวจ: ${task.title}\nจาก: ${worker?.firstName ?? ''} ${worker?.lastName ?? ''}${reference ? `\n${reference}` : ''}\nหมายเหตุ: ${note}`,
        entityPath: task.caseId ? `/cases/${task.caseId}` : '/todos',
        appPath: taskAppRoute(task.id),
        lineActions: () => lineActions.review(task.id),
      });
    } catch (err) {
      this.logger.warn(`Review notice failed for task ${task.id}: ${err instanceof Error ? err.message : String(err)}`);
    }
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

  /**
   * A person's own work list — standalone todos and case tasks alike, since
   * a lawyer doesn't stop owning a task just because it happens to live
   * inside a case. The "mine/team/review" split still happens client-side.
   */
  /** งาน/checklist ของเรื่องรับเข้า — เหมือน findByCase แต่ผูกกับ intake */
  async findByIntake(intakeId: string, user: AuthUser) {
    await this.assertIntakeAccess(intakeId, user);
    const tasks = await this.prisma.task.findMany({
      where: { intakeId, parentId: null, ...this.caseAccess.getTaskFilterForUser(user) },
      include: this.boardInclude,
      orderBy: { createdAt: 'desc' },
    });
    return tasks.map((task) => this.toBoardItem(task));
  }

  /** intake ไม่มี guard แบบ CaseAccessGuard — เช็คสิทธิ์เองก่อนแตะงานของมัน */
  private async assertIntakeAccess(intakeId: string, user: AuthUser) {
    const accessWhere = await this.caseAccess.getIntakeFilterForUser(user);
    const intake = await this.prisma.intake.findFirst({
      where: { id: intakeId, ...accessWhere },
      select: { id: true },
    });
    if (!intake) throw new NotFoundException('Intake not found');
  }

  async createForIntake(user: AuthUser, intakeId: string, dto: CreateTaskDto) {
    await this.assertIntakeAccess(intakeId, user);
    // ไม่ระบุผู้รับผิดชอบ = งานของคนที่สร้าง (เหมือน /todos)
    return this.create(user, null, { ...dto, assigneeId: dto.assigneeId ?? user.id }, TaskSource.WEB, intakeId);
  }

  async updateForIntake(user: AuthUser, intakeId: string, taskId: string, dto: UpdateTaskDto) {
    await this.assertIntakeAccess(intakeId, user);
    const inIntake = await this.prisma.task.findFirst({
      where: { id: taskId, intakeId },
      select: { id: true },
    });
    if (!inIntake) throw new NotFoundException('ไม่พบงานนี้');
    return this.update(taskId, dto, user);
  }

  async removeForIntake(user: AuthUser, intakeId: string, taskId: string) {
    await this.assertIntakeAccess(intakeId, user);
    const inIntake = await this.prisma.task.findFirst({
      where: { id: taskId, intakeId },
      select: { id: true },
    });
    if (!inIntake) throw new NotFoundException('ไม่พบงานนี้');
    return this.remove(taskId);
  }

  async findMine(user: AuthUser, view = 'all') {
    if (!['all', 'mine', 'created', 'review'].includes(view)) {
      throw new BadRequestException('Unknown task view');
    }
    const viewFilter: Prisma.TaskWhereInput = view === 'created'
      ? { createdById: user.id }
      : view === 'review'
        ? reviewQueueWhere(user)
        : { OR: [{ assigneeId: user.id }, { status: { in: [TaskStatus.PENDING_REVIEW, TaskStatus.DONE] }, assignmentLogs: { some: { action: TaskLogAction.HANDED_OFF, fromUserId: user.id } } }] };
    const tasks = await this.prisma.task.findMany({
      where: view === 'all' ? {
        parentId: null,
        assignee: { firmMembers: { some: { firmId: user.firmId } } },
        ...this.caseAccess.getTaskFilterForUser(user),
      } : {
        AND: [
          { OR: [
            { case: { firmId: user.firmId, deletedAt: null } },
            { caseId: null, ...this.standaloneFirmScope(user) },
          ] },
          this.caseAccess.getTaskAccessFilterForUser(user),
          viewFilter,
        ],
      },
      include: {
        ...this.boardInclude,
        comments: { orderBy: { createdAt: 'desc' }, take: 1,
          select: { id: true, body: true, createdAt: true, author: { select: { firstName: true, lastName: true } } } },
        case: { select: { id: true, ownRef: true, title: true, blackCaseNumber: true, redCaseNumber: true, leadLawyerId: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    return tasks.map((task) => this.toBoardItem(task));
  }

  async assertStandaloneOwnership(id: string, user: AuthUser) {
    if ([FirmRole.OWNER, FirmRole.SENIOR_LAWYER, FirmRole.OFFICE_MANAGER].includes(user.firmRole)) {
      const task = await this.assertAccess(id, user);
      if (task.caseId) throw new NotFoundException('Task not found');
      return;
    }
    const task = await this.assertAccess(id, user);
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

  /**
   * Standalone todos follow the firm hierarchy: you may hand work only to
   * yourself or to members whose role is strictly below yours. Case tasks
   * are governed by the lead/owner rules instead.
   */
  private async assertCanAssignTodo(user: AuthUser, assigneeId: string) {
    if (assigneeId === user.id) return;
    if (![FirmRole.OWNER, FirmRole.SENIOR_LAWYER, FirmRole.OFFICE_MANAGER, FirmRole.LAWYER].includes(user.firmRole)) {
      throw new ForbiddenException('ผู้ช่วยมอบหมายงานให้ผู้อื่นไม่ได้');
    }
    const member = await this.prisma.firmMember.findFirst({
      where: { role: { not: FirmRole.EXTERNAL }, firmId: user.firmId, userId: assigneeId },
      select: { role: true },
    });
    if (!member) throw new NotFoundException('ผู้รับมอบหมายไม่ได้อยู่ในสำนักงานนี้');
    if (!canDelegateTask(user.firmRole, member.role as FirmRole)) {
      throw new ForbiddenException(user.firmRole === FirmRole.LAWYER
        ? 'ทนายความมอบหมายงานได้เฉพาะผู้ช่วยหรือผู้จัดการสำนักงาน'
        : 'มอบหมายได้เฉพาะสมาชิกที่มีบทบาทต่ำกว่าของคุณเท่านั้น');
    }
  }

  async notifyParentObserversOnSubtaskAction(
    parentTaskId: string,
    subtask: any,
    action: 'create' | 'complete' | 'comment',
    actorUserId: string,
  ) {
    const observers = await this.prisma.taskObserver.findMany({
      where: { taskId: parentTaskId },
      select: { userId: true },
    });

    const observerIds = [...new Set(observers.map((o) => o.userId))].filter(
      (id) => id !== actorUserId,
    );

    if (!observerIds.length) return;

    const parent = await this.prisma.task.findUnique({
      where: { id: parentTaskId },
      select: { caseId: true, intakeId: true, firmId: true },
    });

    const summaryMap = {
      create: `งานย่อยใหม่: "${subtask.title}"`,
      complete: `งานย่อยเสร็จแล้ว: "${subtask.title}"`,
      comment: `มีความเห็นใหม่ในงานย่อย: "${subtask.title}"`,
    };

    await this.assignmentNotifier.notifyAssigned({
      firmId: parent?.firmId ?? null,
      userIds: observerIds,
      actorUserId,
      category: NotificationCategory.TASK,
      summaryText: `📌 ${summaryMap[action]}`,
      entityPath: parent?.caseId ? `/cases/${parent.caseId}` : '/todos',
      appPath: taskAppRoute(subtask.id),
    });
  }

  private async validateObservers(observerIds: string[] | undefined, isCaseTask: boolean, firmId: string) {
    if (!observerIds?.length) return;
    // Observers are only firm members
    for (const observerId of observerIds) {
      const member = await this.prisma.firmMember.findFirst({
        where: { role: { not: FirmRole.EXTERNAL }, firmId, userId: observerId },
        select: { role: true },
      });
      if (!member) throw new NotFoundException('ผู้ติดตาม ต้องเป็นสมาชิกของสำนักงาน');
    }
  }

  async create(
    user: AuthUser,
    caseId: string | null,
    dto: CreateTaskDto,
    source: TaskSource = TaskSource.WEB,
    intakeId?: string,
    queuePosition = 0,
    followUp?: { parentId: string; sourceTaskId: string; sourceCommentId: string; sourceQuote: string; ownerEscalation?: boolean },
  ) {
    // A dependency must be a task this person can see — never another firm's.
    if (dto.blockedById) await this.assertAccess(dto.blockedById, user);
    const previousRequest = async () => {
      const previous = dto.createRequestId ? await this.prisma.task.findUnique({ where: { createRequestId: dto.createRequestId } }) : null;
      if (previous && (previous.firmId !== user.firmId || previous.createdById !== user.id || previous.caseId !== caseId)) throw new NotFoundException('ไม่พบคำขอบันทึกงานนี้');
      return previous;
    };
    const previous = await previousRequest();
    if (previous) return this.findOne(previous.id);
    if (!dto.title.trim()) throw new BadRequestException('ระบุชื่องาน');
    let routine: TaskRoutineSnapshot | null = null;
    if (dto.routineSource) {
      if (![FirmRole.OWNER, FirmRole.SENIOR_LAWYER, FirmRole.OFFICE_MANAGER].includes(user.firmRole)) throw new ForbiddenException('ผู้ดูแลงานเท่านั้นที่เลือกวิธีทำงานประจำได้');
      const release = await this.prisma.playbookRelease.findFirst({ where: { id: dto.routineSource.releaseId, firmId: user.firmId } });
      const step = (release?.steps as unknown as { instructions?: string; routine?: TaskRoutineDefinition }[])?.[dto.routineSource.stepIndex];
      if (!release || !step?.routine) throw new BadRequestException('ไม่พบวิธีทำงานประจำนี้ในสำนักงาน');
      try { routine = taskRoutineSnapshot(release, dto.routineSource.stepIndex, step.routine); }
      catch (e) { throw new BadRequestException((e as Error).message); }
      if (!dto.requiresReview) throw new BadRequestException('งานประจำนี้ต้องเลือกผู้ตรวจและส่งตรวจ');
      dto.description = step.instructions ?? '';
    }
    if (dto.status === TaskStatus.PENDING_REVIEW || dto.status === TaskStatus.NEEDS_REVISION || (dto.requiresReview && dto.status === TaskStatus.DONE)) {
      throw new BadRequestException('ใช้ขั้นตอนส่งตรวจสำหรับงานที่ต้องตรวจ');
    }
    if (dto.assigneeId) {
      if (followUp?.ownerEscalation) {
        const owner = await this.prisma.firmMember.findFirst({ where: { firmId: user.firmId, userId: dto.assigneeId, role: FirmRole.OWNER } });
        if (!owner) throw new ForbiddenException('ส่งจุดติดขัดให้ Owner ในสำนักงานนี้เท่านั้น');
      } else await this.assertCanAssignTodo(user, dto.assigneeId);
    }
    await this.validateReview(user, dto.requiresReview ?? false, dto.reviewerId, { caseId, assigneeId: dto.assigneeId });
    await this.validateObservers(dto.observerIds, !!caseId, user.firmId);

    const task = await this.prisma.task.create({
      data: {
        caseId,
        createRequestId: dto.createRequestId,
        intakeId,
        parentId: followUp?.parentId,
        followUpSourceTaskId: followUp?.sourceTaskId,
        followUpSourceCommentId: followUp?.sourceCommentId,
        followUpSourceQuote: followUp?.sourceQuote,
        title: dto.title.trim(),
        description: dto.description,
        routine: routine ? JSON.parse(JSON.stringify(routine)) : undefined,
        assigneeId: dto.assigneeId,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
        status: dto.status,
        priority: dto.priority ?? TaskPriority.MEDIUM,
        labels: this.labelsFromDto(dto.labels) ?? [],
        recurrenceDays: dto.recurrenceDays,
        blockedById: dto.blockedById,
        createdById: user.id,
        source,
        firmId: user.firmId,
        queuePosition,
        workType: dto.workType,
        size: dto.size,
        scheduledFor: dto.scheduledFor ? new Date(`${dto.scheduledFor.slice(0, 10)}T00:00:00Z`) : undefined,
        requiresReview: dto.requiresReview,
        requiresAttachment: dto.requiresAttachment ?? false,
        reviewerId: dto.reviewerId,
        assignedAt: dto.assigneeId && dto.assigneeId !== user.id ? new Date() : undefined,
        acknowledgedAt: dto.assigneeId === user.id ? new Date() : undefined,
        completedAt: dto.status === TaskStatus.DONE ? new Date() : undefined,
      },
      include: this.taskInclude,
    }).catch(async error => {
      if (dto.createRequestId && error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const existing = await previousRequest();
        if (existing) return { ...await this.findOne(existing.id), requestAlreadyCreated: true };
      }
      throw error;
    });
    if ('requestAlreadyCreated' in task) return this.findOne(task.id);

    // Add observers
    if (dto.observerIds?.length) {
      await this.prisma.taskObserver.createMany({
        data: dto.observerIds.map((userId) => ({
          taskId: task.id,
          userId,
          addedById: user.id,
        })),
      });
    }

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

    // Notify assignee and observers, excluding creator
    const notifyUserIds = [...new Set([
      ...(dto.assigneeId ? [dto.assigneeId] : []),
      ...(dto.observerIds ?? []),
    ])].filter((id) => id !== user.id);

    if (notifyUserIds.length) {
      await this.assignmentNotifier.notifyAssigned({
        firmId: user.firmId,
        userIds: notifyUserIds,
        actorUserId: user.id,
        category: NotificationCategory.TASK,
        summaryText: await this.taskAssignmentSummary(dto.title, caseId, intakeId),
        entityPath: caseId ? `/cases/${caseId}` : '/todos',
        appPath: taskAppRoute(task.id),
        lineActions: (userId) => userId === task.assigneeId
          ? lineActions.task(task.id, { canComplete: canCompleteFromLine(task), canHandoff: canHandoffFromLine(task) }) : undefined,
      });
    }

    return this.findOne(task.id);
  }

  async update(id: string, dto: UpdateTaskDto, user: AuthUser, caseId?: string) {
    if (dto.blockedById) await this.assertAccess(dto.blockedById, user);
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

    if (task.firmId && task.firmId !== user.firmId) throw new NotFoundException('Task not found');
    if (dto.recurrenceDays !== undefined && user.firmRole !== FirmRole.OWNER && task.assigneeId !== user.id) {
      throw new ForbiddenException('Owner หรือผู้รับงานเท่านั้นที่ตั้งรอบงานซ้ำได้');
    }
    if (task.routine && (dto.requiresReview === false || dto.requiresAttachment === false)) throw new BadRequestException('งานประจำนี้ต้องผ่านผู้ตรวจตาม SOP');
    if (task.routine && dto.description !== undefined && dto.description !== task.description) throw new BadRequestException('งานนี้คงวิธีทำตามรุ่น SOP ที่ได้รับ');
    if (dto.assigneeId && dto.assigneeId !== task.assigneeId) await this.assertCanAssignTodo(user, dto.assigneeId);
    if (dto.requiresReview !== undefined || dto.reviewerId !== undefined || dto.requiresAttachment !== undefined) {
      if (![FirmRole.OWNER, FirmRole.SENIOR_LAWYER].includes(user.firmRole)) {
        throw new ForbiddenException('เฉพาะ Owner หรือทนายอาวุโสที่เปลี่ยนเงื่อนไขตรวจงานได้');
      }
    }
    if (dto.requiresReview !== undefined || dto.reviewerId !== undefined) {
      await this.validateReview(user, dto.requiresReview ?? task.requiresReview, dto.reviewerId === undefined ? task.reviewerId : dto.reviewerId, { caseId: task.caseId, assigneeId: dto.assigneeId ?? task.assigneeId });
    }
    if (dto.status === TaskStatus.DONE && (dto.requiresReview ?? task.requiresReview)) {
      throw new BadRequestException('งานนี้ต้องส่งตรวจและผ่านการอนุมัติก่อนเสร็จ');
    }

    if (dto.status === TaskStatus.PENDING_REVIEW || dto.status === TaskStatus.NEEDS_REVISION) {
      throw new BadRequestException(
        'ใช้ปุ่ม "ส่งต่อให้ Senior" หรือ "ตีกลับ" สำหรับสถานะนี้ ไม่สามารถตั้งค่าตรงนี้ได้',
      );
    }
    if (task.status === TaskStatus.PENDING_REVIEW && (dto.status !== undefined || dto.assigneeId !== undefined)) {
      throw new BadRequestException('ใช้ตรวจผ่านหรือตีกลับสำหรับงานที่รอตรวจ');
    }
    if ((dto.requiresReview ?? task.requiresReview) && (dto.assigneeId ?? task.assigneeId) === (dto.reviewerId ?? task.reviewerId)) {
      throw new BadRequestException('ผู้ทำงานและผู้ตรวจต้องเป็นคนละคน');
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
      if (!legalCase && !hasFirmCapability(user.firmRole, 'runOperations')) {
        throw new ForbiddenException('เปลี่ยนสถานะได้เฉพาะงานของตัวเอง');
      }
      if (legalCase) this.assertLeadOrOwner(user, legalCase);
    }
    if (dto.status === TaskStatus.DONE && task.blockedById) await this.assertRoutineReady(task);

    if (dto.assigneeId && !task.caseId && dto.assigneeId !== task.assigneeId) {
      await this.assertCanAssignTodo(user, dto.assigneeId);
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

    const { observerIds, ...fields } = dto;
    const addedObserverIds = observerIds ? await this.syncObservers(id, observerIds, user) : [];

    const updated = await this.updateWithHistory({ where: { id }, data: {
        ...fields,
        scheduledFor: dto.scheduledFor === null ? null : dto.scheduledFor ? new Date(`${dto.scheduledFor.slice(0, 10)}T00:00:00Z`) : undefined,
        assignedAt: dto.assigneeId && dto.assigneeId !== task.assigneeId ? new Date() : undefined,
        acknowledgedAt: dto.assigneeId && dto.assigneeId !== task.assigneeId ? (dto.assigneeId === user.id ? new Date() : null) : undefined,
        routineCompletedChecks: dto.assigneeId && dto.assigneeId !== task.assigneeId ? [] : undefined,
        planConfirmedAt: dto.scheduledFor !== undefined || (dto.assigneeId && dto.assigneeId !== task.assigneeId) ? null : undefined,
        completedAt:
          dto.status === TaskStatus.DONE
            ? task.status === TaskStatus.DONE ? undefined : new Date()
            : dto.status !== undefined ? null : undefined,
        labels: this.labelsFromDto(dto.labels),
        dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
    }, include: this.taskInclude }, user);

    if (dto.assigneeId && dto.assigneeId !== task.assigneeId && dto.assigneeId !== user.id) {
      await this.assignmentNotifier.notifyAssigned({
        firmId: user.firmId,
        userIds: [dto.assigneeId],
        actorUserId: user.id,
        category: NotificationCategory.TASK,
        summaryText: await this.taskAssignmentSummary(task.title, task.caseId, task.intakeId),
        entityPath: task.caseId ? `/cases/${task.caseId}` : '/todos',
        appPath: taskAppRoute(task.id),
        lineActions: () => lineActions.task(task.id, { canComplete: canCompleteFromLine(updated), canHandoff: canHandoffFromLine(updated) }),
      });
    }
    if (dto.assigneeId && dto.assigneeId !== task.assigneeId) {
      await this.notifyPreviousAssignee(task, task.assigneeId, dto.assigneeId, user);
    }

    const newObservers = addedObserverIds.filter((uid) => uid !== user.id);
    if (newObservers.length) {
      await this.assignmentNotifier.notifyAssigned({
        firmId: user.firmId,
        userIds: newObservers,
        actorUserId: user.id,
        category: NotificationCategory.TASK,
        summaryText: `👀 คุณถูกเพิ่มเป็นผู้ติดตามงาน "${task.title}"`,
        entityPath: task.caseId ? `/cases/${task.caseId}` : '/todos',
        appPath: taskAppRoute(task.id),
      });
    }

    if (dto.status === TaskStatus.DONE && task.status !== TaskStatus.DONE) {
      await this.onTaskCompleted(updated, user.id);
    }

    return updated;
  }

  /** Check-and-set status change: only the caller that still finds the task in `from` wins; the loser is refused. */
  private async transition(taskId: string, from: TaskStatus[], data: Prisma.TaskUpdateManyMutationInput & { assigneeId?: string | null; reviewerId?: string | null }, user: AuthUser) {
    return this.prisma.$transaction(async (tx) => {
      const before = await tx.task.findUniqueOrThrow({ where: { id: taskId } });
      const claimed = await tx.task.updateMany({ where: { id: taskId, status: { in: from } }, data });
      if (!claimed.count) throw new BadRequestException('งานนี้ถูกดำเนินการไปแล้ว กรุณารีเฟรช');
      const updated = await tx.task.findUniqueOrThrow({ where: { id: taskId } });
      if (before.status !== updated.status) await tx.auditLog.create({ data: {
        firmId: user.firmId, userId: user.id, action: 'TASK_CHANGED',
        metadata: { taskId, changes: [{ field: 'status', before: before.status, after: updated.status }] },
      } });
      return updated;
    });
  }

  private async updateWithHistory<T extends Prisma.TaskUpdateArgs>(args: Prisma.SelectSubset<T, Prisma.TaskUpdateArgs>, user: AuthUser) {
    return this.prisma.$transaction(async (tx) => {
      const before = await tx.task.findUniqueOrThrow({ where: args.where });
      const updated = await tx.task.update<T>(args);
      const changes: Array<{ field: string; before: string | null; after: string | null }> = [];
      if (before.status !== updated.status) changes.push({ field: 'status', before: before.status, after: updated.status });
      if (before.dueDate?.getTime() !== updated.dueDate?.getTime()) changes.push({ field: 'dueDate', before: before.dueDate?.toISOString() ?? null, after: updated.dueDate?.toISOString() ?? null });
      if (changes.length) await tx.auditLog.create({ data: {
        firmId: user.firmId, userId: user.id, action: 'TASK_CHANGED', metadata: { taskId: before.id, changes },
      } });
      return updated;
    });
  }

  /** Makes the task's observers exactly `observerIds`; returns the ones newly added. */
  private async syncObservers(taskId: string, observerIds: string[], user: AuthUser): Promise<string[]> {
    const wanted = [...new Set(observerIds)];
    await this.validateObservers(wanted, true, user.firmId);
    const current = (await this.prisma.taskObserver.findMany({ where: { taskId }, select: { userId: true } })).map((o) => o.userId);
    const added = wanted.filter((uid) => !current.includes(uid));
    await this.prisma.taskObserver.deleteMany({ where: { taskId, userId: { notIn: wanted } } });
    if (added.length) {
      await this.prisma.taskObserver.createMany({
        data: added.map((userId) => ({ taskId, userId, addedById: user.id })),
        skipDuplicates: true,
      });
    }
    return added;
  }

  private async validateReview(
    user: AuthUser,
    required: boolean,
    reviewerId?: string | null,
    ctx: { caseId?: string | null; assigneeId?: string | null } = {},
  ) {
    if (!required && !reviewerId) return;
    if (!reviewerId) throw new BadRequestException('เลือกผู้ตรวจสำหรับงานที่ต้องตรวจ');
    if (ctx.assigneeId && ctx.assigneeId === reviewerId) throw new BadRequestException('ผู้ทำงานและผู้ตรวจต้องเป็นคนละคน');
    const legalCase = ctx.caseId
      ? await this.prisma.case.findUnique({ where: { id: ctx.caseId }, select: { leadLawyerId: true } })
      : null;
    const reviewer = await this.prisma.firmMember.findFirst({
      where: { firmId: user.firmId, userId: reviewerId },
      select: { role: true },
    });
    if (!reviewer || !isEligibleReviewer({ role: reviewer.role, userId: reviewerId, caseLeadId: legalCase?.leadLawyerId, assigneeId: ctx.assigneeId })) {
      throw new BadRequestException('ผู้ตรวจต้องเป็น Owner ทนายอาวุโส หรือทนายหลักของคดีนี้');
    }
  }

  async acknowledge(taskId: string, user: AuthUser) {
    const task = await this.assertAccess(taskId, user);
    if (task.assigneeId !== user.id) throw new ForbiddenException('ผู้รับผิดชอบเท่านั้นที่ยืนยันรับทราบได้');
    if (task.acknowledgedAt) return task;
    const changed = await this.prisma.task.updateMany({
      where: { id: taskId, assigneeId: user.id, assignedAt: task.assignedAt },
      data: { acknowledgedAt: new Date() },
    });
    if (!changed.count) throw new BadRequestException('ผู้รับผิดชอบเปลี่ยนแล้ว กรุณาโหลดงานใหม่');
    return this.findOne(taskId);
  }

  /** Both case and standalone transitions enforce the same persisted routine requirements. */
  async assertRoutineReady(task: { id: string; assigneeId: string | null; routine?: Prisma.JsonValue; routineCompletedChecks?: number[]; blockedById?: string | null }) {
    if (task.blockedById) {
      const dependency = await this.prisma.task.findUnique({ where: { id: task.blockedById }, select: { status: true } });
      if (dependency && dependency.status !== TaskStatus.DONE) throw new BadRequestException('ยังรอคนแก้จุดติดขัด เปิดติดตามเรื่องนั้นก่อนส่งตรวจหรือปิดงาน');
    }
    if (!task.routine) return;
    const [attachments, update, hold, dependency] = await Promise.all([
      this.prisma.taskAttachment.findMany({ where: { taskId: task.id }, select: { mimeType: true } }),
      this.prisma.taskComment.findFirst({ where: { taskId: task.id, kind: 'DAILY_UPDATE' }, orderBy: { createdAt: 'desc' } }),
      this.prisma.taskOnHold.findUnique({ where: { taskId: task.id } }),
      this.prisma.task.findUnique({ where: { id: task.id }, select: { blockedBy: { select: { title: true, status: true } } } }),
    ]);
    const blocker = hold && !hold.endedAt ? hold.reason : dependency?.blockedBy && dependency.blockedBy.status !== TaskStatus.DONE
      ? `รอ ${dependency.blockedBy.title}` : update ? dailyUpdateParts(update.body).blocker : '';
    const missing = routineMissing(task.routine as unknown as TaskRoutineSnapshot, task.routineCompletedChecks ?? [], attachments, blocker);
    if (missing.length) throw new BadRequestException(`ก่อนส่งงานยังขาด: ${missing.join(' · ')}`);
  }

  /**
   * Runs once when a task transitions to DONE: spawn the next occurrence of a
   * recurring task, notify observers and parent observers, and tell owners of
   * tasks blocked by this one they can start.
   */
  private async onTaskCompleted(
    task: import('../generated/prisma').Task,
    actorUserId: string,
  ) {
    // Notify observers and parent observers (if subtask) that task is complete
    const notifyIds = [...new Set([
      ...(await this.getParentObserverIds(task.id)),
      ...(task.parentId ? await this.getParentObserverIds(task.parentId) : []),
    ])].filter((id) => id !== actorUserId);

    if (notifyIds.length) {
      await this.notifyViaAssignmentNotifier({
        firmId: task.firmId ?? null,
        userIds: notifyIds,
        actorUserId,
        category: NotificationCategory.TASK,
        summaryText: `✅ งานเสร็จแล้ว: "${task.title}"`,
        entityPath: task.caseId ? `/cases/${task.caseId}` : '/todos',
        appPath: taskAppRoute(task.id),
      });
    }

    if (task.recurrenceDays) {
      const base = task.dueDate && task.dueDate > new Date() ? task.dueDate : new Date();
      const handoff = await this.prisma.taskAssignmentLog.findFirst({ where: { taskId: task.id, action: TaskLogAction.HANDED_OFF }, orderBy: { createdAt: 'desc' }, select: { fromUserId: true } });
      const workerId = handoff?.fromUserId ?? task.assigneeId;
      await this.prisma.task.upsert({
        where: { createRequestId: `recurrence:${task.id}` }, update: {},
        create: {
          createRequestId: `recurrence:${task.id}`,
          caseId: task.caseId,
          firmId: task.firmId,
          intakeId: task.intakeId,
          workType: task.workType,
          size: task.size,
          requiresReview: task.requiresReview,
          reviewerId: task.reviewerId,
          assignedAt: workerId ? new Date() : null,
          title: task.title,
          description: task.description,
          routine: task.routine ?? undefined,
          assigneeId: workerId,
          createdById: task.createdById,
          priority: task.priority,
          labels: task.labels,
          recurrenceDays: task.recurrenceDays,
          dueDate: new Date(base.getTime() + task.recurrenceDays * 24 * 60 * 60 * 1000),
        },
      });
    }

    const unblocked = await this.prisma.task.findMany({
      where: { blockedById: task.id, status: { not: TaskStatus.DONE } },
      select: { id: true, title: true, assigneeId: true, caseId: true, firmId: true, workflowRunId: true },
    });
    for (const t of unblocked) {
      if (!t.assigneeId) continue;
      const isExternalAssignee = await this.prisma.firmMember.findFirst({
        where: { userId: t.assigneeId, firmId: t.firmId ?? '' },
        select: { role: true },
      });
      await this.assignmentNotifier.notifyAssigned({
        // Unblock runs without an AuthUser; a personal todo falls back to the recipient's own firm.
        firmId: t.firmId ?? null,
        userIds: [t.assigneeId],
        actorUserId,
        summaryText: `🟢 งานที่รออยู่เริ่มได้แล้ว: "${t.title}"\n(งานก่อนหน้า "${task.title}" เสร็จแล้ว)`,
        category: NotificationCategory.TASK,
        entityPath: isExternalAssignee?.role === FirmRole.EXTERNAL ? '/work' : (t.caseId ? `/cases/${t.caseId}` : '/todos'),
        appPath: taskAppRoute(t.id),
      });
    }

    // Workflow steps: re-plan the rest of the run or close it (owned by WorkflowsService,
    // resolved lazily because the workflows module itself depends on tasks).
    if (task.workflowRunId) {
      await this.moduleRef.get(WorkflowsService, { strict: false }).onStepCompleted(task.id, actorUserId)
        .catch((err: Error) => this.logger.error(`Workflow follow-up for task ${task.id} failed: ${err.message}`));
    }
  }

  async completeWorkflowStep(taskId: string, user: AuthUser) {
    const task = await this.prisma.task.findUnique({
      where: { id: taskId },
      select: { id: true, assigneeId: true, caseId: true, requiresReview: true, reviewerId: true, title: true },
    });
    if (!task) throw new NotFoundException('Task not found');
    if (task.assigneeId !== user.id) throw new ForbiddenException('Not assigned to you');

    const toReview = Boolean(task.requiresReview && task.reviewerId);
    const newStatus = toReview ? TaskStatus.PENDING_REVIEW : TaskStatus.DONE;
    // Check-and-set: a double click must not hand in (and re-plan the run) twice.
    const claimed = await this.prisma.task.updateMany({
      where: { id: taskId, assigneeId: user.id, status: { notIn: [TaskStatus.DONE, TaskStatus.PENDING_REVIEW] } },
      data: { status: newStatus, completedAt: newStatus === TaskStatus.DONE ? new Date() : null, submittedAt: toReview ? new Date() : null },
    });
    if (!claimed.count) throw new BadRequestException('ส่งงานนี้ไปแล้ว');

    if (toReview) {
      if (task.caseId) await this.ensureCaseMembership(task.caseId, task.reviewerId!);
      // Recorded as a hand-off so a rejection returns the work to whoever did it.
      await this.logAssignment({
        taskId, action: TaskLogAction.HANDED_OFF, fromUserId: user.id, toUserId: task.reviewerId!, performedById: user.id,
      });
      await this.assignmentNotifier.notifyAssigned({
        firmId: user.firmId,
        userIds: [task.reviewerId!],
        actorUserId: user.id,
        category: NotificationCategory.TASK,
        summaryText: `📋 งาน "${task.title}" รอการตรวจและอนุมัติ`,
        entityPath: task.caseId ? `/cases/${task.caseId}` : '/todos',
        appPath: taskAppRoute(task.id),
        lineActions: () => lineActions.review(task.id),
      });
    }
    const updated = await this.prisma.task.findUniqueOrThrow({ where: { id: taskId }, include: this.taskInclude });
    if (newStatus === TaskStatus.DONE) await this.onTaskCompleted(updated, user.id);
    return updated;
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

    const reviewerId = effectiveReviewerId(task, legalCase.leadLawyerId)!;
    if (reviewerId === user.id) throw new BadRequestException('คุณเป็นผู้ตรวจงานนี้เอง ไม่ต้องส่งตรวจ');
    if (task.assigneeId && task.assigneeId !== user.id) throw new ForbiddenException('คุณไม่ใช่ผู้รับผิดชอบงานนี้');
    const allowed: TaskStatus[] = [TaskStatus.TODO, TaskStatus.IN_PROGRESS, TaskStatus.NEEDS_REVISION, TaskStatus.DONE];
    if (!allowed.includes(task.status as TaskStatus)) throw new BadRequestException('งานนี้ไม่อยู่ในสถานะที่ส่งต่อได้');

    const note = await this.prepareHandoff(task, user, dto.note);
    await this.ensureCaseMembership(caseId, reviewerId);
    await this.transition(taskId, allowed, {
      status: TaskStatus.PENDING_REVIEW, assigneeId: task.assigneeId ?? user.id, submittedAt: new Date(), completedAt: null,
    }, user);
    await this.logAssignment({
      taskId, action: TaskLogAction.HANDED_OFF, fromUserId: user.id, toUserId: reviewerId, performedById: user.id,
      note, stageDueDate: dto.stageDueDate ? new Date(dto.stageDueDate) : undefined,
    });
    await this.logActivity(caseId, `ส่งงาน "${task.title}" ให้ตรวจ`, user.id);
    await this.notifyReviewer(task, reviewerId, user, note);
    return this.findOne(taskId);
  }

  async accept(caseId: string, taskId: string, user: AuthUser) {
    const task = await this.prisma.task.findFirst({ where: { id: taskId, caseId } });
    if (!task) throw new NotFoundException('ไม่พบงานนี้');
    const legalCase = await this.prisma.case.findUnique({ where: { id: caseId } });
    if (!legalCase) throw new NotFoundException('Case not found');
    this.assertReviewer(task, legalCase.leadLawyerId, user);
    if (task.status !== TaskStatus.PENDING_REVIEW) throw new BadRequestException('งานนี้ไม่ได้อยู่ในสถานะรอตรวจ');

    await this.assertRoutineReady(task);
    await this.transition(taskId, [TaskStatus.PENDING_REVIEW], { status: TaskStatus.DONE, completedAt: new Date() }, user);
    await this.logActivity(caseId, `ปิดงาน "${task.title}"`, user.id);
    await this.notifyWorker(task, user, `✅ งานผ่านการตรวจแล้ว\nงาน: ${task.title}`);
    await this.onTaskCompleted(await this.prisma.task.findUniqueOrThrow({ where: { id: taskId } }), user.id);
    return this.findOne(taskId);
  }

  async reject(caseId: string, taskId: string, user: AuthUser, dto: RejectTaskDto) {
    const task = await this.prisma.task.findFirst({ where: { id: taskId, caseId } });
    if (!task) throw new NotFoundException('ไม่พบงานนี้');
    const legalCase = await this.prisma.case.findUnique({ where: { id: caseId } });
    if (!legalCase) throw new NotFoundException('Case not found');
    this.assertReviewer(task, legalCase.leadLawyerId, user);
    if (task.status !== TaskStatus.PENDING_REVIEW) throw new BadRequestException('งานนี้ไม่ได้อยู่ในสถานะรอตรวจ');
    return this.sendBack(task, user, dto.reason);
  }

  /** Reject = back to NEEDS_REVISION with the same worker (legacy rows fall back to the last sender). */
  private async sendBack(task: Task, user: AuthUser, reason: string) {
    const lastHandoff = task.assigneeId ? null : await this.prisma.taskAssignmentLog.findFirst({
      where: { taskId: task.id, action: TaskLogAction.HANDED_OFF }, orderBy: { createdAt: 'desc' },
    });
    const workerId = task.assigneeId ?? lastHandoff?.fromUserId ?? task.createdById;
    await this.transition(task.id, [TaskStatus.PENDING_REVIEW], {
      status: TaskStatus.NEEDS_REVISION, assigneeId: workerId, submittedAt: null, routineCompletedChecks: [],
    }, user);
    await this.logAssignment({ taskId: task.id, action: TaskLogAction.REJECTED, fromUserId: user.id, toUserId: workerId, performedById: user.id, note: reason });
    await this.logActivity(task.caseId, `ตีกลับงาน "${task.title}": ${reason}`, user.id);
    await this.notifyWorker({ ...task, assigneeId: workerId }, user, `🔁 งานถูกตีกลับให้แก้ไข\nงาน: ${task.title}\nเหตุผล: ${reason}`);
    return this.findOne(task.id);
  }

  async reassign(caseId: string, taskId: string, user: AuthUser, dto: ReassignTaskDto) {
    const task = await this.prisma.task.findFirst({ where: { id: taskId, caseId } });
    if (!task) throw new NotFoundException('ไม่พบงานนี้');

    const legalCase = await this.prisma.case.findUnique({ where: { id: caseId } });
    if (!legalCase) throw new NotFoundException('Case not found');
    this.assertLeadOrOwner(user, legalCase);
    if (task.status === TaskStatus.PENDING_REVIEW) throw new BadRequestException('ใช้ตรวจผ่านหรือตีกลับสำหรับงานที่รอตรวจ');

    await this.assertCanAssignTodo(user, dto.assigneeId);

    await this.ensureCaseMembership(caseId, dto.assigneeId);

    await this.prisma.task.update({
      where: { id: taskId },
      data: { assigneeId: dto.assigneeId, assignedAt: new Date(), acknowledgedAt: null, routineCompletedChecks: [] },
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
    if (dto.assigneeId !== user.id) {
      await this.notifyViaAssignmentNotifier({
        firmId: user.firmId,
        userIds: [dto.assigneeId],
        actorUserId: user.id,
        category: NotificationCategory.TASK,
        summaryText: await this.taskAssignmentSummary(task.title, caseId, task.intakeId),
        entityPath: `/cases/${caseId}`,
        appPath: taskAppRoute(taskId),
        lineActions: () => lineActions.task(taskId, { canComplete: canCompleteFromLine(task), canHandoff: canHandoffFromLine(task) }),
      });
    }
    await this.notifyPreviousAssignee(task, task.assigneeId, dto.assigneeId, user);

    return this.findOne(taskId);
  }

  async handoffStandalone(taskId: string, user: AuthUser, dto: HandoffStandaloneTaskDto) {
    await this.assertAccess(taskId, user);
    const task = await this.prisma.task.findFirst({ where: { id: taskId, caseId: null } });
    if (!task) throw new NotFoundException('ไม่พบงานนี้');
    if (task.assigneeId !== user.id) throw new ForbiddenException('คุณไม่ใช่ผู้รับผิดชอบงานนี้');
    if (dto.reviewerId === user.id) throw new BadRequestException('ไม่สามารถส่งงานให้ตัวเองตรวจได้');
    if (task.reviewerId && task.reviewerId !== dto.reviewerId) throw new BadRequestException('ส่งงานให้ผู้ตรวจที่ระบุไว้เท่านั้น');
    const allowed: TaskStatus[] = [TaskStatus.TODO, TaskStatus.IN_PROGRESS, TaskStatus.NEEDS_REVISION];
    if (!allowed.includes(task.status as TaskStatus)) throw new BadRequestException('งานนี้ไม่อยู่ในสถานะที่ส่งต่อได้');
    await this.validateReview(user, true, dto.reviewerId, { assigneeId: task.assigneeId });

    const note = await this.prepareHandoff(task, user, dto.note);
    await this.transition(taskId, allowed, {
      status: TaskStatus.PENDING_REVIEW, reviewerId: dto.reviewerId, submittedAt: new Date(), completedAt: null,
    }, user);
    await this.logAssignment({
      taskId, action: TaskLogAction.HANDED_OFF, fromUserId: user.id, toUserId: dto.reviewerId, performedById: user.id,
      note, stageDueDate: dto.stageDueDate ? new Date(dto.stageDueDate) : undefined,
    });
    await this.notifyReviewer(task, dto.reviewerId, user, note);
    return this.findOne(taskId);
  }

  async acceptStandalone(taskId: string, user: AuthUser) {
    const task = await this.prisma.task.findFirst({ where: { id: taskId, caseId: null } });
    if (!task || (task.firmId && task.firmId !== user.firmId)) throw new NotFoundException('ไม่พบงานนี้');
    this.assertReviewer(task, null, user);
    if (task.status !== TaskStatus.PENDING_REVIEW) throw new BadRequestException('งานนี้ไม่ได้อยู่ในสถานะรอตรวจ');
    await this.assertRoutineReady(task);
    await this.transition(taskId, [TaskStatus.PENDING_REVIEW], { status: TaskStatus.DONE, completedAt: new Date() }, user);
    await this.notifyWorker(task, user, `✅ งานผ่านการตรวจแล้ว\nงาน: ${task.title}`);
    await this.onTaskCompleted(await this.prisma.task.findUniqueOrThrow({ where: { id: taskId } }), user.id);
    return this.findOne(taskId);
  }

  async rejectStandalone(taskId: string, user: AuthUser, dto: RejectTaskDto) {
    const task = await this.prisma.task.findFirst({ where: { id: taskId, caseId: null } });
    if (!task || (task.firmId && task.firmId !== user.firmId)) throw new NotFoundException('ไม่พบงานนี้');
    this.assertReviewer(task, null, user);
    if (task.status !== TaskStatus.PENDING_REVIEW) throw new BadRequestException('งานนี้ไม่ได้อยู่ในสถานะรอตรวจ');
    return this.sendBack(task, user, dto.reason);
  }

  async startOnHold(caseId: string, taskId: string, user: AuthUser, dto: StartTaskOnHoldDto) {
    await this.assertAccess(taskId, user);
    await assertFirmRefs(this.prisma, user.firmId, { userIds: [dto.followerUserId] });
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

    const data = {
      reason: dto.reason,
      category: dto.category ?? 'OTHER',
      followerUserId: dto.followerUserId ?? null,
      nextFollowUpAt: dto.nextFollowUpAt ? new Date(dto.nextFollowUpAt) : null,
      createdById: user.id,
    } as const;
    // One TaskOnHold row per task (taskId is unique): a resumed hold is reopened, not duplicated.
    const hold = await this.prisma.taskOnHold.upsert({
      where: { taskId },
      create: { taskId, ...data },
      update: { ...data, startedAt: new Date(), endedAt: null, lastFollowUpAt: null, notes: null },
    });
    await this.notifyLeadAndObservers({ id: taskId, title: task.title, caseId, assigneeId: task.assigneeId }, user, `⏸️ พักงาน: ${task.title}\nเหตุผล: ${dto.reason}`);
    return hold;
  }

  async updateOnHold(caseId: string, taskId: string, user: AuthUser, dto: UpdateTaskOnHoldDto) {
    await this.assertAccess(taskId, user);
    if (dto.followerUserId) {
      const legalCase = await this.prisma.case.findUnique({ where: { id: caseId }, select: { firmId: true } });
      await assertFirmRefs(this.prisma, legalCase?.firmId ?? '', { userIds: [dto.followerUserId] });
    }
    const hold = await this.prisma.taskOnHold.findFirst({
      where: { taskId, task: { caseId } },
    });
    if (!hold || hold.endedAt) {
      throw new NotFoundException('ไม่พบสถานะ On hold ที่ยังใช้งานอยู่สำหรับงานนี้');
    }

    return this.prisma.taskOnHold.update({
      where: { id: hold.id },
      data: {
        category: dto.category ?? hold.category,
        followerUserId: dto.followerUserId ?? hold.followerUserId,
        lastFollowUpAt: dto.lastFollowUpAt ? new Date(dto.lastFollowUpAt) : hold.lastFollowUpAt,
        nextFollowUpAt: dto.nextFollowUpAt ? new Date(dto.nextFollowUpAt) : hold.nextFollowUpAt,
        notes: dto.notes ?? hold.notes,
      },
    });
  }

  async resumeFromOnHold(caseId: string, taskId: string, user: AuthUser) {
    await this.assertAccess(taskId, user);
    const hold = await this.prisma.taskOnHold.findFirst({
      where: { taskId, task: { caseId } },
      include: { task: { select: { title: true, assigneeId: true } } },
    });
    if (!hold || hold.endedAt) {
      throw new NotFoundException('ไม่พบสถานะ On hold ที่ยังใช้งานอยู่สำหรับงานนี้');
    }

    const resumed = await this.prisma.taskOnHold.update({
      where: { id: hold.id },
      data: { endedAt: new Date() },
    });
    await this.notifyLeadAndObservers({ id: taskId, title: hold.task.title, caseId, assigneeId: hold.task.assigneeId }, user, `▶️ งานกลับมาทำต่อ: ${hold.task.title}`);
    return resumed;
  }

  /** Hold/resume and similar case-level news: the lead lawyer, the assignee and the task's observers, never the actor. */
  private async notifyLeadAndObservers(task: { id: string; title: string; caseId: string | null; assigneeId?: string | null }, user: AuthUser, summaryText: string) {
    const legalCase = task.caseId ? await this.prisma.case.findUnique({ where: { id: task.caseId }, select: { leadLawyerId: true } }) : null;
    const userIds = [...new Set([legalCase?.leadLawyerId, task.assigneeId, ...(await this.getParentObserverIds(task.id))].filter((id): id is string => !!id && id !== user.id))];
    await this.notifyViaAssignmentNotifier({
      firmId: user.firmId,
      userIds,
      actorUserId: user.id,
      category: NotificationCategory.TASK,
      summaryText,
      entityPath: task.caseId ? `/cases/${task.caseId}` : '/todos',
      appPath: taskAppRoute(task.id),
    });
  }

  private async notifyPreviousAssignee(task: { id: string; title: string; caseId: string | null }, previousId: string | null, newAssigneeId: string, user: AuthUser) {
    if (!previousId || previousId === newAssigneeId || previousId === user.id) return;
    const next = await this.prisma.user.findUnique({ where: { id: newAssigneeId }, select: { firstName: true, lastName: true } });
    await this.notifyViaAssignmentNotifier({
      firmId: user.firmId,
      userIds: [previousId],
      actorUserId: user.id,
      category: NotificationCategory.TASK,
      summaryText: `↪️ งาน "${task.title}" ถูกมอบให้ ${next?.firstName ?? ''} ${next?.lastName ?? ''} แทน`,
      entityPath: task.caseId ? `/cases/${task.caseId}` : '/todos',
      appPath: taskAppRoute(task.id),
    });
  }

  async getParentObserverIds(parentTaskId: string): Promise<string[]> {
    const observers = await this.prisma.taskObserver.findMany({
      where: { taskId: parentTaskId },
      select: { userId: true },
    });
    return observers.map((o) => o.userId);
  }

  async notifyViaAssignmentNotifier(params: NotifyParams) {
    if (!params.userIds.length) return;
    try {
      await this.assignmentNotifier.notifyAssigned(params);
    } catch (err) {
      this.logger.error('Notification failed (non-blocking)', err);
    }
  }
}

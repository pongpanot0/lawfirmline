import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { Prisma } from '../generated/prisma';
import { PrismaService } from '../prisma/prisma.module';
import { AuthUser, WorkflowStepDefinition, FirmRole } from '@lawfirm/shared';
import { DeadlineDayBasis } from '@lawfirm/shared';
import { DeadlineRulesService } from '../deadlines/deadline-rules.service';
import { CaseAccessService } from '../common/services/case-access.service';
import { AssignmentNotifierService } from '../notifications/assignment-notifier.service';
import { CreateWorkflowTemplateDto, UpdateWorkflowTemplateDto, CreateWorkflowRunDto, SendBackWorkflowDto, WorkflowAssigneeDto } from './dto/workflow.dto';
import { TaskStatus, NotificationCategory } from '../generated/prisma';

@Injectable()
export class WorkflowsService {
  constructor(
    private prisma: PrismaService,
    private deadlineRules: DeadlineRulesService,
    private notifier: AssignmentNotifierService,
    private caseAccess: CaseAccessService,
  ) {}

  /**
   * Due dates for consecutive steps, counted in business days (public holidays
   * skipped) from `start`: each step ends its own duration after the previous one.
   */
  private async planDueDates(durations: number[], start: Date): Promise<Date[]> {
    const total = durations.reduce((sum, d) => sum + d, 0);
    const holidays = await this.deadlineRules.loadHolidays(start, total);
    let cumulative = 0;
    return durations.map((days) => {
      cumulative += days;
      return new Date(`${this.deadlineRules.computeDueDate(start, cumulative, DeadlineDayBasis.BUSINESS, holidays)}T00:00:00.000Z`);
    });
  }

  /**
   * Called by TasksService whenever a task finishes. For a workflow step:
   * re-plan the remaining steps from the real finish, or close the run when
   * every step is done.
   */
  async onStepCompleted(taskId: string, actorUserId: string): Promise<void> {
    const done = await this.prisma.task.findUnique({ where: { id: taskId }, select: { workflowRunId: true, workflowStep: true } });
    if (!done?.workflowRunId) return;
    const run = await this.prisma.workflowRun.findUnique({
      where: { id: done.workflowRunId },
      select: {
        id: true, name: true, status: true, firmId: true, caseId: true, createdById: true,
        case: { select: { leadLawyerId: true } },
        tasks: { select: { id: true, status: true, workflowStep: true, workflowDurationDays: true }, orderBy: { workflowStep: 'asc' } },
      },
    });
    if (!run || run.status !== 'ACTIVE') return;

    const remaining = run.tasks.filter((t) => t.status !== TaskStatus.DONE);
    if (!remaining.length) {
      await this.prisma.workflowRun.update({ where: { id: run.id }, data: { status: 'DONE', completedAt: new Date() } });
      await this.notifier.notifyAssigned({
        firmId: run.firmId,
        userIds: [run.createdById, run.case.leadLawyerId],
        actorUserId,
        category: NotificationCategory.TASK,
        summaryText: `✅ สายงาน "${run.name}" เสร็จครบทุกขั้น`,
        entityPath: `/cases/${run.caseId}`,
      });
      return;
    }
    const later = remaining.filter((t) => (t.workflowStep ?? 0) > (done.workflowStep ?? 0));
    const dates = await this.planDueDates(later.map((t) => t.workflowDurationDays ?? 1), new Date());
    await this.prisma.$transaction(later.map((t, i) => this.prisma.task.update({ where: { id: t.id }, data: { dueDate: dates[i] } })));
  }

  // ===== Template CRUD =====

  async createTemplate(user: AuthUser, dto: CreateWorkflowTemplateDto) {
    const steps = this.validateSteps(dto.steps);
    return this.prisma.workflowTemplate.create({
      data: {
        firmId: user.firmId,
        name: dto.name,
        description: dto.description,
        steps: steps as unknown as Prisma.InputJsonValue,
        createdById: user.id,
      },
    });
  }

  async getTemplates(user: AuthUser) {
    return this.prisma.workflowTemplate.findMany({
      where: {
        firmId: user.firmId,
        isActive: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async updateTemplate(user: AuthUser, templateId: string, dto: UpdateWorkflowTemplateDto) {
    const tmpl = await this.prisma.workflowTemplate.findFirst({
      where: { id: templateId, firmId: user.firmId },
      select: { id: true },
    });
    if (!tmpl) throw new NotFoundException('Template not found');

    const steps = dto.steps ? this.validateSteps(dto.steps) : undefined;
    return this.prisma.workflowTemplate.update({
      where: { id: templateId },
      data: {
        name: dto.name,
        description: dto.description,
        steps: steps as unknown as Prisma.InputJsonValue | undefined,
      },
    });
  }

  async deleteTemplate(user: AuthUser, templateId: string) {
    const tmpl = await this.prisma.workflowTemplate.findFirst({
      where: { id: templateId, firmId: user.firmId },
      select: { id: true },
    });
    if (!tmpl) throw new NotFoundException('Template not found');

    await this.prisma.workflowTemplate.update({
      where: { id: templateId },
      data: { isActive: false },
    });
    return { deleted: true };
  }

  /** Steps are stored as JSON, so every field is checked here rather than trusted. */
  private validateSteps(steps: unknown): WorkflowStepDefinition[] {
    if (!Array.isArray(steps) || steps.length < 1 || steps.length > 20) throw new BadRequestException('ต้องมี 1-20 ขั้นตอน');
    return steps.map((raw, i) => {
      const step = raw as Partial<WorkflowStepDefinition>;
      const title = typeof step?.title === 'string' ? step.title.trim() : '';
      if (!title || title.length > 200) throw new BadRequestException(`ขั้นที่ ${i + 1} ต้องมีชื่อ (ไม่เกิน 200 ตัวอักษร)`);
      if (!Number.isInteger(step.durationDays) || step.durationDays! < 1 || step.durationDays! > 60) throw new BadRequestException(`ขั้นที่ ${i + 1}: ระยะเวลา 1-60 วันทำการ`);
      if (!Object.values(FirmRole).includes(step.role as FirmRole)) throw new BadRequestException(`ขั้นที่ ${i + 1}: บทบาทไม่ถูกต้อง`);
      if (step.instructions !== undefined && (typeof step.instructions !== 'string' || step.instructions.length > 5000)) throw new BadRequestException(`ขั้นที่ ${i + 1}: คำอธิบายไม่ถูกต้อง`);
      if (step.requiresReview !== undefined && typeof step.requiresReview !== 'boolean') throw new BadRequestException(`ขั้นที่ ${i + 1}: ค่าการตรวจไม่ถูกต้อง`);
      return { title, instructions: step.instructions?.trim() || undefined, role: step.role as FirmRole, durationDays: step.durationDays!, requiresReview: step.requiresReview ?? false };
    });
  }

  // ===== Assignee Picker =====

  async getAssigneesByRole(user: AuthUser, role: FirmRole): Promise<WorkflowAssigneeDto[]> {
    const members = await this.prisma.firmMember.findMany({
      where: { firmId: user.firmId, role },
      select: {
        userId: true,
        user: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    const result = await Promise.all(
      members.map(async (m) => {
        const openCount = await this.prisma.task.count({
          where: {
            assigneeId: m.userId,
            status: { not: TaskStatus.DONE },
            // Load in this firm only — another firm's work is neither shown nor counted.
            OR: [{ firmId: user.firmId }, { case: { firmId: user.firmId } }],
          },
        });
        const name = `${m.user.firstName} ${m.user.lastName}`.trim();
        return {
          userId: m.userId,
          name,
          openTaskCount: openCount,
        };
      }),
    );

    return result.sort((a, b) => a.openTaskCount - b.openTaskCount);
  }

  // ===== Create Workflow Run =====

  async createWorkflowRun(user: AuthUser, caseId: string, dto: CreateWorkflowRunDto) {
    const legalCase = await this.prisma.case.findFirst({
      where: { id: caseId, ...this.caseAccess.getCaseFilterForUser(user) },
      select: { id: true, leadLawyerId: true, status: true },
    });
    if (!legalCase) throw new NotFoundException('ไม่พบคดี');
    if (legalCase.status === 'CLOSED') throw new BadRequestException('คดีปิดแล้ว');

    const template = dto.templateId
      ? await this.prisma.workflowTemplate.findFirst({ where: { id: dto.templateId, firmId: user.firmId, isActive: true }, select: { id: true, steps: true } })
      : null;
    if (dto.templateId && !template) throw new NotFoundException('ไม่พบแม่แบบสายงาน');
    const steps = this.validateSteps(template?.steps ?? dto.steps);

    const members = await this.prisma.firmMember.findMany({ where: { firmId: user.firmId }, select: { userId: true, role: true } });
    const assignees: string[] = [];
    for (const [i, step] of steps.entries()) {
      const chosen = dto.assignees?.[i];
      if (chosen) {
        // The person must hold the role the step asks for — this is also the only
        // place a freelancer (EXTERNAL) may be named.
        if (!members.some((m) => m.userId === chosen && m.role === step.role)) {
          throw new BadRequestException(`ขั้นที่ ${i + 1}: ผู้รับต้องเป็นบทบาท ${step.role} ในสำนักงานนี้`);
        }
        assignees.push(chosen);
      } else {
        assignees.push(await this.lightestMember(user.firmId, members.filter((m) => m.role === step.role).map((m) => m.userId), step.role));
      }
    }
    const reviewerFor = (assigneeId: string) =>
      legalCase.leadLawyerId !== assigneeId
        ? legalCase.leadLawyerId
        : members.find((m) => m.userId !== assigneeId && (m.role === FirmRole.OWNER || m.role === FirmRole.SENIOR_LAWYER))?.userId ?? null;

    const dueDates = await this.planDueDates(steps.map((s) => s.durationDays), new Date());
    const run = await this.prisma.$transaction(async (tx) => {
      const created = await tx.workflowRun.create({
        data: {
          firmId: user.firmId, caseId, templateId: template?.id ?? null, name: dto.name.trim(),
          promisedAt: dto.promisedAt ? new Date(dto.promisedAt) : null, createdById: user.id,
        },
      });
      let previousTaskId: string | null = null;
      for (const [i, step] of steps.entries()) {
        const reviewerId = step.requiresReview ? reviewerFor(assignees[i]) : null;
        const task: { id: string } = await tx.task.create({
          data: {
            firmId: user.firmId, caseId, title: step.title, description: step.instructions,
            assigneeId: assignees[i], assignedAt: new Date(), dueDate: dueDates[i],
            blockedById: previousTaskId,
            requiresReview: Boolean(step.requiresReview && reviewerId), reviewerId,
            workflowRunId: created.id, workflowStep: i, workflowDurationDays: step.durationDays,
            labels: [`workflow:${created.id}`], createdById: user.id,
          },
          select: { id: true },
        });
        previousTaskId = task.id;
      }
      return created;
    });

    const firstIsExternal = members.find((m) => m.userId === assignees[0])?.role === FirmRole.EXTERNAL;
    await this.notifier.notifyAssigned({
      firmId: user.firmId,
      userIds: [assignees[0]],
      actorUserId: user.id,
      category: NotificationCategory.TASK,
      summaryText: `📋 สายงานใหม่: "${run.name}"\nขั้นแรกของคุณ: ${steps[0].title}`,
      entityPath: firstIsExternal ? '/work' : `/cases/${caseId}`,
    });
    await this.prisma.auditLog.create({
      data: { firmId: user.firmId, userId: user.id, action: 'WORKFLOW_STARTED', metadata: { runId: run.id, caseId, stepCount: steps.length } },
    });
    return run;
  }

  /** The member with the fewest open case tasks; a role nobody holds cannot be staffed. */
  private async lightestMember(firmId: string, userIds: string[], role: string): Promise<string> {
    if (!userIds.length) throw new BadRequestException(`ไม่มีสมาชิกบทบาท ${role} ในสำนักงาน`);
    const counts = await this.prisma.task.groupBy({
      by: ['assigneeId'],
      where: { assigneeId: { in: userIds }, status: { not: TaskStatus.DONE }, OR: [{ firmId }, { case: { firmId } }] },
      _count: { _all: true },
    });
    const load = new Map(counts.map((c) => [c.assigneeId, c._count._all]));
    return [...userIds].sort((a, b) => (load.get(a) ?? 0) - (load.get(b) ?? 0))[0];
  }

  // ===== Get Case Workflows =====

  async getCaseWorkflows(user: AuthUser, caseId: string) {
    const legalCase = await this.prisma.case.findFirst({
      where: { id: caseId, ...this.caseAccess.getCaseFilterForUser(user) },
      select: { id: true },
    });
    if (!legalCase) throw new NotFoundException('Case not found');

    const runs = await this.prisma.workflowRun.findMany({
      where: { caseId },
      select: {
        id: true,
        name: true,
        status: true,
        createdAt: true,
        tasks: {
          select: {
            id: true,
            title: true,
            workflowStep: true,
            status: true,
            dueDate: true,
            completedAt: true,
            assignee: { select: { id: true, firstName: true, lastName: true } },
            attachments: { select: { id: true } },
          },
          orderBy: { workflowStep: 'asc' },
        },
      },
    });

    return runs.map((run) => ({
      id: run.id,
      name: run.name,
      status: run.status,
      createdAt: run.createdAt,
      steps: run.tasks.map((t) => ({
        taskId: t.id,
        title: t.title,
        assignee: t.assignee
          ? { id: t.assignee.id, name: `${t.assignee.firstName} ${t.assignee.lastName}`.trim() }
          : null,
        status: t.status,
        dueDate: t.dueDate,
        completedAt: t.completedAt,
        attachmentCount: t.attachments.length,
      })),
    }));
  }

  // ===== Get Pipeline =====

  async getWorkflowRuns(user: AuthUser, status?: string) {
    const runs = await this.prisma.workflowRun.findMany({
      where: {
        firmId: user.firmId,
        ...(status && { status: status as any }),
      },
      select: {
        id: true,
        name: true,
        status: true,
        promisedAt: true,
        createdById: true,
        case: { select: { id: true, ownRef: true, title: true } },
        tasks: {
          select: {
            id: true,
            title: true,
            status: true,
            dueDate: true,
            completedAt: true,
            assigneeId: true,
            assignee: { select: { id: true, firstName: true, lastName: true } },
            workflowStep: true,
            workflowDurationDays: true,
          },
          orderBy: { workflowStep: 'asc' },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const holidays = await this.deadlineRules.loadHolidays(new Date(), 365);
    const filtered = runs.filter((run) => {
      if (user.firmRole === FirmRole.OWNER || user.firmRole === FirmRole.SENIOR_LAWYER) {
        return true;
      }
      return run.createdById === user.id || run.tasks.some((t) => t.assigneeId === user.id);
    });

    return filtered.map((run) => {
      const tasks = run.tasks;
      const done = tasks.filter((t) => t.status === TaskStatus.DONE);
      const currentTask = tasks.find(
        (t) => t.status !== TaskStatus.DONE,
      );

      const remainingDays = tasks
        .filter((t) => !done.map((d) => d.id).includes(t.id) && t.id !== currentTask?.id)
        .reduce((sum, t) => sum + (t.workflowDurationDays ?? 0), 0);

      const from = currentTask?.dueDate && currentTask.dueDate > new Date() ? currentTask.dueDate : new Date();
      const projectedFinish = remainingDays
        ? new Date(`${this.deadlineRules.computeDueDate(from, remainingDays, DeadlineDayBasis.BUSINESS, holidays)}T00:00:00.000Z`)
        : from;

      const lateByDays = run.promisedAt
        ? Math.max(0, Math.floor((projectedFinish.getTime() - run.promisedAt.getTime()) / (24 * 60 * 60 * 1000)))
        : 0;

      const overdueDays = currentTask?.dueDate
        ? Math.max(0, Math.floor((new Date().getTime() - currentTask.dueDate.getTime()) / (24 * 60 * 60 * 1000)))
        : 0;

      return {
        id: run.id,
        name: run.name,
        status: run.status,
        case: run.case,
        currentStep: currentTask
          ? {
              index: currentTask.workflowStep ?? 0,
              title: currentTask.title,
              assignee: currentTask.assignee
                ? { id: currentTask.assignee.id, name: `${currentTask.assignee.firstName} ${currentTask.assignee.lastName}`.trim() }
                : null,
              dueDate: currentTask.dueDate?.toISOString(),
              overdueDays,
            }
          : null,
        stepsDone: done.length,
        stepsTotal: tasks.length,
        projectedFinish: projectedFinish.toISOString(),
        lateByDays,
        promisedAt: run.promisedAt?.toISOString(),
      };
    });
  }

  // ===== Send Back =====

  async sendBack(user: AuthUser, runId: string, dto: SendBackWorkflowDto) {
    const run = await this.prisma.workflowRun.findFirst({
      where: { id: runId, firmId: user.firmId },
      select: { id: true, status: true, createdById: true, caseId: true, tasks: { select: { id: true, workflowStep: true, assigneeId: true, status: true, workflowDurationDays: true }, orderBy: { workflowStep: 'asc' } } },
    });
    if (!run) throw new NotFoundException('Workflow run not found');
    if (run.status !== 'ACTIVE') throw new BadRequestException('สายงานนี้ไม่ได้เดินอยู่');

    const currentTask = run.tasks.find((t) => t.status !== TaskStatus.DONE);
    if (!currentTask) throw new BadRequestException('ไม่มีขั้นปัจจุบัน');

    const legalCase = await this.prisma.case.findFirst({
      where: { id: run.caseId, firmId: user.firmId },
      select: { leadLawyerId: true },
    });

    const canSendBack =
      currentTask.assigneeId === user.id ||
      run.createdById === user.id ||
      legalCase?.leadLawyerId === user.id ||
      user.firmRole === FirmRole.OWNER ||
      user.firmRole === FirmRole.SENIOR_LAWYER;

    if (!canSendBack) throw new ForbiddenException();

    if (dto.toStep >= (currentTask.workflowStep ?? 0)) {
      throw new BadRequestException('ขั้นเป้าหมายต้องก่อนขั้นปัจจุบัน');
    }

    const targetTask = run.tasks.find((t) => t.workflowStep === dto.toStep);
    if (!targetTask) throw new BadRequestException('ขั้นเป้าหมายไม่พบ');
    const dates = await this.planDueDates(
      run.tasks.filter((t) => (t.workflowStep ?? 0) >= dto.toStep).map((t) => t.workflowDurationDays ?? 1),
      new Date(),
    );

    // A step that went through review is held by its reviewer; reopening it
    // must give it back to whoever did the work (the last hand-off's sender).
    const reopenedIds = run.tasks
      .filter((t) => (t.workflowStep ?? 0) >= dto.toStep && (t.workflowStep ?? 0) <= (currentTask.workflowStep ?? 0))
      .map((t) => t.id);
    const handoffs = await this.prisma.taskAssignmentLog.findMany({
      where: { taskId: { in: reopenedIds }, action: 'HANDED_OFF' },
      orderBy: { createdAt: 'desc' },
      select: { taskId: true, fromUserId: true },
    });
    const worker = new Map<string, string>();
    for (const h of handoffs) if (h.fromUserId && !worker.has(h.taskId)) worker.set(h.taskId, h.fromUserId);
    const targetAssigneeId = worker.get(targetTask.id) ?? targetTask.assigneeId;

    await this.prisma.$transaction(async (tx) => {
      const updates: Promise<unknown>[] = [];
      await tx.task.update({
        where: { id: targetTask.id },
        data: {
          status: TaskStatus.TODO,
          completedAt: null,
          ...(worker.has(targetTask.id) && { assigneeId: worker.get(targetTask.id) }),
        },
      });

      await tx.taskComment.create({
        data: {
          taskId: targetTask.id,
          body: `🔁 ส่งกลับมา: ${dto.reason}`,
          authorId: user.id,
        },
      });

      const toReopen = run.tasks.filter(
        (t) => (t.workflowStep ?? 0) > dto.toStep && (t.workflowStep ?? 0) <= (currentTask.workflowStep ?? 0),
      );
      for (const t of toReopen) {
        await tx.task.update({
          where: { id: t.id },
          data: {
            status: TaskStatus.TODO,
            completedAt: null,
            ...(worker.has(t.id) && { assigneeId: worker.get(t.id) }),
          },
        });
      }

      const replanned = run.tasks.filter((t) => (t.workflowStep ?? 0) >= dto.toStep);
      replanned.forEach((t, i) => updates.push(tx.task.update({ where: { id: t.id }, data: { dueDate: dates[i] } })));
      await Promise.all(updates);
    });

    const targetMember = await this.prisma.firmMember.findFirst({
      where: { userId: targetAssigneeId!, firmId: user.firmId },
      select: { role: true },
    });

    await this.notifier.notifyAssigned({
      firmId: user.firmId,
      userIds: [targetAssigneeId!],
      actorUserId: user.id,
      category: NotificationCategory.TASK,
      summaryText: `🔁 สายงานถูกส่งกลับมาที่ขั้นของคุณ\nเหตุผล: ${dto.reason}`,
      entityPath: targetMember?.role === FirmRole.EXTERNAL ? '/work' : `/cases/${run.caseId}`,
    });

    await this.prisma.auditLog.create({
      data: {
        firmId: user.firmId,
        userId: user.id,
        action: 'WORKFLOW_SENT_BACK',
        metadata: { runId, caseId: run.caseId, toStep: dto.toStep, reason: dto.reason },
      },
    });

    return { sentBack: true };
  }

  // ===== Cancel Run =====

  async cancelRun(user: AuthUser, runId: string) {
    const run = await this.prisma.workflowRun.findFirst({
      where: { id: runId, firmId: user.firmId },
      select: {
        id: true, status: true, createdById: true, caseId: true,
        tasks: { select: { id: true, status: true, _count: { select: { attachments: true, comments: true } } } },
      },
    });
    if (!run) throw new NotFoundException('Workflow run not found');
    if (run.status !== 'ACTIVE') throw new BadRequestException('สายงานนี้ไม่ได้เดินอยู่');

    const legalCase = await this.prisma.case.findFirst({
      where: { id: run.caseId, firmId: user.firmId },
      select: { leadLawyerId: true },
    });

    const canCancel =
      run.createdById === user.id ||
      legalCase?.leadLawyerId === user.id ||
      user.firmRole === FirmRole.OWNER ||
      user.firmRole === FirmRole.SENIOR_LAWYER;

    if (!canCancel) throw new ForbiddenException();

    // Only steps nobody has touched are removed. A step that holds work — files,
    // comments, or already handed in for review — stays as an ordinary task of
    // the case, so cancelling never destroys a deliverable.
    const untouched = run.tasks.filter((t) =>
      t.status === TaskStatus.TODO && t._count.attachments === 0 && t._count.comments === 0);
    await this.prisma.$transaction([
      this.prisma.task.deleteMany({ where: { id: { in: untouched.map((t) => t.id) } } }),
      this.prisma.workflowRun.update({ where: { id: run.id }, data: { status: 'CANCELLED' } }),
    ]);

    await this.prisma.auditLog.create({
      data: {
        firmId: user.firmId, userId: user.id, action: 'WORKFLOW_CANCELLED',
        metadata: { runId: run.id, caseId: run.caseId, removedTaskIds: untouched.map((t) => t.id) },
      },
    });

    return { cancelled: true, removedSteps: untouched.length, keptSteps: run.tasks.filter((t) => t.status !== TaskStatus.DONE).length - untouched.length };
  }

  // ===== Get Run Files =====

  async getRunFiles(user: AuthUser, runId: string) {
    const run = await this.prisma.workflowRun.findFirst({
      where: { id: runId, firmId: user.firmId, case: this.caseAccess.getCaseFilterForUser(user) },
      select: { id: true, caseId: true, tasks: { select: { id: true, workflowStep: true, attachments: true } } },
    });
    if (!run) throw new NotFoundException('Workflow run not found');

    // Task id travels with each file: staff download through the task attachment route.
    return run.tasks
      .sort((a, b) => (a.workflowStep ?? 0) - (b.workflowStep ?? 0))
      .map((task) => ({
        step: task.workflowStep ?? 0,
        taskId: task.id,
        files: task.attachments.map((a) => ({ id: a.id, filename: a.filename, size: a.size })),
      }));
  }
}

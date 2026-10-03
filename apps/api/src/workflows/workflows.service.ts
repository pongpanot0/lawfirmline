import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { Prisma } from '../generated/prisma';
import { PrismaService } from '../prisma/prisma.module';
import { AuthUser, WorkflowStepDefinition, FirmRole } from '@lawfirm/shared';
import { DeadlineRulesService } from '../deadlines/deadline-rules.service';
import { AssignmentNotifierService } from '../notifications/assignment-notifier.service';
import { CreateWorkflowTemplateDto, UpdateWorkflowTemplateDto, CreateWorkflowRunDto, SendBackWorkflowDto, WorkflowAssigneeDto } from './dto/workflow.dto';
import { TaskStatus, NotificationCategory } from '../generated/prisma';

@Injectable()
export class WorkflowsService {
  constructor(
    private prisma: PrismaService,
    private deadlineRules: DeadlineRulesService,
    private notifier: AssignmentNotifierService,
  ) {}

  // ===== Template CRUD =====

  async createTemplate(user: AuthUser, dto: CreateWorkflowTemplateDto) {
    this.validateSteps(dto.steps);
    return this.prisma.workflowTemplate.create({
      data: {
        firmId: user.firmId,
        name: dto.name,
        description: dto.description,
        steps: dto.steps as any,
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

    if (dto.steps) this.validateSteps(dto.steps);
    return this.prisma.workflowTemplate.update({
      where: { id: templateId },
      data: {
        name: dto.name,
        description: dto.description,
        steps: dto.steps ? (dto.steps as any) : undefined,
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

  private validateSteps(steps: WorkflowStepDefinition[]) {
    if (steps.length < 1 || steps.length > 20) {
      throw new BadRequestException('ต้องมี 1-20 ขั้นตอน');
    }
    for (const step of steps) {
      if (!step.title) throw new BadRequestException('ทุกขั้นต้องมีชื่อ');
      if (step.durationDays < 1 || step.durationDays > 60) {
        throw new BadRequestException('ระยะเวลาต้อง 1-60 วัน');
      }
      if (!Object.values(FirmRole).includes(step.role)) {
        throw new BadRequestException('บทบาทไม่ถูกต้อง');
      }
    }
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
            caseId: { not: null },
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
      where: { id: caseId, firmId: user.firmId },
      select: { id: true, ownRef: true, title: true, leadLawyerId: true },
    });
    if (!legalCase) throw new NotFoundException('Case not found');

    const template = dto.templateId
      ? await this.prisma.workflowTemplate.findFirst({
          where: { id: dto.templateId, firmId: user.firmId, isActive: true },
          select: { id: true, steps: true },
        })
      : null;

    const steps = (template?.steps ?? dto.steps ?? []) as WorkflowStepDefinition[];
    this.validateSteps(steps);

    // Validate assignees
    const assignees = dto.record ?? {};
    const userIds = Object.values(assignees).filter((id): id is string => !!id);
    if (userIds.length) {
      for (const [stepIdxStr, userId] of Object.entries(assignees)) {
        const stepIdx = parseInt(stepIdxStr, 10);
        if (stepIdx < 0 || stepIdx >= steps.length) {
          throw new BadRequestException('ดัชนีขั้นไม่ถูกต้อง');
        }
        const step = steps[stepIdx];
        const member = await this.prisma.firmMember.findFirst({
          where: { userId, firmId: user.firmId, role: step.role },
          select: { id: true },
        });
        if (!member) {
          throw new BadRequestException(
            `ผู้ใช้สำหรับขั้น ${stepIdx} ไม่มีบทบาท ${step.role} หรือไม่อยู่ในสำนักงาน`,
          );
        }
      }
    }

    const maxDays = steps.reduce((sum, s) => sum + s.durationDays, 0);
    const holidays = await this.deadlineRules.loadHolidays(new Date(), maxDays);

    const result = await this.prisma.$transaction(async (tx) => {
      const run = await tx.workflowRun.create({
        data: {
          firmId: user.firmId,
          caseId,
          templateId: template?.id ?? null,
          name: dto.name,
          promisedAt: dto.promisedAt ? new Date(dto.promisedAt) : null,
          createdById: user.id,
        },
      });

      let cumulativeDaysFromNow = 0;
      let previousTaskId: string | null = null;

      for (let i = 0; i < steps.length; i++) {
        const step = steps[i];
        cumulativeDaysFromNow += step.durationDays;
        const dueDate = new Date(
          `${this.deadlineRules.computeDueDate(
            new Date(),
            cumulativeDaysFromNow,
            'BUSINESS' as any,
            holidays,
          )}T00:00:00.000Z`,
        );

        let assigneeId: string | null = assignees[i] ?? null;
        if (!assigneeId) {
          const candidates = await tx.firmMember.findMany({
            where: { firmId: user.firmId, role: step.role },
            select: { userId: true },
          });
          if (!candidates.length) {
            throw new BadRequestException(`ไม่มีสมาชิกบทบาท ${step.role}`);
          }
          let bestUserId = candidates[0].userId;
          let bestCount = Infinity;
          for (const c of candidates) {
            const count = await tx.task.count({
              where: {
                assigneeId: c.userId,
                status: { not: TaskStatus.DONE },
                caseId: { not: null },
              },
            });
            if (count < bestCount) {
              bestCount = count;
              bestUserId = c.userId;
            }
          }
          assigneeId = bestUserId;
        }

        const newTask: any = await tx.task.create({
          data: {
            firmId: user.firmId,
            caseId,
            title: step.title,
            description: step.instructions ?? undefined,
            assigneeId,
            dueDate,
            blockedById: previousTaskId,
            requiresReview: step.requiresReview ?? false,
            reviewerId: step.requiresReview ? (legalCase.leadLawyerId ?? null) : null,
            workflowRunId: run.id,
            workflowStep: i,
            workflowDurationDays: step.durationDays,
            labels: [`workflow:${run.id}`],
            assignedAt: assigneeId ? new Date() : null,
            createdById: user.id,
          },
        });
        previousTaskId = newTask.id;
      }

      return run;
    });

    // Notify step-0 assignee
    const step0 = steps[0];
    const step0AssigneeId = assignees[0] ?? null;
    if (step0AssigneeId) {
      const member = await this.prisma.firmMember.findFirst({
        where: { userId: step0AssigneeId, firmId: user.firmId },
        select: { role: true },
      });
      const isExternal = member?.role === FirmRole.EXTERNAL;
      await this.notifier.notifyAssigned({
        firmId: user.firmId,
        userIds: [step0AssigneeId],
        actorUserId: user.id,
        category: NotificationCategory.TASK,
        summaryText: `📋 สายงานใหม่: "${result.name}"\nเริ่มต้น: ${step0.title}`,
        entityPath: isExternal ? '/work' : `/cases/${caseId}`,
      });
    }

    // Audit log
    await this.prisma.auditLog.create({
      data: {
        firmId: user.firmId,
        userId: user.id,
        action: 'WORKFLOW_STARTED',
        metadata: { name: result.name, stepCount: steps.length },
      },
    });

    return result;
  }

  // ===== Get Case Workflows =====

  async getCaseWorkflows(user: AuthUser, caseId: string) {
    const legalCase = await this.prisma.case.findFirst({
      where: { id: caseId, firmId: user.firmId },
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

      const projectedFinish = currentTask?.dueDate
        ? new Date(currentTask.dueDate.getTime() + remainingDays * 24 * 60 * 60 * 1000)
        : new Date();

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
      select: { id: true, createdById: true, caseId: true, tasks: { select: { id: true, workflowStep: true, assigneeId: true, status: true } } },
    });
    if (!run) throw new NotFoundException('Workflow run not found');

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

    const holidays = await this.deadlineRules.loadHolidays(new Date(), 365);
    const targetTask = run.tasks.find((t) => t.workflowStep === dto.toStep);
    if (!targetTask) throw new BadRequestException('ขั้นเป้าหมายไม่พบ');

    await this.prisma.$transaction(async (tx) => {
      await tx.task.update({
        where: { id: targetTask.id },
        data: {
          status: TaskStatus.TODO,
          completedAt: null,
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
          },
        });
      }

      let cumulativeDays = 0;
      for (const t of run.tasks.filter((t) => (t.workflowStep ?? 0) >= dto.toStep)) {
        const taskData = await tx.task.findUnique({ where: { id: t.id }, select: { workflowDurationDays: true } });
        cumulativeDays += taskData?.workflowDurationDays ?? 1;

        const newDueDate = new Date(
          `${this.deadlineRules.computeDueDate(
            new Date(),
            cumulativeDays,
            'BUSINESS' as any,
            holidays,
          )}T00:00:00.000Z`,
        );
        await tx.task.update({
          where: { id: t.id },
          data: { dueDate: newDueDate },
        });
      }
    });

    const targetMember = await this.prisma.firmMember.findFirst({
      where: { userId: targetTask.assigneeId!, firmId: user.firmId },
      select: { role: true },
    });

    await this.notifier.notifyAssigned({
      firmId: user.firmId,
      userIds: [targetTask.assigneeId!],
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
        metadata: { toStep: dto.toStep, reason: dto.reason },
      },
    });

    return { sentBack: true };
  }

  // ===== Cancel Run =====

  async cancelRun(user: AuthUser, runId: string) {
    const run = await this.prisma.workflowRun.findFirst({
      where: { id: runId, firmId: user.firmId },
      select: { id: true, createdById: true, caseId: true, tasks: { select: { id: true, status: true } } },
    });
    if (!run) throw new NotFoundException('Workflow run not found');

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

    await this.prisma.$transaction(async (tx) => {
      const undone = run.tasks.filter((t) => t.status !== TaskStatus.DONE);
      for (const t of undone) {
        await tx.task.delete({ where: { id: t.id } });
      }

      await tx.workflowRun.update({
        where: { id: run.id },
        data: { status: 'CANCELLED' },
      });
    });

    await this.prisma.auditLog.create({
      data: {
        firmId: user.firmId,
        userId: user.id,
        action: 'WORKFLOW_CANCELLED',
        metadata: {},
      },
    });

    return { cancelled: true };
  }

  // ===== Get Run Files =====

  async getRunFiles(user: AuthUser, runId: string) {
    const run = await this.prisma.workflowRun.findFirst({
      where: { id: runId, firmId: user.firmId },
      select: { id: true, caseId: true, tasks: { select: { id: true, workflowStep: true, attachments: true } } },
    });
    if (!run) throw new NotFoundException('Workflow run not found');

    const byStep = new Map<number, any[]>();
    for (const task of run.tasks) {
      byStep.set(task.workflowStep ?? 0, task.attachments);
    }

    return Array.from(byStep.entries())
      .sort(([a], [b]) => a - b)
      .map(([step, attachments]) => ({
        step,
        files: attachments.map((a) => ({
          id: a.id,
          filename: a.filename,
          size: a.size,
        })),
      }));
  }
}

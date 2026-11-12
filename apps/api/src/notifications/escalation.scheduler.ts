import { canCompleteFromLine, lineActions } from './line-actions';
import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { FirmRole } from '@lawfirm/shared';
import { NotificationCategory, Prisma, TaskStatus } from '../generated/prisma';
import { taskAppRoute } from './app-route';
import { PrismaService } from '../prisma/prisma.module';
import { AssignmentNotifierService } from './assignment-notifier.service';
import { AutomationLogService } from '../common/services/automation-log.service';
import { formatCaseNotificationReference } from './reference-label';

const DAY_MS = 24 * 60 * 60 * 1000;
const FOLLOW_UP_INTERVAL_DAYS = 7;
/** Todos have no case; a soft-deleted case's tasks must go quiet with it. */
const NOT_IN_DELETED_CASE: Prisma.TaskWhereInput = { OR: [{ caseId: null }, { case: { deletedAt: null } }] };
/** LINE caps a text message at 5,000 characters; a long backlog points to the task list instead. */
const GROUP_MAX_LINES = 15;

type EscalationItem = {
  task: { id: string; title: string; caseId: string | null; assigneeId: string | null } & Parameters<typeof canCompleteFromLine>[0];
  label: string;
  reference: string | null;
};

const overdueDaysOf = (dueDate: Date, now: Date) => Math.floor((now.getTime() - dueDate.getTime()) / DAY_MS);

/** Several tasks for one person → a single message listing them all. */
function groupedSummary(items: EscalationItem[]): string {
  const lines = items
    .slice(0, GROUP_MAX_LINES)
    .map((i) => `• ${i.task.title}${i.reference ? ` (${i.reference})` : ''} — ${i.label}`);
  const more = items.length > GROUP_MAX_LINES ? [`และอีก ${items.length - GROUP_MAX_LINES} งาน`] : [];
  return [`⚠️ งานที่ต้องตาม ${items.length} งาน`, ...lines, ...more].join('\n');
}

/**
 * Overdue-task escalation chain (ทุกเช้า 08:30 กทม.):
 *   ครบกำหนดพรุ่งนี้        → เตือน assignee
 *   เลยกำหนด ≥ 1 วัน       → เตือน assignee + lead lawyer ของคดี
 *   เลยกำหนด ≥ 3 วัน       → + เจ้าของสำนักงาน (OWNER)
 * Plus: chases TaskOnHold rows whose nextFollowUpAt has arrived.
 * Each recipient gets one message per morning; a single task keeps its own link and Done button.
 * ponytail: daily re-notify by design — no per-tier sent-log until it annoys someone.
 */
@Injectable()
export class EscalationScheduler {
  private readonly logger = new Logger(EscalationScheduler.name);

  constructor(
    private prisma: PrismaService,
    private notifier: AssignmentNotifierService,
    private automationLog: AutomationLogService,
  ) {}

  @Cron('30 8 * * *', { timeZone: 'Asia/Bangkok' })
  async run() {
    await this.escalateOverdueTasks().catch((err) => this.logger.error('escalation failed', err));
    await this.chaseOnHoldFollowUps().catch((err) => this.logger.error('follow-up chase failed', err));
  }

  private async escalateOverdueTasks() {
    const now = new Date();
    const tomorrowEnd = new Date(now.getTime() + DAY_MS);
    const tasks = await this.prisma.task.findMany({
      where: {
        status: { not: TaskStatus.DONE },
        dueDate: { lte: tomorrowEnd },
        onHold: null,
        ...NOT_IN_DELETED_CASE,
      },
      include: { case: { select: { id: true, firmId: true, title: true, leadLawyerId: true, ownRef: true, blackCaseNumber: true, redCaseNumber: true } } },
      orderBy: { dueDate: 'asc' },
    });

    const ownerFirmIds = [...new Set(tasks.filter((t) => t.case && t.dueDate && overdueDaysOf(t.dueDate, now) >= 3).map((t) => t.case!.firmId))];
    const owners = ownerFirmIds.length
      ? await this.prisma.firmMember.findMany({ where: { firmId: { in: ownerFirmIds }, role: FirmRole.OWNER }, select: { firmId: true, userId: true } })
      : [];

    // One message per recipient per firm per morning, not one per task.
    const buckets = new Map<string, { firmId: string | null; userId: string; items: EscalationItem[] }>();
    const add = (firmId: string | null, userId: string | null, item: EscalationItem) => {
      if (!userId) return;
      const key = `${firmId ?? ''}:${userId}`;
      if (!buckets.has(key)) buckets.set(key, { firmId, userId, items: [] });
      const bucket = buckets.get(key)!;
      if (!bucket.items.some((i) => i.task.id === item.task.id)) bucket.items.push(item);
    };

    const perFirm = new Map<string, number>();
    for (const task of tasks) {
      if (!task.dueDate) continue;
      if (task.case) perFirm.set(task.case.firmId, (perFirm.get(task.case.firmId) ?? 0) + 1);
      const overdueDays = overdueDaysOf(task.dueDate, now);
      const item: EscalationItem = {
        task,
        label: overdueDays >= 1 ? `เลยกำหนด ${overdueDays} วัน` : 'ครบกำหนดพรุ่งนี้',
        reference: task.case ? (formatCaseNotificationReference(task.case) ?? `คดี: ${task.case.title}`) : null,
      };
      const firmId = task.case?.firmId ?? null;
      add(firmId, task.assigneeId, item);
      if (overdueDays >= 1 && task.case) add(firmId, task.case.leadLawyerId, item);
      if (overdueDays >= 3 && task.case) {
        for (const o of owners) if (o.firmId === task.case.firmId) add(firmId, o.userId, item);
      }
    }

    for (const { firmId, userId, items } of buckets.values()) {
      const [only] = items;
      await this.notifier.notifyAssigned(
        items.length === 1
          ? {
              category: NotificationCategory.TASK,
              firmId,
              userIds: [userId],
              actorUserId: '',
              summaryText: `⚠️ งาน "${only.task.title}"${only.reference ? `\n${only.reference}` : ''}\n${only.label}`,
              entityPath: only.task.caseId ? `/cases/${only.task.caseId}` : '/todos',
              appPath: taskAppRoute(only.task.id),
              lineActions: (id) => (id === only.task.assigneeId && canCompleteFromLine(only.task) ? lineActions.taskDone(only.task.id) : undefined),
            }
          : {
              category: NotificationCategory.TASK,
              firmId,
              userIds: [userId],
              actorUserId: '',
              summaryText: groupedSummary(items),
              entityPath: '/todos',
            },
      );
    }

    for (const [firmId, count] of perFirm) {
      await this.automationLog.record({
        firmId,
        automation: 'task-escalation',
        trigger: { cron: '08:30 Asia/Bangkok' },
        result: { tasksNotified: count },
      });
    }
  }

  private async chaseOnHoldFollowUps() {
    const now = new Date();
    const holds = await this.prisma.taskOnHold.findMany({
      where: { endedAt: null, nextFollowUpAt: { lte: now }, task: NOT_IN_DELETED_CASE },
      include: {
        task: { include: { case: { select: { id: true, firmId: true, title: true, ownRef: true, blackCaseNumber: true, redCaseNumber: true } } } },
      },
    });

    for (const hold of holds) {
      const targets = [hold.followerUserId ?? hold.createdById];
      await this.notifier.notifyAssigned({
        category: NotificationCategory.TASK,
        firmId: hold.task.case?.firmId ?? null,
        userIds: targets,
        actorUserId: '',
        summaryText:
          `⏰ ถึงกำหนดตามงานที่พักไว้: "${hold.task.title}"` +
          `${hold.task.case ? `\n${formatCaseNotificationReference(hold.task.case) ?? `คดี: ${hold.task.case.title}`}` : ''}\nเหตุผลที่พัก: ${hold.reason}`,
        entityPath: hold.task.caseId ? `/cases/${hold.task.caseId}` : '/todos',
        appPath: taskAppRoute(hold.task.id),
      });
      await this.prisma.taskOnHold.update({
        where: { id: hold.id },
        data: {
          lastFollowUpAt: now,
          nextFollowUpAt: new Date(now.getTime() + FOLLOW_UP_INTERVAL_DAYS * DAY_MS),
        },
      });
    }
  }
}

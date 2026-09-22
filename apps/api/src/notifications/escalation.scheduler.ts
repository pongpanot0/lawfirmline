import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { TaskStatus } from '../generated/prisma';
import { PrismaService } from '../prisma/prisma.module';
import { AssignmentNotifierService } from './assignment-notifier.service';
import { AutomationLogService } from '../common/services/automation-log.service';

const DAY_MS = 24 * 60 * 60 * 1000;
const FOLLOW_UP_INTERVAL_DAYS = 7;

/**
 * Overdue-task escalation chain (ทุกเช้า 08:30 กทม.):
 *   ครบกำหนดพรุ่งนี้        → เตือน assignee
 *   เลยกำหนด ≥ 1 วัน       → เตือน assignee + lead lawyer ของคดี
 *   เลยกำหนด ≥ 3 วัน       → + เจ้าของสำนักงาน (OWNER)
 * Plus: chases TaskOnHold rows whose nextFollowUpAt has arrived.
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
      },
      include: { case: { select: { id: true, firmId: true, title: true, leadLawyerId: true } } },
    });

    const perFirm = new Map<string, number>();
    for (const task of tasks) {
      if (task.case) perFirm.set(task.case.firmId, (perFirm.get(task.case.firmId) ?? 0) + 1);
    }

    for (const task of tasks) {
      if (!task.dueDate) continue;
      const overdueDays = Math.floor((now.getTime() - task.dueDate.getTime()) / DAY_MS);
      const path = task.caseId ? `/cases/${task.caseId}` : '/todos';
      const label = overdueDays >= 1 ? `เลยกำหนด ${overdueDays} วัน` : 'ครบกำหนดพรุ่งนี้';
      const summary = `⚠️ งาน "${task.title}"${task.case ? ` (คดี ${task.case.title})` : ''} ${label}`;

      const targets = new Set<string>();
      if (task.assigneeId) targets.add(task.assigneeId);
      if (overdueDays >= 1 && task.case) targets.add(task.case.leadLawyerId);

      if (targets.size) {
        await this.notifier.notifyAssigned({
          firmId: task.case?.firmId ?? null,
          userIds: [...targets],
          actorUserId: '',
          summaryText: summary,
          entityPath: path,
        });
      }

      if (overdueDays >= 3 && task.case) {
        await this.notifier.notifyFirmOwners({
          firmId: task.case.firmId,
          actorUserId: task.assigneeId ?? '',
          summaryText: summary,
          entityPath: path,
        });
      }
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
      where: { endedAt: null, nextFollowUpAt: { lte: now } },
      include: {
        task: { include: { case: { select: { id: true, firmId: true, title: true } } } },
      },
    });

    for (const hold of holds) {
      const targets = [hold.followerUserId ?? hold.createdById];
      await this.notifier.notifyAssigned({
        firmId: hold.task.case?.firmId ?? null,
        userIds: targets,
        actorUserId: '',
        summaryText:
          `⏰ ถึงกำหนดตามงานที่พักไว้: "${hold.task.title}"` +
          `${hold.task.case ? ` (คดี ${hold.task.case.title})` : ''}\nเหตุผลที่พัก: ${hold.reason}`,
        entityPath: hold.task.caseId ? `/cases/${hold.task.caseId}` : '/todos',
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

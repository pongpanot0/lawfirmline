import { forwardRef, ForbiddenException, Inject, Injectable } from '@nestjs/common';
import { AuthUser, ExpenseClaimStatus, TaskStatus } from '@lawfirm/shared';
import { LeaveService } from '../../leave/leave.service';
import { TasksService } from '../../tasks/tasks.service';
import { BillingService } from '../../billing/billing.service';
import { EventResponsibilityService } from '../../calendar/event-responsibility.service';

const ACTION = /^(leave|task|claim|event):([a-z]+):([0-9a-f-]{36})(?::(.+))?$/i;

/**
 * Handles the postbacks from notification buttons (see ../line-actions.ts).
 * Every action goes through the same service method the web calls, with the
 * tapper as the actor, so a forwarded or typed payload gets no further than
 * the web would.
 */
@Injectable()
export class LineQuickActionsService {
  constructor(
    private leaves: LeaveService,
    @Inject(forwardRef(() => TasksService)) private tasks: TasksService,
    @Inject(forwardRef(() => BillingService)) private billing: BillingService,
    @Inject(forwardRef(() => EventResponsibilityService)) private events: EventResponsibilityService,
  ) {}

  /** The reply for an action payload, or null when `data` is not one. */
  async handle(user: AuthUser, data: string): Promise<string | null> {
    const match = ACTION.exec(data);
    if (!match) return null;
    const [, kind, verb, id, extra] = match;
    try {
      return await this.run(user, `${kind}:${verb}`, id, extra);
    } catch (error) {
      return error instanceof Error ? `ทำรายการไม่สำเร็จ: ${error.message}` : 'ทำรายการไม่สำเร็จ กรุณาลองใหม่';
    }
  }

  private async run(user: AuthUser, action: string, id: string, extra?: string): Promise<string | null> {
    switch (action) {
      case 'leave:approve':
      case 'leave:reject':
        await this.leaves.decide(user, id, action === 'leave:approve' ? 'APPROVED' : 'REJECTED');
        return action === 'leave:approve' ? 'อนุมัติการลาแล้วครับ' : 'ไม่อนุมัติการลาแล้วครับ';
      case 'task:ack': {
        const task = await this.tasks.acknowledge(id, user);
        return `รับทราบงาน "${task.title}" แล้วครับ`;
      }
      case 'task:done': {
        const task = await this.tasks.assertAccess(id, user);
        if (task.assigneeId !== user.id) throw new ForbiddenException('ปิดงานจาก LINE ได้เฉพาะผู้รับผิดชอบ');
        if (task.status === TaskStatus.DONE) return `งาน "${task.title}" เสร็จไปแล้วครับ`;
        await this.tasks.update(id, { status: TaskStatus.DONE }, user, task.caseId ?? undefined);
        return `✅ ปิดงาน "${task.title}" แล้วครับ`;
      }
      case 'claim:approve':
      case 'claim:reject': {
        const status = action === 'claim:approve' ? ExpenseClaimStatus.APPROVED : ExpenseClaimStatus.REJECTED;
        await this.billing.updateExpenseClaimStatus(user, id, { status });
        return status === ExpenseClaimStatus.APPROVED ? 'อนุมัติใบเบิกแล้วครับ' : 'ไม่อนุมัติใบเบิกแล้วครับ';
      }
      case 'event:ack':
        if (!extra) return null;
        await this.events.acknowledge(user, id, extra);
        return 'รับทราบนัดแล้วครับ';
      default:
        return null;
    }
  }
}

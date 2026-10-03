import type { QuickReplyItem } from './line-messaging.service';

/**
 * One-tap buttons that ride along with a LINE notification. Each is a postback
 * the bot router hands to LineQuickActionsService, which re-checks the tapper's
 * rights through the same service the web uses — a button is a shortcut, never
 * a permission.
 */
export const lineActions = {
  task(taskId: string, opts: { canComplete: boolean }): QuickReplyItem[] {
    return [
      { label: '👍 รับทราบ', text: 'รับทราบงาน', data: `task:ack:${taskId}` },
      ...(opts.canComplete ? [{ label: '✅ เสร็จแล้ว', text: 'งานเสร็จแล้ว', data: `task:done:${taskId}` }] : []),
    ];
  },
  taskDone(taskId: string): QuickReplyItem[] {
    return [{ label: '✅ เสร็จแล้ว', text: 'งานเสร็จแล้ว', data: `task:done:${taskId}` }];
  },
  claim(claimId: string): QuickReplyItem[] {
    return [
      { label: '✅ อนุมัติใบเบิก', text: 'อนุมัติใบเบิก', data: `claim:approve:${claimId}` },
      { label: '❌ ไม่อนุมัติ', text: 'ไม่อนุมัติใบเบิก', data: `claim:reject:${claimId}` },
    ];
  },
  /** `revision` is the event's updatedAt: a tap on a stale notice must not confirm a newer date. */
  eventAck(eventId: string, revision: Date): QuickReplyItem[] {
    return [{ label: '👍 รับทราบนัด', text: 'รับทราบนัด', data: `event:ack:${eventId}:${revision.toISOString()}` }];
  },
};

/** Whether a task can be closed with one tap — not when it needs review or follows an SOP routine. */
export const canCompleteFromLine = (task: { requiresReview?: boolean | null; routine?: unknown }) =>
  !task.requiresReview && !task.routine;

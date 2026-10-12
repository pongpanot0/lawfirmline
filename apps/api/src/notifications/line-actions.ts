import type { QuickReplyItem } from './line-messaging.service';

/**
 * One-tap buttons that ride along with a LINE notification. Each is a postback
 * the bot router hands to LineQuickActionsService, which re-checks the tapper's
 * rights through the same service the web uses — a button is a shortcut, never
 * a permission.
 */
export const lineActions = {
  task(taskId: string, opts: { canComplete: boolean; canHandoff?: boolean }): QuickReplyItem[] {
    return [
      { label: '👍 รับทราบ', text: 'รับทราบงาน', data: `task:ack:${taskId}` },
      ...(opts.canComplete ? [{ label: '✅ เสร็จแล้ว', text: 'งานเสร็จแล้ว', data: `task:done:${taskId}` }] : []),
      ...(opts.canHandoff ? [{ label: '📤 ส่งตรวจ', text: 'ส่งงานให้ตรวจ', data: `task:handoff:${taskId}` }] : []),
    ];
  },
  taskDone(taskId: string): QuickReplyItem[] {
    return [{ label: '✅ เสร็จแล้ว', text: 'งานเสร็จแล้ว', data: `task:done:${taskId}` }];
  },
  /** Sent to the reviewer with a handoff. "ส่งกลับ" asks for the reason as a follow-up message (Task 6). */
  review(taskId: string): QuickReplyItem[] {
    return [
      { label: '✅ อนุมัติ', text: 'อนุมัติงาน', data: `task:accept:${taskId}` },
      { label: '↩️ ส่งกลับ', text: 'ส่งงานกลับแก้', data: `task:reject:${taskId}` },
    ];
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

/** The handoff button needs somewhere to go: a case task, or a standalone task with a named reviewer. */
export const canHandoffFromLine = (task: { requiresReview?: boolean | null; caseId?: string | null; reviewerId?: string | null }) =>
  !!task.requiresReview && (!!task.caseId || !!task.reviewerId);

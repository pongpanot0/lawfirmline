import { forwardRef, Inject, Injectable } from '@nestjs/common';
import { TASK_HANDOFF_NOTE_MIN } from '@lawfirm/shared';
import { TasksService } from '../../../tasks/tasks.service';
import { LineMessagingService, QuickReplyItem } from '../../line-messaging.service';
import { LineConversationStoreService } from '../line-conversation-store.service';
import { LineAuthContextService } from '../line-auth-context.service';
import { ConversationSession, ConversationStep, FlowType } from '../line-conversation.types';
import { withEscape } from './flow-confirmation.util';

/** Postbacks that need a typed follow-up before they act. */
export const REVIEW_NOTE_ACTION = /^task:(handoff|reject):([0-9a-f-]{36})$/i;

/**
 * "📤 ส่งตรวจ" and "↩️ ส่งกลับ" need words from the person who tapped: the
 * handoff note for the reviewer (≥ 5 chars, same rule as web/mobile) or the
 * reason for sending back. The next message is that text; the action then
 * runs through the same TasksService method the web uses.
 */
@Injectable()
export class LineTaskReviewFlowService {
  constructor(
    @Inject(forwardRef(() => TasksService)) private tasks: TasksService,
    private line: LineMessagingService,
    private store: LineConversationStoreService,
    private auth: LineAuthContextService,
  ) {}

  async begin(session: ConversationSession, kind: 'handoff' | 'reject', taskId: string): Promise<void> {
    const step = kind === 'handoff' ? ConversationStep.TASK_HANDOFF_NOTE : ConversationStep.TASK_REJECT_REASON;
    this.store.update(session.lineUserId, { flowType: FlowType.TASK_REVIEW, step, data: { taskId } });
    await this.reply(session, kind === 'handoff'
      ? `พิมพ์หมายเหตุถึงผู้ตรวจ (อย่างน้อย ${TASK_HANDOFF_NOTE_MIN} ตัวอักษร) แล้วส่งมาได้เลยครับ`
      : 'พิมพ์เหตุผลที่ส่งงานกลับให้แก้ แล้วส่งมาได้เลยครับ');
  }

  async handle(session: ConversationSession, text: string): Promise<void> {
    const taskId = String(session.data.taskId ?? '');
    const value = text.trim();
    const handoff = session.step === ConversationStep.TASK_HANDOFF_NOTE;
    if (value.length < (handoff ? TASK_HANDOFF_NOTE_MIN : 1)) {
      await this.reply(session, `หมายเหตุสั้นไป พิมพ์อย่างน้อย ${TASK_HANDOFF_NOTE_MIN} ตัวอักษรครับ`);
      return;
    }
    const user = await this.auth.resolve(session.lineUserId);
    this.store.clear(session.lineUserId);
    if (!user) return;
    try {
      const task = handoff
        ? await this.tasks.handoffById(taskId, user, value)
        : await this.tasks.rejectById(taskId, user, value);
      await this.reply(session, handoff ? `📤 ส่งงาน "${task.title}" ให้ตรวจแล้วครับ` : `↩️ ส่งงาน "${task.title}" กลับให้แก้แล้วครับ`);
    } catch (error) {
      await this.reply(session, `ทำรายการไม่สำเร็จ: ${error instanceof Error ? error.message : 'กรุณาลองใหม่'}`);
    }
  }

  private async reply(session: ConversationSession, text: string, quickReply?: QuickReplyItem[]) {
    const items = withEscape(quickReply);
    if (session.target.replyToken) await this.line.replyWithQuickReply(session.target.replyToken, text, items);
    else await this.line.pushTo(session.lineUserId, text, items);
  }
}

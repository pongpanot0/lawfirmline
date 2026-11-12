import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AgendaItem, AuthUser, secretaryCardLabel, secretaryCardPath } from '@lawfirm/shared';
import { FirmLinkService } from '../firm-link.service';
import { SecretaryChatService } from '../../secretary/secretary-chat.service';
import { AgendaService } from '../../agenda/agenda.service';
import { LineMessagingService } from '../line-messaging.service';
import { LineAuthContextService } from './line-auth-context.service';
import { LineConversationStoreService } from './line-conversation-store.service';
import { LineCaseFlowService } from './flows/line-case-flow.service';
import { LineTaskFlowService } from './flows/line-task-flow.service';
import { LineTodoFlowService } from './flows/line-todo-flow.service';
import { LineExpenseFlowService } from './flows/line-expense-flow.service';
import { LineAdvanceFlowService } from './flows/line-advance-flow.service';
import { LineTaskReviewFlowService, REVIEW_NOTE_ACTION } from './flows/line-task-review-flow.service';
import { LineLeaveFlowService } from './flows/line-leave-flow.service';
import { LineQuickActionsService } from './line-quick-actions.service';
import { AI_CONFIRM_ACTION, AI_CONFIRM_COMMAND, LINE_AI_WRITES, LineAiWriteService } from './line-ai-write.service';
import { CASE_SEARCH_COMMAND, LineQueryService, OPEN_TASKS_COMMAND, QueryReply } from './line-query.service';
import { ConversationSession, ConversationTarget, ConversationStep, FlowType } from './line-conversation.types';
import {
  CANCEL_COMMAND,
  MENU_COMMAND,
  MENU_HINT,
  MENU_QUICK_REPLY,
  MENU_SELECTION_MAP,
  MYDAY_COMMAND,
  leaveIntent,
} from './line-menu';

const MYDAY_SECTION_LIMIT = 5;
/** LINE rejects a text message over 5000 characters. */
const LINE_TEXT_MAX = 5000;
/** Links under an AI answer; more turns a phone screen into a list of URLs. */
const AI_LINKS_MAX = 3;
/**
 * Only turns this recent count as the conversation. Older ones are a different topic, and
 * feeding them in made the same question get a different answer for each person.
 */
const AI_FOLLOW_UP_MS = 30 * 60_000;

/** Which chat a message came from — a session belongs to one chat, not to a user. */
export function chatKey(target: ConversationTarget): string {
  return target.groupId ?? target.roomId ?? 'user';
}

@Injectable()
export class LineBotRouterService {
  private readonly logger = new Logger(LineBotRouterService.name);

  constructor(
    private line: LineMessagingService,
    private auth: LineAuthContextService,
    private store: LineConversationStoreService,
    private caseFlow: LineCaseFlowService,
    private taskFlow: LineTaskFlowService,
    private todoFlow: LineTodoFlowService,
    private expenseFlow: LineExpenseFlowService,
    private advanceFlow: LineAdvanceFlowService,
    private agenda: AgendaService,
    private config: ConfigService,
    private firmLink: FirmLinkService,
    private leaveFlow: LineLeaveFlowService,
    private quickActions: LineQuickActionsService,
    private query: LineQueryService,
    private reviewFlow: LineTaskReviewFlowService,
    private secretary: SecretaryChatService,
    private aiWrite: LineAiWriteService,
  ) {}

  async route(
    lineUserId: string,
    text: string,
    target: ConversationTarget,
    mentionsBot: boolean,
  ): Promise<void> {
    const stored = this.store.get(lineUserId);
    // A session started in another chat must not swallow messages here.
    const existing = stored && chatKey(stored.target) === chatKey(target) ? stored : undefined;
    const isGroupOrRoom = target.sourceType === 'group' || target.sourceType === 'room';

    // In a group/room, only react to a fresh mention — never to ambient chatter.
    if (!existing && isGroupOrRoom && !mentionsBot) return;

    const authUser = await this.auth.resolve(lineUserId);
    if (!authUser) {
      if (existing) this.store.clear(lineUserId);
      await this.replyUnlinked(lineUserId, target);
      return;
    }

    // A notification button (approve, acknowledge, done…) works from any chat
    // state and never starts or disturbs a flow.
    const reviewNote = REVIEW_NOTE_ACTION.exec(text);
    if (reviewNote) {
      // Guard on the user's session in any chat; only a review flow may be replaced.
      const active = this.store.get(lineUserId);
      if (active?.flowType && active.flowType !== FlowType.TASK_REVIEW) {
        await this.reply(lineUserId, target, { text: 'ทำรายการเดิมให้เสร็จหรือพิมพ์ "ยกเลิก" ก่อน แล้วกดปุ่มอีกครั้งครับ' });
        return;
      }
      // The note prompt and result carry the task title: keep them in the 1:1 chat.
      const privateTarget: ConversationTarget = { sourceType: 'user' };
      const session = this.store.start({
        lineUserId, userId: authUser.id, firmId: authUser.firmId,
        flowType: FlowType.TASK_REVIEW, step: ConversationStep.SELECT_ACTION, data: {},
        target: chatKey(target) === 'user' ? target : privateTarget,
      });
      const delivered = await this.reviewFlow.begin(session, reviewNote[1].toLowerCase() as 'handoff' | 'reject', reviewNote[2]);
      if (chatKey(target) !== 'user') {
        if (delivered === false) {
          this.store.clear(lineUserId);
          await this.reply(lineUserId, target, { text: 'เพิ่มบอทเป็นเพื่อนก่อน แล้วกดปุ่มอีกครั้งครับ' });
        } else {
          await this.reply(lineUserId, target, { text: 'ส่งขั้นตอนต่อไปที่แชตส่วนตัวกับบอทแล้วครับ' });
        }
      }
      return;
    }

    // An AI-write ยืนยัน button saves exactly the proposal it was drawn for, whatever the chat state now.
    const aiConfirm = AI_CONFIRM_ACTION.exec(text);
    if (aiConfirm) {
      const saved = await this.aiWrite.confirm(authUser, lineUserId, aiConfirm[1].toLowerCase());
      // null: a second tap of the same button — the first one already saved it.
      if (saved) await this.reply(lineUserId, target, { text: saved }, MENU_QUICK_REPLY);
      return;
    }

    const actionReply = await this.quickActions.handle(authUser, text);
    if (actionReply !== null) {
      await this.reply(lineUserId, target, { text: actionReply });
      return;
    }

    // Read-only questions answer from anywhere and leave an in-progress flow untouched.
    if (text === MYDAY_COMMAND) {
      if (existing) this.store.update(lineUserId, { target });
      await this.replyMyDay(authUser, lineUserId, target);
      return;
    }
    if (text === OPEN_TASKS_COMMAND) {
      if (existing) this.store.update(lineUserId, { target });
      await this.replyPrivately(lineUserId, target, await this.query.openTasks(authUser));
      return;
    }
    if (text === CASE_SEARCH_COMMAND) {
      if (existing) this.store.update(lineUserId, { target });
      await this.reply(lineUserId, target, { text: 'พิมพ์ "คดี" ตามด้วยเลขอ้างอิง เลขคดีดำ/แดง หรือชื่อคดีได้เลยครับ\nเช่น คดี TSBREF20250001' });
      return;
    }
    // "คดี X" is a question only outside a flow — inside one it may be the answer to a step.
    const caseTerm = !existing?.flowType ? this.query.caseQuery(text) : null;
    if (caseTerm) {
      if (existing) this.store.update(lineUserId, { target });
      await this.replyPrivately(lineUserId, target, await this.query.findCase(authUser, caseTerm));
      return;
    }

    // Menu / cancel / a menu tap always win over the current step: a button the
    // bot itself put on screen must never be mistaken for an answer.
    if (text === CANCEL_COMMAND) {
      if (existing) this.store.clear(lineUserId);
      await this.showMainMenu(lineUserId, target, existing ? 'ยกเลิกรายการแล้วครับ' : undefined);
      return;
    }

    // A typed leave request ("ขอลาพรุ่งนี้") opens the leave form rather than the AI — but only
    // outside a flow, where it could be the answer to a step (a task titled "ลางานบวช").
    const typedLeave = !MENU_SELECTION_MAP[text] && !existing?.flowType ? leaveIntent(text) : null;
    const directFlow = MENU_SELECTION_MAP[text] ?? (typedLeave ? FlowType.LEAVE : undefined);
    if (text === MENU_COMMAND || directFlow) {
      const interrupted = Boolean(existing?.flowType);
      const started = this.store.start({
        lineUserId,
        userId: authUser.id,
        firmId: authUser.firmId,
        flowType: directFlow ?? null,
        step: ConversationStep.SELECT_ACTION,
        data: {},
        target,
      });
      if (directFlow) {
        if (interrupted) {
          await this.line.pushTo(
            chatKey(target) === 'user' ? lineUserId : chatKey(target),
            'ออกจากรายการที่ทำค้างไว้ แล้วเริ่มรายการใหม่ให้ครับ',
          );
        }
        await this.startFlow(directFlow, started, typedLeave ?? text);
        return;
      }
      await this.showMainMenu(lineUserId, target);
      return;
    }

    if (!existing || existing.flowType === null) {
      if (!existing) {
        this.store.start({
          lineUserId,
          userId: authUser.id,
          firmId: authUser.firmId,
          flowType: null,
          step: ConversationStep.SELECT_ACTION,
          data: {},
          target,
        });
      } else {
        this.store.update(lineUserId, { target });
      }
      // Not a command: a question for the AI secretary (the same read-only, access-scoped one as the web panel).
      await this.answerWithAi(authUser, lineUserId, target, text);
      return;
    }

    // An action flow is active — refresh the target (replyToken changes every turn) and delegate.
    const updated = this.store.update(lineUserId, { target });
    if (!updated) {
      this.logger.warn(`Session for ${lineUserId} expired before message could be routed`);
      await this.showMainMenu(
        lineUserId,
        target,
        'รายการที่ทำค้างไว้หมดเวลาแล้วครับ (เกิน 10 นาที) เริ่มใหม่ได้เลย',
      );
      return;
    }
    if (existing.flowType === FlowType.CASE) return this.caseFlow.handle(updated, text);
    if (existing.flowType === FlowType.TASK) return this.taskFlow.handle(updated, text);
    if (existing.flowType === FlowType.TODO) return this.todoFlow.handle(updated, text);
    if (existing.flowType === FlowType.EXPENSE) return this.expenseFlow.handle(updated, text);
    if (existing.flowType === FlowType.ADVANCE) return this.advanceFlow.handle(updated, text);
    if (existing.flowType === FlowType.TASK_REVIEW) return this.reviewFlow.handle(updated, text);
    if (existing.flowType === FlowType.LEAVE) return this.leaveFlow.handle(updated, text);
    if (existing.flowType === FlowType.AI_WRITE) {
      // Typed "ยืนยัน" names no proposal; only the button does — show it again.
      if (text === AI_CONFIRM_COMMAND) {
        return this.reply(lineUserId, target, { text: 'กดปุ่ม ✅ ยืนยัน ด้านล่างเพื่อบันทึกครับ', quickReply: this.aiWrite.heldQuickReply(lineUserId) });
      }
      // Anything else is a new message: the waiting write is dropped (the AI may propose a corrected one).
      this.store.clear(lineUserId);
      return this.answerWithAi(authUser, lineUserId, target, text, 'รายการที่รอยืนยันยังไม่ได้บันทึกครับ');
    }
  }

  private async replyMyDay(
    authUser: AuthUser,
    lineUserId: string,
    target: ConversationTarget,
  ): Promise<void> {
    const day = await this.agenda.getMyDay(authUser);
    const webUrl = this.firmLink.originForSlug(authUser.firmSlug);

    const section = (icon: string, title: string, items: AgendaItem[]): string | null => {
      if (!items.length) return null;
      const lines = items.slice(0, MYDAY_SECTION_LIMIT).map((item) => {
        const time = item.allDay
          ? ''
          : `${new Date(item.at).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Bangkok' })} `;
        const caseRef = item.caseRef ? ` — ${item.caseRef}` : '';
        return `• ${time}${item.title}${caseRef}`;
      });
      const more = items.length > MYDAY_SECTION_LIMIT
        ? [`…และอีก ${items.length - MYDAY_SECTION_LIMIT} รายการ`]
        : [];
      return [`${icon} ${title} ${items.length} รายการ`, ...lines, ...more].join('\n');
    };

    const dateLabel = new Date(`${day.today}T00:00:00+07:00`).toLocaleDateString('th-TH', {
      day: 'numeric',
      month: 'short',
      timeZone: 'Asia/Bangkok',
    });
    const sections = [
      section('⏰', 'เลยกำหนด', day.overdue),
      section('📅', 'วันนี้', day.todayItems),
    ].filter((s): s is string => s !== null);

    const body = sections.length
      ? sections.join('\n\n')
      : 'วันนี้ไม่มีนัดหมายและไม่มีงานค้างครับ 🎉';
    const text = `📊 งานของฉันวันนี้ (${dateLabel})\n\n${body}\n\n🔗 ${webUrl}/my-day`;

    if (target.replyToken) {
      await this.line.replyWithQuickReply(target.replyToken, text, MENU_QUICK_REPLY);
    } else {
      await this.line.pushTo(lineUserId, text, MENU_QUICK_REPLY);
    }
  }

  /**
   * The user typed a question, so the AI runs because they asked — never on its own.
   * The answer may name cases the group cannot see, so in a group it goes to the asker's own chat.
   */
  private async answerWithAi(user: AuthUser, lineUserId: string, target: ConversationTarget, question: string, notice?: string) {
    const isPrivate = chatKey(target) === 'user';
    if (isPrivate) await this.line.showLoading(lineUserId);
    let text: string;
    let quickReply = MENU_QUICK_REPLY;
    try {
      // History is the user's one secretary chat, so a question just asked on the web can be followed up here.
      const past = await this.secretary.history(user, new Date(Date.now() - AI_FOLLOW_UP_MS));
      const { reply, cards, proposal } = await this.secretary.chat(user, [...past, { role: 'user', content: question }], { writeTools: LINE_AI_WRITES });
      const origin = this.firmLink.originForSlug(user.firmSlug);
      const links = cards.slice(0, AI_LINKS_MAX).map((c) => `🔗 ${secretaryCardLabel(c)}\n${origin}${secretaryCardPath(c)}`);
      text = [notice, reply, ...(proposal ? [] : links)].filter(Boolean).join('\n\n').slice(0, LINE_TEXT_MAX);
      // A proposed write saves nothing yet: it waits for the person's own "ยืนยัน".
      if (proposal) quickReply = this.aiWrite.hold(user, lineUserId, proposal);
    } catch (err) {
      this.logger.warn(`LINE AI answer failed: ${err}`);
      text = `ผู้ช่วย AI ตอบไม่ได้ในขณะนี้ครับ ลองถามใหม่อีกครั้ง\n\n${MENU_HINT}`;
    }
    if (!isPrivate) return this.replyPrivately(lineUserId, target, { text, quickReply });
    // A slow answer can outlive the reply token; push so the answer is never lost.
    const replied = target.replyToken && (await this.line.replyWithQuickReply(target.replyToken, text, quickReply));
    if (!replied) await this.line.pushTo(lineUserId, text, quickReply);
  }

  private startFlow(flowType: FlowType, session: ConversationSession, command?: string): Promise<void> {
    switch (flowType) {
      case FlowType.CASE:
        return this.caseFlow.start(session);
      case FlowType.TASK:
        return this.taskFlow.start(session);
      case FlowType.TODO:
        return this.todoFlow.start(session);
      case FlowType.EXPENSE:
        return this.expenseFlow.start(session);
      case FlowType.ADVANCE:
        return this.advanceFlow.start(session);
      case FlowType.LEAVE:
        return this.leaveFlow.start(session, command);
      case FlowType.TASK_REVIEW:
        throw new Error('TASK_REVIEW starts from a postback, not a menu command');
      case FlowType.AI_WRITE:
        throw new Error('AI_WRITE starts from an AI answer, not a menu command');
    }
  }

  /**
   * A photo message. Only meaningful inside a flow step that expects one
   * (the expense receipt step) — everything else is ignored silently so
   * ambient photos in groups never trigger the bot.
   */
  async routeImage(
    lineUserId: string,
    messageId: string,
    target: ConversationTarget,
  ): Promise<void> {
    const session = this.store.get(lineUserId);
    if (
      session?.flowType !== FlowType.EXPENSE ||
      session.step !== ConversationStep.EXPENSE_RECEIPT ||
      chatKey(session.target) !== chatKey(target)
    ) {
      return;
    }
    const updated = this.store.update(lineUserId, { target });
    if (!updated) return;
    const image = await this.line.getMessageContent(messageId);
    if (!image) {
      if (target.replyToken) {
        await this.line.replyWithQuickReply(target.replyToken, 'ดาวน์โหลดรูปไม่สำเร็จครับ ลองส่งใหม่อีกครั้ง');
      } else {
        await this.line.pushTo(lineUserId, 'ดาวน์โหลดรูปไม่สำเร็จครับ ลองส่งใหม่อีกครั้ง');
      }
      return;
    }
    await this.expenseFlow.handleImage(updated, image);
  }

  /** The home menu: the picture (3 cards) plus buttons for every command. */
  private async showMainMenu(
    lineUserId: string,
    target: ConversationTarget,
    notice?: string,
  ): Promise<void> {
    if (notice) {
      const text = `${notice}\n\n${MENU_HINT}`;
      if (target.replyToken) {
        await this.line.replyWithQuickReply(target.replyToken, text, MENU_QUICK_REPLY);
      } else {
        await this.line.pushTo(lineUserId, text, MENU_QUICK_REPLY);
      }
      return;
    }
    if (target.replyToken) {
      await this.line.replyHomeMenu(target.replyToken, MENU_QUICK_REPLY);
    } else {
      await this.line.pushHomeMenu(lineUserId, MENU_QUICK_REPLY);
    }
  }

  /**
   * Case and task answers carry what only the asker may see. In a group the
   * other members' access is unknown, so the answer goes to the asker's own
   * chat and the group only hears that it was sent.
   */
  private async replyPrivately(lineUserId: string, target: ConversationTarget, message: QueryReply) {
    if (chatKey(target) === 'user') return this.reply(lineUserId, target, message, MENU_QUICK_REPLY);
    await this.line.pushTo(lineUserId, message.text, message.quickReply ?? MENU_QUICK_REPLY);
    await this.reply(lineUserId, target, { text: 'ส่งคำตอบไปที่แชตส่วนตัวกับบอทแล้วครับ' });
  }

  private async reply(lineUserId: string, target: ConversationTarget, message: QueryReply, fallback?: QueryReply['quickReply']) {
    const quickReply = message.quickReply ?? fallback;
    if (target.replyToken) {
      await this.line.replyWithQuickReply(target.replyToken, message.text, quickReply);
    } else {
      await this.line.pushTo(chatKey(target) === 'user' ? lineUserId : chatKey(target), message.text, quickReply);
    }
  }

  private async replyUnlinked(lineUserId: string, target: ConversationTarget): Promise<void> {
    const text = 'บัญชีไลน์นี้ยังไม่ได้ผูกกับผู้ใช้งานในระบบครับ กรุณาไปที่หน้าตั้งค่า > เชื่อมต่อ LINE บนเว็บแอปเพื่อขอรหัสผูกบัญชี แล้วพิมพ์รหัส (เช่น LF-XXXXXX) กลับมาที่นี่ครับ';
    if (target.replyToken) {
      await this.line.replyWithQuickReply(target.replyToken, text);
    } else {
      await this.line.pushTo(lineUserId, text);
    }
  }
}

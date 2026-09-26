import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AgendaItem, AuthUser } from '@lawfirm/shared';
import { FirmLinkService } from '../firm-link.service';
import { AgendaService } from '../../agenda/agenda.service';
import { LineMessagingService } from '../line-messaging.service';
import { LineAuthContextService } from './line-auth-context.service';
import { LineConversationStoreService } from './line-conversation-store.service';
import { LineCaseFlowService } from './flows/line-case-flow.service';
import { LineTaskFlowService } from './flows/line-task-flow.service';
import { LineTodoFlowService } from './flows/line-todo-flow.service';
import { LineExpenseFlowService } from './flows/line-expense-flow.service';
import { LineAdvanceFlowService } from './flows/line-advance-flow.service';
import { LineLeaveFlowService } from './flows/line-leave-flow.service';
import { LeaveService } from '../../leave/leave.service';
import { ConversationSession, ConversationTarget, ConversationStep, FlowType } from './line-conversation.types';
import {
  CANCEL_COMMAND,
  MENU_COMMAND,
  MENU_HINT,
  MENU_QUICK_REPLY,
  MENU_SELECTION_MAP,
  MYDAY_COMMAND,
} from './line-menu';

const MYDAY_SECTION_LIMIT = 5;

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
    private leaveService: LeaveService,
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

    // A leave approve/reject postback works from any chat state and never starts a flow.
    const leaveDecision = /^leave:(approve|reject):(.+)$/.exec(text);
    if (leaveDecision) {
      await this.replyLeaveDecision(authUser, lineUserId, target, leaveDecision[1] === 'approve' ? 'APPROVED' : 'REJECTED', leaveDecision[2]);
      return;
    }

    // My-day answers from anywhere and leaves an in-progress flow untouched.
    if (text === MYDAY_COMMAND) {
      if (existing) this.store.update(lineUserId, { target });
      await this.replyMyDay(authUser, lineUserId, target);
      return;
    }

    // Menu / cancel / a menu tap always win over the current step: a button the
    // bot itself put on screen must never be mistaken for an answer.
    if (text === CANCEL_COMMAND) {
      if (existing) this.store.clear(lineUserId);
      await this.showMainMenu(lineUserId, target, existing ? 'ยกเลิกรายการแล้วครับ' : undefined);
      return;
    }

    const directFlow = MENU_SELECTION_MAP[text];
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
        await this.startFlow(directFlow, started, text);
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
      // Nothing matched a command — say so instead of silently re-sending a picture.
      await this.showMainMenu(
        lineUserId,
        target,
        `ยังไม่เข้าใจคำว่า "${text.slice(0, 40)}" ครับ`,
      );
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
    if (existing.flowType === FlowType.LEAVE) return this.leaveFlow.handle(updated, text);
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

  private async replyLeaveDecision(
    authUser: AuthUser,
    lineUserId: string,
    target: ConversationTarget,
    decision: 'APPROVED' | 'REJECTED',
    leaveId: string,
  ): Promise<void> {
    let text: string;
    try {
      await this.leaveService.decide(authUser, leaveId, decision);
      text = decision === 'APPROVED' ? 'อนุมัติการลาแล้วครับ' : 'ไม่อนุมัติการลาแล้วครับ';
    } catch (error) {
      text = error instanceof Error ? error.message : 'ดำเนินการไม่สำเร็จ กรุณาลองใหม่';
    }
    if (target.replyToken) {
      await this.line.replyWithQuickReply(target.replyToken, text);
    } else {
      await this.line.pushTo(lineUserId, text);
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

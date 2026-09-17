import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AgendaItem, AuthUser } from '@lawfirm/shared';
import { AgendaService } from '../../agenda/agenda.service';
import { LineMessagingService } from '../line-messaging.service';
import { LineAuthContextService } from './line-auth-context.service';
import { LineConversationStoreService } from './line-conversation-store.service';
import { LineIntakeFlowService } from './flows/line-intake-flow.service';
import { LineTaskFlowService } from './flows/line-task-flow.service';
import { LineTodoFlowService } from './flows/line-todo-flow.service';
import { LineExpenseFlowService } from './flows/line-expense-flow.service';
import { LineAdvanceFlowService } from './flows/line-advance-flow.service';
import { ConversationSession, ConversationTarget, ConversationStep, FlowType } from './line-conversation.types';

const MYDAY_COMMAND = 'งานของฉันวันนี้';
const MYDAY_SECTION_LIMIT = 5;

const MENU_SELECTION_MAP: Record<string, FlowType> = {
  'สร้าง Case': FlowType.CASE,
  'เพิ่ม Task': FlowType.TASK,
  'สร้าง Todo': FlowType.TODO,
  'บันทึกค่าใช้จ่าย': FlowType.EXPENSE,
  'เบิกล่วงหน้า': FlowType.ADVANCE,
};

@Injectable()
export class LineBotRouterService {
  private readonly logger = new Logger(LineBotRouterService.name);

  constructor(
    private line: LineMessagingService,
    private auth: LineAuthContextService,
    private store: LineConversationStoreService,
    private intakeFlow: LineIntakeFlowService,
    private taskFlow: LineTaskFlowService,
    private todoFlow: LineTodoFlowService,
    private expenseFlow: LineExpenseFlowService,
    private advanceFlow: LineAdvanceFlowService,
    private agenda: AgendaService,
    private config: ConfigService,
  ) {}

  async route(
    lineUserId: string,
    text: string,
    target: ConversationTarget,
    mentionsBot: boolean,
  ): Promise<void> {
    const existing = this.store.get(lineUserId);
    const isGroupOrRoom = target.sourceType === 'group' || target.sourceType === 'room';

    if (!existing) {
      // In a group/room, only react to a fresh mention — never to ambient chatter.
      if (isGroupOrRoom && !mentionsBot) return;

      const authUser = await this.auth.resolve(lineUserId);
      if (!authUser) {
        await this.replyUnlinked(lineUserId, target);
        return;
      }

      if (text === MYDAY_COMMAND) {
        await this.replyMyDay(authUser, lineUserId, target);
        return;
      }

      // A rich-menu tap (or typed command) with no session starts its flow
      // directly instead of bouncing through the menu.
      const directFlow = MENU_SELECTION_MAP[text];
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
        await this.startFlow(directFlow, started);
        return;
      }
      await this.showMainMenu(lineUserId, target);
      return;
    }

    // A session exists. Re-check auth defensively (e.g. account was unlinked mid-conversation).
    const authUser = await this.auth.resolve(lineUserId);
    if (!authUser) {
      this.store.clear(lineUserId);
      await this.replyUnlinked(lineUserId, target);
      return;
    }

    if (existing.flowType === null) {
      if (text === MYDAY_COMMAND) {
        this.store.update(lineUserId, { target });
        await this.replyMyDay(authUser, lineUserId, target);
        return;
      }
      // Awaiting the user's menu choice.
      const flowType = MENU_SELECTION_MAP[text];
      if (!flowType) {
        this.store.update(lineUserId, { target });
        await this.showMainMenu(lineUserId, target);
        return;
      }
      const updated = this.store.update(lineUserId, { flowType, target });
      if (!updated) {
        this.logger.warn(`Session for ${lineUserId} expired before flow could start`);
        return;
      }
      return this.startFlow(flowType, updated);
    }

    // An action flow is active — refresh the target (replyToken changes every turn) and delegate.
    const updated = this.store.update(lineUserId, { target });
    if (!updated) {
      this.logger.warn(`Session for ${lineUserId} expired before message could be routed`);
      return;
    }
    if (existing.flowType === FlowType.CASE) return this.intakeFlow.handle(updated, text);
    if (existing.flowType === FlowType.TASK) return this.taskFlow.handle(updated, text);
    if (existing.flowType === FlowType.TODO) return this.todoFlow.handle(updated, text);
    if (existing.flowType === FlowType.EXPENSE) return this.expenseFlow.handle(updated, text);
    if (existing.flowType === FlowType.ADVANCE) return this.advanceFlow.handle(updated, text);
  }

  private async replyMyDay(
    authUser: AuthUser,
    lineUserId: string,
    target: ConversationTarget,
  ): Promise<void> {
    const day = await this.agenda.getMyDay(authUser);
    const webUrl = this.config.get<string>('WEB_APP_URL') ?? 'http://localhost:3000';

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
      await this.line.replyWithQuickReply(target.replyToken, text);
    } else {
      await this.line.pushTo(lineUserId, text);
    }
  }

  private startFlow(flowType: FlowType, session: ConversationSession): Promise<void> {
    switch (flowType) {
      case FlowType.CASE:
        return this.intakeFlow.start(session);
      case FlowType.TASK:
        return this.taskFlow.start(session);
      case FlowType.TODO:
        return this.todoFlow.start(session);
      case FlowType.EXPENSE:
        return this.expenseFlow.start(session);
      case FlowType.ADVANCE:
        return this.advanceFlow.start(session);
    }
  }

  /**
   * A photo message. Only meaningful inside a flow step that expects one
   * (the expense receipt step, wired in the expense flow task) — everything
   * else ignores it silently so ambient photos in groups never trigger the bot.
   */
  async routeImage(
    lineUserId: string,
    messageId: string,
    target: ConversationTarget,
  ): Promise<void> {
    const session = this.store.get(lineUserId);
    if (
      session?.flowType !== FlowType.EXPENSE ||
      session.step !== ConversationStep.EXPENSE_RECEIPT
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

  private async showMainMenu(lineUserId: string, target: ConversationTarget): Promise<void> {
    if (target.replyToken) {
      await this.line.replyHomeMenu(target.replyToken);
    } else {
      await this.line.pushHomeMenu(lineUserId);
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

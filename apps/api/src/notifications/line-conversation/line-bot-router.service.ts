import { Injectable, Logger } from '@nestjs/common';
import { LineMessagingService, QuickReplyItem } from '../line-messaging.service';
import { LineAuthContextService } from './line-auth-context.service';
import { LineConversationStoreService } from './line-conversation-store.service';
import { LineIntakeFlowService } from './flows/line-intake-flow.service';
import { LineTaskFlowService } from './flows/line-task-flow.service';
import { LineTodoFlowService } from './flows/line-todo-flow.service';
import { ConversationTarget, ConversationStep, FlowType } from './line-conversation.types';

const MAIN_MENU_QUICK_REPLY: QuickReplyItem[] = [
  { label: '📋 สร้าง Case', text: 'สร้าง Case' },
  { label: '✅ เพิ่ม Task ในคดี', text: 'เพิ่ม Task' },
  { label: '📝 สร้าง Todo', text: 'สร้าง Todo' },
];

const MENU_SELECTION_MAP: Record<string, FlowType> = {
  'สร้าง Case': FlowType.CASE,
  'เพิ่ม Task': FlowType.TASK,
  'สร้าง Todo': FlowType.TODO,
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

      this.store.start({
        lineUserId,
        userId: authUser.id,
        firmId: authUser.firmId,
        flowType: null,
        step: ConversationStep.SELECT_ACTION,
        data: {},
        target,
      });
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
      if (flowType === FlowType.CASE) return this.intakeFlow.start(updated);
      if (flowType === FlowType.TASK) return this.taskFlow.start(updated);
      if (flowType === FlowType.TODO) return this.todoFlow.start(updated);
      return;
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
  }

  private async showMainMenu(lineUserId: string, target: ConversationTarget): Promise<void> {
    const text = 'สวัสดีครับ ผมลอว์ 🤖 จะให้ช่วยอะไรดีครับ?';
    if (target.replyToken) {
      await this.line.replyWithQuickReply(target.replyToken, text, MAIN_MENU_QUICK_REPLY);
    } else {
      await this.line.pushTo(lineUserId, text, MAIN_MENU_QUICK_REPLY);
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

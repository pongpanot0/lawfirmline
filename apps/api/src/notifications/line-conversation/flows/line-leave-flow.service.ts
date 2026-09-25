import { BadRequestException, Injectable } from '@nestjs/common';
import { LeaveType } from '../../../generated/prisma';
import { LeaveService } from '../../../leave/leave.service';
import { LineMessagingService, QuickReplyItem } from '../../line-messaging.service';
import { LineConversationStoreService } from '../line-conversation-store.service';
import { LineAuthContextService } from '../line-auth-context.service';
import { ConversationSession, ConversationStep } from '../line-conversation.types';
import { DATE_HELP, dateQuickReply, formatIsoDate, parseFlexibleDate, todayInBangkok } from './date-parse.util';
import { withEscape } from './flow-confirmation.util';

const TYPES: Record<string, LeaveType> = {
  'ลาป่วย': LeaveType.SICK,
  'ลากิจ': LeaveType.PERSONAL,
  'พักร้อน': LeaveType.VACATION,
};
const TYPE_LABEL: Record<LeaveType, string> = {
  SICK: 'ลาป่วย', PERSONAL: 'ลากิจ', VACATION: 'พักร้อน',
};

@Injectable()
export class LineLeaveFlowService {
  constructor(
    private leaves: LeaveService,
    private line: LineMessagingService,
    private store: LineConversationStoreService,
    private auth: LineAuthContextService,
  ) {}

  async start(session: ConversationSession, command?: string) {
    if (session.target.sourceType !== 'user') {
      this.store.clear(session.lineUserId);
      await this.reply(session, 'กรุณาพิมพ์ "ลางาน" ในแชตส่วนตัวกับบอทครับ');
      return;
    }
    if (command === 'การลาของฉัน') {
      const leaves = await this.leaves.myLeaves({ id: session.userId, firmId: session.firmId });
      if (!leaves.length) {
        this.store.clear(session.lineUserId);
        await this.reply(session, 'ยังไม่มีรายการลาที่จะถึงครับ');
        return;
      }
      const lines = leaves.map((leave, index) =>
        `${index + 1}. ${TYPE_LABEL[leave.type]} · ${formatIsoDate(leave.startDate.toISOString().slice(0, 10))} ถึง ${formatIsoDate(leave.endDate.toISOString().slice(0, 10))}`);
      this.store.update(session.lineUserId, { step: ConversationStep.LEAVE_CANCEL_PICK, data: { leaveIds: leaves.map((leave) => leave.id) } });
      await this.reply(session, `รายการลาของคุณ\n${lines.join('\n')}\n\nเลือกหมายเลขเพื่อยกเลิก หรือพิมพ์ "เมนู"`,
        leaves.map((_, index) => ({ label: `ยกเลิกรายการ ${index + 1}`, text: String(index + 1) })));
      return;
    }
    const type = command ? TYPES[command] : undefined;
    if (type) {
      this.store.update(session.lineUserId, { step: ConversationStep.LEAVE_START, data: { type } });
      await this.reply(session, `${command} เริ่มวันไหนครับ?\n${DATE_HELP}`, dateQuickReply({ skip: false }));
    } else {
      this.store.update(session.lineUserId, { step: ConversationStep.LEAVE_TYPE, data: {} });
      await this.reply(session, 'ต้องการลาประเภทไหนครับ?', Object.keys(TYPES).map((label) => ({ label, text: label })));
    }
  }

  async handle(session: ConversationSession, text: string) {
    if (session.step === ConversationStep.LEAVE_CANCEL_PICK) {
      const leaveIds = session.data.leaveIds as string[] | undefined;
      const index = Number(text) - 1;
      if (!Number.isInteger(index) || !leaveIds?.[index]) return this.reply(session, 'กรุณาเลือกหมายเลขรายการลาที่ต้องการยกเลิกครับ');
      this.store.update(session.lineUserId, { step: ConversationStep.LEAVE_CANCEL_CONFIRM, data: { leaveId: leaveIds[index] } });
      return this.reply(session, 'ยืนยันยกเลิกรายการลานี้? สมาชิกคนอื่นจะได้รับข้อความแก้ไข', [{ label: 'ยืนยันยกเลิกลา', text: 'ยืนยันยกเลิกลา' }]);
    }
    if (session.step === ConversationStep.LEAVE_CANCEL_CONFIRM) {
      if (text !== 'ยืนยันยกเลิกลา') return this.reply(session, 'กด "ยืนยันยกเลิกลา" หรือ "ยกเลิก" เพื่อออกครับ');
      const user = await this.auth.resolve(session.lineUserId);
      if (!user || user.id !== session.userId || user.firmId !== session.firmId) {
        this.store.clear(session.lineUserId);
        return this.reply(session, 'บัญชี LINE ไม่ตรงกับสำนักงาน กรุณาเชื่อมบัญชีใหม่ครับ');
      }
      await this.leaves.cancel(user, String(session.data.leaveId));
      this.store.clear(session.lineUserId);
      return this.reply(session, 'ยกเลิกการลาแล้วครับ ✅');
    }
    if (session.step === ConversationStep.LEAVE_TYPE) {
      const type = TYPES[text];
      if (!type) return this.reply(session, 'เลือก ลาป่วย ลากิจ หรือ พักร้อน ครับ', Object.keys(TYPES).map((label) => ({ label, text: label })));
      this.store.update(session.lineUserId, { step: ConversationStep.LEAVE_START, data: { type } });
      return this.reply(session, `เริ่มลาวันไหนครับ?\n${DATE_HELP}`, dateQuickReply({ skip: false }));
    }
    if (session.step === ConversationStep.LEAVE_START || session.step === ConversationStep.LEAVE_END) {
      const date = text === 'วันเดียว' && session.step === ConversationStep.LEAVE_END
        ? String(session.data.startDate)
        : parseFlexibleDate(text);
      if (!date || date < todayInBangkok()) return this.reply(session, `กรุณาใส่วันที่ตั้งแต่วันนี้ครับ\n${DATE_HELP}`, dateQuickReply({ skip: false }));
      if (session.step === ConversationStep.LEAVE_START) {
        this.store.update(session.lineUserId, { step: ConversationStep.LEAVE_END, data: { ...session.data, startDate: date } });
        return this.reply(session, 'ลาถึงวันไหนครับ? ถ้าวันเดียว กด "วันเดียว"', [{ label: 'วันเดียว', text: 'วันเดียว' }]);
      }
      if (date < String(session.data.startDate)) return this.reply(session, 'วันสิ้นสุดต้องไม่ก่อนวันเริ่มครับ');
      const data = { ...session.data, endDate: date };
      this.store.update(session.lineUserId, { step: ConversationStep.LEAVE_CONFIRM, data });
      return this.reply(session, this.summary(data), [{ label: 'ยืนยัน', text: 'ยืนยัน' }, { label: 'เริ่มใหม่', text: 'เริ่มใหม่' }]);
    }
    if (session.step === ConversationStep.LEAVE_CONFIRM) {
      if (text === 'เริ่มใหม่') return this.start(session);
      if (text !== 'ยืนยัน') return this.reply(session, this.summary(session.data), [{ label: 'ยืนยัน', text: 'ยืนยัน' }, { label: 'เริ่มใหม่', text: 'เริ่มใหม่' }]);
      const user = await this.auth.resolve(session.lineUserId);
      if (!user || user.id !== session.userId || user.firmId !== session.firmId) {
        this.store.clear(session.lineUserId);
        return this.reply(session, 'บัญชี LINE ไม่ตรงกับสำนักงาน กรุณาเชื่อมบัญชีใหม่ครับ');
      }
      try {
        const data = session.data as { type: LeaveType; startDate: string; endDate: string };
        await this.leaves.create(user, data);
      } catch (error) {
        if (error instanceof BadRequestException) return this.reply(session, String(error.message));
        throw error;
      }
      this.store.clear(session.lineUserId);
      return this.reply(session, 'บันทึกการลาในปฏิทินแล้วครับ ✅');
    }
    this.store.clear(session.lineUserId);
    return this.reply(session, 'รายการหมดเวลาแล้วครับ พิมพ์ "ลางาน" เพื่อเริ่มใหม่');
  }

  private summary(data: Record<string, unknown>) {
    return `ตรวจสอบก่อนบันทึกครับ\n${TYPE_LABEL[data.type as LeaveType]}\n${formatIsoDate(data.startDate)} ถึง ${formatIsoDate(data.endDate)}\nกด "ยืนยัน" เพื่อบันทึก`;
  }

  private async reply(session: ConversationSession, message: string, quickReply?: QuickReplyItem[]) {
    const items = withEscape(quickReply);
    if (session.target.replyToken) await this.line.replyWithQuickReply(session.target.replyToken, message, items);
    else await this.line.pushTo(session.lineUserId, message, items);
  }
}

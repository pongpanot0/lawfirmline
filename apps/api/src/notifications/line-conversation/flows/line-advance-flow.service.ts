import { Injectable } from '@nestjs/common';
import { FirmRole } from '@lawfirm/shared';
import { CashAdvanceService } from '../../../billing/cash-advance.service';
import { UsersService } from '../../../users/users.service';
import { LineMessagingService, QuickReplyItem } from '../../line-messaging.service';
import { LineNotificationService } from '../line-notification.service';
import { LineConversationStoreService } from '../line-conversation-store.service';
import { LineAuthContextService } from '../line-auth-context.service';
import { ConversationSession, ConversationStep } from '../line-conversation.types';
import {
  renderSummary,
  buildFieldPickerQuickReply,
  pickQuickReply,
  resolvePick,
  withEscape,
  CONFIRM_QUICK_REPLY,
  SKIP_QUICK_REPLY,
  FieldSpec,
} from './flow-confirmation.util';

const FIELDS: FieldSpec[] = [
  { key: 'userLabel', label: 'ผู้รับ' },
  { key: 'amount', label: 'จำนวนเงิน', format: (v) => `฿${Number(v).toLocaleString('th-TH')}` },
  { key: 'note', label: 'หมายเหตุ' },
];

@Injectable()
export class LineAdvanceFlowService {
  constructor(
    private cashAdvance: CashAdvanceService,
    private users: UsersService,
    private line: LineMessagingService,
    private store: LineConversationStoreService,
    private authContext: LineAuthContextService,
    private notify: LineNotificationService,
  ) {}

  async start(session: ConversationSession): Promise<void> {
    const authUser = await this.authContext.resolve(session.lineUserId);
    if (!authUser || authUser.firmRole !== FirmRole.OWNER) {
      this.store.clear(session.lineUserId);
      await this.reply(session, 'ขออภัยครับ เบิกล่วงหน้าทำได้เฉพาะเจ้าของสำนักงาน');
      return;
    }
    this.store.update(session.lineUserId, {
      step: ConversationStep.ADVANCE_RECIPIENT_PICK,
      data: {},
      pagingOffset: 0,
    });
    await this.showRecipientPage(session, 0);
  }

  async handle(session: ConversationSession, text: string): Promise<void> {
    if (text === 'ยกเลิก') {
      this.store.clear(session.lineUserId);
      await this.reply(session, 'ยกเลิกแล้วครับ');
      return;
    }

    switch (session.step) {
      case ConversationStep.ADVANCE_RECIPIENT_PICK: {
        if (text === 'ดูเพิ่มเติม') {
          const nextOffset = (session.pagingOffset ?? 0) + 12;
          this.store.update(session.lineUserId, { pagingOffset: nextOffset });
          await this.showRecipientPage(session, nextOffset);
          return;
        }
        const picked = resolvePick(session.searchResults, text);
        if (!picked) {
          await this.reply(session, 'กรุณาเลือกจากปุ่มที่บอทให้มาครับ');
          return;
        }
        const withRecipient = { ...session.data, userId: picked.id, userLabel: picked.label };
        if (session.editingField === 'userLabel') {
          this.store.update(session.lineUserId, {
            data: withRecipient,
            step: ConversationStep.ADVANCE_CONFIRM,
            editingField: undefined,
          });
          await this.reply(session, renderSummary(FIELDS, withRecipient), CONFIRM_QUICK_REPLY);
          return;
        }
        this.store.update(session.lineUserId, {
          data: withRecipient,
          step: ConversationStep.ADVANCE_AMOUNT,
        });
        await this.reply(session, 'จำนวนเงินเท่าไหร่ครับ?');
        return;
      }
      case ConversationStep.ADVANCE_AMOUNT: {
        const amount = Number(text.replace(/,/g, ''));
        if (!Number.isFinite(amount) || amount <= 0) {
          await this.reply(session, 'ขอเป็นตัวเลขมากกว่า 0 ครับ');
          return;
        }
        this.store.update(session.lineUserId, {
          data: { ...session.data, amount },
          step: ConversationStep.ADVANCE_NOTE,
        });
        await this.reply(session, 'หมายเหตุครับ (หรือกด "ข้าม")', SKIP_QUICK_REPLY);
        return;
      }
      case ConversationStep.ADVANCE_NOTE: {
        const note = text === 'ข้าม' ? undefined : text;
        const data = { ...session.data, note };
        this.store.update(session.lineUserId, { data, step: ConversationStep.ADVANCE_CONFIRM });
        await this.reply(session, renderSummary(FIELDS, data), CONFIRM_QUICK_REPLY);
        return;
      }
      case ConversationStep.ADVANCE_CONFIRM: {
        if (text === 'ยืนยัน') {
          await this.issue(session);
          return;
        }
        this.store.update(session.lineUserId, { step: ConversationStep.ADVANCE_EDIT_PICK_FIELD });
        await this.reply(session, 'จะแก้ไขข้อมูลไหนครับ?', buildFieldPickerQuickReply(FIELDS));
        return;
      }
      case ConversationStep.ADVANCE_EDIT_PICK_FIELD: {
        const field = text.startsWith('แก้:') ? text.slice(4) : null;
        if (!field || !FIELDS.some((f) => f.key === field)) {
          await this.reply(session, 'กรุณาเลือกจากปุ่มที่บอทให้มาครับ', buildFieldPickerQuickReply(FIELDS));
          return;
        }
        if (field === 'userLabel') {
          this.store.update(session.lineUserId, {
            step: ConversationStep.ADVANCE_RECIPIENT_PICK,
            pagingOffset: 0,
            editingField: 'userLabel',
          });
          await this.showRecipientPage(session, 0);
          return;
        }
        this.store.update(session.lineUserId, {
          editingField: field,
          step: ConversationStep.ADVANCE_EDIT_VALUE,
        });
        await this.reply(
          session,
          `กรอกค่าใหม่สำหรับ "${FIELDS.find((f) => f.key === field)!.label}" ครับ`,
          field === 'note' ? SKIP_QUICK_REPLY : undefined,
        );
        return;
      }
      case ConversationStep.ADVANCE_EDIT_VALUE: {
        const field = session.editingField!;
        let value: string | number | undefined = text;
        if (field === 'amount') {
          const amount = Number(text.replace(/,/g, ''));
          if (!Number.isFinite(amount) || amount <= 0) {
            await this.reply(session, 'ขอเป็นตัวเลขมากกว่า 0 ครับ');
            return;
          }
          value = amount;
        }
        if (field === 'note' && text === 'ข้าม') value = undefined;
        const data = { ...session.data, [field]: value };
        this.store.update(session.lineUserId, {
          data,
          step: ConversationStep.ADVANCE_CONFIRM,
          editingField: undefined,
        });
        await this.reply(session, renderSummary(FIELDS, data), CONFIRM_QUICK_REPLY);
        return;
      }
      default: {
        this.store.clear(session.lineUserId);
        await this.reply(session, 'เกิดข้อผิดพลาด เริ่มใหม่ด้วยการพิมพ์ "เบิกล่วงหน้า" ครับ');
      }
    }
  }

  private async issue(session: ConversationSession): Promise<void> {
    const data = session.data as { userId: string; userLabel: string; amount: number; note?: string };
    // issue() enforces the owner role itself, so resolve the full AuthUser.
    const owner = await this.authContext.resolve(session.lineUserId);
    if (!owner) {
      await this.reply(session, 'เกิดข้อผิดพลาดในการยืนยันตัวตน กรุณาลองใหม่อีกครั้งครับ');
      return;
    }
    await this.cashAdvance.issue(owner, {
      userId: data.userId,
      amount: data.amount,
      note: data.note,
    });
    this.store.clear(session.lineUserId);
    await this.reply(
      session,
      `บันทึกเงินสำรองจ่ายสำเร็จแล้วครับ ✅ ฿${data.amount.toLocaleString('th-TH')} ให้ ${data.userLabel}`,
    );
    await this.notify.notifyCreated({
      firmId: session.firmId,
      target: session.target,
      summaryText: `💰 เงินสำรองจ่าย ฿${data.amount.toLocaleString('th-TH')} → ${data.userLabel}${
        data.note ? `\nหมายเหตุ: ${data.note}` : ''
      }`,
      assigneeUserId: data.userId,
      dmHeadline: '💰 คุณได้รับเงินสำรองจ่าย',
      entityPath: '/expenses',
    });
  }

  private async showRecipientPage(session: ConversationSession, offset: number): Promise<void> {
    const { items, hasMore } = await this.users.findAllByFirm(session.firmId, offset, 12);
    const withoutSelf = items.filter((u) => u.id !== session.userId);
    this.store.update(session.lineUserId, { searchResults: withoutSelf });
    const extra = hasMore ? [{ label: 'ดูเพิ่มเติม', text: 'ดูเพิ่มเติม' }] : [];
    await this.reply(
      session,
      'จ่ายเงินสำรองล่วงหน้าให้ใครครับ?',
      pickQuickReply(withoutSelf, extra),
    );
  }

  private async reply(
    session: ConversationSession,
    text: string,
    quickReply?: QuickReplyItem[],
  ): Promise<void> {
    const items = withEscape(quickReply);
    if (session.target.replyToken) {
      await this.line.replyWithQuickReply(session.target.replyToken, text, items);
    } else {
      await this.line.pushTo(session.lineUserId, text, items);
    }
  }
}

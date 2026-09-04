import { Injectable } from '@nestjs/common';
import { AuthUser } from '@lawfirm/shared';
import { IntakeService } from '../../../intake/intake.service';
import { ReferralChannel } from '../../../intake/dto/intake.dto';
import { ClientsService } from '../../../clients/clients.service';
import { LineMessagingService } from '../../line-messaging.service';
import { LineNotificationService } from '../line-notification.service';
import { LineConversationStoreService } from '../line-conversation-store.service';
import { ConversationSession, ConversationStep } from '../line-conversation.types';
import { renderSummary, buildFieldPickerQuickReply, CONFIRM_QUICK_REPLY, FieldSpec } from './flow-confirmation.util';
import { QuickReplyItem } from '../../line-messaging.service';

const FIELDS: FieldSpec[] = [
  { key: 'title', label: 'ชื่อเรื่อง' },
  { key: 'clientName', label: 'ลูกความ' },
  { key: 'description', label: 'รายละเอียด' },
];

@Injectable()
export class LineIntakeFlowService {
  constructor(
    private intake: IntakeService,
    private clients: ClientsService,
    private line: LineMessagingService,
    private notify: LineNotificationService,
    private store: LineConversationStoreService,
  ) {}

  async start(session: ConversationSession): Promise<void> {
    this.store.update(session.lineUserId, { step: ConversationStep.CASE_TITLE, data: {} });
    await this.reply(session, 'สร้าง Case ใหม่ครับ 📋\n\nชื่อเรื่อง/หัวข้อคดีคืออะไรครับ?');
  }

  async handle(session: ConversationSession, text: string): Promise<void> {
    if (text === 'ยกเลิก') {
      this.store.clear(session.lineUserId);
      await this.reply(session, 'ยกเลิกการสร้าง Case แล้วครับ');
      return;
    }

    switch (session.step) {
      case ConversationStep.CASE_TITLE: {
        this.store.update(session.lineUserId, {
          data: { ...session.data, title: text },
          step: ConversationStep.CASE_CLIENT_SEARCH,
        });
        await this.reply(session, 'ลูกความชื่ออะไรครับ? (พิมพ์ชื่อเพื่อค้นหา)');
        return;
      }
      case ConversationStep.CASE_CLIENT_SEARCH: {
        const results = await this.clients.findAll(
          { firmId: session.firmId } as unknown as AuthUser,
          text,
        );
        if (results.length === 0) {
          this.store.update(session.lineUserId, {
            data: { ...session.data, clientName: text },
            step: ConversationStep.CASE_DESCRIPTION,
          });
          await this.reply(session, `ไม่พบลูกความที่ตรงกับ "${text}" — จะใช้ชื่อนี้ไปก่อนนะครับ\n\nมีรายละเอียดเพิ่มเติมไหมครับ? (หรือพิมพ์ "ข้าม")`);
          return;
        }
        this.store.update(session.lineUserId, {
          step: ConversationStep.CASE_CLIENT_PICK,
          searchResults: results.slice(0, 12).map((c) => ({ id: c.id, label: c.name })),
        });
        await this.reply(
          session,
          'เลือกลูกความ หรือพิมพ์ "ไม่เจอ" เพื่อใช้ชื่อที่พิมพ์ไปแทน',
          [
            ...results.slice(0, 12).map((c) => ({ label: c.name.slice(0, 20), text: c.name })),
            { label: 'ไม่เจอ', text: 'ไม่เจอ' },
          ],
        );
        return;
      }
      case ConversationStep.CASE_CLIENT_PICK: {
        if (text === 'ไม่เจอ') {
          this.store.update(session.lineUserId, { step: ConversationStep.CASE_CLIENT_SEARCH });
          await this.reply(session, 'พิมพ์ชื่อลูกความอีกครั้งครับ');
          return;
        }
        const picked = session.searchResults?.find((r) => r.label === text);
        this.store.update(session.lineUserId, {
          data: { ...session.data, clientId: picked?.id, clientName: text },
          step: ConversationStep.CASE_DESCRIPTION,
        });
        await this.reply(session, 'มีรายละเอียดเพิ่มเติมไหมครับ? (หรือพิมพ์ "ข้าม")');
        return;
      }
      case ConversationStep.CASE_DESCRIPTION: {
        const description = text === 'ข้าม' ? undefined : text;
        const data = { ...session.data, description };
        this.store.update(session.lineUserId, { data, step: ConversationStep.CASE_CONFIRM });
        await this.confirmStep(session, data);
        return;
      }
      case ConversationStep.CASE_CONFIRM: {
        if (text === 'ยืนยัน') {
          await this.create(session);
          return;
        }
        if (text === 'แก้ไข') {
          this.store.update(session.lineUserId, { step: ConversationStep.CASE_EDIT_PICK_FIELD });
          await this.reply(
            session,
            'จะแก้ไขข้อมูลไหนครับ?',
            buildFieldPickerQuickReply(FIELDS),
          );
          return;
        }
        await this.confirmStep(session, session.data);
        return;
      }
      case ConversationStep.CASE_EDIT_PICK_FIELD: {
        const field = text.startsWith('แก้:') ? text.slice(4) : null;
        if (!field || !FIELDS.some((f) => f.key === field)) {
          await this.reply(session, 'กรุณาเลือกจากปุ่มที่บอทให้มาครับ');
          return;
        }
        if (field === 'clientName') {
          this.store.update(session.lineUserId, { step: ConversationStep.CASE_CLIENT_SEARCH });
          await this.reply(session, 'พิมพ์ชื่อลูกความอีกครั้งครับ');
          return;
        }
        this.store.update(session.lineUserId, { editingField: field, step: ConversationStep.CASE_EDIT_VALUE });
        const label = FIELDS.find((f) => f.key === field)!.label;
        await this.reply(session, `กรอกค่าใหม่สำหรับ "${label}" ครับ`);
        return;
      }
      case ConversationStep.CASE_EDIT_VALUE: {
        const field = session.editingField!;
        const data = { ...session.data, [field]: text };
        this.store.update(session.lineUserId, { data, step: ConversationStep.CASE_CONFIRM, editingField: undefined });
        await this.confirmStep(session, data);
        return;
      }
    }
  }

  private async confirmStep(session: ConversationSession, data: Record<string, unknown>): Promise<void> {
    await this.reply(session, renderSummary(FIELDS, data), CONFIRM_QUICK_REPLY);
  }

  private async create(session: ConversationSession): Promise<void> {
    const data = session.data as { title: string; clientId?: string; clientName?: string; description?: string };
    const created = await this.intake.create(
      { id: session.userId, firmId: session.firmId } as unknown as AuthUser,
      {
        receivedDate: new Date().toISOString(),
        title: data.title,
        clientId: data.clientId,
        clientName: data.clientName,
        description: data.description,
        referralChannel: ReferralChannel.LINE,
      },
    );
    this.store.clear(session.lineUserId);
    await this.reply(session, `สร้าง Case สำเร็จแล้วครับ ✅\n\n"${data.title}"`);
    await this.notify.notifyCreated({
      target: session.target,
      summaryText: `📋 สร้าง Intake ใหม่: ${data.title}${data.clientName ? `\nลูกความ: ${data.clientName}` : ''}`,
      entityPath: `/intake/${created.id}`,
    });
  }

  private async reply(session: ConversationSession, text: string, quickReply?: QuickReplyItem[]): Promise<void> {
    if (session.target.replyToken) {
      await this.line.replyWithQuickReply(session.target.replyToken, text, quickReply);
    } else {
      await this.line.pushTo(session.lineUserId, text, quickReply);
    }
  }
}

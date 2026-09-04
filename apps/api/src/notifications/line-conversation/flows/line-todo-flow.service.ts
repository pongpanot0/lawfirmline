import { Injectable } from '@nestjs/common';
import { TaskSource } from '../../../generated/prisma';
import type { AuthUser } from '@lawfirm/shared';
import { TasksService } from '../../../tasks/tasks.service';
import { UsersService } from '../../../users/users.service';
import { LineMessagingService } from '../../line-messaging.service';
import { LineNotificationService } from '../line-notification.service';
import { LineConversationStoreService } from '../line-conversation-store.service';
import { ConversationSession, ConversationStep } from '../line-conversation.types';
import { renderSummary, buildFieldPickerQuickReply, CONFIRM_QUICK_REPLY, FieldSpec } from './flow-confirmation.util';

const FIELDS: FieldSpec[] = [
  { key: 'title', label: 'ชื่องาน' },
  { key: 'assigneeLabel', label: 'ผู้รับผิดชอบ' },
  { key: 'dueDate', label: 'กำหนดส่ง' },
];

@Injectable()
export class LineTodoFlowService {
  constructor(
    private tasks: TasksService,
    private users: UsersService,
    private line: LineMessagingService,
    private notify: LineNotificationService,
    private store: LineConversationStoreService,
  ) {}

  async start(session: ConversationSession): Promise<void> {
    this.store.update(session.lineUserId, { step: ConversationStep.TODO_TITLE, data: {} });
    await this.reply(session, 'สร้าง Todo ใหม่ — ชื่องานคืออะไรครับ?');
  }

  async handle(session: ConversationSession, text: string): Promise<void> {
    if (text === 'ยกเลิก') {
      this.store.clear(session.lineUserId);
      await this.reply(session, 'ยกเลิกแล้วครับ');
      return;
    }

    switch (session.step) {
      case ConversationStep.TODO_TITLE: {
        this.store.update(session.lineUserId, {
          data: { ...session.data, title: text },
          step: ConversationStep.TODO_ASSIGNEE_PICK,
          pagingOffset: 0,
        });
        await this.showAssigneePage(session, 0);
        return;
      }
      case ConversationStep.TODO_ASSIGNEE_PICK: {
        if (text === 'ดูเพิ่มเติม') {
          const nextOffset = (session.pagingOffset ?? 0) + 12;
          this.store.update(session.lineUserId, { pagingOffset: nextOffset });
          await this.showAssigneePage(session, nextOffset);
          return;
        }
        const picked = session.searchResults?.find((r) => r.label === text);
        if (!picked) {
          await this.reply(session, 'กรุณาเลือกจากปุ่มที่บอทให้มาครับ');
          return;
        }
        this.store.update(session.lineUserId, {
          data: { ...session.data, assigneeId: picked.id, assigneeLabel: picked.label },
          step: ConversationStep.TODO_DUE_DATE,
        });
        await this.reply(session, 'กำหนดส่งวันไหนครับ? (YYYY-MM-DD หรือพิมพ์ "ข้าม")');
        return;
      }
      case ConversationStep.TODO_DUE_DATE: {
        const dueDate = text === 'ข้าม' ? undefined : text;
        const data = { ...session.data, dueDate };
        this.store.update(session.lineUserId, { data, step: ConversationStep.TODO_CONFIRM });
        await this.confirmStep(session, data);
        return;
      }
      case ConversationStep.TODO_CONFIRM: {
        if (text === 'ยืนยัน') {
          await this.create(session);
          return;
        }
        if (text === 'แก้ไข') {
          this.store.update(session.lineUserId, { step: ConversationStep.TODO_EDIT_PICK_FIELD });
          await this.line.replyWithQuickReply(
            session.target.replyToken!,
            'จะแก้ไขข้อมูลไหนครับ?',
            buildFieldPickerQuickReply(FIELDS),
          );
          return;
        }
        await this.confirmStep(session, session.data);
        return;
      }
      case ConversationStep.TODO_EDIT_PICK_FIELD: {
        const field = text.startsWith('แก้:') ? text.slice(4) : null;
        if (!field || !FIELDS.some((f) => f.key === field)) {
          await this.reply(session, 'กรุณาเลือกจากปุ่มที่บอทให้มาครับ');
          return;
        }
        this.store.update(session.lineUserId, { editingField: field, step: ConversationStep.TODO_EDIT_VALUE });
        await this.reply(session, `กรอกค่าใหม่สำหรับ "${FIELDS.find((f) => f.key === field)!.label}" ครับ`);
        return;
      }
      case ConversationStep.TODO_EDIT_VALUE: {
        const field = session.editingField!;
        const data = { ...session.data, [field]: text };
        this.store.update(session.lineUserId, { data, step: ConversationStep.TODO_CONFIRM, editingField: undefined });
        await this.confirmStep(session, data);
        return;
      }
    }
  }

  private async showAssigneePage(session: ConversationSession, offset: number): Promise<void> {
    const { items, hasMore } = await this.users.findAllByFirm(session.firmId, offset, 12);
    this.store.update(session.lineUserId, { searchResults: items });
    const buttons = items.map((u) => ({ label: u.label.slice(0, 20), text: u.label }));
    if (hasMore) buttons.push({ label: 'ดูเพิ่มเติม', text: 'ดูเพิ่มเติม' });
    await this.line.replyWithQuickReply(session.target.replyToken!, 'มอบหมายให้ใครครับ?', buttons);
  }

  private async confirmStep(session: ConversationSession, data: Record<string, unknown>): Promise<void> {
    await this.line.replyWithQuickReply(session.target.replyToken!, renderSummary(FIELDS, data), CONFIRM_QUICK_REPLY);
  }

  private async create(session: ConversationSession): Promise<void> {
    const data = session.data as { title: string; assigneeId?: string; assigneeLabel?: string; dueDate?: string };
    const minimalUser = { id: session.userId, firmId: session.firmId } as unknown as AuthUser;
    const created = await this.tasks.create(
      minimalUser,
      null,
      { title: data.title, assigneeId: data.assigneeId, dueDate: data.dueDate },
      TaskSource.LINE,
    );
    this.store.clear(session.lineUserId);
    await this.reply(session, `สร้าง Todo สำเร็จแล้วครับ ✅ "${data.title}"`);
    await this.notify.notifyCreated({
      target: session.target,
      summaryText: `📝 Todo ใหม่: ${data.title}${data.assigneeLabel ? `\nผู้รับผิดชอบ: ${data.assigneeLabel}` : ''}`,
      assigneeUserId: data.assigneeId,
      entityPath: `/todos/${created.id}`,
    });
  }

  private async reply(session: ConversationSession, text: string): Promise<void> {
    if (session.target.replyToken) {
      await this.line.replyWithQuickReply(session.target.replyToken, text);
    } else {
      await this.line.pushTo(session.lineUserId, text);
    }
  }
}

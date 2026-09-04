import { Injectable } from '@nestjs/common';
import { AuthUser } from '@lawfirm/shared';
import { TaskSource } from '../../../generated/prisma';
import { TasksService } from '../../../tasks/tasks.service';
import { CasesService } from '../../../cases/cases.service';
import { UsersService } from '../../../users/users.service';
import { LineMessagingService, QuickReplyItem } from '../../line-messaging.service';
import { LineNotificationService } from '../line-notification.service';
import { LineConversationStoreService } from '../line-conversation-store.service';
import { LineAuthContextService } from '../line-auth-context.service';
import { ConversationSession, ConversationStep } from '../line-conversation.types';
import { renderSummary, buildFieldPickerQuickReply, CONFIRM_QUICK_REPLY, FieldSpec } from './flow-confirmation.util';

const FIELDS: FieldSpec[] = [
  { key: 'title', label: 'ชื่องาน' },
  { key: 'assigneeLabel', label: 'ผู้รับผิดชอบ' },
  { key: 'dueDate', label: 'กำหนดส่ง' },
];

@Injectable()
export class LineTaskFlowService {
  constructor(
    private tasks: TasksService,
    private cases: CasesService,
    private users: UsersService,
    private line: LineMessagingService,
    private notify: LineNotificationService,
    private store: LineConversationStoreService,
    private authContext: LineAuthContextService,
  ) {}

  async start(session: ConversationSession): Promise<void> {
    this.store.update(session.lineUserId, { step: ConversationStep.TASK_CASE_SEARCH, data: {} });
    await this.reply(session, 'เพิ่มงานในคดี — พิมพ์ชื่อคดีหรือเลขคดี (ดำ/แดง) เพื่อค้นหาครับ');
  }

  async handle(session: ConversationSession, text: string): Promise<void> {
    if (text === 'ยกเลิก') {
      this.store.clear(session.lineUserId);
      await this.reply(session, 'ยกเลิกแล้วครับ');
      return;
    }

    switch (session.step) {
      case ConversationStep.TASK_CASE_SEARCH: {
        const authUser = await this.authContext.resolve(session.lineUserId);
        if (!authUser) {
          await this.reply(session, 'เกิดข้อผิดพลาดในการยืนยันตัวตน กรุณาลองใหม่อีกครั้งครับ');
          return;
        }
        const results = await this.cases.findAll(authUser, { search: text });
        if (!results.length) {
          await this.reply(session, `ไม่พบคดีที่ตรงกับ "${text}" ลองพิมพ์คำอื่นดูครับ`);
          return;
        }
        const page = results.slice(0, 13);
        this.store.update(session.lineUserId, {
          step: ConversationStep.TASK_CASE_PICK,
          searchResults: page.map((c) => ({ id: c.id, label: c.title })),
        });
        await this.reply(
          session,
          'เลือกคดีครับ',
          page.map((c) => ({ label: c.title.slice(0, 20), text: c.title })),
        );
        return;
      }
      case ConversationStep.TASK_CASE_PICK: {
        const picked = session.searchResults?.find((r) => r.label === text);
        if (!picked) {
          await this.reply(session, 'กรุณาเลือกจากปุ่มที่บอทให้มาครับ');
          return;
        }
        this.store.update(session.lineUserId, {
          data: { ...session.data, caseId: picked.id, caseLabel: picked.label },
          step: ConversationStep.TASK_TITLE,
        });
        await this.reply(session, 'ชื่องานที่จะมอบหมายคืออะไรครับ?');
        return;
      }
      case ConversationStep.TASK_TITLE: {
        this.store.update(session.lineUserId, {
          data: { ...session.data, title: text },
          step: ConversationStep.TASK_ASSIGNEE_PICK,
          pagingOffset: 0,
        });
        await this.showAssigneePage(session, 0);
        return;
      }
      case ConversationStep.TASK_ASSIGNEE_PICK: {
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
          step: ConversationStep.TASK_DUE_DATE,
        });
        await this.reply(session, 'กำหนดส่งงานวันไหนครับ? (รูปแบบ YYYY-MM-DD หรือพิมพ์ "ข้าม")');
        return;
      }
      case ConversationStep.TASK_DUE_DATE: {
        if (text !== 'ข้าม') {
          const isValidDate = !isNaN(new Date(text).getTime());
          if (!isValidDate) {
            await this.reply(session, 'รูปแบบวันที่ไม่ถูกต้อง กรุณาพิมพ์ใหม่ เช่น 2026-09-15 (หรือพิมพ์ "ข้าม")');
            return;
          }
        }
        const dueDate = text === 'ข้าม' ? undefined : text;
        const data = { ...session.data, dueDate };
        this.store.update(session.lineUserId, { data, step: ConversationStep.TASK_CONFIRM });
        await this.confirmStep(session, data);
        return;
      }
      case ConversationStep.TASK_CONFIRM: {
        if (text === 'ยืนยัน') {
          await this.create(session);
          return;
        }
        if (text === 'แก้ไข') {
          this.store.update(session.lineUserId, { step: ConversationStep.TASK_EDIT_PICK_FIELD });
          await this.reply(session, 'จะแก้ไขข้อมูลไหนครับ?', buildFieldPickerQuickReply(FIELDS));
          return;
        }
        await this.confirmStep(session, session.data);
        return;
      }
      case ConversationStep.TASK_EDIT_PICK_FIELD: {
        const field = text.startsWith('แก้:') ? text.slice(4) : null;
        if (!field || !FIELDS.some((f) => f.key === field)) {
          await this.reply(session, 'กรุณาเลือกจากปุ่มที่บอทให้มาครับ');
          return;
        }
        if (field === 'assigneeLabel') {
          this.store.update(session.lineUserId, {
            step: ConversationStep.TASK_ASSIGNEE_PICK,
            pagingOffset: 0,
          });
          await this.showAssigneePage(session, 0);
          return;
        }
        this.store.update(session.lineUserId, { editingField: field, step: ConversationStep.TASK_EDIT_VALUE });
        await this.reply(session, `กรอกค่าใหม่สำหรับ "${FIELDS.find((f) => f.key === field)!.label}" ครับ`);
        return;
      }
      case ConversationStep.TASK_EDIT_VALUE: {
        const field = session.editingField!;
        const data = { ...session.data, [field]: text };
        this.store.update(session.lineUserId, { data, step: ConversationStep.TASK_CONFIRM, editingField: undefined });
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
    await this.reply(session, 'มอบหมายให้ใครครับ?', buttons);
  }

  private async confirmStep(session: ConversationSession, data: Record<string, unknown>): Promise<void> {
    await this.reply(session, renderSummary(FIELDS, data), CONFIRM_QUICK_REPLY);
  }

  private async create(session: ConversationSession): Promise<void> {
    const data = session.data as {
      caseId: string;
      caseLabel: string;
      title: string;
      assigneeId?: string;
      assigneeLabel?: string;
      dueDate?: string;
    };
    await this.tasks.create(
      { id: session.userId, firmId: session.firmId } as unknown as AuthUser,
      data.caseId,
      { title: data.title, assigneeId: data.assigneeId, dueDate: data.dueDate },
      TaskSource.LINE,
    );
    this.store.clear(session.lineUserId);
    await this.reply(session, `เพิ่มงานในคดี "${data.caseLabel}" สำเร็จแล้วครับ ✅`);
    await this.notify.notifyCreated({
      target: session.target,
      summaryText: `✅ งานใหม่ในคดี "${data.caseLabel}": ${data.title}${data.assigneeLabel ? `\nผู้รับผิดชอบ: ${data.assigneeLabel}` : ''}`,
      assigneeUserId: data.assigneeId,
      entityPath: `/cases/${data.caseId}`,
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

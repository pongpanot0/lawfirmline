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
import {
  renderSummary,
  buildFieldPickerQuickReply,
  pickQuickReply,
  resolvePick,
  withEscape,
  CONFIRM_QUICK_REPLY,
  FieldSpec,
} from './flow-confirmation.util';
import { parseFlexibleDate, formatIsoDate, dateQuickReply, DATE_HELP } from './date-parse.util';

const FIELDS: FieldSpec[] = [
  { key: 'title', label: 'ชื่องาน' },
  { key: 'assigneeLabel', label: 'ผู้รับผิดชอบ' },
  { key: 'dueDate', label: 'กำหนดส่ง', format: formatIsoDate },
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
    await this.reply(
      session,
      'เพิ่มงาน — พิมพ์ชื่อคดีหรือเลขคดี (ดำ/แดง) เพื่อค้นหา หรือพิมพ์ "ข้าม" ถ้าเป็นงานนอกคดีครับ',
      [{ label: 'ข้าม (งานนอกคดี)', text: 'ข้าม' }],
    );
  }

  async handle(session: ConversationSession, text: string): Promise<void> {
    if (text === 'ยกเลิก') {
      this.store.clear(session.lineUserId);
      await this.reply(session, 'ยกเลิกแล้วครับ');
      return;
    }

    switch (session.step) {
      case ConversationStep.TASK_CASE_SEARCH: {
        if (text === 'ข้าม') {
          this.store.update(session.lineUserId, {
            data: { ...session.data },
            step: ConversationStep.TASK_TITLE,
          });
          await this.reply(session, 'ชื่องานที่จะมอบหมายคืออะไรครับ?');
          return;
        }
        const authUser = await this.authContext.resolve(session.lineUserId);
        if (!authUser) {
          await this.reply(session, 'เกิดข้อผิดพลาดในการยืนยันตัวตน กรุณาลองใหม่อีกครั้งครับ');
          return;
        }
        const results = await this.cases.findAll(authUser, { search: text });
        if (!results.length) {
          await this.reply(session, `ไม่พบคดีที่ตรงกับ "${text}" ลองพิมพ์คำอื่นดูครับ`, [
            { label: 'ข้าม (งานนอกคดี)', text: 'ข้าม' },
          ]);
          return;
        }
        const page = results.slice(0, 10).map((c) => ({ id: c.id, label: c.title }));
        this.store.update(session.lineUserId, {
          step: ConversationStep.TASK_CASE_PICK,
          searchResults: page,
        });
        await this.reply(
          session,
          'เลือกคดีครับ',
          pickQuickReply(page, [{ label: 'ค้นหาใหม่', text: 'ค้นหาใหม่' }]),
        );
        return;
      }
      case ConversationStep.TASK_CASE_PICK: {
        if (text === 'ค้นหาใหม่') {
          this.store.update(session.lineUserId, { step: ConversationStep.TASK_CASE_SEARCH });
          await this.reply(session, 'พิมพ์ชื่อคดีหรือเลขคดีอีกครั้งครับ', [
            { label: 'ข้าม (งานนอกคดี)', text: 'ข้าม' },
          ]);
          return;
        }
        const picked = resolvePick(session.searchResults, text);
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
        const picked = resolvePick(session.searchResults, text);
        if (!picked) {
          await this.reply(session, 'กรุณาเลือกจากปุ่มที่บอทให้มาครับ');
          return;
        }
        const withAssignee = { ...session.data, assigneeId: picked.id, assigneeLabel: picked.label };
        if (session.editingField === 'assigneeLabel') {
          this.store.update(session.lineUserId, {
            data: withAssignee,
            step: ConversationStep.TASK_CONFIRM,
            editingField: undefined,
          });
          await this.confirmStep(session, withAssignee);
          return;
        }
        this.store.update(session.lineUserId, {
          data: withAssignee,
          step: ConversationStep.TASK_DUE_DATE,
        });
        await this.reply(session, `กำหนดส่งงานวันไหนครับ?\n${DATE_HELP}`, dateQuickReply());
        return;
      }
      case ConversationStep.TASK_DUE_DATE: {
        let dueDate: string | undefined;
        if (text !== 'ข้าม') {
          const parsed = parseFlexibleDate(text);
          if (!parsed) {
            await this.reply(session, `ยังอ่านวันที่ไม่ออกครับ — ${DATE_HELP}`, dateQuickReply());
            return;
          }
          dueDate = parsed;
        }
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
            editingField: 'assigneeLabel',
          });
          await this.showAssigneePage(session, 0);
          return;
        }
        this.store.update(session.lineUserId, { editingField: field, step: ConversationStep.TASK_EDIT_VALUE });
        await this.reply(
          session,
          `กรอกค่าใหม่สำหรับ "${FIELDS.find((f) => f.key === field)!.label}" ครับ`,
          field === 'dueDate' ? dateQuickReply() : undefined,
        );
        return;
      }
      case ConversationStep.TASK_EDIT_VALUE: {
        const field = session.editingField!;
        let value: string | undefined = text;
        if (field === 'dueDate') {
          value = text === 'ข้าม' ? undefined : (parseFlexibleDate(text) ?? undefined);
          if (text !== 'ข้าม' && !value) {
            await this.reply(session, `ยังอ่านวันที่ไม่ออกครับ — ${DATE_HELP}`, dateQuickReply());
            return;
          }
        }
        const data = { ...session.data, [field]: value };
        this.store.update(session.lineUserId, { data, step: ConversationStep.TASK_CONFIRM, editingField: undefined });
        await this.confirmStep(session, data);
        return;
      }
    }
  }

  private async showAssigneePage(session: ConversationSession, offset: number): Promise<void> {
    const { items, hasMore } = await this.users.findAllByFirm(session.firmId, offset, 12);
    this.store.update(session.lineUserId, { searchResults: items });
    const extra = hasMore ? [{ label: 'ดูเพิ่มเติม', text: 'ดูเพิ่มเติม' }] : [];
    await this.reply(session, 'มอบหมายให้ใครครับ?', pickQuickReply(items, extra));
  }

  private async confirmStep(session: ConversationSession, data: Record<string, unknown>): Promise<void> {
    await this.reply(session, renderSummary(FIELDS, data), CONFIRM_QUICK_REPLY);
  }

  private async create(session: ConversationSession): Promise<void> {
    const data = session.data as {
      caseId?: string;
      caseLabel?: string;
      title: string;
      assigneeId?: string;
      assigneeLabel?: string;
      dueDate?: string;
    };
    // Assigning a standalone task to someone else checks the caller's firm
    // role, so the full AuthUser is needed — the minimal cast has no role.
    const authUser =
      (await this.authContext.resolve(session.lineUserId)) ??
      ({ id: session.userId, firmId: session.firmId } as unknown as AuthUser);
    await this.tasks.create(
      authUser,
      data.caseId ?? null,
      { title: data.title, assigneeId: data.assigneeId, dueDate: data.dueDate },
      TaskSource.LINE,
    );
    this.store.clear(session.lineUserId);
    const where = data.caseId ? `ในคดี "${data.caseLabel}"` : 'นอกคดี';
    await this.reply(session, `เพิ่มงาน${where}สำเร็จแล้วครับ ✅`);
    await this.notify.notifyCreated({
      target: session.target,
      summaryText: `✅ งานใหม่${where}: ${data.title}${data.assigneeLabel ? `\nผู้รับผิดชอบ: ${data.assigneeLabel}` : ''}`,
      assigneeUserId: data.assigneeId,
      entityPath: data.caseId ? `/cases/${data.caseId}` : '/todos',
    });
  }

  private async reply(session: ConversationSession, text: string, quickReply?: QuickReplyItem[]): Promise<void> {
    const items = withEscape(quickReply);
    if (session.target.replyToken) {
      await this.line.replyWithQuickReply(session.target.replyToken, text, items);
    } else {
      await this.line.pushTo(session.lineUserId, text, items);
    }
  }
}

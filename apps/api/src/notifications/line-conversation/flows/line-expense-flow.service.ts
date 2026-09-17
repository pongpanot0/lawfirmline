import { Injectable, Logger } from '@nestjs/common';
import { ExpenseStatus } from '@lawfirm/shared';
import { BillingService } from '../../../billing/billing.service';
import { CasesService } from '../../../cases/cases.service';
import {
  InsufficientCreditsError,
  ReceiptExtractionService,
} from '../../../intelligence/receipt-extraction.service';
import { LineMessagingService, QuickReplyItem } from '../../line-messaging.service';
import { LineConversationStoreService } from '../line-conversation-store.service';
import { LineAuthContextService } from '../line-auth-context.service';
import { ConversationSession, ConversationStep } from '../line-conversation.types';
import { renderSummary, CONFIRM_QUICK_REPLY, FieldSpec } from './flow-confirmation.util';

const FIELDS: FieldSpec[] = [
  { key: 'amount', label: 'ยอดเงิน', format: (v) => `฿${Number(v).toLocaleString('th-TH')}` },
  { key: 'description', label: 'รายการ' },
  { key: 'caseLabel', label: 'คดี' },
];

const MODE_QUICK_REPLY: QuickReplyItem[] = [
  { label: '✍️ กรอกเอง', text: 'กรอกเอง' },
  { label: '🤖 AI อ่านจากรูป', text: 'AI อ่านจากรูป' },
];

@Injectable()
export class LineExpenseFlowService {
  private readonly logger = new Logger(LineExpenseFlowService.name);

  constructor(
    private billing: BillingService,
    private cases: CasesService,
    private receiptExtraction: ReceiptExtractionService,
    private line: LineMessagingService,
    private store: LineConversationStoreService,
    private authContext: LineAuthContextService,
  ) {}

  async start(session: ConversationSession): Promise<void> {
    this.store.update(session.lineUserId, { step: ConversationStep.EXPENSE_MODE_PICK, data: {} });
    await this.reply(
      session,
      'บันทึกค่าใช้จ่าย — จะกรอกเองหรือให้ AI อ่านจากรูปใบเสร็จครับ?',
      MODE_QUICK_REPLY,
    );
  }

  async handle(session: ConversationSession, text: string): Promise<void> {
    if (text === 'ยกเลิก') {
      this.store.clear(session.lineUserId);
      await this.reply(session, 'ยกเลิกแล้วครับ');
      return;
    }

    switch (session.step) {
      case ConversationStep.EXPENSE_MODE_PICK: {
        if (text !== 'กรอกเอง' && text !== 'AI อ่านจากรูป') {
          await this.reply(session, 'กรุณาเลือกจากปุ่มที่บอทให้มาครับ', MODE_QUICK_REPLY);
          return;
        }
        const mode = text === 'กรอกเอง' ? 'manual' : 'ai';
        this.store.update(session.lineUserId, {
          data: { ...session.data, mode },
          step: ConversationStep.EXPENSE_RECEIPT,
        });
        await this.reply(
          session,
          mode === 'manual'
            ? 'ส่งรูปใบเสร็จมาได้เลยครับ หรือพิมพ์ "ข้าม" ถ้าไม่มีรูป'
            : 'ส่งรูปใบเสร็จมาได้เลยครับ (พิมพ์ "ข้าม" เพื่อเปลี่ยนเป็นกรอกเอง)',
        );
        return;
      }
      case ConversationStep.EXPENSE_RECEIPT: {
        if (text === 'ข้าม') {
          this.store.update(session.lineUserId, {
            data: { ...session.data, mode: 'manual' },
            step: ConversationStep.EXPENSE_AMOUNT,
          });
          await this.reply(session, 'ยอดเงินเท่าไหร่ครับ? (ตัวเลข เช่น 1500)');
          return;
        }
        await this.reply(session, 'ส่งรูปใบเสร็จเป็นรูปภาพ หรือพิมพ์ "ข้าม" ครับ');
        return;
      }
      case ConversationStep.EXPENSE_AMOUNT: {
        const amount = Number(text.replace(/,/g, ''));
        if (!Number.isFinite(amount) || amount <= 0) {
          await this.reply(session, 'ขอเป็นตัวเลขมากกว่า 0 ครับ');
          return;
        }
        this.store.update(session.lineUserId, {
          data: { ...session.data, amount },
          step: ConversationStep.EXPENSE_DESCRIPTION,
        });
        await this.reply(session, 'ค่าอะไรครับ? (เช่น ค่าส่งเอกสาร)');
        return;
      }
      case ConversationStep.EXPENSE_DESCRIPTION: {
        this.store.update(session.lineUserId, {
          data: { ...session.data, description: text },
          step: ConversationStep.EXPENSE_CASE_SEARCH,
        });
        await this.reply(
          session,
          'ผูกกับคดีไหนครับ? พิมพ์ชื่อคดีเพื่อค้นหา หรือพิมพ์ "ข้าม" ถ้าเป็นค่าใช้จ่ายทั่วไป',
        );
        return;
      }
      case ConversationStep.EXPENSE_CASE_SEARCH: {
        if (text === 'ข้าม') {
          const data = { ...session.data };
          this.store.update(session.lineUserId, { data, step: ConversationStep.EXPENSE_CONFIRM });
          await this.confirmStep(session, data);
          return;
        }
        const authUser = await this.authContext.resolve(session.lineUserId);
        if (!authUser) {
          await this.reply(session, 'เกิดข้อผิดพลาดในการยืนยันตัวตน กรุณาลองใหม่อีกครั้งครับ');
          return;
        }
        const results = await this.cases.findAll(authUser, { search: text });
        if (!results.length) {
          await this.reply(session, `ไม่พบคดีที่ตรงกับ "${text}" ลองพิมพ์คำอื่น หรือพิมพ์ "ข้าม" ครับ`);
          return;
        }
        const page = results.slice(0, 13);
        this.store.update(session.lineUserId, {
          step: ConversationStep.EXPENSE_CASE_PICK,
          searchResults: page.map((c) => ({ id: c.id, label: c.title })),
        });
        await this.reply(
          session,
          'เลือกคดีครับ',
          page.map((c) => ({ label: c.title.slice(0, 20), text: c.title })),
        );
        return;
      }
      case ConversationStep.EXPENSE_CASE_PICK: {
        const picked = session.searchResults?.find((r) => r.label === text);
        if (!picked) {
          await this.reply(session, 'กรุณาเลือกจากปุ่มที่บอทให้มาครับ');
          return;
        }
        const data = { ...session.data, caseId: picked.id, caseLabel: picked.label };
        this.store.update(session.lineUserId, { data, step: ConversationStep.EXPENSE_CONFIRM });
        await this.confirmStep(session, data);
        return;
      }
      case ConversationStep.EXPENSE_CONFIRM: {
        if (text === 'ยืนยัน') {
          await this.create(session);
          return;
        }
        // ponytail: no per-field edit sub-machine — any other reply restarts at the amount step
        this.store.update(session.lineUserId, { step: ConversationStep.EXPENSE_AMOUNT });
        await this.reply(session, 'แก้ไขได้เลยครับ — ยอดเงินเท่าไหร่ครับ?');
        return;
      }
      default: {
        this.store.clear(session.lineUserId);
        await this.reply(session, 'เกิดข้อผิดพลาด เริ่มใหม่ด้วยการพิมพ์ "บันทึกค่าใช้จ่าย" ครับ');
      }
    }
  }

  /** A photo arriving while we are at the receipt step. */
  async handleImage(
    session: ConversationSession,
    image: { buffer: Buffer; contentType: string },
  ): Promise<void> {
    if (session.step !== ConversationStep.EXPENSE_RECEIPT) return;

    const withReceipt = {
      ...session.data,
      receiptBase64: image.buffer.toString('base64'),
      receiptContentType: image.contentType,
    };

    if (session.data.mode !== 'ai') {
      this.store.update(session.lineUserId, {
        data: withReceipt,
        step: ConversationStep.EXPENSE_AMOUNT,
      });
      await this.reply(session, 'ได้รูปแล้วครับ ✅ ยอดเงินเท่าไหร่ครับ? (ตัวเลข เช่น 1500)');
      return;
    }

    try {
      const extracted = await this.receiptExtraction.extractReceipt(session.userId, image);
      if (extracted && (extracted.amount !== null || extracted.description !== null)) {
        const data = {
          ...withReceipt,
          amount: extracted.amount ?? undefined,
          description: extracted.description ?? undefined,
        };
        if (extracted.amount === null) {
          this.store.update(session.lineUserId, { data, step: ConversationStep.EXPENSE_AMOUNT });
          await this.reply(session, 'AI อ่านยอดเงินไม่ได้ครับ — ยอดเงินเท่าไหร่ครับ?');
          return;
        }
        if (extracted.description === null) {
          this.store.update(session.lineUserId, { data, step: ConversationStep.EXPENSE_DESCRIPTION });
          await this.reply(
            session,
            `AI อ่านได้: ฿${extracted.amount.toLocaleString('th-TH')} ครับ — ค่าอะไรครับ?`,
          );
          return;
        }
        this.store.update(session.lineUserId, { data, step: ConversationStep.EXPENSE_CASE_SEARCH });
        await this.reply(
          session,
          `AI อ่านได้: ฿${extracted.amount.toLocaleString('th-TH')} — ${extracted.description} ครับ ถ้าไม่ถูกแก้ได้ในขั้นยืนยัน\n\nผูกกับคดีไหนครับ? พิมพ์ชื่อคดีเพื่อค้นหา หรือพิมพ์ "ข้าม"`,
        );
        return;
      }
      this.store.update(session.lineUserId, {
        data: { ...withReceipt, mode: 'manual' },
        step: ConversationStep.EXPENSE_AMOUNT,
      });
      await this.reply(session, 'อ่านรูปไม่สำเร็จครับ — กรอกเองนะครับ ยอดเงินเท่าไหร่ครับ?');
    } catch (err) {
      if (err instanceof InsufficientCreditsError) {
        this.store.update(session.lineUserId, {
          data: { ...withReceipt, mode: 'manual' },
          step: ConversationStep.EXPENSE_AMOUNT,
        });
        await this.reply(session, 'เครดิต AI ไม่พอครับ — เปลี่ยนเป็นกรอกเองนะครับ ยอดเงินเท่าไหร่ครับ?');
        return;
      }
      this.logger.error('Receipt handling failed', err);
      this.store.update(session.lineUserId, {
        data: { ...withReceipt, mode: 'manual' },
        step: ConversationStep.EXPENSE_AMOUNT,
      });
      await this.reply(session, 'เกิดข้อผิดพลาดในการอ่านรูปครับ — กรอกเองนะครับ ยอดเงินเท่าไหร่ครับ?');
    }
  }

  private async confirmStep(
    session: ConversationSession,
    data: Record<string, unknown>,
  ): Promise<void> {
    await this.reply(session, renderSummary(FIELDS, data), CONFIRM_QUICK_REPLY);
  }

  private async create(session: ConversationSession): Promise<void> {
    const data = session.data as {
      amount: number;
      description: string;
      caseId?: string;
      receiptBase64?: string;
      receiptContentType?: string;
    };
    const authUser = await this.authContext.resolve(session.lineUserId);
    if (!authUser) {
      await this.reply(session, 'เกิดข้อผิดพลาดในการยืนยันตัวตน กรุณาลองใหม่อีกครั้งครับ');
      return;
    }

    const receipt = data.receiptBase64
      ? ({
          buffer: Buffer.from(data.receiptBase64, 'base64'),
          originalname: 'line-receipt.jpg',
          mimetype: data.receiptContentType ?? 'image/jpeg',
          size: Buffer.byteLength(data.receiptBase64, 'base64'),
        } as Express.Multer.File)
      : undefined;

    // Draft first, then submit through the normal claim pipeline so the
    // expense lands in the owner's approval queue (and the existing
    // claim-submitted owner notification fires).
    const expense = await this.billing.createStandaloneExpense(
      authUser,
      { amount: data.amount, description: data.description, caseId: data.caseId } as never,
      receipt,
    );
    await this.billing.updateExpenseStatus(authUser, expense.id, {
      status: ExpenseStatus.PENDING,
    } as never);

    this.store.clear(session.lineUserId);
    await this.reply(
      session,
      `บันทึกค่าใช้จ่ายสำเร็จแล้วครับ ✅ ฿${data.amount.toLocaleString('th-TH')} — ส่งเบิกให้เจ้าของสำนักงานแล้ว`,
    );
  }

  private async reply(
    session: ConversationSession,
    text: string,
    quickReply?: QuickReplyItem[],
  ): Promise<void> {
    if (session.target.replyToken) {
      await this.line.replyWithQuickReply(session.target.replyToken, text, quickReply);
    } else {
      await this.line.pushTo(session.lineUserId, text, quickReply);
    }
  }
}

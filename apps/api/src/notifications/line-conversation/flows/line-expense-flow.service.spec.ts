import { LineExpenseFlowService } from './line-expense-flow.service';
import {
  ConversationSession,
  ConversationStep,
  FlowType,
} from '../line-conversation.types';
import { InsufficientCreditsError } from '../../../intelligence/receipt-extraction.service';

describe('LineExpenseFlowService', () => {
  const billing = {
    createStandaloneExpense: jest.fn().mockResolvedValue({ id: 'e1' }),
    updateExpenseStatus: jest.fn().mockResolvedValue({ id: 'e1' }),
  } as any;
  const cases = { findAll: jest.fn() } as any;
  const extraction = { extractReceipt: jest.fn() } as any;
  const line = { replyWithQuickReply: jest.fn(), pushTo: jest.fn() } as any;
  const notify = { notifyCreated: jest.fn() } as any;
  const authContext = {
    resolve: jest.fn().mockResolvedValue({ id: 'u1', firmId: 'f1', firmRole: 'LAWYER' }),
  } as any;

  let sessionState: ConversationSession;
  const store = {
    update: jest.fn((_id: string, patch: Partial<ConversationSession>) => {
      sessionState = { ...sessionState, ...patch } as ConversationSession;
      return sessionState;
    }),
    clear: jest.fn(),
    get: jest.fn(() => sessionState),
  } as any;

  const baseSession = (): ConversationSession => ({
    lineUserId: 'L1',
    userId: 'u1',
    firmId: 'f1',
    flowType: FlowType.EXPENSE,
    step: ConversationStep.EXPENSE_MODE_PICK,
    data: {},
    target: { sourceType: 'user' },
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });

  let svc: LineExpenseFlowService;
  beforeEach(() => {
    jest.clearAllMocks();
    billing.createStandaloneExpense.mockResolvedValue({ id: 'e1' });
    sessionState = baseSession();
    svc = new LineExpenseFlowService(billing, cases, extraction, line, store, authContext, notify);
  });

  it('manual path: skip receipt, amount with commas, description, skip case, confirm submits', async () => {
    await svc.handle(sessionState, 'กรอกเอง');
    expect(sessionState.step).toBe(ConversationStep.EXPENSE_RECEIPT);
    await svc.handle(sessionState, 'ข้าม');
    expect(sessionState.step).toBe(ConversationStep.EXPENSE_AMOUNT);
    await svc.handle(sessionState, '1,500');
    expect(sessionState.step).toBe(ConversationStep.EXPENSE_DESCRIPTION);
    await svc.handle(sessionState, 'ค่าส่งเอกสาร');
    await svc.handle(sessionState, 'ข้าม');
    expect(sessionState.step).toBe(ConversationStep.EXPENSE_CONFIRM);
    await svc.handle(sessionState, 'ยืนยัน');
    expect(billing.createStandaloneExpense).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'u1' }),
      { amount: 1500, description: 'ค่าส่งเอกสาร', caseId: undefined },
      undefined,
    );
    // A LINE expense stays a draft — it is submitted from the web app.
    expect(billing.updateExpenseStatus).not.toHaveBeenCalled();
    expect(store.clear).toHaveBeenCalledWith('L1');
  });

  it('rejects an invalid amount and re-asks', async () => {
    sessionState.step = ConversationStep.EXPENSE_AMOUNT;
    await svc.handle(sessionState, 'abc');
    expect(sessionState.step).toBe(ConversationStep.EXPENSE_AMOUNT);
    expect(line.pushTo).toHaveBeenCalledWith('L1', expect.stringContaining('ตัวเลข'), expect.any(Array));
  });

  it('AI path: image extraction prefills amount and description', async () => {
    sessionState.step = ConversationStep.EXPENSE_RECEIPT;
    sessionState.data = { mode: 'ai' };
    extraction.extractReceipt.mockResolvedValue({ amount: 900, description: 'ค่าถ่ายเอกสาร' });
    await svc.handleImage(sessionState, { buffer: Buffer.from('x'), contentType: 'image/jpeg' });
    expect(sessionState.step).toBe(ConversationStep.EXPENSE_CASE_SEARCH);
    expect(sessionState.data).toMatchObject({ amount: 900, description: 'ค่าถ่ายเอกสาร' });
    expect(sessionState.data.receiptBase64).toBeDefined();
  });

  it('AI path falls back to manual on insufficient credits, keeping the photo', async () => {
    sessionState.step = ConversationStep.EXPENSE_RECEIPT;
    sessionState.data = { mode: 'ai' };
    extraction.extractReceipt.mockRejectedValue(new InsufficientCreditsError());
    await svc.handleImage(sessionState, { buffer: Buffer.from('x'), contentType: 'image/jpeg' });
    expect(sessionState.step).toBe(ConversationStep.EXPENSE_AMOUNT);
    expect(sessionState.data.receiptBase64).toBeDefined();
    expect(line.pushTo).toHaveBeenCalledWith('L1', expect.stringContaining('เครดิต AI ไม่พอ'), expect.any(Array));
  });

  it('edits one field from the confirm step instead of restarting', async () => {
    sessionState.step = ConversationStep.EXPENSE_CONFIRM;
    sessionState.data = { amount: 100, description: 'ค่าน้ำมัน' };
    await svc.handle(sessionState, 'แก้ไข');
    expect(sessionState.step).toBe(ConversationStep.EXPENSE_EDIT_PICK_FIELD);
    await svc.handle(sessionState, 'แก้:amount');
    expect(sessionState.step).toBe(ConversationStep.EXPENSE_EDIT_VALUE);
    await svc.handle(sessionState, '250');
    expect(sessionState.step).toBe(ConversationStep.EXPENSE_CONFIRM);
    expect(sessionState.data).toMatchObject({ amount: 250, description: 'ค่าน้ำมัน' });
  });

  it('notifies the chat after submitting', async () => {
    sessionState.step = ConversationStep.EXPENSE_CONFIRM;
    sessionState.data = { amount: 300, description: 'ค่าส่งเอกสาร' };
    await svc.handle(sessionState, 'ยืนยัน');
    expect(notify.notifyCreated).toHaveBeenCalledWith(
      expect.objectContaining({ entityPath: '/expenses' }),
    );
  });

  it('attaches the photo as a receipt file on submit', async () => {
    sessionState.step = ConversationStep.EXPENSE_CONFIRM;
    sessionState.data = {
      amount: 200,
      description: 'ค่าแท็กซี่',
      receiptBase64: Buffer.from('img').toString('base64'),
      receiptContentType: 'image/png',
    };
    await svc.handle(sessionState, 'ยืนยัน');
    const receiptArg = billing.createStandaloneExpense.mock.calls[0][2];
    expect(receiptArg.mimetype).toBe('image/png');
    expect(receiptArg.buffer.toString()).toBe('img');
  });
});

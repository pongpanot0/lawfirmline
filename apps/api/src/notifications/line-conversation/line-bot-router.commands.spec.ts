import { FirmLinkService } from '../firm-link.service';
import { LineBotRouterService } from './line-bot-router.service';
import { ConversationSession, ConversationStep, FlowType } from './line-conversation.types';

describe('LineBotRouter — menu commands never get eaten by a flow', () => {
  const line = {
    replyWithQuickReply: jest.fn(),
    pushTo: jest.fn(),
    replyHomeMenu: jest.fn(),
    pushHomeMenu: jest.fn(),
    getMessageContent: jest.fn(),
    showLoading: jest.fn(),
  } as any;
  const secretary = { history: jest.fn(), chat: jest.fn() } as any;
  const auth = {
    resolve: jest.fn().mockResolvedValue({ id: 'u1', firmId: 'f1', firmSlug: 'acme', firmRole: 'OWNER' }),
  } as any;
  const caseFlow = { start: jest.fn(), handle: jest.fn() } as any;
  const taskFlow = { start: jest.fn(), handle: jest.fn() } as any;
  const todoFlow = { start: jest.fn(), handle: jest.fn() } as any;
  const expenseFlow = { start: jest.fn(), handle: jest.fn(), handleImage: jest.fn() } as any;
  const advanceFlow = { start: jest.fn(), handle: jest.fn() } as any;
  const agenda = { getMyDay: jest.fn() } as any;
  const config = {
    get: jest.fn((key: string) =>
      key === 'ROOT_DOMAIN' ? 'example.com' : 'https://app.example.com',
    ),
  } as any;

  const store = {
    get: jest.fn(),
    start: jest.fn((s) => ({ ...s, createdAt: 1, updatedAt: 1 })),
    update: jest.fn(),
    clear: jest.fn(),
  } as any;

  const target = { replyToken: 'rt', sourceType: 'user' as const };

  const midFlow = (overrides: Partial<ConversationSession> = {}): ConversationSession => ({
    lineUserId: 'L1',
    userId: 'u1',
    firmId: 'f1',
    flowType: FlowType.EXPENSE,
    step: ConversationStep.EXPENSE_DESCRIPTION,
    data: {},
    target,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  });

  let router: LineBotRouterService;
  beforeEach(() => {
    jest.clearAllMocks();
    auth.resolve.mockResolvedValue({ id: 'u1', firmId: 'f1', firmSlug: 'acme', firmRole: 'OWNER' });
    store.start.mockImplementation((s: any) => ({ ...s, createdAt: 1, updatedAt: 1 }));
    router = new LineBotRouterService(
      line, auth, store, caseFlow, taskFlow, todoFlow, expenseFlow, advanceFlow, agenda, config,
      new FirmLinkService({ firm: { findUnique: async () => ({ slug: 'acme' }) } } as any, config),
      { start: jest.fn(), handle: jest.fn() } as any,
      { handle: jest.fn().mockResolvedValue(null) } as any,
      { caseQuery: jest.fn().mockReturnValue(null), openTasks: jest.fn(), findCase: jest.fn() } as any,
      { begin: jest.fn(), handle: jest.fn() } as any,
      secretary,
    );
  });

  it('a menu tap mid-flow starts that flow instead of becoming an answer', async () => {
    store.get.mockReturnValue(midFlow());
    await router.route('L1', 'เพิ่ม Task', target, false);
    expect(expenseFlow.handle).not.toHaveBeenCalled();
    expect(taskFlow.start).toHaveBeenCalled();
  });

  it('"เมนู" mid-flow goes home', async () => {
    store.get.mockReturnValue(midFlow());
    await router.route('L1', 'เมนู', target, false);
    expect(expenseFlow.handle).not.toHaveBeenCalled();
    expect(line.replyHomeMenu).toHaveBeenCalledWith('rt', expect.any(Array));
  });

  it('"ยกเลิก" clears the session and shows the menu with a notice', async () => {
    store.get.mockReturnValue(midFlow());
    await router.route('L1', 'ยกเลิก', target, false);
    expect(store.clear).toHaveBeenCalledWith('L1');
    expect(line.replyWithQuickReply).toHaveBeenCalledWith(
      'rt',
      expect.stringContaining('ยกเลิก'),
      expect.any(Array),
    );
  });

  describe('free text goes to the AI secretary', () => {
    const card = { type: 'case' as const, id: 'c1', title: 'ผิดสัญญา', ownRef: 'TSBREF20250001' };
    beforeEach(() => {
      store.get.mockReturnValue(undefined);
      secretary.history.mockResolvedValue([{ role: 'user', content: 'ก่อนหน้า' }, { role: 'assistant', content: 'ตอบก่อนหน้า' }]);
      secretary.chat.mockResolvedValue({ reply: 'พรุ่งนี้มีนัด 1 นัดครับ', cards: [card] });
      line.replyWithQuickReply.mockResolvedValue(true);
    });

    it('answers with the saved history, the question and links to what it found', async () => {
      await router.route('L1', 'พรุ่งนี้มีนัดอะไร', target, false);
      expect(line.showLoading).toHaveBeenCalledWith('L1');
      expect(secretary.chat).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'u1' }),
        [expect.objectContaining({ content: 'ก่อนหน้า' }), expect.objectContaining({ content: 'ตอบก่อนหน้า' }), { role: 'user', content: 'พรุ่งนี้มีนัดอะไร' }],
      );
      const text = line.replyWithQuickReply.mock.calls[0][1] as string;
      expect(text).toContain('พรุ่งนี้มีนัด 1 นัดครับ');
      expect(text).toContain('TSBREF20250001 · ผิดสัญญา');
      expect(text).toMatch(/\/cases\/c1$/);
      expect(line.replyHomeMenu).not.toHaveBeenCalled();
    });

    it('pushes the answer when the reply token has expired', async () => {
      line.replyWithQuickReply.mockResolvedValue(false);
      await router.route('L1', 'พรุ่งนี้มีนัดอะไร', target, false);
      expect(line.pushTo).toHaveBeenCalledWith('L1', expect.stringContaining('พรุ่งนี้มีนัด'), expect.any(Array));
    });

    it('a failed AI call still answers, with the menu hint', async () => {
      secretary.chat.mockRejectedValue(new Error('upstream'));
      await router.route('L1', 'พรุ่งนี้มีนัดอะไร', target, false);
      expect(line.replyWithQuickReply).toHaveBeenCalledWith('rt', expect.stringContaining('ตอบไม่ได้'), expect.any(Array));
    });

    it('in a group the answer goes to the asker privately, never to the group', async () => {
      const group = { replyToken: 'rt', sourceType: 'group' as const, groupId: 'G1' };
      await router.route('L1', '@บอท พรุ่งนี้มีนัดอะไร', group, true);
      expect(line.showLoading).not.toHaveBeenCalled();
      expect(line.pushTo).toHaveBeenCalledWith('L1', expect.stringContaining('พรุ่งนี้มีนัด'), expect.any(Array));
      expect(line.replyWithQuickReply).toHaveBeenCalledWith('rt', expect.stringContaining('แชตส่วนตัว'), undefined);
    });

    it('ambient group chatter never reaches the AI', async () => {
      const group = { replyToken: 'rt', sourceType: 'group' as const, groupId: 'G1' };
      await router.route('L1', 'กินข้าวยัง', group, false);
      expect(secretary.chat).not.toHaveBeenCalled();
    });
  });

  it('a session started in a group does not swallow a private message', async () => {
    store.get.mockReturnValue(
      midFlow({ target: { sourceType: 'group', groupId: 'G1' } }),
    );
    await router.route('L1', 'ข้อความส่วนตัว', target, false);
    expect(expenseFlow.handle).not.toHaveBeenCalled();
  });

  it('delegates a postback pick to the active flow', async () => {
    const session = midFlow({ step: ConversationStep.EXPENSE_CASE_PICK });
    store.get.mockReturnValue(session);
    store.update.mockReturnValue(session);
    await router.route('L1', 'pick:case-1', target, true);
    expect(expenseFlow.handle).toHaveBeenCalledWith(session, 'pick:case-1');
  });

  it('tells the user when the session expired rather than going silent', async () => {
    store.get.mockReturnValue(midFlow());
    store.update.mockReturnValue(undefined);
    await router.route('L1', 'ค่าเดินทาง', target, false);
    expect(line.replyWithQuickReply).toHaveBeenCalledWith(
      'rt',
      expect.stringContaining('หมดเวลา'),
      expect.any(Array),
    );
  });
});

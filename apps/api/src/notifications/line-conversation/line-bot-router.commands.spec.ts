import { LineBotRouterService } from './line-bot-router.service';
import { ConversationSession, ConversationStep, FlowType } from './line-conversation.types';

describe('LineBotRouter — menu commands never get eaten by a flow', () => {
  const line = {
    replyWithQuickReply: jest.fn(),
    pushTo: jest.fn(),
    replyHomeMenu: jest.fn(),
    pushHomeMenu: jest.fn(),
    getMessageContent: jest.fn(),
  } as any;
  const auth = {
    resolve: jest.fn().mockResolvedValue({ id: 'u1', firmId: 'f1', firmRole: 'OWNER' }),
  } as any;
  const intakeFlow = { start: jest.fn(), handle: jest.fn() } as any;
  const taskFlow = { start: jest.fn(), handle: jest.fn() } as any;
  const todoFlow = { start: jest.fn(), handle: jest.fn() } as any;
  const expenseFlow = { start: jest.fn(), handle: jest.fn(), handleImage: jest.fn() } as any;
  const advanceFlow = { start: jest.fn(), handle: jest.fn() } as any;
  const agenda = { getMyDay: jest.fn() } as any;
  const config = { get: jest.fn().mockReturnValue('https://app.example.com') } as any;

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
    auth.resolve.mockResolvedValue({ id: 'u1', firmId: 'f1', firmRole: 'OWNER' });
    store.start.mockImplementation((s: any) => ({ ...s, createdAt: 1, updatedAt: 1 }));
    router = new LineBotRouterService(
      line, auth, store, intakeFlow, taskFlow, todoFlow, expenseFlow, advanceFlow, agenda, config,
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

  it('unrecognised text explains itself instead of re-sending a picture', async () => {
    store.get.mockReturnValue(undefined);
    await router.route('L1', 'อยากได้อะไรสักอย่าง', target, false);
    expect(line.replyWithQuickReply).toHaveBeenCalledWith(
      'rt',
      expect.stringContaining('ยังไม่เข้าใจ'),
      expect.any(Array),
    );
    expect(line.replyHomeMenu).not.toHaveBeenCalled();
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

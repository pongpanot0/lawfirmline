import { LineBotRouterService } from './line-bot-router.service';
import { ConversationStep, FlowType } from './line-conversation.types';

describe('LineBotRouter my-day command', () => {
  const line = {
    replyWithQuickReply: jest.fn(),
    pushTo: jest.fn(),
    getMessageContent: jest.fn(),
  } as any;
  const auth = {
    resolve: jest.fn().mockResolvedValue({ id: 'u1', firmId: 'f1', firmRole: 'LAWYER' }),
  } as any;
  const store = { get: jest.fn(), start: jest.fn(), update: jest.fn(), clear: jest.fn() } as any;
  const intakeFlow = { start: jest.fn(), handle: jest.fn() } as any;
  const taskFlow = { start: jest.fn(), handle: jest.fn() } as any;
  const todoFlow = { start: jest.fn(), handle: jest.fn() } as any;
  const expenseFlow = { start: jest.fn(), handle: jest.fn(), handleImage: jest.fn() } as any;
  const advanceFlow = { start: jest.fn(), handle: jest.fn() } as any;
  const agenda = { getMyDay: jest.fn() } as any;
  const config = { get: jest.fn().mockReturnValue('https://app.example.com') } as any;

  const target = { replyToken: 'rt', sourceType: 'user' as const };

  let router: LineBotRouterService;
  beforeEach(() => {
    jest.clearAllMocks();
    auth.resolve.mockResolvedValue({ id: 'u1', firmId: 'f1', firmRole: 'LAWYER' });
    router = new LineBotRouterService(
      line, auth, store, intakeFlow, taskFlow, todoFlow, expenseFlow, advanceFlow, agenda, config,
    );
  });

  it('replies with a summary containing overdue items and the my-day link', async () => {
    store.get.mockReturnValue(undefined);
    agenda.getMyDay.mockResolvedValue({
      today: '2026-09-17',
      overdue: [
        { title: 'ยื่นคำให้การ', allDay: true, at: '2026-09-10T00:00:00+07:00', caseRef: 'A-01' },
      ],
      todayItems: [
        { title: 'นัดสืบพยาน', allDay: false, at: '2026-09-17T09:00:00+07:00', caseRef: null },
      ],
      tomorrow: [],
      upcoming: [],
      warnings: [],
    });
    await router.route('L1', 'งานของฉันวันนี้', target, false);
    const text = line.replyWithQuickReply.mock.calls[0][1];
    expect(text).toContain('ยื่นคำให้การ');
    expect(text).toContain('นัดสืบพยาน');
    expect(text).toContain('https://app.example.com/my-day');
    expect(intakeFlow.start).not.toHaveBeenCalled();
  });

  it('celebrates an empty day', async () => {
    store.get.mockReturnValue(undefined);
    agenda.getMyDay.mockResolvedValue({
      today: '2026-09-17', overdue: [], todayItems: [], tomorrow: [], upcoming: [], warnings: [],
    });
    await router.route('L1', 'งานของฉันวันนี้', target, false);
    expect(line.replyWithQuickReply.mock.calls[0][1]).toContain('🎉');
  });

  it('does not hijack the text mid-flow', async () => {
    const session = {
      lineUserId: 'L1', userId: 'u1', firmId: 'f1',
      flowType: FlowType.EXPENSE, step: ConversationStep.EXPENSE_DESCRIPTION,
      data: {}, target, createdAt: Date.now(), updatedAt: Date.now(),
    };
    store.get.mockReturnValue(session);
    store.update.mockReturnValue(session);
    await router.route('L1', 'งานของฉันวันนี้', target, false);
    expect(agenda.getMyDay).not.toHaveBeenCalled();
    expect(expenseFlow.handle).toHaveBeenCalled();
  });
});

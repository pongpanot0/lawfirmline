import { FirmLinkService } from '../firm-link.service';
import { LineBotRouterService } from './line-bot-router.service';

describe('LineBotRouter — notification buttons and chat questions', () => {
  const line = {
    replyWithQuickReply: jest.fn(),
    pushTo: jest.fn(),
    replyHomeMenu: jest.fn(),
    getMessageContent: jest.fn(),
  } as any;
  const auth = { resolve: jest.fn() } as any;
  const flow = () => ({ start: jest.fn(), handle: jest.fn(), handleImage: jest.fn() }) as any;
  const caseFlow = flow();
  const agenda = { getMyDay: jest.fn() } as any;
  const config = { get: jest.fn(() => 'https://app.example.com') } as any;
  const store = { get: jest.fn(), start: jest.fn((s) => s), update: jest.fn((_id, patch) => ({ ...patch })), clear: jest.fn() } as any;
  const quickActions = { handle: jest.fn() } as any;
  const query = { caseQuery: jest.fn(), openTasks: jest.fn(), findCase: jest.fn() } as any;
  const user = { id: 'u1', firmId: 'f1', firmSlug: 'acme', firmRole: 'LAWYER' };
  const dm = { replyToken: 'rt', sourceType: 'user' as const };
  const group = { replyToken: 'rt', sourceType: 'group' as const, groupId: 'G1' };

  let router: LineBotRouterService;
  beforeEach(() => {
    jest.clearAllMocks();
    auth.resolve.mockResolvedValue(user);
    store.get.mockReturnValue(undefined);
    quickActions.handle.mockResolvedValue(null);
    query.caseQuery.mockImplementation((text: string) => /^คดี\s+(\S+)/.exec(text)?.[1] ?? null);
    router = new LineBotRouterService(
      line, auth, store, caseFlow, flow(), flow(), flow(), flow(), agenda, config,
      new FirmLinkService({ firm: { findUnique: async () => ({ slug: 'acme' }) } } as any, config),
      flow(), quickActions, query,
    );
  });

  it('a button postback is answered by the action service and never reaches a flow', async () => {
    quickActions.handle.mockResolvedValue('อนุมัติใบเบิกแล้วครับ');
    store.get.mockReturnValue({ flowType: 'CASE', target: dm });
    await router.route('L1', 'claim:approve:11111111-1111-1111-1111-111111111111', dm, true);
    expect(quickActions.handle).toHaveBeenCalledWith(user, 'claim:approve:11111111-1111-1111-1111-111111111111');
    expect(line.replyWithQuickReply).toHaveBeenCalledWith('rt', 'อนุมัติใบเบิกแล้วครับ', undefined);
    expect(caseFlow.handle).not.toHaveBeenCalled();
  });

  it('"งานค้างของฉัน" answers in a direct chat', async () => {
    query.openTasks.mockResolvedValue({ text: '📌 งานค้างของฉัน 2 งาน' });
    await router.route('L1', 'งานค้างของฉัน', dm, false);
    expect(line.replyWithQuickReply).toHaveBeenCalledWith('rt', '📌 งานค้างของฉัน 2 งาน', expect.any(Array));
  });

  it('a case question in a group is answered privately', async () => {
    query.findCase.mockResolvedValue({ text: '⚖️ TSB-1 — คดีลับ' });
    await router.route('L1', 'คดี TSB-1 นัดครั้งหน้าเมื่อไหร่', group, true);
    expect(query.findCase).toHaveBeenCalledWith(user, 'TSB-1');
    expect(line.pushTo).toHaveBeenCalledWith('L1', '⚖️ TSB-1 — คดีลับ', expect.any(Array));
    expect(line.replyWithQuickReply).toHaveBeenCalledWith('rt', expect.stringContaining('แชตส่วนตัว'), undefined);
  });

  it('"คดี …" inside a flow is that flow\'s answer, not a search', async () => {
    store.get.mockReturnValue({ flowType: 'CASE', target: dm });
    await router.route('L1', 'คดี ฟ้องผิดสัญญา', dm, false);
    expect(query.findCase).not.toHaveBeenCalled();
    expect(caseFlow.handle).toHaveBeenCalled();
  });
});

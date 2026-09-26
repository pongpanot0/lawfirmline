import { FirmLinkService } from '../firm-link.service';
import { LineBotRouterService } from './line-bot-router.service';

describe('LineBotRouter — leave approval postback', () => {
  const line = {
    replyWithQuickReply: jest.fn(),
    pushTo: jest.fn(),
    replyHomeMenu: jest.fn(),
    getMessageContent: jest.fn(),
  } as any;
  const auth = {
    resolve: jest.fn().mockResolvedValue({ id: 'owner-1', firmId: 'f1', firmSlug: 'acme', firmRole: 'OWNER' }),
  } as any;
  const caseFlow = { start: jest.fn(), handle: jest.fn() } as any;
  const taskFlow = { start: jest.fn(), handle: jest.fn() } as any;
  const todoFlow = { start: jest.fn(), handle: jest.fn() } as any;
  const expenseFlow = { start: jest.fn(), handle: jest.fn(), handleImage: jest.fn() } as any;
  const advanceFlow = { start: jest.fn(), handle: jest.fn() } as any;
  const agenda = { getMyDay: jest.fn() } as any;
  const config = { get: jest.fn(() => 'https://app.example.com') } as any;
  const store = { get: jest.fn(() => undefined), start: jest.fn((s) => s), update: jest.fn(), clear: jest.fn() } as any;
  const leaveFlow = { start: jest.fn(), handle: jest.fn() } as any;
  const leaveService = { decide: jest.fn() } as any;

  const target = { replyToken: 'rt', sourceType: 'user' as const };

  let router: LineBotRouterService;
  beforeEach(() => {
    jest.clearAllMocks();
    auth.resolve.mockResolvedValue({ id: 'owner-1', firmId: 'f1', firmSlug: 'acme', firmRole: 'OWNER' });
    router = new LineBotRouterService(
      line, auth, store, caseFlow, taskFlow, todoFlow, expenseFlow, advanceFlow, agenda, config,
      new FirmLinkService({ firm: { findUnique: async () => ({ slug: 'acme' }) } } as any, config),
      leaveFlow, leaveService,
    );
  });

  it('an approve postback calls decide and replies with success', async () => {
    leaveService.decide.mockResolvedValue({ id: 'leave-1', status: 'APPROVED' });
    await router.route('L1', 'leave:approve:abc', target, false);
    expect(leaveService.decide).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'owner-1' }), 'abc', 'APPROVED',
    );
    expect(line.replyWithQuickReply).toHaveBeenCalledWith('rt', expect.stringContaining('อนุมัติ'));
    expect(caseFlow.handle).not.toHaveBeenCalled();
  });

  it('a reject postback replies with the service error message on failure', async () => {
    leaveService.decide.mockRejectedValue(new Error('คำขอนี้ตัดสินไปแล้ว'));
    await router.route('L1', 'leave:reject:abc', target, false);
    expect(leaveService.decide).toHaveBeenCalledWith(expect.anything(), 'abc', 'REJECTED');
    expect(line.replyWithQuickReply).toHaveBeenCalledWith('rt', 'คำขอนี้ตัดสินไปแล้ว');
  });

  it('unrelated text is not treated as a leave postback', async () => {
    store.get.mockReturnValue(undefined);
    await router.route('L1', 'สวัสดี', target, false);
    expect(leaveService.decide).not.toHaveBeenCalled();
  });
});

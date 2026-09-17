import { LineAdvanceFlowService } from './line-advance-flow.service';
import { ConversationSession, ConversationStep, FlowType } from '../line-conversation.types';

describe('LineAdvanceFlowService', () => {
  const cashAdvance = { issue: jest.fn().mockResolvedValue({ id: 'a1' }) } as any;
  const users = {
    findAllByFirm: jest.fn().mockResolvedValue({
      items: [
        { id: 'owner-1', label: 'เจ้าของ สำนักงาน' },
        { id: 'u2', label: 'สมชาย ทนาย' },
      ],
      hasMore: false,
    }),
  } as any;
  const line = { replyWithQuickReply: jest.fn(), pushTo: jest.fn() } as any;
  const authContext = { resolve: jest.fn() } as any;

  let sessionState: ConversationSession;
  const store = {
    update: jest.fn((_id: string, patch: Partial<ConversationSession>) => {
      sessionState = { ...sessionState, ...patch } as ConversationSession;
      return sessionState;
    }),
    clear: jest.fn(),
  } as any;

  const baseSession = (): ConversationSession => ({
    lineUserId: 'L1',
    userId: 'owner-1',
    firmId: 'f1',
    flowType: FlowType.ADVANCE,
    step: ConversationStep.SELECT_ACTION,
    data: {},
    target: { sourceType: 'user' },
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });

  let svc: LineAdvanceFlowService;
  beforeEach(() => {
    jest.clearAllMocks();
    sessionState = baseSession();
    svc = new LineAdvanceFlowService(cashAdvance, users, line, store, authContext);
  });

  it('refuses non-owners at start and clears the session', async () => {
    authContext.resolve.mockResolvedValue({ id: 'u2', firmId: 'f1', firmRole: 'LAWYER' });
    await svc.start(sessionState);
    expect(store.clear).toHaveBeenCalledWith('L1');
    expect(line.pushTo).toHaveBeenCalledWith('L1', expect.stringContaining('เฉพาะเจ้าของ'), undefined);
    expect(users.findAllByFirm).not.toHaveBeenCalled();
  });

  it('owner full path issues the advance to the picked member (self excluded)', async () => {
    authContext.resolve.mockResolvedValue({ id: 'owner-1', firmId: 'f1', firmRole: 'OWNER' });
    await svc.start(sessionState);
    // self must be filtered out of the picker
    expect(sessionState.searchResults).toEqual([{ id: 'u2', label: 'สมชาย ทนาย' }]);
    await svc.handle(sessionState, 'สมชาย ทนาย');
    expect(sessionState.step).toBe(ConversationStep.ADVANCE_AMOUNT);
    await svc.handle(sessionState, '5,000');
    expect(sessionState.step).toBe(ConversationStep.ADVANCE_NOTE);
    await svc.handle(sessionState, 'ข้าม');
    expect(sessionState.step).toBe(ConversationStep.ADVANCE_CONFIRM);
    await svc.handle(sessionState, 'ยืนยัน');
    expect(cashAdvance.issue).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'owner-1', firmRole: 'OWNER' }),
      { userId: 'u2', amount: 5000, note: undefined },
    );
    expect(store.clear).toHaveBeenCalledWith('L1');
  });
});

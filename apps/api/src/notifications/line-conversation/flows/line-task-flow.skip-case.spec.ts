import { LineTaskFlowService } from './line-task-flow.service';
import { ConversationSession, ConversationStep, FlowType } from '../line-conversation.types';

describe('LineTaskFlowService — task outside a case', () => {
  const tasks = { create: jest.fn().mockResolvedValue({ id: 't1' }) } as any;
  const cases = { findAll: jest.fn() } as any;
  const users = { findAllByFirm: jest.fn().mockResolvedValue({ items: [], hasMore: false }) } as any;
  const line = { replyWithQuickReply: jest.fn(), pushTo: jest.fn() } as any;
  const notify = { notifyCreated: jest.fn() } as any;
  const authContext = {
    resolve: jest.fn().mockResolvedValue({ id: 'u1', firmId: 'f1', firmRole: 'OWNER' }),
  } as any;

  let sessionState: ConversationSession;
  const store = {
    update: jest.fn((_id: string, patch: Partial<ConversationSession>) => {
      sessionState = { ...sessionState, ...patch } as ConversationSession;
      return sessionState;
    }),
    clear: jest.fn(),
  } as any;

  beforeEach(() => {
    jest.clearAllMocks();
    sessionState = {
      lineUserId: 'L1',
      userId: 'u1',
      firmId: 'f1',
      flowType: FlowType.TASK,
      step: ConversationStep.TASK_CASE_SEARCH,
      data: {},
      target: { sourceType: 'user' },
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
  });

  it('"ข้าม" skips the case search and the task is created with caseId null', async () => {
    const svc = new LineTaskFlowService(tasks, cases, users, line, notify, store, authContext);
    await svc.handle(sessionState, 'ข้าม');
    expect(sessionState.step).toBe(ConversationStep.TASK_TITLE);
    expect(cases.findAll).not.toHaveBeenCalled();

    sessionState.step = ConversationStep.TASK_CONFIRM;
    sessionState.data = { title: 'ซื้อแสตมป์', assigneeId: 'u1' };
    await svc.handle(sessionState, 'ยืนยัน');
    expect(tasks.create).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'u1', firmRole: 'OWNER' }),
      null,
      expect.objectContaining({ title: 'ซื้อแสตมป์' }),
      expect.anything(),
    );
    expect(notify.notifyCreated).toHaveBeenCalledWith(
      expect.objectContaining({ entityPath: '/todos' }),
    );
  });
});

import { LineTaskReviewFlowService } from './flows/line-task-review-flow.service';
import { ConversationStep, FlowType } from './line-conversation.types';

const ID = '11111111-2222-3333-4444-555555555555';

describe('LineTaskReviewFlowService', () => {
  const tasks = { handoffById: jest.fn(), rejectById: jest.fn() } as any;
  const line = { replyWithQuickReply: jest.fn(), pushTo: jest.fn() } as any;
  const store = { update: jest.fn(), clear: jest.fn() } as any;
  const auth = { resolve: jest.fn().mockResolvedValue({ id: 'u1', firmId: 'f1' }) } as any;
  const session = (step: ConversationStep) => ({
    lineUserId: 'L1', userId: 'u1', firmId: 'f1', flowType: FlowType.TASK_REVIEW, step,
    data: { taskId: ID }, target: { replyToken: 'rt', sourceType: 'user' as const }, createdAt: 0, updatedAt: 0,
  });
  let flow: LineTaskReviewFlowService;

  beforeEach(() => {
    jest.clearAllMocks();
    flow = new LineTaskReviewFlowService(tasks, line, store, auth);
  });

  it('asks for the handoff note and stores the step', async () => {
    await flow.begin(session(ConversationStep.SELECT_ACTION), 'handoff', ID);
    expect(store.update).toHaveBeenCalledWith('L1', { flowType: FlowType.TASK_REVIEW, step: ConversationStep.TASK_HANDOFF_NOTE, data: { taskId: ID } });
    expect(line.replyWithQuickReply).toHaveBeenCalledWith('rt', expect.stringContaining('หมายเหตุ'), expect.anything());
  });

  it('refuses a note shorter than 5 characters and keeps waiting', async () => {
    await flow.handle(session(ConversationStep.TASK_HANDOFF_NOTE), ' ok ');
    expect(tasks.handoffById).not.toHaveBeenCalled();
    expect(store.clear).not.toHaveBeenCalled();
    expect(line.replyWithQuickReply).toHaveBeenCalledWith('rt', expect.stringContaining('5'), expect.anything());
  });

  it('hands off with the note as the tapper and ends the flow', async () => {
    tasks.handoffById.mockResolvedValue({ title: 'ร่างคำฟ้อง' });
    await flow.handle(session(ConversationStep.TASK_HANDOFF_NOTE), 'ร่างเสร็จ แนบไฟล์แล้ว');
    expect(tasks.handoffById).toHaveBeenCalledWith(ID, { id: 'u1', firmId: 'f1' }, 'ร่างเสร็จ แนบไฟล์แล้ว');
    expect(store.clear).toHaveBeenCalledWith('L1');
  });

  it('sends back with the reason', async () => {
    tasks.rejectById.mockResolvedValue({ title: 'ร่างคำฟ้อง' });
    await flow.handle(session(ConversationStep.TASK_REJECT_REASON), 'แก้ทุนทรัพย์ข้อ 2');
    expect(tasks.rejectById).toHaveBeenCalledWith(ID, { id: 'u1', firmId: 'f1' }, 'แก้ทุนทรัพย์ข้อ 2');
  });

  it('reports a refusal from the service and ends the flow', async () => {
    tasks.handoffById.mockRejectedValue(new Error('งานนี้ต้องแนบไฟล์ผลงานก่อนส่งตรวจ'));
    await flow.handle(session(ConversationStep.TASK_HANDOFF_NOTE), 'ส่งตรวจครับผม');
    expect(line.replyWithQuickReply).toHaveBeenCalledWith('rt', expect.stringContaining('แนบไฟล์'), expect.anything());
    expect(store.clear).toHaveBeenCalledWith('L1');
  });
});

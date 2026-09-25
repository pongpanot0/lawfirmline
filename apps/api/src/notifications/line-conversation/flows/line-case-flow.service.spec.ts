import { CourtLevel } from '@lawfirm/shared';
import { TaskSource } from '../../../generated/prisma';
import { ConversationStep, FlowType } from '../line-conversation.types';
import { LineCaseFlowService } from './line-case-flow.service';

describe('LINE create Case', () => {
  it('creates a Case, links its deadline task, and points the message to the Case', async () => {
    const cases = { create: jest.fn(async () => ({ id: 'case-1', ownRef: 'REF20260001' })) } as any;
    const tasks = { create: jest.fn(async () => ({})) } as any;
    const line = { replyWithQuickReply: jest.fn(async () => true) } as any;
    const notify = { notifyCreated: jest.fn(async () => undefined) } as any;
    const store = { clear: jest.fn() } as any;
    const authUser = { id: 'author', firmId: 'firm-a', firmRole: 'OWNER' } as any;
    const auth = { resolve: jest.fn(async () => authUser) } as any;
    const flow = new LineCaseFlowService(cases, tasks, {} as any, {} as any, line, notify, store, auth);
    const session = {
      lineUserId: 'line-author', userId: 'author', firmId: 'firm-a',
      flowType: FlowType.CASE, step: ConversationStep.CASE_CONFIRM,
      data: { title: 'คดีทดสอบ', clientName: 'ลูกความ', assignedUserIds: ['lead', 'buddy'],
        assignedUserLabels: ['ทนายหลัก', 'ทีม'], deadlineDate: '2026-10-01' },
      target: { sourceType: 'user', replyToken: 'reply' }, createdAt: 0, updatedAt: 0,
    } as const;

    await flow.handle(session, 'ยืนยัน');

    expect(cases.create).toHaveBeenCalledWith(authUser, expect.objectContaining({
      title: 'คดีทดสอบ', courtLevel: CourtLevel.TRIAL, leadLawyerId: 'lead', buddyIds: ['buddy'],
    }));
    expect(tasks.create).toHaveBeenCalledWith(authUser, 'case-1', expect.objectContaining({
      dueDate: '2026-10-01T23:59:00+07:00', assigneeId: 'lead',
    }), TaskSource.LINE);
    expect(notify.notifyCreated).toHaveBeenCalledWith(expect.objectContaining({ entityPath: '/cases/case-1' }));
    expect(line.replyWithQuickReply).toHaveBeenCalledWith('reply', expect.stringContaining('REF20260001'), expect.any(Array));
  });
});

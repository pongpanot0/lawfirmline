import type { AuthUser } from '@lawfirm/shared';
import { AppFeedbackService } from '../../app-feedback/app-feedback.service';
import { LineBotRouterService } from './line-bot-router.service';
import { LineConversationStoreService } from './line-conversation-store.service';
import { ConversationStep, FlowType } from './line-conversation.types';

const dm = { sourceType: 'user' as const, replyToken: 'rt' };
const user = { id: 'u1', firmId: 'f1' } as AuthUser;

describe('LINE app feedback', () => {
  let router: LineBotRouterService;
  let store: LineConversationStoreService;
  let feedback: AppFeedbackService;
  let db: any;
  let line: any;
  let flow: any;
  let secretary: any;
  beforeEach(() => {
    store = new LineConversationStoreService();
    db = {
      appFeedbackLineRound: { findUnique: jest.fn().mockResolvedValue({ id: 'r1' }) },
      appFeedback: { upsert: jest.fn().mockResolvedValue({ id: 'fb1' }), updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    };
    line = { replyWithQuickReply: jest.fn().mockResolvedValue(true), pushTo: jest.fn().mockResolvedValue(true), replyHomeMenu: jest.fn(), showLoading: jest.fn() };
    feedback = new AppFeedbackService(db, {} as any, line);
    flow = { handle: jest.fn(), start: jest.fn() };
    secretary = { history: jest.fn().mockResolvedValue([]), chat: jest.fn().mockResolvedValue({ reply: 'AI', cards: [] }) };
    router = new LineBotRouterService(line, { resolve: jest.fn().mockResolvedValue(user) } as any, store,
      flow, flow, flow, flow, flow, {} as any, {} as any, { originForSlug: () => 'https://example.com' } as any, flow,
      { handle: jest.fn().mockResolvedValue(null) } as any,
      { caseQuery: jest.fn().mockReturnValue(null) } as any, flow, secretary, {} as any, feedback);
  });

  function start(flowType = FlowType.APP_FEEDBACK, target = dm) {
    return store.start({ lineUserId: 'L1', userId: 'u1', firmId: 'f1', flowType, step: ConversationStep.APP_FEEDBACK_DETAIL, data: { feedbackId: 'fb1' }, target });
  }

  it('a tap starts a ten-minute detail session with exact copy; the next text saves and clears it', async () => {
    await router.route('L1', 'fbk:r1:1', dm, false);
    expect(store.get('L1')).toMatchObject({ flowType: FlowType.APP_FEEDBACK, step: ConversationStep.APP_FEEDBACK_DETAIL, data: { feedbackId: 'fb1' } });
    expect(line.replyWithQuickReply).toHaveBeenCalledWith('rt', 'ขอบคุณครับ 🙏 อยากเล่ารายละเอียดเพิ่มไหม? พิมพ์ตอบได้เลย หรือข้ามก็ได้ครับ', undefined);
    await router.route('L1', 'ก'.repeat(501), dm, false);
    expect(db.appFeedback.updateMany).toHaveBeenCalledWith({ where: { id: 'fb1', userId: 'u1', source: 'LINE', kind: 'RATING' }, data: { message: 'ก'.repeat(500) } });
    expect(store.get('L1')).toBeUndefined();
    expect(line.replyWithQuickReply).toHaveBeenLastCalledWith('rt', 'บันทึกแล้ว ขอบคุณครับ', undefined);
  });

  it('typing ข้าม ends the session without saving it as the comment', async () => {
    await router.route('L1', 'fbk:r1:2', dm, false);
    await router.route('L1', ' ข้าม ', dm, false);
    expect(db.appFeedback.updateMany).not.toHaveBeenCalled();
    expect(store.get('L1')).toBeUndefined();
    expect(line.replyWithQuickReply).toHaveBeenLastCalledWith('rt', 'รับทราบครับ ขอบคุณครับ', undefined);
  });

  it('a second tap changes the same answer and keeps the detail prompt', async () => {
    await router.route('L1', 'fbk:r1:1', dm, false);
    await router.route('L1', 'fbk:r1:3', dm, false);
    expect(db.appFeedback.upsert.mock.calls[1][0]).toMatchObject({ where: { lineRoundId_userId: { lineRoundId: 'r1', userId: 'u1' } }, update: { rating: 3 } });
    expect(store.get('L1')?.flowType).toBe(FlowType.APP_FEEDBACK);
  });

  it('a tap in any other flow saves the rating and leaves that flow untouched', async () => {
    const active = start(FlowType.EXPENSE);
    await router.route('L1', 'fbk:r1:2', dm, false);
    expect(db.appFeedback.upsert).toHaveBeenCalled();
    expect(store.get('L1')).toBe(active);
    expect(line.replyWithQuickReply).toHaveBeenCalledWith('rt', 'ขอบคุณครับ 🙏', undefined);
    expect(flow.handle).not.toHaveBeenCalled();
  });

  it('does not replace a flow in another chat; acknowledgements go only to the private chat', async () => {
    const active = start(FlowType.CASE, { sourceType: 'group', groupId: 'G1' } as any);
    await router.route('L1', 'fbk:r1:2', dm, false);
    expect(store.get('L1')).toBe(active);
    await router.route('L1', 'fbk:r1:3', { sourceType: 'group', groupId: 'G1', replyToken: 'group-token' }, true);
    expect(line.pushTo).toHaveBeenCalledWith('L1', 'ขอบคุณครับ 🙏', undefined);
    expect(line.replyWithQuickReply).not.toHaveBeenCalledWith('group-token', expect.anything(), expect.anything());
  });

  it('ignores a tap for a round that no longer exists', async () => {
    db.appFeedbackLineRound.findUnique.mockResolvedValue(null);
    await router.route('L1', 'fbk:unknown:1', dm, false);
    expect(db.appFeedback.upsert).not.toHaveBeenCalled();
    expect(store.get('L1')).toBeUndefined();
    expect(line.replyWithQuickReply).not.toHaveBeenCalled();
    expect(secretary.chat).not.toHaveBeenCalled();
  });

  it.each(['fbk:r1:4', 'fbk:r1:1:extra', 'fbk: ลืมแนบไฟล์'])('treats non-tap text %s as an ordinary message', async (text) => {
    await router.route('L1', text, dm, false);
    expect(db.appFeedback.upsert).not.toHaveBeenCalled();
    expect(secretary.chat).toHaveBeenCalled();
  });

  it.each(['เมนู', 'ยกเลิก', 'เพิ่ม Task'])('%s wins over the detail step', async (text) => {
    start();
    await router.route('L1', text, dm, false);
    expect(db.appFeedback.updateMany).not.toHaveBeenCalled();
    expect(store.get('L1')?.flowType).not.toBe(FlowType.APP_FEEDBACK);
  });

  it('expired feedback sessions return to the normal bot', async () => {
    const active = start();
    active.updatedAt = Date.now() - 10 * 60_000 - 1;
    await router.route('L1', 'ความคิดเห็น', dm, false);
    expect(db.appFeedback.updateMany).not.toHaveBeenCalled();
    expect(secretary.chat).toHaveBeenCalled();
  });

  it('private feedback sessions never consume ambient text from another chat', async () => {
    start();
    await router.route('L1', 'group text', { sourceType: 'group', groupId: 'G1' }, false);
    expect(db.appFeedback.updateMany).not.toHaveBeenCalled();
    expect(store.get('L1')?.flowType).toBe(FlowType.APP_FEEDBACK);
  });
});

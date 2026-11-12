import { NotFoundException } from '@nestjs/common';
import { LineConversationStoreService } from './line-conversation-store.service';
import { LineAiWriteService, savedText } from './line-ai-write.service';

describe('LineAiWriteService — the confirm step', () => {
  const user = { id: 'u1', firmId: 'f1', firmSlug: 'acme' } as any;
  const proposal = { tool: 'create_task' as const, args: { caseId: 'c1', title: 'เตรียมพยาน' }, labels: {} };
  let store: LineConversationStoreService, writes: any, secretary: any, svc: LineAiWriteService;
  beforeEach(() => {
    store = new LineConversationStoreService();
    writes = { run: jest.fn().mockResolvedValue({ id: 't1', caseId: 'c1' }) };
    secretary = { record: jest.fn() };
    svc = new LineAiWriteService(store, writes, secretary, { originForSlug: () => 'https://acme.samnuan.com' } as any);
  });

  it('holds the proposal in the 1:1 chat and saves it once, audited as a LINE AI write', async () => {
    const buttons = svc.hold(user, 'L1', proposal);
    expect(store.get('L1')?.target).toEqual({ sourceType: 'user' });
    const id = /^ai-write:confirm:(.+)$/.exec(buttons[0].data!)![1];
    const [first, second] = await Promise.all([svc.confirm(user, 'L1', id), svc.confirm(user, 'L1', id)]);
    expect(writes.run).toHaveBeenCalledTimes(1);
    expect(writes.run).toHaveBeenCalledWith(user, 'create_task', proposal.args, { auditPrefix: 'line_ai', auditMetadata: { channel: 'line' }, clientName: 'LINE' });
    expect(first).toBe('✅ บันทึกแล้วครับ: สร้างงาน "เตรียมพยาน"\n🔗 https://acme.samnuan.com/cases/c1?task=t1');
    expect(second).toBeNull();
    expect(store.get('L1')).toBeUndefined();
    expect(secretary.record).toHaveBeenCalledWith(user, 'ยืนยัน', first);
  });

  it('an old button never saves a newer proposal', async () => {
    const old = /:([^:]+)$/.exec(svc.hold(user, 'L1', proposal)[0].data!)![1];
    svc.hold(user, 'L1', { ...proposal, args: { title: 'งานใหม่' } });
    expect(await svc.confirm(user, 'L1', old)).toContain('รายการเก่า');
    expect(writes.run).not.toHaveBeenCalled();
    expect(store.get('L1')).toBeDefined();
  });

  it('a relinked LINE account or another firm never inherits the proposal', async () => {
    const id = /:([^:]+)$/.exec(svc.hold(user, 'L1', proposal)[0].data!)![1];
    expect(await svc.confirm({ ...user, id: 'u2' }, 'L1', id)).toContain('หมดอายุ');
    expect(writes.run).not.toHaveBeenCalled();
    expect(store.get('L1')).toBeUndefined();
  });

  it('a refusal at save time is reported, not swallowed', async () => {
    writes.run.mockRejectedValue(new NotFoundException('ไม่พบคดีนี้ในงานของคุณ'));
    const id = /:([^:]+)$/.exec(svc.hold(user, 'L1', proposal)[0].data!)![1];
    expect(await svc.confirm(user, 'L1', id)).toBe('บันทึกไม่สำเร็จครับ: ไม่พบคดีนี้ในงานของคุณ');
  });

  it('links each write to where it can be opened', () => {
    const o = 'https://x';
    expect(savedText({ tool: 'draft_expense', args: { amount: 1 }, labels: {} }, { id: 'e1', caseId: null }, o)).toContain('https://x/expenses');
    expect(savedText({ tool: 'complete_task', args: {}, labels: { task: 'ประชุม' } }, { id: 't2', caseId: null }, o)).toBe('✅ ปิดงาน "ประชุม" แล้วครับ\n🔗 https://x/todos?task=t2');
    expect(savedText({ tool: 'draft_notice', args: {}, labels: {} }, { intakeId: 'i1', caseId: undefined }, o)).toContain('https://x/intake/i1');
  });
});

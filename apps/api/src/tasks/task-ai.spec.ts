import { parseTaskAiResult } from './task-ai';

describe('task AI source grounding', () => {
  const comments = [{ id: 'source-1', body: 'แจ้งลูกค้าแล้ว แต่ยังไม่ได้รับหนังสือมอบอำนาจครับ' }];

  it('keeps a suggestion only when its quote is in the task comment', () => {
    const input = { status: 'blocker', sourceCommentId: 'source-1', quote: 'ยังไม่ได้รับหนังสือมอบอำนาจ', blocker: 'รอหนังสือมอบอำนาจ', title: 'ติดตามเอกสาร', description: 'โทรติดตามลูกค้า' };
    expect(parseTaskAiResult(JSON.stringify(input), comments)).toMatchObject(input);
    expect(parseTaskAiResult(JSON.stringify({ ...input, quote: 'ลูกค้ายืนยันส่งแล้ว' }), comments)).toEqual({ status: 'insufficient' });
    expect(parseTaskAiResult(JSON.stringify({ ...input, sourceCommentId: 'other-task' }), comments)).toEqual({ status: 'insufficient' });
    for (const invalid of ['null', '[]', 'false', '{']) expect(parseTaskAiResult(invalid, comments)).toEqual({ status: 'insufficient' });
  });
});

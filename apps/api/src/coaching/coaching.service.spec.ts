import { AuthUser } from '@lawfirm/shared';
import { CoachingService } from './coaching.service';

const now = new Date('2026-11-13T01:00:00Z');
const user = { id: 'manager', firmId: 'f1', firmRole: 'OWNER' } as AuthUser;
const recipient = { ...user, id: 'u1', firmRole: 'LAWYER' } as AuthUser;
const taskId = '11111111-1111-4111-8111-111111111111';
const unknownId = '22222222-2222-4222-8222-222222222222';
const draft = { praise: 'เตรียมคำร้องได้ชัดเจน', improve: 'ตรวจคำร้องให้ครบ', nextStep: 'ตรวจคำร้องวันนี้', linkedTaskIds: [taskId, unknownId] };
const note = (over = {}) => ({ id: 'n1', firmId: 'f1', userId: 'u1', authorId: 'manager', praise: 'ชม', improve: 'ปรับ', nextStep: 'ทำ', linkedTaskIds: [], aiDrafted: false,
  acknowledgedAt: null, reply: null, createdAt: now, user: { id: 'u1', firstName: 'เอ', lastName: 'บี' }, author: { id: 'manager', firstName: 'หัวหน้า', lastName: 'ทีม' }, ...over });
function build(configured = true) {
  const db = {
    firmMember: { count: jest.fn().mockResolvedValue(1), findMany: jest.fn().mockResolvedValue([{ userId: 'u1' }, { userId: 'u2' }]), findUnique: jest.fn().mockResolvedValue({ userId: 'u1' }) },
    task: { count: jest.fn().mockResolvedValue(1), findMany: jest.fn().mockResolvedValue([]) },
    taskComment: { findMany: jest.fn().mockResolvedValue([]) },
    dailyStandup: { findMany: jest.fn().mockResolvedValue([]), create: jest.fn() },
    coachingNote: { create: jest.fn().mockResolvedValue(note()), findMany: jest.fn().mockResolvedValue([]), findFirst: jest.fn().mockResolvedValue(note()),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }), count: jest.fn().mockResolvedValue(0), groupBy: jest.fn().mockResolvedValue([]) },
    notification: { create: jest.fn() },
    client: { findMany: jest.fn().mockResolvedValue([{ name: 'บริษัทลับมาก' }]) },
    clientContact: { findMany: jest.fn().mockResolvedValue([{ name: 'คุณลูกความ', nickname: null }]) },
    caseParticipant: { findMany: jest.fn().mockResolvedValue([{ name: 'นายคู่ความ', nickname: null, opposingLawyer: null, opposingInsurer: null }]) },
    case: { findMany: jest.fn().mockResolvedValue([{ clientName: 'ชื่อคดีลับ' }]) },
    intake: { findMany: jest.fn().mockResolvedValue([{ clientName: 'ชื่อรับเข้า', opposingParty: 'ฝ่ายตรงข้าม' }]) },
    $transaction: jest.fn(),
  };
  db.$transaction.mockImplementation(async (fn: any) => fn(db));
  const config = { get: jest.fn((key: string) => key === 'OPENAI_API_KEY' ? configured ? 'sk-test' : undefined : undefined) };
  const rag = { logRun: jest.fn().mockResolvedValue(undefined) };
  const notifier = { record: jest.fn().mockResolvedValue({ id: 'notification' }), send: jest.fn().mockResolvedValue(undefined) };
  return { db, config, rag, notifier, svc: new CoachingService(db as never, config as never, rag as never, notifier as never) };
}
const response = (content: unknown) => ({ ok: true, json: async () => ({ choices: [{ message: { content: typeof content === 'string' ? content : JSON.stringify(content) } }], usage: { prompt_tokens: 20, completion_tokens: 10 } }) }) as Response;

describe('CoachingService', () => {
  let fetchSpy: jest.SpyInstance;
  beforeEach(() => { jest.useFakeTimers().setSystemTime(now); fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue(response(draft)); });
  afterEach(() => { fetchSpy.mockRestore(); jest.useRealTimers(); });

  it('draft redacts identifiers and known client/party names in all free text; usage is the only write', async () => {
    const { db, rag, notifier, svc } = build();
    db.taskComment.findMany.mockResolvedValue([{ taskId, kind: 'DAILY_UPDATE', body: 'บริษัทลับมาก คุณลูกความ นายคู่ความ ชื่อคดีลับ ชื่อรับเข้า ฝ่ายตรงข้าม โทร 0812345678 ส่ง client@example.com', createdAt: now }]);
    db.dailyStandup.findMany.mockResolvedValue([{ todayTaskIds: [taskId], yesterdayTaskIds: [], todayNote: 'บริษัทลับมาก', blocker: 'นายคู่ความ' }]);
    db.task.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([{ id: taskId, title: 'คำร้อง บริษัทลับมาก', case: { ownRef: 'CASE-1' } }]);
    const result = await svc.draft(user, 'u1');
    expect(result.linkedTasks).toEqual([{ id: taskId, title: 'คำร้อง บริษัทลับมาก', caseRef: 'CASE-1' }]);
    const call = fetchSpy.mock.calls[0][1]; const body = JSON.parse(call.body);
    const input = body.messages[1].content;
    for (const secret of ['บริษัทลับมาก', 'คุณลูกความ', 'นายคู่ความ', 'ชื่อคดีลับ', 'ชื่อรับเข้า', 'ฝ่ายตรงข้าม', '0812345678', 'client@example.com']) expect(input).not.toContain(secret);
    expect(input).toContain('[ชื่อคู่ความ]'); expect(input).toContain('[เบอร์โทร]'); expect(input).toContain('[อีเมล]');
    expect(body.response_format.json_schema.strict).toBe(true); expect(call.signal).toBeDefined();
    expect(rag.logRun).toHaveBeenCalledWith(expect.objectContaining({ operation: 'coaching_draft', firmId: 'f1', userId: 'manager', status: 'success', inputTokens: 20, outputTokens: 10 }));
    expect(db.coachingNote.create).not.toHaveBeenCalled(); expect(db.dailyStandup.create).not.toHaveBeenCalled();
    expect(db.notification.create).not.toHaveBeenCalled(); expect(db.$transaction).not.toHaveBeenCalled(); expect(notifier.record).not.toHaveBeenCalled();
    expect(db.taskComment.findMany.mock.calls[0][0]).toMatchObject({ where: { authorId: 'u1', createdAt: { gte: new Date('2026-10-30T01:00:00Z'), lte: now }, task: { AND: [expect.anything()] }, OR: [{ kind: 'DAILY_UPDATE' }, { task: { assigneeId: 'u1' } }] } });
    expect(db.dailyStandup.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { firmId: 'f1', userId: 'u1' }, take: 10, orderBy: { day: 'desc' } }));
  });

  it('computes open points, overdue tasks and eight Bangkok weeks without the operations service', async () => {
    const { db, svc } = build();
    db.task.findMany.mockResolvedValueOnce([
      { id: taskId, status: 'TODO', size: 'L', dueDate: new Date('2026-11-12'), completedAt: null },
      { id: 'review', status: 'PENDING_REVIEW', size: 'L', dueDate: new Date('2026-11-12'), completedAt: null },
      { id: 'done', status: 'DONE', size: 'M', dueDate: null, completedAt: new Date('2026-11-12T02:00:00Z') },
      { id: 'older', status: 'DONE', size: 'S', dueDate: null, completedAt: new Date('2026-11-08T16:59:00Z') },
    ]).mockResolvedValueOnce([{ id: taskId, title: 'คำร้อง', case: null }]);
    await svc.draft(user, 'u1'); const input = JSON.parse(JSON.parse(fetchSpy.mock.calls[0][1].body).messages[1].content);
    expect(input.stats).toMatchObject({ openPoints: 4, standardPoints: 10, overdueCount: 1 });
    expect(input.stats.finishedPointsPerWeek).toHaveLength(8);
    expect(input.stats.finishedPointsPerWeek.slice(-2)).toEqual([{ weekStart: '2026-11-02', finishedPoints: 1 }, { weekStart: '2026-11-09', finishedPoints: 2 }]);
  });

  it.each(['not JSON', '{"praise":"only"}', JSON.stringify({ ...draft, nextStep: '', extra: true })])('returns 502 for invalid draft %s and logs error', async (content) => {
    const { svc, rag, db } = build(); fetchSpy.mockResolvedValue(response(content));
    await expect(svc.draft(user, 'u1')).rejects.toMatchObject({ status: 502 });
    expect(rag.logRun).toHaveBeenCalledWith(expect.objectContaining({ status: 'error' })); expect(db.coachingNote.create).not.toHaveBeenCalled();
  });
  it('drops unknown task ids and de-duplicates valid ids', async () => {
    const { db, svc } = build(); db.task.findMany.mockResolvedValueOnce([{ id: taskId, status: 'TODO', size: 'M' }]).mockResolvedValueOnce([{ id: taskId, title: 'งาน', case: null }]);
    fetchSpy.mockResolvedValue(response({ ...draft, linkedTaskIds: [unknownId, taskId, taskId] }));
    expect((await svc.draft(user, 'u1')).linkedTasks).toEqual([{ id: taskId, title: 'งาน', caseRef: null }]);
  });
  it('returns Thai 503 when OpenAI is not configured, with no model call', async () => {
    const { svc, rag } = build(false); await expect(svc.draft(user, 'u1')).rejects.toMatchObject({ status: 503, message: expect.stringContaining('ยังไม่ได้ตั้งค่า AI') });
    expect(fetchSpy).not.toHaveBeenCalled(); expect(rag.logRun).not.toHaveBeenCalled();
  });
  it('rejects a draft recipient outside the firm before reading or sending any input', async () => {
    const { db, svc } = build(); db.firmMember.count.mockResolvedValue(0);
    await expect(svc.draft(user, 'foreign')).rejects.toThrow('ไม่ได้อยู่ในสำนักงาน');
    expect(fetchSpy).not.toHaveBeenCalled(); expect(db.taskComment.findMany).not.toHaveBeenCalled();
  });
  it.each(['http', 'network'])('returns 502 and records model failure: %s', async (failure) => {
    const { svc, rag } = build();
    if (failure === 'http') fetchSpy.mockResolvedValue({ ok: false, status: 429 }); else fetchSpy.mockRejectedValue(new Error('offline'));
    await expect(svc.draft(user, 'u1')).rejects.toMatchObject({ status: 502 });
    expect(rag.logRun).toHaveBeenCalledWith(expect.objectContaining({ status: 'error' }));
  });

  it('save checks body refs then commits the note and recipient notification together, followed by push', async () => {
    const { db, notifier, svc } = build();
    const dto = { userId: 'u1', praise: 'ชม', improve: 'ปรับ', nextStep: 'ทำ', linkedTaskIds: [], aiDrafted: true };
    expect(await svc.save(user, dto)).toMatchObject({ id: 'n1', user: { id: 'u1' } });
    expect(db.coachingNote.create).toHaveBeenCalledWith(expect.objectContaining({ data: { firmId: 'f1', authorId: 'manager', ...dto } }));
    expect(notifier.record).toHaveBeenCalledWith(db, 'f1', 'u1', 'COACHING', expect.any(String), '/coaching/mine');
    expect(notifier.send).toHaveBeenCalledWith({ id: 'notification' }); expect(fetchSpy).not.toHaveBeenCalled();
  });
  it('rejects a linked task in another firm without saving', async () => {
    const { db, svc } = build(); db.task.count.mockResolvedValue(0);
    await expect(svc.save(user, { userId: 'u1', praise: 'ชม', improve: 'ปรับ', nextStep: 'ทำ', linkedTaskIds: ['foreign'], aiDrafted: false })).rejects.toThrow('ไม่อยู่ในสำนักงาน');
    expect(db.$transaction).not.toHaveBeenCalled();
  });
  it('only the recipient can acknowledge within their firm', async () => {
    const { db, svc } = build(); db.coachingNote.findFirst.mockResolvedValue(note({ acknowledgedAt: now, reply: 'ขอบคุณ' }));
    expect(await svc.acknowledge(recipient, 'n1', ' ขอบคุณ ')).toMatchObject({ acknowledgedAt: now.toISOString(), reply: 'ขอบคุณ' });
    expect(db.coachingNote.updateMany).toHaveBeenCalledWith({ where: { id: 'n1', firmId: 'f1', userId: 'u1', acknowledgedAt: null }, data: { acknowledgedAt: now, reply: 'ขอบคุณ' } });
    expect(db.coachingNote.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'n1', firmId: 'f1', userId: 'u1' } }));
  });
  it.each([{ ...user, id: 'other' }, { ...recipient, firmId: 'other-firm' }])('returns 404 when a non-recipient/other firm tries acknowledge', async (caller) => {
    const { db, svc } = build(); db.coachingNote.updateMany.mockResolvedValue({ count: 0 }); db.coachingNote.findFirst.mockResolvedValue(null);
    await expect(svc.acknowledge(caller as AuthUser, 'n1')).rejects.toMatchObject({ status: 404 });
  });
  it('acknowledgement retry does not overwrite the first reply', async () => {
    const { db, svc } = build(); db.coachingNote.updateMany.mockResolvedValue({ count: 0 }); db.coachingNote.findFirst.mockResolvedValue(note({ acknowledgedAt: now, reply: 'เดิม' }));
    expect((await svc.acknowledge(recipient, 'n1', 'ใหม่')).reply).toBe('เดิม');
  });
  it('list returns firm-wide summary counts independent of the note filters', async () => {
    const { db, svc } = build();
    db.coachingNote.count.mockResolvedValueOnce(4).mockResolvedValueOnce(2);
    db.coachingNote.findMany.mockResolvedValueOnce([note()]).mockResolvedValueOnce([{ userId: 'u1' }]);
    const result = await svc.list(user, { userId: 'u1', status: 'pending' });
    expect(result.summary).toEqual({ sentThisMonth: 4, awaitingAck: 2, notCoached30d: 1 });
    expect(result.notes).toHaveLength(1);
    expect(db.coachingNote.findMany.mock.calls[0][0]).toMatchObject({ where: { firmId: 'f1', userId: 'u1', acknowledgedAt: null } });
    expect(db.coachingNote.count.mock.calls[0][0]).toEqual({ where: { firmId: 'f1', createdAt: { gte: new Date('2026-10-31T17:00:00Z') } } });
    expect(db.firmMember.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { firmId: 'f1', role: { not: 'EXTERNAL' } } }));
  });
  it('acknowledged filter and mine/member queries remain firm scoped', async () => {
    const { db, svc } = build(); await svc.list(user, { status: 'acknowledged' });
    expect(db.coachingNote.findMany.mock.calls[0][0]).toMatchObject({ where: { firmId: 'f1', acknowledgedAt: { not: null } } });
    await svc.mine(recipient);
    expect(db.coachingNote.findMany).toHaveBeenLastCalledWith(expect.objectContaining({ where: { firmId: 'f1', userId: 'u1' } }));
    db.firmMember.findUnique.mockResolvedValue(null); await expect(svc.member(user, 'foreign')).rejects.toMatchObject({ status: 404 });
  });
  it('batch cues use grouped firm-scoped queries and include users with no notes', async () => {
    const { db, svc } = build(); db.coachingNote.groupBy.mockResolvedValueOnce([{ userId: 'u1', _max: { createdAt: now } }]).mockResolvedValueOnce([{ userId: 'u1', _count: { _all: 2 } }]);
    expect(await svc.cuesFor('f1', ['u1', 'u2'])).toEqual(new Map([['u1', { unacknowledged: 2, lastSentAt: now.toISOString() }], ['u2', { unacknowledged: 0, lastSentAt: null }]]));
    expect(db.coachingNote.groupBy.mock.calls[0][0]).toMatchObject({ where: { firmId: 'f1', userId: { in: ['u1', 'u2'] } } });
    expect(await svc.cuesFor('f1', [])).toEqual(new Map()); expect(db.coachingNote.groupBy).toHaveBeenCalledTimes(2);
  });
});

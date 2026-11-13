import { CaseAccessService } from '../common/services/case-access.service';
import { AuthUser } from '@lawfirm/shared';
import { StandupService } from './standup.service';

const user = { id: 'u1', firmId: 'f1', firmRole: 'LAWYER' } as AuthUser;
const now = new Date('2026-11-13T01:00:00Z');
const row = (over = {}) => ({ id: 's1', firmId: 'f1', userId: 'u1', day: new Date('2026-11-13T00:00:00Z'), status: 'CHECKED_IN',
  yesterdayTaskIds: [], todayTaskIds: [], yesterdayNote: null, todayNote: null, blocker: null, updatedAt: now, ...over });
function build() {
  const db = {
    firmMember: { findMany: jest.fn().mockResolvedValue([{ userId: 'u1', role: 'LAWYER' }]), findUnique: jest.fn().mockResolvedValue({ userId: 'u1' }) },
    leaveRequest: { findMany: jest.fn().mockResolvedValue([]) },
    publicHoliday: { findUnique: jest.fn().mockResolvedValue(null), findMany: jest.fn().mockResolvedValue([]) },
    task: { count: jest.fn().mockResolvedValue(1), findMany: jest.fn().mockResolvedValue([]) },
    dailyStandup: { findMany: jest.fn().mockResolvedValue([]), findUnique: jest.fn().mockResolvedValue(null),
      upsert: jest.fn(async ({ create, update }: any) => row({ ...create, ...update })) },
  };
  return { db, svc: new StandupService(db as never, new CaseAccessService(db as never)) };
}

describe('StandupService', () => {
  beforeEach(() => jest.useFakeTimers().setSystemTime(now));
  afterEach(() => jest.useRealTimers());

  it('upserts today as CHECKED_IN and is editable', async () => {
    const { db, svc } = build();
    const dto = { yesterdayTaskIds: [], todayTaskIds: ['t1'], todayNote: ' แผน ', blocker: '  ' };
    const result = await svc.upsert(user, dto);
    expect(result).toMatchObject({ day: '2026-11-13', status: 'CHECKED_IN', todayNote: 'แผน', blocker: null });
    expect(db.dailyStandup.upsert.mock.calls[0][0]).toMatchObject({ where: { firmId_userId_day: { firmId: 'f1', userId: 'u1', day: new Date('2026-11-13T00:00:00Z') } }, update: { status: 'CHECKED_IN', todayTaskIds: ['t1'] } });
    await svc.upsert(user, { ...dto, todayNote: 'แก้ไข' });
    expect(db.dailyStandup.upsert).toHaveBeenCalledTimes(2);
    expect(db.task.count.mock.calls[0][0]).toMatchObject({ where: { AND: [expect.anything(), { id: { in: ['t1'] } }] } });
    expect(db.task.count.mock.calls[1][0]).toMatchObject({ where: { AND: [expect.anything(), { id: { in: ['t1'] }, assigneeId: 'u1' }] } });
  });

  it('rejects another firm task before any write', async () => {
    const { db, svc } = build(); db.task.count.mockResolvedValue(0);
    await expect(svc.upsert(user, { yesterdayTaskIds: ['foreign'], todayTaskIds: [] })).rejects.toThrow('ไม่อยู่ในสำนักงาน');
    expect(db.dailyStandup.upsert).not.toHaveBeenCalled();
  });

  it('rejects a firm task assigned to somebody else', async () => {
    const { db, svc } = build(); db.task.count.mockResolvedValueOnce(1).mockResolvedValueOnce(0);
    await expect(svc.upsert(user, { yesterdayTaskIds: [], todayTaskIds: ['t1'] })).rejects.toThrow('มอบหมายให้คุณ');
    expect(db.dailyStandup.upsert).not.toHaveBeenCalled();
  });

  it('skips and clears yesterday/today/blocker without validating tasks', async () => {
    const { db, svc } = build();
    expect(await svc.skip(user)).toMatchObject({ status: 'SKIPPED', yesterday: [], today: [], blocker: null });
    expect(db.task.count).not.toHaveBeenCalled();
  });

  it('returns a hidden card for approved leave', async () => {
    const { db, svc } = build(); db.leaveRequest.findMany.mockResolvedValue([{ userId: 'u1' }]);
    expect(await svc.today(user)).toMatchObject({ required: false, state: 'on_leave', entry: null });
    expect(db.leaveRequest.findMany.mock.calls[0][0]).toMatchObject({ where: { firmId: 'f1', status: 'APPROVED', startDate: { lte: new Date('2026-11-13') }, endDate: { gte: new Date('2026-11-13') } } });
  });

  it.each([
    [null, 'not_yet'], [row(), 'checked_in'], [row({ blocker: 'รอเอกสาร' }), 'blocked'], [row({ blocker: '  ' }), 'checked_in'], [row({ status: 'SKIPPED', blocker: 'เก่า' }), 'skipped'],
  ])('derives state from the entry %j', async (entry, state) => {
    const { db, svc } = build(); db.dailyStandup.findMany.mockResolvedValue(entry ? [entry] : []);
    expect((await svc.statesFor('f1', ['u1'], '2026-11-13')).get('u1')).toBe(state);
  });

  it('batches all requested users and defaults non-members/non-lawyers to not_required', async () => {
    const { db, svc } = build(); db.firmMember.findMany.mockResolvedValue([{ userId: 'u1', role: 'LAWYER' }, { userId: 'u2', role: 'OWNER' }]);
    expect(await svc.statesFor('f1', ['u1', 'u2', 'unknown'], '2026-11-13')).toEqual(new Map([['u1', 'not_yet'], ['u2', 'not_required'], ['unknown', 'not_required']]));
    expect(db.firmMember.findMany).toHaveBeenCalledTimes(1);
    expect(await svc.statesFor('f1', [], '2026-11-13')).toEqual(new Map());
    expect(db.firmMember.findMany).toHaveBeenCalledTimes(1);
  });

  it.each(['2026-11-14', '2026-11-15'])('does not require weekend %s', async (day) => {
    const { svc } = build(); expect((await svc.statesFor('f1', ['u1'], day)).get('u1')).toBe('not_required');
  });

  it('does not require a public holiday', async () => {
    const { db, svc } = build(); db.publicHoliday.findUnique.mockResolvedValue({ date: new Date('2026-11-13') });
    expect((await svc.statesFor('f1', ['u1'], '2026-11-13')).get('u1')).toBe('not_required');
  });

  it('suggests previous working day updates/completions and today planned/fallback due tasks, capped to DTO size', async () => {
    const { db, svc } = build(); db.publicHoliday.findMany.mockResolvedValue([{ date: new Date('2026-11-13') }]);
    db.task.findMany.mockResolvedValue([{ id: 't1', title: 'เตรียมคำร้อง', case: { ownRef: 'C1' } }]);
    expect(await svc.suggestions(user, '2026-11-16')).toEqual({ yesterday: [{ id: 't1', title: 'เตรียมคำร้อง', caseRef: 'C1' }], today: [{ id: 't1', title: 'เตรียมคำร้อง', caseRef: 'C1' }] });
    const yesterday = db.task.findMany.mock.calls[0][0];
    expect(yesterday).toMatchObject({ take: 20, where: { AND: [expect.anything(), { assigneeId: 'u1', OR: [
      { comments: { some: { authorId: 'u1', kind: 'DAILY_UPDATE', createdAt: { gte: new Date('2026-11-11T17:00:00Z'), lt: new Date('2026-11-12T17:00:00Z') } } } },
      { status: 'DONE', completedAt: { gte: new Date('2026-11-11T17:00:00Z'), lt: new Date('2026-11-12T17:00:00Z') } },
    ] }, expect.anything()] } });
    expect(db.task.findMany.mock.calls[1][0]).toMatchObject({ take: 20, where: { AND: [expect.anything(), { status: { notIn: ['DONE', 'PENDING_REVIEW'] }, OR: [
      { scheduledFor: new Date('2026-11-16') }, { scheduledFor: null, dueDate: { gte: new Date('2026-11-15T17:00:00Z'), lt: new Date('2026-11-16T17:00:00Z') } },
    ] }, expect.anything()] } });
  });

  it('scopes suggestions and history task titles to the viewer case ACL, not the subject', async () => {
    const { db, svc } = build();
    const acl = { OR: [{ caseId: null }, { case: { firmId: 'f1', deletedAt: null, OR: [
      { leadLawyerId: 'u1' }, { assignments: { some: { userId: 'u1' } } }, { tasks: { some: { assigneeId: 'u1' } } },
    ] } }] };
    db.task.findMany.mockResolvedValue([{ id: 't1', title: 'visible task', case: null }]);
    expect(await svc.suggestions(user, '2026-11-13')).toEqual({
      yesterday: [{ id: 't1', title: 'visible task', caseRef: null }], today: [{ id: 't1', title: 'visible task', caseRef: null }],
    });
    db.dailyStandup.findMany.mockResolvedValue([row({ userId: 'other', yesterdayTaskIds: ['hidden'], todayTaskIds: ['t1', 'hidden'] })]);
    const history = await svc.history(user, 'other', 6);
    expect(history[0]).toMatchObject({ yesterday: [], today: [{ id: 't1', title: 'visible task', caseRef: null }] });
    for (const [query] of db.task.findMany.mock.calls) expect(query.where.AND).toEqual(expect.arrayContaining([acl]));
  });

  it('history is firm/member scoped, newest first and limited by calendar days', async () => {
    const { db, svc } = build(); db.dailyStandup.findMany.mockResolvedValue([row()]);
    expect(await svc.history(user, 'u1', 6)).toHaveLength(1);
    expect(db.dailyStandup.findMany.mock.calls[0][0]).toMatchObject({ where: { firmId: 'f1', userId: 'u1', day: { gte: new Date('2026-11-08'), lte: new Date('2026-11-13') } }, orderBy: { day: 'desc' } });
    db.firmMember.findUnique.mockResolvedValue(null);
    await expect(svc.history(user, 'foreign', 6)).rejects.toThrow('ไม่พบสมาชิก');
  });

  it('hydrates only firm-scoped task refs for existing entries', async () => {
    const { db, svc } = build(); db.dailyStandup.findUnique.mockResolvedValue(row({ todayTaskIds: ['t1', 'deleted'] }));
    db.task.findMany.mockResolvedValue([{ id: 't1', title: 'งาน', case: null }]);
    expect((await svc.today(user)).entry?.today).toEqual([{ id: 't1', title: 'งาน', caseRef: null }]);
    expect(db.task.findMany.mock.calls[db.task.findMany.mock.calls.length - 1][0]).toMatchObject({ where: { AND: [expect.anything(), { id: { in: ['t1', 'deleted'] } }, expect.anything()] } });
  });
});

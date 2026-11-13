import { HEAVY_QUEUE_POINTS, TeamRadarMember } from '@lawfirm/shared';
import { buildTeamDigest, NEWCOMER_DAYS, previousWorkingDay, TeamDigestInput, TeamDigestTask } from './team-digest';

const today = new Date('2026-11-09T01:30:00Z');
const member = (userId = 'a') => ({ userId, firstName: userId, lastName: 'ใจดี', role: 'LAWYER', onLeave: false });
const load = (userId = 'a', openPoints = 0, overdueCount = 0, standardPoints?: number): TeamRadarMember & { standardPoints?: number } => ({
  ...member(userId), openPoints, overdueCount, standardPoints, openCount: 1, reviewCount: 0, unscheduledCount: 0, days: [],
});
const task = (overrides: Partial<TeamDigestTask> = {}): TeamDigestTask => ({
  assigneeId: 'a', status: 'IN_PROGRESS', blocker: null, holdReason: null, blockedBy: null, case: null, ...overrides,
});
function input(): TeamDigestInput {
  return { today, board: { members: [member()], tasks: [task()] }, firmName: 'สำนักงานทดสอบ', updates: [],
    radar: { members: [load()] }, joins: [], appUrl: 'https://app.example' };
}
function update(authorId = 'a') {
  return { authorId, caseRef: 'C-1', body: 'ทำถึงไหน: ส่งเอกสาร\nเหลืออะไร: รอรับ\nติดอะไร: ไม่มี' };
}

describe('buildTeamDigest', () => {
  it('orders newcomers, over-standard, overdue, missing-update, then others; ties by name', () => {
    const data = input();
    data.board.members = ['rest', 'missing', 'overdue', 'heavy', 'new', 'aaa'].map(id => member(id));
    data.board.tasks = [task({ assigneeId: 'missing' })];
    data.radar.members = [load('heavy', 11), load('overdue', 2, 1)];
    data.joins = [{ userId: 'new', createdAt: new Date('2026-11-04T03:00:00Z') }];
    const text = buildTeamDigest(data).text;
    const names = ['🆕 new ใจดี', 'heavy ใจดี', 'overdue ใจดี', 'missing ใจดี', 'aaa ใจดี', 'rest ใจดี'];
    expect(names.map(name => text.indexOf(name))).toEqual([...names.map(name => text.indexOf(name))].sort((a, b) => a - b));
    expect(text).toContain('(เข้าใหม่ 5 วัน)');
    expect(text).toContain('คนใหม่ 1 คน');
  });

  it('only flags joins within 30 Bangkok days, including today', () => {
    const data = input();
    expect(NEWCOMER_DAYS).toBe(30);
    data.joins = [{ userId: 'a', createdAt: new Date('2026-10-10T03:00:00Z') }];
    expect(buildTeamDigest(data).text).not.toContain('🆕');
    data.joins[0].createdAt = today;
    expect(buildTeamDigest(data).text).toContain('(เข้าใหม่ 0 วัน)');
  });

  it('shows only the name and leave line for a member on leave', () => {
    const data = input();
    data.board.members[0].onLeave = true;
    data.board.tasks = [task({ blocker: 'ปัญหา' })];
    const lines = buildTeamDigest(data).lines;
    expect(lines.slice(3, -2)).toEqual(['a ใจดี', '🏖️ ลาวันนี้']);
    expect(lines.join('\n')).toContain('ไม่ได้อัปเดต 0 คน');
    data.board.members[0].onLeave = false;
    data.radar.members[0].days = [{ onLeave: true } as TeamRadarMember['days'][number]];
    expect(buildTeamDigest(data).lines.slice(3, -2)).toEqual(['a ใจดี', '🏖️ ลาวันนี้']);
  });

  it('matches comments by author even if the task is now done or reassigned', () => {
    const data = input();
    data.updates = [update('other')];
    expect(buildTeamDigest(data).text).toContain('⚠️ ไม่ได้อัปเดตงานวันศุกร์');
    data.updates.push(update());
    data.board.tasks.push(task({ status: 'DONE', assigneeId: 'other' }));
    expect(buildTeamDigest(data).text).toContain('✅ ส่งเอกสาร  ⏭ รอรับ');
    expect(buildTeamDigest(data).summary).toContain('ไม่ได้อัปเดต 0 คน');
  });

  it('names Friday on Monday and says yesterday on Tuesday', () => {
    const data = input();
    expect(buildTeamDigest(data).text).toContain('⚠️ ไม่ได้อัปเดตงานวันศุกร์');
    data.today = new Date('2026-11-09T17:00:00Z');
    expect(buildTeamDigest(data).text).toContain('⚠️ ไม่ได้อัปเดตงานเมื่อวาน');
  });

  it.each(['DONE', 'PENDING_REVIEW'])('does not warn or show blockers for a member with only %s tasks', status => {
    const data = input();
    data.board.tasks = [task({ status, blocker: 'ไม่แสดง' })];
    const digest = buildTeamDigest(data);
    expect(digest.summary).toContain('ไม่ได้อัปเดต 0 คน');
    expect(digest.lines).toContain('ว่าง');
    expect(digest.text).not.toContain('⚠️ ไม่ได้อัปเดตงาน');
    expect(digest.text).not.toContain('ไม่แสดง');
  });

  it('includes the firm name in the header and links to operations', () => {
    const digest = buildTeamDigest(input());
    expect(digest.lines[0]).toBe('📋 สรุปทีมประจำวัน สำนักงานทดสอบ จ. 9 พ.ย. 2569');
    expect(digest.lines.at(-1)).toBe('ดูรายละเอียดในแอป: https://app.example/operations');
  });

  it('shows blocker, hold reason and dependencies only for open assigned tasks', () => {
    const data = input();
    data.board.tasks = [task({ blocker: 'ขาดเอกสาร', case: { ownRef: 'C-1' } }), task({ holdReason: 'รอลูกความ' }),
      task({ blockedBy: 'ตรวจร่าง' }), task({ blocker: 'ไม่แสดง', status: 'DONE' }), task({ blocker: 'อื่น', assigneeId: 'b' })];
    const text = buildTeamDigest(data).text;
    expect(text).toContain('⛔ ขาดเอกสาร [C-1]');
    expect(text).toContain('⛔ รอลูกความ');
    expect(text).toContain('⛔ รอ: ตรวจร่าง');
    expect(text).not.toContain('ไม่แสดง');
    expect(text).not.toContain('⛔ อื่น');
  });

  it('caps updates and blockers independently at 3 and truncates fields to 80 characters', () => {
    const data = input();
    data.board.tasks = Array.from({ length: 5 }, () => task({ blocker: 'ก'.repeat(100) }));
    data.updates = Array.from({ length: 4 }, () => update());
    const text = buildTeamDigest(data).text;
    expect(text.match(/✅ /g)).toHaveLength(3);
    expect(text.match(/⛔ /g)).toHaveLength(3);
    expect(text).toContain('…และอีก 1 งาน');
    expect(text).toContain('…และอีก 2 งาน');
    expect(text).toContain('ก'.repeat(79) + '…');
    expect(text).not.toContain('ก'.repeat(80));
  });

  it('cuts LINE at a complete member boundary under 5000 characters, retaining all email lines', () => {
    const data = input();
    data.board.members = Array.from({ length: 100 }, (_, i) => member(`person${String(i).padStart(3, '0')}`));
    data.board.tasks = data.board.members.flatMap(m => Array.from({ length: 3 }, () => task({ assigneeId: m.userId, blocker: 'ก'.repeat(80) })));
    const digest = buildTeamDigest(data);
    expect(digest.text.length).toBeLessThanOrEqual(5000);
    expect(digest.text).toContain('…ดูต่อในแอป');
    expect(digest.lines.join('\n').length).toBeGreaterThan(5000);
    const blocks = digest.text.split('\n\n').slice(1, -2);
    for (const block of blocks) expect(block.match(/⛔ /g)).toHaveLength(3);
    expect(digest.text).toMatch(/ดูรายละเอียดในแอป: https:\/\/app.example\/operations$/);
  });

  it('uses HEAVY_QUEUE_POINTS unless a member has a standard; zero points says free', () => {
    const data = input();
    data.radar.members = [load('a', 11)];
    expect(buildTeamDigest(data).text).toContain(`คิว 11/${HEAVY_QUEUE_POINTS} แต้ม ⚠️ เกินเกณฑ์`);
    data.radar.members = [load('a', 11, 0, 20)];
    expect(buildTeamDigest(data).text).toContain('คิว 11/20 แต้ม');
    expect(buildTeamDigest(data).summary).toContain('เกินเกณฑ์ 0 คน');
    data.radar.members = [load()];
    expect(buildTeamDigest(data).text).toContain('\nว่าง\n');
    expect(buildTeamDigest(data).lines.find(line => line === 'ว่าง')).toBe('ว่าง');
  });

  it('never includes external members', () => {
    const data = input();
    data.board.members.push({ ...member('outside'), role: 'EXTERNAL' });
    expect(buildTeamDigest(data).memberCount).toBe(1);
  });
});

it('uses Friday as Monday yesterday in Bangkok regardless of UTC day', () => {
  expect(previousWorkingDay(new Date('2026-11-08T17:00:00Z')).toISOString()).toBe('2026-11-05T17:00:00.000Z');
});

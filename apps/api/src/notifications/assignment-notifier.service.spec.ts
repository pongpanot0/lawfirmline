import { AssignmentNotifierService } from './assignment-notifier.service';
import { FirmLinkService } from './firm-link.service';

const CASE_ID = '11111111-2222-3333-4444-555555555555';

const prisma = { publicHoliday: { findUnique: jest.fn().mockResolvedValue(null) }, leaveRequest: { findMany: jest.fn().mockResolvedValue([]) }, 
  user: { findMany: jest.fn() },
  firmMember: { findMany: jest.fn() },
  calendarEvent: { findMany: jest.fn().mockResolvedValue([]) },
  notification: { createManyAndReturn: jest.fn(), findMany: jest.fn(), updateMany: jest.fn() },
} as any;
const line = { pushTo: jest.fn() } as any;
const push = { send: jest.fn() } as any;
const center = { channelsFor: jest.fn(), unreadCounts: jest.fn() } as any;
const config = {
  get: jest.fn((key: string) =>
    key === 'ROOT_DOMAIN' ? 'example.com' : 'https://app.example.com',
  ),
} as any;
// Real FirmLinkService over a stub Prisma: the point of these tests is the link
// the recipient receives, so the slug must actually reach the URL.
const firmPrisma = {
  firm: { findUnique: jest.fn().mockResolvedValue({ slug: 'acme' }) },
} as any;

const allOn = (ids: string[]) => new Map(ids.map((id) => [id, { push: true, line: true }]));

describe('AssignmentNotifierService', () => {
  let svc: AssignmentNotifierService;
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers({ now: new Date('2026-09-08T04:00:00Z'), doNotFake: ['nextTick', 'setImmediate'] }); // Tue 11:00 Bangkok
    line.pushTo.mockResolvedValue(true);
    push.send.mockResolvedValue(true);
    firmPrisma.firm.findUnique.mockResolvedValue({ slug: 'acme' });
    center.channelsFor.mockImplementation(async (ids: string[]) => allOn(ids));
    center.unreadCounts.mockResolvedValue(new Map([['u2', 3]]));
    prisma.notification.createManyAndReturn.mockImplementation(async ({ data }: any) =>
      data.map((row: any) => ({ id: `n-${row.userId}`, userId: row.userId })),
    );
    svc = new AssignmentNotifierService(prisma, line, new FirmLinkService(firmPrisma, config), push, center);
  });

  const users = [
    { id: 'u2', lineUserId: 'L2', firmMembers: [] },
    { id: 'u3', lineUserId: null, firmMembers: [] },
  ];

  it('records an inbox row, pushes and DMs every recipient except the actor', async () => {
    prisma.user.findMany.mockResolvedValue(users);
    const result = await svc.notifyAssigned({
      firmId: 'f1',
      userIds: ['u1', 'u2', 'u3'],
      actorUserId: 'u1',
      category: 'CASE',
      summaryText: '⚖️ คุณได้รับมอบหมายคดี\nคดี: ทดสอบ',
      entityPath: `/cases/${CASE_ID}?tab=tasks`,
    });

    expect(prisma.user.findMany.mock.calls[0][0].where).toEqual({ id: { in: ['u2', 'u3'] }, firmMembers: { some: { firmId: 'f1' } } });
    expect(prisma.notification.createManyAndReturn.mock.calls[0][0].data).toEqual([
      expect.objectContaining({ userId: 'u2', firmId: 'f1', category: 'CASE', title: '⚖️ คุณได้รับมอบหมายคดี', body: 'คดี: ทดสอบ', appPath: `/case/${CASE_ID}` }),
      expect.objectContaining({ userId: 'u3' }),
    ]);
    expect(push.send).toHaveBeenCalledWith([
      expect.objectContaining({ userId: 'u2', badge: 3, data: { url: `/case/${CASE_ID}`, notificationId: 'n-u2' } }),
      expect.objectContaining({ userId: 'u3', badge: 0, data: { url: `/case/${CASE_ID}`, notificationId: 'n-u3' } }),
    ]);
    expect(line.pushTo).toHaveBeenCalledTimes(1);
    expect(line.pushTo).toHaveBeenCalledWith('L2', expect.stringContaining(`https://acme.example.com/cases/${CASE_ID}?tab=tasks`), undefined);
    expect(result).toEqual({ recipients: 2, push: true, line: true });
  });

  afterEach(() => jest.useRealTimers());

  it.each([
    ['Tue 17:00 Bangkok', '2026-09-08T10:00:00Z'],
    ['Tue 08:59 Bangkok', '2026-09-08T01:59:00Z'],
    ['Sat 11:00 Bangkok', '2026-09-12T04:00:00Z'],
  ])('outside office hours (%s) only writes the inbox row', async (_label, at) => {
    jest.setSystemTime(new Date(at));
    prisma.user.findMany.mockResolvedValue(users);
    const result = await svc.notifyAssigned({
      firmId: 'f1', userIds: ['u2', 'u3'], actorUserId: '', category: 'TASK', summaryText: 'งานใหม่', entityPath: '/todos',
    });
    expect(prisma.notification.createManyAndReturn).toHaveBeenCalledTimes(1);
    expect(push.send).not.toHaveBeenCalled();
    expect(line.pushTo).not.toHaveBeenCalled();
    expect(result).toEqual({ recipients: 2, push: false, line: false });
  });

  it('holds push and LINE on a public holiday', async () => {
    prisma.publicHoliday.findUnique.mockResolvedValueOnce({ id: 'h' });
    prisma.user.findMany.mockResolvedValue(users);
    await svc.notifyAssigned({ firmId: 'f1', userIds: ['u2'], actorUserId: '', category: 'TASK', summaryText: 'งานใหม่', entityPath: '/todos' });
    expect(push.send).not.toHaveBeenCalled();
    expect(prisma.notification.createManyAndReturn.mock.calls[0][0].data[0]).toEqual(expect.objectContaining({ held: true }));
  });

  it('holds only the recipient on leave; the rest are pushed', async () => {
    prisma.leaveRequest.findMany.mockResolvedValueOnce([{ userId: 'u2' }]);
    prisma.user.findMany.mockResolvedValue(users);
    await svc.notifyAssigned({ firmId: 'f1', userIds: ['u2', 'u3'], actorUserId: '', category: 'TASK', summaryText: 'งานใหม่', entityPath: '/todos' });
    expect(prisma.notification.createManyAndReturn.mock.calls[0][0].data.map((r: any) => [r.userId, r.held])).toEqual([['u2', true], ['u3', false]]);
    expect(push.send.mock.calls[0][0].map((m: any) => m.userId)).toEqual(['u3']);
    expect(line.pushTo).not.toHaveBeenCalled();
  });

  it('09:00 summarises each person\'s held unread rows once, skipping anyone still on leave', async () => {
    prisma.notification.findMany.mockResolvedValue([
      { id: 'n1', userId: 'u2', firmId: 'f1', title: 'งาน A', body: 'คดี ก ข · หมายเลขคดีดำ พ.1/2569\nอื่น\nไม่แสดง', path: '/cases/c1', readAt: null, user: { lineUserId: 'L2' } },
      { id: 'n2', userId: 'u3', firmId: 'f1', title: 'งาน B', readAt: null, user: { lineUserId: null } },
      { id: 'n3', userId: 'u2', firmId: 'f1', title: 'งาน C', readAt: null, user: { lineUserId: 'L2' } },
      { id: 'n4', userId: 'u2', firmId: 'f1', title: 'อ่านแล้ว', readAt: new Date(), user: { lineUserId: 'L2' } },
    ]);
    prisma.firmMember.findMany.mockResolvedValueOnce([]);
    prisma.leaveRequest.findMany.mockResolvedValueOnce([{ userId: 'u3' }]);
    const sent = await svc.sendHeldSummary(new Date('2026-09-14T02:00:00Z')); // Mon 09:00 Bangkok

    expect(prisma.notification.findMany.mock.calls[0][0].where).toEqual({ held: true });
    expect(prisma.notification.updateMany).toHaveBeenCalledWith({ where: { id: { in: ['n1', 'n3', 'n4'] } }, data: { held: false } });
    expect(sent).toBe(1);
    expect(push.send).toHaveBeenCalledWith([expect.objectContaining({ userId: 'u2', title: '🔔 แจ้งเตือนระหว่างที่คุณไม่อยู่ 2 รายการ', body: '• งาน A\n• งาน C' })]);
    expect(line.pushTo).toHaveBeenCalledWith('L2', expect.stringContaining('• งาน C'));
    // Each held item keeps its case line and its own link.
    expect(line.pushTo.mock.calls[0][1]).toContain('• งาน A\n  คดี ก ข · หมายเลขคดีดำ พ.1/2569\n  อื่น\n  🔗 https://acme.example.com/cases/c1');
    expect(line.pushTo.mock.calls[0][1]).not.toContain('ไม่แสดง');
  });

  it('09:00 sends every staff member one brief: held items, who is out, and who is in court where', async () => {
    prisma.notification.findMany.mockResolvedValue([
      { id: 'n1', userId: 'u2', firmId: 'f1', title: '🗓 คำขอลา · รออนุมัติ', body: 'ขนิษฐา · ลาป่วย', path: '/leaves', readAt: null, user: { lineUserId: 'L2' } },
    ]);
    prisma.firmMember.findMany.mockResolvedValueOnce([
      { firmId: 'f1', userId: 'u2', user: { lineUserId: 'L2' } },
      { firmId: 'f1', userId: 'u4', user: { lineUserId: 'L4' } },
    ]);
    prisma.leaveRequest.findMany
      .mockResolvedValueOnce([{ firmId: 'f1', userId: 'u4', period: 'AFTERNOON', user: { firstName: 'อรนันท์', lastName: 'ยุบลเพลิด' } }])
      .mockResolvedValueOnce([]); // nobody off at 09:00 (u4 is off only in the afternoon)
    prisma.calendarEvent.findMany.mockResolvedValueOnce([{
      startAt: new Date('2026-09-14T02:30:00Z'), courtName: null, assignees: [{ user: { firstName: 'พงศ์ปณต', lastName: 'ส' } }],
      case: { id: 'c9', firmId: 'f1', title: 'นาย ก กับพวก', ownRef: 'R1', blackCaseNumber: 'พ.12/2569', redCaseNumber: 'พ.34/2569', courtName: 'ศาลแพ่งกรุงเทพใต้', leadLawyer: { firstName: 'x', lastName: 'y' } },
    }]);
    expect(await svc.sendHeldSummary(new Date('2026-09-14T02:00:00Z'))).toBe(2);

    expect(line.pushTo).toHaveBeenCalledTimes(2);
    const forU2 = line.pushTo.mock.calls.find((c: any[]) => c[0] === 'L2')[1];
    expect(forU2).toContain('☀️ สรุปเช้านี้');
    expect(forU2).toContain('• 🗓 คำขอลา · รออนุมัติ\n  ขนิษฐา · ลาป่วย\n  🔗 https://acme.example.com/leaves');
    expect(forU2).toContain('📅 วันนี้ไม่อยู่\n• อรนันท์ ยุบลเพลิด (ครึ่งบ่าย)');
    expect(forU2).toContain('⚖️ นัดศาลวันนี้ 1 นัด\n• 09:30 พงศ์ปณต ส — ศาลแพ่งกรุงเทพใต้\n  คดี นาย ก กับพวก · หมายเลขคดีดำ พ.12/2569 · หมายเลขคดีแดง พ.34/2569\n  🔗 https://acme.example.com/cases/c9');
    const forU4 = line.pushTo.mock.calls.find((c: any[]) => c[0] === 'L4')[1];
    expect(forU4).not.toContain('วันนี้ไม่อยู่'); // not told about their own leave
    expect(forU4).toContain('⚖️ นัดศาลวันนี้');
    expect(push.send).toHaveBeenCalledTimes(1); // push stays the held summary only
  });

  it('09:00 adds a manager\'s team summary line with a link to the team page', async () => {
    prisma.notification.findMany.mockResolvedValue([]);
    prisma.firmMember.findMany.mockResolvedValueOnce([]);
    const team = new Map([['f1:u2', { lineUserId: 'L2', summary: 'เกินเกณฑ์ 1 คน · เลยกำหนด 5 งาน' }]]);
    expect(await svc.sendHeldSummary(new Date('2026-09-14T02:00:00Z'), team)).toBe(1);
    expect(line.pushTo).toHaveBeenCalledWith('L2', expect.stringMatching(/^☀️ สรุปเช้านี้[^]*📋 ทีมวันนี้: เกินเกณฑ์ 1 คน · เลยกำหนด 5 งาน\n  🔗 https:\/\/acme\.example\.com\/operations$/));
    expect(push.send).not.toHaveBeenCalled();
  });

  it('sends no summary on a public holiday', async () => {
    prisma.publicHoliday.findUnique.mockResolvedValueOnce({ id: 'h' });
    expect(await svc.sendHeldSummary(new Date('2026-09-14T02:00:00Z'))).toBe(0);
    expect(prisma.notification.findMany).not.toHaveBeenCalled();
  });

  it('an explicit appPath wins over the mapped web path', async () => {
    prisma.user.findMany.mockResolvedValue([users[0]]);
    await svc.notifyAssigned({
      firmId: 'f1', userIds: ['u2'], actorUserId: '', category: 'TASK',
      summaryText: 'งานใหม่', entityPath: '/todos', appPath: '/task/new?id=t1',
    });
    expect(push.send.mock.calls[0][0][0].data.url).toBe('/task/new?id=t1');
  });

  it('honours per-category opt-outs but always keeps the inbox row', async () => {
    prisma.user.findMany.mockResolvedValue([users[0]]);
    center.channelsFor.mockResolvedValue(new Map([['u2', { push: false, line: false }]]));
    const result = await svc.notifyAssigned({
      firmId: 'f1', userIds: ['u2'], actorUserId: 'u1', category: 'COMMENT', summaryText: 'x', entityPath: '/todos',
    });
    expect(prisma.notification.createManyAndReturn).toHaveBeenCalled();
    expect(push.send).not.toHaveBeenCalled();
    expect(line.pushTo).not.toHaveBeenCalled();
    expect(result).toEqual({ recipients: 1, push: false, line: false });
  });

  it('line:false leaves LINE to the caller', async () => {
    prisma.user.findMany.mockResolvedValue([users[0]]);
    await svc.notifyAssigned({
      firmId: 'f1', userIds: ['u2'], actorUserId: '', category: 'LEAVE', summaryText: 'x', entityPath: '/leaves', line: false,
    });
    expect(push.send).toHaveBeenCalled();
    expect(line.pushTo).not.toHaveBeenCalled();
  });

  it('does nothing when the only target is the actor', async () => {
    await svc.notifyAssigned({
      firmId: 'f1', userIds: ['u1'], actorUserId: 'u1', category: 'TASK', summaryText: 'x', entityPath: '/x',
    });
    expect(prisma.user.findMany).not.toHaveBeenCalled();
    expect(line.pushTo).not.toHaveBeenCalled();
  });

  it('still pushes and DMs when the inbox write fails', async () => {
    prisma.user.findMany.mockResolvedValue([users[0]]);
    prisma.notification.createManyAndReturn.mockRejectedValue(new Error('db down'));
    await svc.notifyAssigned({
      firmId: 'f1', userIds: ['u2'], actorUserId: 'u1', category: 'TASK', summaryText: 'x', entityPath: '/todos',
    });
    expect(push.send.mock.calls[0][0][0].data).toEqual({ url: '/(tabs)/tasks' });
    expect(line.pushTo).toHaveBeenCalled();
  });

  it('never throws when every channel fails', async () => {
    prisma.user.findMany.mockResolvedValue([users[0]]);
    line.pushTo.mockRejectedValue(new Error('LINE down'));
    push.send.mockRejectedValue(new Error('Expo down'));
    await expect(
      svc.notifyAssigned({ firmId: 'f1', userIds: ['u2'], actorUserId: 'u1', category: 'TASK', summaryText: 'x', entityPath: '/x' }),
    ).resolves.toEqual({ recipients: 1, push: false, line: false });
  });

  it('notifyFirmOwners resolves owners then notifies them', async () => {
    prisma.firmMember.findMany.mockResolvedValue([{ userId: 'o1' }]);
    prisma.user.findMany.mockResolvedValue([{ id: 'o1', lineUserId: 'LO', firmMembers: [] }]);
    await svc.notifyFirmOwners({
      firmId: 'f1', actorUserId: 'u1', category: 'BILLING', summaryText: 'เบิกใหม่', entityPath: '/admin/reimbursements',
    });
    expect(prisma.firmMember.findMany).toHaveBeenCalledWith({
      where: { firmId: 'f1', role: 'OWNER' },
      select: { userId: true },
    });
    expect(line.pushTo).toHaveBeenCalledWith('LO', expect.stringContaining('เบิกใหม่'), undefined);
    expect(push.send.mock.calls[0][0][0].data.url).toBe('/expenses/claims');
  });

  it('notifyFirmOwners can target other roles without passing them on', async () => {
    prisma.firmMember.findMany.mockResolvedValue([{ userId: 'o1' }, { userId: 'm1' }]);
    prisma.user.findMany.mockResolvedValue([{ id: 'o1', lineUserId: null, firmMembers: [] }]);
    await svc.notifyFirmOwners({
      firmId: 'f1', actorUserId: 'm1', category: 'LEAVE', summaryText: 'ลา', entityPath: '/leaves', line: false,
      roles: ['OWNER', 'OFFICE_MANAGER'] as any,
    });
    expect(prisma.firmMember.findMany).toHaveBeenCalledWith({
      where: { firmId: 'f1', role: { in: ['OWNER', 'OFFICE_MANAGER'] } },
      select: { userId: true },
    });
    // the requester (actor) is never a recipient
    expect(prisma.user.findMany.mock.calls[0][0].where.id).toEqual({ in: ['o1'] });
  });

  it('without a firm, files each recipient under their own firm', async () => {
    prisma.user.findMany.mockResolvedValue([
      { id: 'a', lineUserId: null, firmMembers: [{ firmId: 'f-a' }] },
      { id: 'b', lineUserId: null, firmMembers: [{ firmId: 'f-b' }] },
    ]);
    await svc.notifyAssigned({ firmId: null, userIds: ['a', 'b'], actorUserId: '', category: 'TASK', summaryText: 'x', entityPath: '/todos' });
    const rows = prisma.notification.createManyAndReturn.mock.calls.flatMap((call: any) => call[0].data);
    expect(rows.map((r: any) => [r.userId, r.firmId])).toEqual([['a', 'f-a'], ['b', 'f-b']]);
  });

  it('clips push text to fit Expo while the inbox keeps it whole', async () => {
    prisma.user.findMany.mockResolvedValue([users[0]]);
    const long = 'ก'.repeat(4000);
    await svc.notifyAssigned({ firmId: 'f1', userIds: ['u2'], actorUserId: '', category: 'CLIENT', summaryText: `หัวข้อ\n${long}`, entityPath: '/todos' });
    expect(push.send.mock.calls[0][0][0].body.length).toBe(400);
    expect(prisma.notification.createManyAndReturn.mock.calls[0][0].data[0].body).toBe(long);
  });

  it('attaches LINE buttons only to the recipients they are for', async () => {
    prisma.user.findMany.mockResolvedValue([
      { id: 'u2', lineUserId: 'L2', firmMembers: [] },
      { id: 'u4', lineUserId: 'L4', firmMembers: [] },
    ]);
    const buttons = [{ label: 'ok', text: 'ok', data: 'task:ack:x' }];
    await svc.notifyAssigned({
      firmId: 'f1', userIds: ['u2', 'u4'], actorUserId: '', category: 'TASK', summaryText: 'x', entityPath: '/todos',
      lineActions: (userId) => (userId === 'u2' ? buttons : undefined),
    });
    expect(line.pushTo).toHaveBeenCalledWith('L2', expect.any(String), buttons);
    expect(line.pushTo).toHaveBeenCalledWith('L4', expect.any(String), undefined);
  });

  it('a freelancer gets only the first line, a /work link and no buttons', async () => {
    prisma.user.findMany.mockResolvedValue([
      { id: 'staff', lineUserId: 'LS', firmMembers: [{ firmId: 'f1', role: 'LAWYER' }] },
      { id: 'free', lineUserId: 'LF', firmMembers: [{ firmId: 'f1', role: 'EXTERNAL' }] },
    ]);
    await svc.notifyAssigned({
      firmId: 'f1', userIds: ['staff', 'free'], actorUserId: '', category: 'TASK',
      summaryText: '⚠️ งาน "แปลเอกสาร"\nหมายเลขคดีดำ พ.123/2569\nเลยกำหนด 2 วัน',
      entityPath: `/cases/${CASE_ID}`, lineActions: () => [{ label: 'x', text: 'x', data: 'task:done:1' }],
    });
    const rows = prisma.notification.createManyAndReturn.mock.calls.flatMap((c: any) => c[0].data);
    expect(rows.find((r: any) => r.userId === 'free')).toMatchObject({ title: '⚠️ งาน "แปลเอกสาร"', body: null, path: '/work', appPath: null });
    expect(rows.find((r: any) => r.userId === 'staff')).toMatchObject({ body: expect.stringContaining('พ.123/2569') });
    expect(line.pushTo).toHaveBeenCalledWith('LF', expect.not.stringContaining('พ.123'), undefined);
    expect(line.pushTo).toHaveBeenCalledWith('LF', expect.stringContaining('/work'), undefined);
  });
});

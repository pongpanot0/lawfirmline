import { LineQueryService } from './line-query.service';

describe('LineQueryService', () => {
  const prisma = { case: { findMany: jest.fn(), findUniqueOrThrow: jest.fn() } } as any;
  const caseAccess = { getCaseFilterForUser: jest.fn().mockReturnValue({ firmId: 'f1', leadLawyerId: 'u1' }) } as any;
  const tasks = { findMine: jest.fn() } as any;
  const firmLink = { originForSlug: jest.fn().mockReturnValue('https://acme.example.com') } as any;
  const user = { id: 'u1', firmId: 'f1', firmSlug: 'acme' } as any;
  let svc: LineQueryService;
  beforeEach(() => {
    jest.clearAllMocks();
    svc = new LineQueryService(prisma, caseAccess, tasks, firmLink);
  });

  it('reads the search term from "คดี …" questions only', () => {
    expect(svc.caseQuery('คดี TSB-001 นัดครั้งหน้าเมื่อไหร่')).toBe('TSB-001');
    expect(svc.caseQuery('สร้าง Case')).toBeNull();
    expect(svc.caseQuery('คดี')).toBeNull();
  });

  it('lists only my unfinished tasks, earliest due first, undated last', async () => {
    tasks.findMine.mockResolvedValue([
      { title: 'ไม่มีกำหนด', assigneeId: 'u1', status: 'TODO', dueDate: null },
      { title: 'เสร็จแล้ว', assigneeId: 'u1', status: 'DONE', dueDate: new Date('2026-01-01') },
      { title: 'ของคนอื่น', assigneeId: 'u2', status: 'TODO', dueDate: new Date('2026-01-01') },
      { title: 'เลยกำหนด', assigneeId: 'u1', status: 'TODO', dueDate: new Date('2020-01-01'), case: { ownRef: 'R-1' } },
    ]);
    const { text } = await svc.openTasks(user);
    expect(tasks.findMine).toHaveBeenCalledWith(user, 'mine');
    expect(text).toContain('งานค้างของฉัน 2 งาน');
    expect(text.indexOf('เลยกำหนด — R-1')).toBeLessThan(text.indexOf('ไม่มีกำหนด'));
    expect(text).not.toContain('เสร็จแล้ว');
    expect(text).not.toContain('ของคนอื่น');
  });

  it('searches inside the asker\'s case access', async () => {
    prisma.case.findMany.mockResolvedValue([]);
    const { text } = await svc.findCase(user, 'XYZ');
    expect(prisma.case.findMany.mock.calls[0][0].where.AND[0]).toEqual({ firmId: 'f1', leadLawyerId: 'u1' });
    expect(text).toContain('ไม่พบคดี "XYZ"');
  });

  it('several matches become buttons to pick from', async () => {
    prisma.case.findMany.mockResolvedValue([
      { id: 'c1', ownRef: 'TSB-10', title: 'ก' },
      { id: 'c2', ownRef: 'TSB-11', title: 'ข' },
    ]);
    const reply = await svc.findCase(user, 'TSB');
    expect(reply.quickReply?.map((q) => q.text)).toEqual(['คดี TSB-10', 'คดี TSB-11']);
  });

  it('an exact reference opens that case even among loose matches', async () => {
    prisma.case.findMany.mockResolvedValue([
      { id: 'c1', ownRef: 'TSB-10', title: 'ก' },
      { id: 'c2', ownRef: 'TSB-1', title: 'ข' },
    ]);
    prisma.case.findUniqueOrThrow.mockResolvedValue({
      id: 'c2', ownRef: 'TSB-1', title: 'ข', status: 'COURT_DATE', courtName: 'ศาลแพ่ง',
      blackCaseNumber: 'พ.123/2569', redCaseNumber: null, clientName: null, client: { name: 'บริษัท ก' },
      leadLawyer: { firstName: 'สม', lastName: 'ชาย' },
      calendarEvents: [{ title: 'สืบพยาน', startAt: new Date('2026-10-12T02:00:00Z'), courtName: 'ศาลแพ่ง' }],
      _count: { tasks: 3 },
    });
    const { text } = await svc.findCase(user, 'tsb-1');
    expect(prisma.case.findUniqueOrThrow.mock.calls[0][0].where).toEqual({ id: 'c2' });
    expect(text).toContain('⚖️ TSB-1 — ข');
    expect(text).toContain('12/10/2026 09:00 สืบพยาน');
    expect(text).toContain('งานที่ยังไม่เสร็จ 3 งาน');
    expect(text).toContain('https://acme.example.com/cases/c2');
  });
});

import type { AuthUser } from '@lawfirm/shared';
import { MatterBriefService } from './matter-brief.service';

describe('MatterBriefService', () => {
  const user = { id: 'u1', firmId: 'f1' } as AuthUser;
  const caseFilter = { firmId: 'f1' };
  const now = new Date('2026-10-31T05:00:00Z');

  const baseCase = {
    id: 'c1', title: 'คดี A', ownRef: 'A-1', clientName: 'ลูกค้า', partyRole: 'PLAINTIFF',
    courtName: null, blackCaseNumber: null, redCaseNumber: null, claimedAmount: null,
    status: 'OPEN', stage: 'FIRST_INSTANCE', stageChangedAt: new Date('2026-10-01T00:00:00Z'),
    participants: [], intake: null, leadLawyer: { firstName: 'สมชาย', lastName: 'ใจดี' },
  };

  function build() {
    const prisma = {
      case: { findFirst: jest.fn().mockResolvedValue(baseCase) },
      intake: { findFirst: jest.fn().mockResolvedValue(null) },
      caseActivity: { findMany: jest.fn().mockResolvedValue([]) },
      caseStatusLog: { findMany: jest.fn().mockResolvedValue([]) },
      calendarEvent: { findFirst: jest.fn().mockResolvedValue(null), findMany: jest.fn().mockResolvedValue([]) },
      task: { findMany: jest.fn().mockResolvedValue([]) },
      auditLog: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const access = {
      getCaseFilterForUser: jest.fn().mockResolvedValue(caseFilter),
      getIntakeFilterForUser: jest.fn().mockResolvedValue({ firmId: 'f1' }),
    };
    return { service: new MatterBriefService(prisma as never, access as never), prisma, access };
  }

  beforeEach(() => { jest.useFakeTimers().setSystemTime(now); });
  afterEach(() => jest.useRealTimers());

  it("returns null for a case outside the user's filter", async () => {
    const { service, prisma } = build();
    prisma.case.findFirst.mockResolvedValue(null);
    expect(await service.getCaseBrief(user, 'c9')).toBeNull();
    expect(prisma.case.findFirst.mock.calls[0][0].where).toEqual({ AND: [caseFilter, { id: 'c9' }] });
  });

  it('maps parties by side', async () => {
    const { service, prisma } = build();
    prisma.case.findFirst.mockResolvedValue({
      ...baseCase,
      participants: [
        { name: 'เรา', side: 'OURS', role: 'PLAINTIFF', opposingLawyer: null },
        { name: 'คู่ความ', side: 'OPPONENT', role: 'DEFENDANT', opposingLawyer: 'ทนายก' },
        { name: 'ทนายข', side: 'OPPONENT', role: 'OPPOSING_LAWYER', opposingLawyer: null },
        { name: 'พยาน', side: 'NEUTRAL', role: 'WITNESS', opposingLawyer: null },
      ],
    });
    const b = await service.getCaseBrief(user, 'c1');
    expect(b!.ourParties).toEqual(['เรา']);
    expect(b!.opponents).toEqual([{ name: 'คู่ความ', role: 'DEFENDANT' }]);
    expect(b!.opposingCounsel).toEqual(['ทนายก', 'ทนายข']);
    expect(b!.leadLawyerName).toBe('สมชาย ใจดี');
  });

  it('includes intake assessment via Case.intakeId', async () => {
    const { service, prisma } = build();
    prisma.case.findFirst.mockResolvedValue({
      ...baseCase,
      intake: { decision: 'ACCEPTED', caseStrength: 'STRONG', assessmentNotes: 'ดี', estimatedDamage: 5000 },
    });
    expect((await service.getCaseBrief(user, 'c1'))!.assessment).toEqual({
      decision: 'ACCEPTED', caseStrength: 'STRONG', notes: 'ดี', estimatedDamage: 5000,
    });
  });

  it('open tasks include every open task on the case, without description', async () => {
    const { service, prisma } = build();
    prisma.task.findMany.mockResolvedValue([{
      id: 't1', title: 'ร่างคำฟ้อง', status: 'IN_PROGRESS', caseId: 'c1', intakeId: null,
      createdAt: new Date('2026-10-20T05:00:00Z'), assignedAt: null, acknowledgedAt: null, planConfirmedAt: null, submittedAt: null,
      dueDate: new Date('2026-10-29T05:00:00Z'), assignee: { id: 'u2', firstName: 'ก', lastName: 'ข' },
      case: { title: 'คดี A' }, intake: null, assignmentLogs: [], onHold: null,
    }]);
    const b = await service.getCaseBrief(user, 'c1');
    const where = prisma.task.findMany.mock.calls[0][0].where;
    expect(where).toMatchObject({ caseId: 'c1', status: { not: 'DONE' } });
    expect(JSON.stringify(where)).not.toContain('assigneeId');
    expect(Object.keys(b!.openTasks[0]).sort()).toEqual(
      ['assigneeName', 'daysOverdue', 'daysStuck', 'dueDate', 'holdReason', 'id', 'status', 'title'],
    );
    expect(b!.openTasks[0]).toMatchObject({ assigneeName: 'ก ข', daysOverdue: 2, daysStuck: 11 });
  });

  it('returns nulls for missing fields', async () => {
    const { service } = build();
    const b = await service.getCaseBrief(user, 'c1');
    expect(b).toMatchObject({ claimedAmount: null, nextEvent: null, assessment: null, recentEvents: [], openTasks: [] });
  });

  it('nextEvent is the earliest CalendarEvent with startAt >= now', async () => {
    const { service, prisma } = build();
    prisma.calendarEvent.findFirst.mockResolvedValue({
      id: 'e1', startAt: new Date('2026-11-05T02:00:00Z'), title: 'นัดสืบพยาน', type: 'COURT_DATE', courtName: 'ศาลแพ่ง',
    });
    const b = await service.getCaseBrief(user, 'c1');
    expect(prisma.calendarEvent.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { caseId: 'c1', startAt: { gte: now } }, orderBy: { startAt: 'asc' },
    }));
    expect(b!.nextEvent).toEqual({ id: 'e1', at: '2026-11-05T02:00:00.000Z', title: 'นัดสืบพยาน', type: 'COURT_DATE', courtName: 'ศาลแพ่ง' });
  });
});

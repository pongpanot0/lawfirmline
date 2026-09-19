import { Test, TestingModule } from '@nestjs/testing';
import { OperationsService } from './operations.service';
import { PrismaService } from '../prisma/prisma.service';

describe('OperationsService.getOnHoldTasks', () => {
  let service: OperationsService;
  const mockPrisma = {
    taskOnHold: { findMany: jest.fn() },
  };
  const user = { id: 'user-1', firmId: 'firm-1' } as any;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [OperationsService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();
    service = module.get(OperationsService);
  });

  it('returns only active on-hold entries scoped to the firm, flagging overdue tasks', async () => {
    const now = Date.now();
    mockPrisma.taskOnHold.findMany.mockResolvedValue([
      {
        taskId: 'task-1',
        reason: 'รอลูกความส่งเอกสาร',
        startedAt: new Date('2026-08-01'),
        lastFollowUpAt: null,
        nextFollowUpAt: new Date('2026-09-10'),
        task: {
          id: 'task-1',
          title: 'เตรียมคำให้การ',
          dueDate: new Date(now - 86400000),
          case: { id: 'case-1', title: 'คดีทดสอบ', ownRef: 'CASE-001', firmId: 'firm-1' },
          assignee: { firstName: 'สมชาย', lastName: 'ใจดี' },
        },
        follower: { firstName: 'สมหญิง', lastName: 'รักงาน' },
      },
    ]);

    const result = await service.getOnHoldTasks(user);

    expect(mockPrisma.taskOnHold.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          endedAt: null,
          task: expect.objectContaining({ case: { firmId: 'firm-1' } }),
        }),
      }),
    );
    expect(result).toHaveLength(1);
    expect(result[0].isOverdue).toBe(true);
    expect(result[0].caseOwnRef).toBe('CASE-001');
    expect(result[0].followerName).toBe('สมหญิง รักงาน');
  });
});

describe('OperationsService.getPairing', () => {
  const mockPrisma = { case: { findMany: jest.fn() }, user: { findMany: jest.fn() } } as any;
  const service = new OperationsService(mockPrisma);
  const user = { id: 'u1', firmId: 'firm-1' } as any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.user.findMany.mockResolvedValue([
      { id: 'a', firstName: 'A', lastName: 'Aa' },
      { id: 'b', firstName: 'B', lastName: 'Bb' },
      { id: 'c', firstName: 'C', lastName: 'Cc' },
    ]);
  });

  it('counts a three-person case as one team, not three pairs', async () => {
    mockPrisma.case.findMany.mockResolvedValue([
      { leadLawyerId: 'a', assignments: [{ userId: 'b' }, { userId: 'c' }] },
    ]);

    const teams = await service.getPairing(user);

    expect(teams).toHaveLength(1);
    expect(teams[0].members.map((m: any) => m.id)).toEqual(['a', 'b', 'c']);
    expect(teams[0].count).toBe(1);
  });

  it('keeps a team of three separate from the pair inside it', async () => {
    mockPrisma.case.findMany.mockResolvedValue([
      { leadLawyerId: 'a', assignments: [{ userId: 'b' }, { userId: 'c' }] },
      { leadLawyerId: 'a', assignments: [{ userId: 'b' }] },
      { leadLawyerId: 'b', assignments: [{ userId: 'a' }] },
    ]);

    const teams = await service.getPairing(user);

    // a+b ทำด้วยกัน 2 คดี (ไม่ว่าใครเป็นหัวหน้า), a+b+c อีก 1 คดี
    expect(teams.map((t: any) => [t.members.map((m: any) => m.id).join('+'), t.count])).toEqual([
      ['a+b', 2],
      ['a+b+c', 1],
    ]);
  });

  it('ignores a case nobody shares', async () => {
    mockPrisma.case.findMany.mockResolvedValue([{ leadLawyerId: 'a', assignments: [] }]);

    expect(await service.getPairing(user)).toEqual([]);
  });
});

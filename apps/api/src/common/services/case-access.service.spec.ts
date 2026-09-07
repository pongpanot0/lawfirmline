import { Test, TestingModule } from '@nestjs/testing';
import { FirmRole } from '@lawfirm/shared';
import { CaseAccessService } from './case-access.service';
import { PrismaService } from '../../prisma/prisma.service';

describe('CaseAccessService', () => {
  let service: CaseAccessService;
  const mockPrisma = { case: { findFirst: jest.fn() } };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [CaseAccessService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();
    service = module.get(CaseAccessService);
  });

  describe('getCaseFilterForUser', () => {
    it('returns only a firm filter for OWNER', () => {
      const user = { id: 'u1', firmId: 'firm-1', firmRole: FirmRole.OWNER } as any;
      expect(service.getCaseFilterForUser(user)).toEqual({ firmId: 'firm-1' });
    });

    it('returns the staffed-or-assigned filter for LAWYER', () => {
      const user = { id: 'u1', firmId: 'firm-1', firmRole: FirmRole.LAWYER } as any;
      expect(service.getCaseFilterForUser(user)).toEqual({
        firmId: 'firm-1',
        OR: [
          { leadLawyerId: 'u1' },
          { assignments: { some: { userId: 'u1' } } },
          { tasks: { some: { assigneeId: 'u1' } } },
        ],
      });
    });

    it('returns the staffed-or-assigned filter for ASSISTANT', () => {
      const user = { id: 'u1', firmId: 'firm-1', firmRole: FirmRole.ASSISTANT } as any;
      expect(service.getCaseFilterForUser(user)).toEqual({
        firmId: 'firm-1',
        OR: [
          { leadLawyerId: 'u1' },
          { assignments: { some: { userId: 'u1' } } },
          { tasks: { some: { assigneeId: 'u1' } } },
        ],
      });
    });

    it('widens the filter for SENIOR_LAWYER to include cases staffed by a LAWYER', () => {
      const user = { id: 'u1', firmId: 'firm-1', firmRole: FirmRole.SENIOR_LAWYER } as any;
      expect(service.getCaseFilterForUser(user)).toEqual({
        firmId: 'firm-1',
        OR: [
          { leadLawyerId: 'u1' },
          { assignments: { some: { userId: 'u1' } } },
          { tasks: { some: { assigneeId: 'u1' } } },
          {
            leadLawyer: {
              firmMembers: { some: { firmId: 'firm-1', role: FirmRole.LAWYER } },
            },
          },
          {
            assignments: {
              some: {
                user: {
                  firmMembers: { some: { firmId: 'firm-1', role: FirmRole.LAWYER } },
                },
              },
            },
          },
        ],
      });
    });
  });

  describe('canAccessCase', () => {
    it('returns true when the case matches the user filter', async () => {
      const user = { id: 'u1', firmId: 'firm-1', firmRole: FirmRole.LAWYER } as any;
      mockPrisma.case.findFirst.mockResolvedValue({ id: 'case-1' });

      const result = await service.canAccessCase(user, 'case-1');

      expect(result).toBe(true);
      expect(mockPrisma.case.findFirst).toHaveBeenCalledWith({
        where: { id: 'case-1', ...service.getCaseFilterForUser(user) },
        select: { id: true },
      });
    });

    it('returns false when no case matches', async () => {
      const user = { id: 'u1', firmId: 'firm-1', firmRole: FirmRole.LAWYER } as any;
      mockPrisma.case.findFirst.mockResolvedValue(null);

      const result = await service.canAccessCase(user, 'case-1');

      expect(result).toBe(false);
    });
  });

  describe('getTaskFilterForUser', () => {
    it('returns no restriction for OWNER', () => {
      const user = { id: 'u1', firmId: 'firm-1', firmRole: FirmRole.OWNER } as any;
      expect(service.getTaskFilterForUser(user)).toEqual({});
    });

    it('returns own-or-LAWYER-assigned for SENIOR_LAWYER', () => {
      const user = { id: 'u1', firmId: 'firm-1', firmRole: FirmRole.SENIOR_LAWYER } as any;
      expect(service.getTaskFilterForUser(user)).toEqual({
        OR: [
          { assigneeId: 'u1' },
          {
            assignee: {
              firmMembers: { some: { firmId: 'firm-1', role: FirmRole.LAWYER } },
            },
          },
        ],
      });
    });

    it('returns own-only for LAWYER', () => {
      const user = { id: 'u1', firmId: 'firm-1', firmRole: FirmRole.LAWYER } as any;
      expect(service.getTaskFilterForUser(user)).toEqual({ assigneeId: 'u1' });
    });

    it('returns own-only for ASSISTANT', () => {
      const user = { id: 'u1', firmId: 'firm-1', firmRole: FirmRole.ASSISTANT } as any;
      expect(service.getTaskFilterForUser(user)).toEqual({ assigneeId: 'u1' });
    });
  });
});

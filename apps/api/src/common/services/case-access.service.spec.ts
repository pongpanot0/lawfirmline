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
      expect(service.getCaseFilterForUser(user)).toEqual({ firmId: 'firm-1', deletedAt: null });
    });

    it('returns only a firm filter for OFFICE_MANAGER', () => {
      const user = { id: 'u1', firmId: 'firm-1', firmRole: FirmRole.OFFICE_MANAGER } as any;
      expect(service.getCaseFilterForUser(user)).toEqual({ firmId: 'firm-1', deletedAt: null });
    });

    it('returns the staffed-or-assigned filter for LAWYER', () => {
      const user = { id: 'u1', firmId: 'firm-1', firmRole: FirmRole.LAWYER } as any;
      expect(service.getCaseFilterForUser(user)).toEqual({
        firmId: 'firm-1',
        deletedAt: null,
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
        deletedAt: null,
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
        deletedAt: null,
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

    it('returns a filter that matches nothing for EXTERNAL', () => {
      const user = { id: 'u1', firmId: 'firm-1', firmRole: FirmRole.EXTERNAL } as any;
      expect(service.getCaseFilterForUser(user)).toEqual({ id: '__external_has_no_case_access__' });
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
    const firmScope = {
      OR: [
        { case: { firmId: 'firm-1', deletedAt: null } },
        { caseId: null, OR: [{ firmId: 'firm-1' }, { firmId: null, createdBy: { firmMembers: { some: { firmId: 'firm-1' } } } }] },
      ],
    };

    it('returns only the firm scope for OWNER', () => {
      const user = { id: 'u1', firmId: 'firm-1', firmRole: FirmRole.OWNER } as any;
      expect(service.getTaskFilterForUser(user)).toEqual(firmScope);
    });

    it('returns only the firm scope for OFFICE_MANAGER', () => {
      const user = { id: 'u1', firmId: 'firm-1', firmRole: FirmRole.OFFICE_MANAGER } as any;
      expect(service.getTaskFilterForUser(user)).toEqual(firmScope);
    });

    it('keeps senior handed-off work visible inside the firm scope', () => {
      const user = { id: 'u1', firmId: 'firm-1', firmRole: FirmRole.SENIOR_LAWYER } as any;
      expect(service.getTaskFilterForUser(user)).toEqual({
        AND: [
          firmScope,
          {
            OR: [
              { assigneeId: 'u1' },
              {
                assignee: {
                  firmMembers: { some: { firmId: 'firm-1', role: FirmRole.LAWYER } },
                },
              },
              { assigneeId: null },
              { status: { in: ['PENDING_REVIEW', 'DONE'] }, assignmentLogs: { some: { action: 'HANDED_OFF', fromUserId: 'u1' } } }, { status: 'PENDING_REVIEW', reviewerId: 'u1' }, { status: 'PENDING_REVIEW', reviewerId: null, case: { leadLawyerId: 'u1' } },
            ],
          },
        ],
      });
    });

    it('returns firm-scoped own-or-unassigned for LAWYER', () => {
      const user = { id: 'u1', firmId: 'firm-1', firmRole: FirmRole.LAWYER } as any;
      expect(service.getTaskFilterForUser(user)).toEqual({
        AND: [firmScope, { OR: [{ assigneeId: 'u1' }, { assigneeId: null }, { status: { in: ['PENDING_REVIEW', 'DONE'] }, assignmentLogs: { some: { action: 'HANDED_OFF', fromUserId: 'u1' } } }, { status: 'PENDING_REVIEW', reviewerId: 'u1' }, { status: 'PENDING_REVIEW', reviewerId: null, case: { leadLawyerId: 'u1' } }] }],
      });
    });

    it('returns firm-scoped own-or-unassigned for ASSISTANT', () => {
      const user = { id: 'u1', firmId: 'firm-1', firmRole: FirmRole.ASSISTANT } as any;
      expect(service.getTaskFilterForUser(user)).toEqual({
        AND: [firmScope, { OR: [{ assigneeId: 'u1' }, { assigneeId: null }, { status: { in: ['PENDING_REVIEW', 'DONE'] }, assignmentLogs: { some: { action: 'HANDED_OFF', fromUserId: 'u1' } } }, { status: 'PENDING_REVIEW', reviewerId: 'u1' }, { status: 'PENDING_REVIEW', reviewerId: null, case: { leadLawyerId: 'u1' } }] }],
      });
    });
  });

  describe('getCaseFilterForFinancials', () => {
    it('returns only a firm filter for OWNER', () => {
      const user = { id: 'u1', firmId: 'firm-1', firmRole: FirmRole.OWNER } as any;
      expect(service.getCaseFilterForFinancials(user)).toEqual({ firmId: 'firm-1', deletedAt: null });
    });

    it('returns only a firm filter for OFFICE_MANAGER financials', () => {
      const user = { id: 'u1', firmId: 'firm-1', firmRole: FirmRole.OFFICE_MANAGER } as any;
      expect(service.getCaseFilterForFinancials(user)).toEqual({ firmId: 'firm-1', deletedAt: null });
    });

    it('returns the narrow staffed-or-assigned filter for SENIOR_LAWYER (not widened)', () => {
      const user = { id: 'u1', firmId: 'firm-1', firmRole: FirmRole.SENIOR_LAWYER } as any;
      expect(service.getCaseFilterForFinancials(user)).toEqual({
        firmId: 'firm-1',
        deletedAt: null,
        OR: [
          { leadLawyerId: 'u1' },
          { assignments: { some: { userId: 'u1' } } },
          { tasks: { some: { assigneeId: 'u1' } } },
        ],
      });
    });

    it('returns the staffed-or-assigned filter for LAWYER', () => {
      const user = { id: 'u1', firmId: 'firm-1', firmRole: FirmRole.LAWYER } as any;
      expect(service.getCaseFilterForFinancials(user)).toEqual({
        firmId: 'firm-1',
        deletedAt: null,
        OR: [
          { leadLawyerId: 'u1' },
          { assignments: { some: { userId: 'u1' } } },
          { tasks: { some: { assigneeId: 'u1' } } },
        ],
      });
    });

    it('returns the staffed-or-assigned filter for ASSISTANT', () => {
      const user = { id: 'u1', firmId: 'firm-1', firmRole: FirmRole.ASSISTANT } as any;
      expect(service.getCaseFilterForFinancials(user)).toEqual({
        firmId: 'firm-1',
        deletedAt: null,
        OR: [
          { leadLawyerId: 'u1' },
          { assignments: { some: { userId: 'u1' } } },
          { tasks: { some: { assigneeId: 'u1' } } },
        ],
      });
    });
  });

  describe('getEmailThreadFilterForUser', () => {
    beforeEach(() => {
      jest.spyOn(service, 'getCaseFilterForUser').mockReturnValue({ marker: 'case' } as any);
      jest.spyOn(service, 'getIntakeFilterForUser').mockResolvedValue({ marker: 'intake' } as any);
    });

    it('a lawyer sees case/intake threads they can access and their own unlinked mail', async () => {
      const where = await service.getEmailThreadFilterForUser({ id: 'u1', firmId: 'f1', firmRole: 'LAWYER' } as any);
      expect(where).toEqual({
        firmId: 'f1',
        OR: [
          { caseId: { not: null }, case: { marker: 'case' } },
          { intakeId: { not: null }, intake: { marker: 'intake' } },
          { caseId: null, intakeId: null, mailboxConnection: { userId: 'u1' } },
        ],
      });
    });

    it('a senior lawyer no longer sees other people’s unlinked mail', async () => {
      const where: any = await service.getEmailThreadFilterForUser({ id: 'u2', firmId: 'f1', firmRole: 'SENIOR_LAWYER' } as any);
      expect(where.OR).not.toContainEqual({ caseId: null, intakeId: null });
    });

    it('owner / office manager see every unlinked thread', async () => {
      const where: any = await service.getEmailThreadFilterForUser({ id: 'u3', firmId: 'f1', firmRole: 'OWNER' } as any);
      expect(where.OR).toContainEqual({ caseId: null, intakeId: null });
    });

    it('external users see nothing', async () => {
      await expect(service.getEmailThreadFilterForUser({ id: 'x', firmId: 'f1', firmRole: 'EXTERNAL' } as any))
        .resolves.toEqual({ id: '__external_has_no_thread_access__' });
    });
  });
});

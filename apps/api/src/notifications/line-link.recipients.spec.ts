import { Test, TestingModule } from '@nestjs/testing';
import { LineLinkService } from './line-link.service';
import { PrismaService } from '../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import { LinkCodeAttemptLimiterService } from './link-code-attempt-limiter.service';

describe('LineLinkService recipients', () => {
  let service: LineLinkService;
  const mockPrisma = {
    user: { findMany: jest.fn() },
    case: { findUnique: jest.fn() },
  };
  const mockLimiter = { reset: jest.fn(), hit: jest.fn(), isBlocked: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockPrisma.user.findMany.mockResolvedValue([]);
    mockPrisma.case.findUnique.mockResolvedValue(null);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LineLinkService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: LinkCodeAttemptLimiterService, useValue: mockLimiter },
        { provide: ConfigService, useValue: { get: jest.fn() } },
      ],
    }).compile();
    service = module.get(LineLinkService);
  });

  describe('getLineUserIdsForEvent', () => {
    it('reminds the person attending, not everyone on the case', async () => {
      mockPrisma.user.findMany.mockResolvedValue([{ lineUserId: 'L-assignee' }]);

      const ids = await service.getLineUserIdsForEvent({
        assigneeId: 'user-attending',
        caseId: 'case-1',
      });

      expect(ids).toEqual(['L-assignee']);
      expect(mockPrisma.user.findMany).toHaveBeenCalledWith({
        where: { id: { in: ['user-attending'] }, lineUserId: { not: null } },
        select: { lineUserId: true },
      });
      // The case is never read: no buddy can be pulled in by accident.
      expect(mockPrisma.case.findUnique).not.toHaveBeenCalled();
    });

    it('falls back to the lead lawyer when nobody was named', async () => {
      mockPrisma.case.findUnique.mockResolvedValue({ leadLawyerId: 'lead-1' });
      mockPrisma.user.findMany.mockResolvedValue([{ lineUserId: 'L-lead' }]);

      const ids = await service.getLineUserIdsForEvent({ assigneeId: null, caseId: 'case-1' });

      expect(ids).toEqual(['L-lead']);
      expect(mockPrisma.user.findMany).toHaveBeenCalledWith({
        where: { id: { in: ['lead-1'] }, lineUserId: { not: null } },
        select: { lineUserId: true },
      });
    });

    it('returns nobody when the case is gone', async () => {
      mockPrisma.case.findUnique.mockResolvedValue(null);

      expect(await service.getLineUserIdsForEvent({ assigneeId: null, caseId: 'x' })).toEqual([]);
    });

    it('drops recipients who have not linked LINE', async () => {
      mockPrisma.user.findMany.mockResolvedValue([{ lineUserId: null }, { lineUserId: 'L-ok' }]);

      expect(
        await service.getLineUserIdsForEvent({ assigneeId: 'u1', caseId: 'case-1' }),
      ).toEqual(['L-ok']);
    });
  });

  describe('getLineUserIdsForCase', () => {
    it('still reaches everyone staffed, for case-wide news', async () => {
      mockPrisma.case.findUnique.mockResolvedValue({
        leadLawyerId: 'lead-1',
        assignments: [{ userId: 'buddy-1' }],
      });
      mockPrisma.user.findMany.mockResolvedValue([{ lineUserId: 'L1' }, { lineUserId: 'L2' }]);

      const ids = await service.getLineUserIdsForCase('case-1');

      expect(ids).toEqual(['L1', 'L2']);
      expect(mockPrisma.user.findMany.mock.calls[0][0].where.id.in.sort()).toEqual([
        'buddy-1',
        'lead-1',
      ]);
    });
  });
});

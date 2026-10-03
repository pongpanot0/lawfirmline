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

  describe('getCaseTeamUserIds', () => {
    it('still reaches everyone staffed, for case-wide news', async () => {
      mockPrisma.case.findUnique.mockResolvedValue({
        leadLawyerId: 'lead-1',
        assignments: [{ userId: 'buddy-1' }, { userId: 'lead-1' }],
      });

      const ids = await service.getCaseTeamUserIds('case-1');

      expect(ids.sort()).toEqual(['buddy-1', 'lead-1']);
    });
  });
});

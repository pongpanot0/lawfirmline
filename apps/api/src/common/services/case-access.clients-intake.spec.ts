import { Test, TestingModule } from '@nestjs/testing';
import { FirmRole } from '@lawfirm/shared';
import { CaseAccessService } from './case-access.service';
import { PrismaService } from '../../prisma/prisma.module';

describe('CaseAccessService client and intake filters', () => {
  let service: CaseAccessService;
  const mockPrisma = {
    firmMember: { findMany: jest.fn() },
    case: { findFirst: jest.fn() },
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockPrisma.firmMember.findMany.mockResolvedValue([{ userId: 'lawyer-1' }, { userId: 'lawyer-2' }]);
    const module: TestingModule = await Test.createTestingModule({
      providers: [CaseAccessService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();
    service = module.get(CaseAccessService);
  });

  it('OWNER sees all firm clients', () => {
    const filter = service.getClientFilterForUser({
      id: 'o1',
      firmId: 'firm-1',
      firmRole: FirmRole.OWNER,
    } as any);
    expect(filter).toEqual({ firmId: 'firm-1' });
  });

  it('LAWYER only sees clients with a visible case', () => {
    const filter = service.getClientFilterForUser({
      id: 'u1',
      firmId: 'firm-1',
      firmRole: FirmRole.LAWYER,
    } as any);
    expect(filter).toEqual(
      expect.objectContaining({
        firmId: 'firm-1',
        cases: { some: expect.objectContaining({ firmId: 'firm-1' }) },
      }),
    );
  });

  it('ASSISTANT intake filter is limited to own involvement', async () => {
    const filter = await service.getIntakeFilterForUser({
      id: 'u1',
      firmId: 'firm-1',
      firmRole: FirmRole.ASSISTANT,
    } as any);
    expect(filter).toEqual(
      expect.objectContaining({
        firmId: 'firm-1',
        OR: expect.arrayContaining([
          { receivedById: 'u1' },
          { assignedUserIds: { has: 'u1' } },
        ]),
      }),
    );
  });

  it('SENIOR_LAWYER intake filter includes lawyer assignees', async () => {
    const filter = await service.getIntakeFilterForUser({
      id: 's1',
      firmId: 'firm-1',
      firmRole: FirmRole.SENIOR_LAWYER,
    } as any);
    expect(mockPrisma.firmMember.findMany).toHaveBeenCalled();
    expect(filter.OR).toEqual(
      expect.arrayContaining([
        { assignedUserIds: { hasSome: ['lawyer-1', 'lawyer-2'] } },
        { receivedById: { in: ['lawyer-1', 'lawyer-2'] } },
      ]),
    );
  });

  it('email threads for LAWYER require a visible linked intake', async () => {
    const filter = await service.getEmailThreadFilterForUser({
      id: 'u1',
      firmId: 'firm-1',
      firmRole: FirmRole.LAWYER,
    } as any);
    expect(filter).toEqual(
      expect.objectContaining({
        firmId: 'firm-1',
        intake: expect.objectContaining({ firmId: 'firm-1' }),
      }),
    );
  });
});

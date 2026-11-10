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

  it('OFFICE_MANAGER sees all firm clients and intakes, but only their own unlinked mail', async () => {
    const user = { id: 'om1', firmId: 'firm-1', firmRole: FirmRole.OFFICE_MANAGER } as any;
    expect(service.getClientFilterForUser(user)).toEqual({ firmId: 'firm-1' });
    expect(await service.getIntakeFilterForUser(user)).toEqual({ firmId: 'firm-1', OR: [{ case: service.getCaseFilterForUser(user) }, { case: { is: null } }] });
    expect(await service.getEmailThreadFilterForUser(user)).toEqual(
      expect.objectContaining({
        firmId: 'firm-1',
        OR: expect.arrayContaining([{ caseId: null, intakeId: null, mailboxConnection: { userId: 'om1' } }]),
      }),
    );
  });

  it('LAWYER sees clients in any role through visible cases or their own intakes', () => {
    const filter = service.getClientFilterForUser({
      id: 'u1',
      firmId: 'firm-1',
      firmRole: FirmRole.LAWYER,
    } as any);
    expect(filter).toEqual(
      expect.objectContaining({
        firmId: 'firm-1',
        OR: [
          { cases: { some: expect.objectContaining({ firmId: 'firm-1', deletedAt: null }) } },
          { additionalCaseRoles: { some: { case: expect.objectContaining({ firmId: 'firm-1', deletedAt: null }) } } },
          { caseCustomerRoles: { some: { case: expect.objectContaining({ firmId: 'firm-1', deletedAt: null }) } } },
          { intakes: { some: { OR: [{ receivedById: 'u1' }, { assignedUserIds: { has: 'u1' } }, { assessorId: 'u1' }] } } },
        ],
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
        OR: [{ case: service.getCaseFilterForUser({ id: 'u1', firmId: 'firm-1', firmRole: FirmRole.ASSISTANT } as any) }, { case: { is: null }, OR: expect.arrayContaining([{ receivedById: 'u1' }, { assignedUserIds: { has: 'u1' } }]) }],
      }),
    );
  });

  it.each([FirmRole.ASSISTANT, FirmRole.LAWYER, FirmRole.SENIOR_LAWYER])('includes the hidden intake of every visible case for %s', async (firmRole) => {
    const user = { id: 'u1', firmId: 'firm-1', firmRole } as any;
    const filter = await service.getIntakeFilterForUser(user);
    expect(filter.firmId).toBe('firm-1');
    expect(filter.OR).toContainEqual({ case: service.getCaseFilterForUser(user) });
    expect((filter.OR as any[]).find((branch) => branch.case).case).toMatchObject({ firmId: 'firm-1', deletedAt: null });
  });

  it('SENIOR_LAWYER intake filter includes lawyer assignees', async () => {
    const filter = await service.getIntakeFilterForUser({
      id: 's1',
      firmId: 'firm-1',
      firmRole: FirmRole.SENIOR_LAWYER,
    } as any);
    expect(mockPrisma.firmMember.findMany).toHaveBeenCalled();
    expect((filter.OR as any[])[1]).toMatchObject({ case: { is: null } });
    expect((filter.OR as any[])[1].OR).toEqual(
      expect.arrayContaining([
        { assignedUserIds: { hasSome: ['lawyer-1', 'lawyer-2'] } },
        { receivedById: { in: ['lawyer-1', 'lawyer-2'] } },
      ]),
    );
  });

  it('email threads for LAWYER: visible case/intake or own unlinked mail', async () => {
    const filter = await service.getEmailThreadFilterForUser({
      id: 'u1',
      firmId: 'firm-1',
      firmRole: FirmRole.LAWYER,
    } as any);
    expect(filter).toEqual(
      expect.objectContaining({
        firmId: 'firm-1',
        OR: [
          { caseId: { not: null }, case: expect.objectContaining({ firmId: 'firm-1' }) },
          { caseId: null, intakeId: { not: null }, intake: expect.objectContaining({ firmId: 'firm-1' }) },
          { caseId: null, intakeId: null, mailboxConnection: { userId: 'u1' } },
        ],
      }),
    );
  });
});

import { Test } from '@nestjs/testing';
import { ConflictException } from '@nestjs/common';
import { CasesService } from './cases.service';
import { PrismaService } from '../prisma/prisma.module';
import { CaseAccessService } from '../common/services/case-access.service';
import { CaseFeedService } from '../common/services/case-feed.service';
import { CaseActivitiesService } from './case-activities.service';
import { AssignmentNotifierService } from '../notifications/assignment-notifier.service';
import { ConflictCheckService } from '../conflict-check/conflict-check.service';

describe('POST /cases conflict gate', () => {
  const user = { id: 'u1', firmId: 'firm-1', firmRole: 'OWNER' } as any;
  const gate = { gateNewCase: jest.fn(), recordForCase: jest.fn() };
  let service: CasesService;
  let prisma: any;

  beforeEach(async () => {
    jest.clearAllMocks();
    prisma = {
      client: { findFirst: jest.fn().mockResolvedValue({ id: 'cl-1', name: 'บริษัท ก จำกัด' }), count: jest.fn().mockResolvedValue(1), findMany: jest.fn().mockResolvedValue([]) },
      clientContact: { count: jest.fn() },
      caseType: { count: jest.fn() },
      firmMember: { count: jest.fn().mockResolvedValue(1) },
      case: {
        findUnique: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockResolvedValue({ id: 'case-new', ownRef: 'C-1', openedAt: new Date(), leadLawyerId: 'u1' }),
      },
      firm: { findUnique: jest.fn().mockResolvedValue({ ownRefPrefix: 'C' }) },
      caseParticipant: { findFirst: jest.fn(), findMany: jest.fn().mockResolvedValue([]), createMany: jest.fn().mockResolvedValue({ count: 1 }), create: jest.fn() },
    };
    const module = await Test.createTestingModule({
      providers: [
        CasesService,
        { provide: PrismaService, useValue: prisma },
        { provide: CaseFeedService, useValue: { log: jest.fn() } },
        { provide: CaseAccessService, useValue: { canAccessCase: jest.fn().mockResolvedValue(true) } },
        { provide: CaseActivitiesService, useValue: { create: jest.fn() } },
        { provide: AssignmentNotifierService, useValue: { notifyAssigned: jest.fn() } },
        { provide: ConflictCheckService, useValue: gate },
      ],
    }).compile();
    service = module.get(CasesService);
  });

  const dto = {
    title: 'ฟ้องเรียกค่าเสียหาย', clientId: 'cl-1', partyRole: 'PLAINTIFF', courtLevel: 'TRIAL',
    leadLawyerId: 'u1', opponents: [{ name: 'บริษัท ข จำกัด' }], conflictOverrideReason: undefined,
  } as any;

  it('checks our client and every opponent before creating, and records the result on the case', async () => {
    gate.gateNewCase.mockResolvedValue({ result: 'CLEAR', terms: [], matches: [], overrideReason: null });

    await service.create(user, { ...dto });

    expect(gate.gateNewCase).toHaveBeenCalledWith(user, {
      parties: [
        { name: 'บริษัท ก จำกัด', side: 'OURS' },
        { name: 'บริษัท ข จำกัด', side: 'OPPONENT' },
      ],
      overrideReason: undefined,
    });
    expect(gate.recordForCase).toHaveBeenCalledWith(user, expect.objectContaining({ result: 'CLEAR' }), { caseId: 'case-new' });
  });

  it('searches the registered client name too when the name typed on the case differs', async () => {
    gate.gateNewCase.mockResolvedValue({ result: 'CLEAR', terms: [], matches: [], overrideReason: null });

    await service.create(user, { ...dto, clientName: 'ก จำกัด (สาขา)' });

    expect(gate.gateNewCase).toHaveBeenCalledWith(user, expect.objectContaining({
      parties: [
        { name: 'ก จำกัด (สาขา)', side: 'OURS' },
        { name: 'บริษัท ก จำกัด', side: 'OURS' },
        { name: 'บริษัท ข จำกัด', side: 'OPPONENT' },
      ],
    }));
  });

  it('creates nothing when the gate refuses', async () => {
    gate.gateNewCase.mockRejectedValue(new ConflictException({ code: 'CONFLICT_FOUND', matches: [] }));

    await expect(service.create(user, { ...dto })).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.case.create).not.toHaveBeenCalled();
  });
});

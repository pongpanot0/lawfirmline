import { NotFoundException } from '@nestjs/common';
import { AuthUser, FirmRole } from '@lawfirm/shared';
import { CaseAccessService } from '../common/services/case-access.service';
import { IntakeService } from './intake.service';
import { IntakeController, IntakeJourneyController } from './intake.controller';

const user = { id: 'u1', firmId: 'f1', firmRole: FirmRole.LAWYER } as AuthUser;

describe('Intake journey endpoint', () => {
  const prisma = { intake: { findFirst: jest.fn() }, intakeDocumentRequest: { findMany: jest.fn() } };
  const conflictCheck = { latestForIntake: jest.fn() };
  const access = new CaseAccessService(prisma as any);
  const service: IntakeService = Object.assign(Object.create(IntakeService.prototype), { prisma, caseAccess: access, conflictCheck });

  beforeEach(() => jest.resetAllMocks());

  it.each(['other firm', 'no intake access'])('returns 404 for %s before reading conflicts/documents', async () => {
    prisma.intake.findFirst.mockResolvedValue(null);
    await expect(service.journey(user, 'intake')).rejects.toThrow(NotFoundException);
    expect(prisma.intake.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'intake', ...await access.getIntakeFilterForUser(user) } }));
    expect(conflictCheck.latestForIntake).not.toHaveBeenCalled();
    expect(prisma.intakeDocumentRequest.findMany).not.toHaveBeenCalled();
  });

  it('uses the latest conflict result and all document requests after scoped access', async () => {
    prisma.intake.findFirst.mockResolvedValue({ title: 'เรื่อง', clientId: 'client', clientName: null, decision: 'FILE_SUIT', status: 'ACCEPTED', noticeIssuedAt: null, preLitigationStatus: 'NOT_STARTED' });
    conflictCheck.latestForIntake.mockResolvedValue({ result: 'NEEDS_REVIEW' });
    prisma.intakeDocumentRequest.findMany.mockResolvedValue([]);
    expect((await service.journey(user, 'intake')).steps[1].state).toBe('current');
    expect(conflictCheck.latestForIntake).toHaveBeenCalledWith('intake');
    expect(prisma.intakeDocumentRequest.findMany).toHaveBeenCalledWith({ where: { intakeId: 'intake' }, select: { required: true, status: true } });
  });

  it('both plural contract route and singular existing route delegate with the authenticated user', async () => {
    const result = { steps: [], next: null, canAdvance: false, blockers: [] };
    const mock = { journey: jest.fn().mockResolvedValue(result) };
    expect(Reflect.getMetadata('path', IntakeJourneyController)).toBe('intakes');
    expect(Reflect.getMetadata('path', IntakeJourneyController.prototype.journey)).toBe(':id/journey');
    expect(await new IntakeJourneyController(mock as any).journey(user, 'i')).toBe(result);
    expect(await new IntakeController(mock as any, {} as any).journey(user, 'i')).toBe(result);
    expect(mock.journey).toHaveBeenCalledWith(user, 'i');
  });

  it('adds stage labels when intake seeds playbook tasks', async () => {
    const db = { playbookRelease: { findFirst: jest.fn().mockResolvedValue({ steps: [{ title: 'ยื่นฟ้อง', stage: 'FILING' }, { title: 'ทั่วไป' }] }) }, task: { count: jest.fn().mockResolvedValue(0), create: jest.fn() } };
    const seedService = Object.assign(Object.create(IntakeService.prototype), { prisma: db });
    await seedService.seedPlaybookTasks(user, 'intake', 'release');
    expect(db.task.create.mock.calls.map(([args]) => args.data.labels)).toEqual([['playbook:release', 'stage:FILING'], ['playbook:release']]);
  });
});

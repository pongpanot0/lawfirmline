import { BadRequestException, NotFoundException } from '@nestjs/common';
import { AuthUser, CaseStage, FirmRole } from '@lawfirm/shared';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CasesService } from './cases.service';
import { CasesController } from './cases.controller';
import { AdvanceJourneyDto } from './dto/advance-journey.dto';
import { CaseAccessService } from '../common/services/case-access.service';

const user = { id: 'u1', firmId: 'f1', firmRole: FirmRole.LAWYER } as AuthUser;

describe('Case journey endpoints', () => {
  const prisma = {
    case: { findFirst: jest.fn(), findUnique: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
    task: { findMany: jest.fn() },
    appliedPlaybook: { findMany: jest.fn() },
    $transaction: jest.fn(),
    caseProceeding: { upsert: jest.fn(), findUnique: jest.fn(), count: jest.fn() },
  };
  const caseFeed = { log: jest.fn() };
  const access = new CaseAccessService(prisma as any);
  const service = new CasesService(prisma as any, access, caseFeed as any, {} as any, {} as any, {} as any, {} as any, {} as any);

  beforeEach(() => {
    jest.restoreAllMocks();
    jest.resetAllMocks();
    prisma.task.findMany.mockResolvedValue([]);
    prisma.appliedPlaybook.findMany.mockResolvedValue([]);
    prisma.$transaction.mockImplementation((fn) => fn(prisma));
    prisma.case.updateMany.mockResolvedValue({ count: 1 });
    prisma.caseProceeding.count.mockResolvedValue(0);
    prisma.case.update.mockImplementation(async ({ data }) => ({ id: 'case', status: 'OPEN', ...data }));
  });

  it.each(['other firm', 'no case access'])('returns 404 on GET and advance for %s before reading tasks', async () => {
    prisma.case.findFirst.mockResolvedValue(null);
    await expect(service.journey(user, 'case')).rejects.toThrow(NotFoundException);
    await expect(service.advanceJourney(user, 'case', {})).rejects.toThrow(NotFoundException);
    expect(prisma.case.findFirst).toHaveBeenCalledWith({ where: { id: 'case', ...access.getCaseFilterForUser(user) }, select: { id: true } });
    expect(prisma.task.findMany).not.toHaveBeenCalled();
    expect(prisma.case.update).not.toHaveBeenCalled();
  });

  it('checks tenant and deletion again on the journey data query', async () => {
    prisma.case.findFirst.mockResolvedValueOnce({ id: 'case' }).mockResolvedValueOnce(null);
    await expect(service.journey(user, 'case')).rejects.toThrow(NotFoundException);
    expect(prisma.case.findFirst).toHaveBeenLastCalledWith({ where: { id: 'case', firmId: 'f1', deletedAt: null }, select: { stage: true, partyRole: true } });
    expect(prisma.appliedPlaybook.findMany).not.toHaveBeenCalled();
  });

  it('loads stage tasks and only releases from the same firm', async () => {
    prisma.case.findFirst.mockResolvedValue({ id: 'case', stage: 'FILING', partyRole: null });
    await service.journey(user, 'case');
    expect(prisma.task.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { caseId: 'case' } }));
    expect(prisma.appliedPlaybook.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { caseId: 'case', release: { firmId: 'f1' } } }));
  });

  it('refuses advance with Thai blockers and does not call the existing update path', async () => {
    prisma.case.findFirst.mockResolvedValue({ id: 'case', stage: 'FILING', partyRole: null });
    prisma.task.findMany.mockResolvedValue([{ id: 't', title: 'ยื่นฟ้อง', status: 'TODO', parentId: null, labels: ['stage:FILING'], assignee: null, dueDate: null, skippedReason: null }]);
    const update = jest.spyOn(service, 'update');
    await expect(service.advanceJourney(user, 'case', {})).rejects.toMatchObject({ response: { blockers: ['งานยังไม่เสร็จหรือข้าม: ยื่นฟ้อง'] }, status: 400 });
    expect(update).not.toHaveBeenCalled();
  });

  it('advances through the real update path, preserving stageChangedAt and activity logging', async () => {
    const row = { id: 'case', stage: CaseStage.FILING, status: 'OPEN', partyRole: null, courtLevel: 'FIRST_INSTANCE', blackCaseNumber: null, redCaseNumber: null };
    prisma.case.findFirst.mockImplementation(async () => ({ ...row }));
    prisma.case.findUnique.mockImplementation(async () => ({ ...row }));
    prisma.case.update.mockImplementation(async ({ data }) => { Object.assign(row, data); return { ...row }; });
    prisma.task.findMany.mockResolvedValue([
      { id: 'done', title: 'ร่างคำฟ้อง', status: 'DONE', parentId: null, labels: ['stage:FILING'], assignee: null, dueDate: null, skippedReason: null },
      { id: 'skip', title: 'เอกสารเพิ่มเติม', status: 'TODO', parentId: null, labels: ['stage:FILING'], assignee: null, dueDate: null, skippedReason: 'ไม่เกี่ยวข้อง' },
      { id: 'next', title: 'คำให้การ', status: 'TODO', parentId: null, labels: ['stage:ANSWER'], assignee: null, dueDate: null, skippedReason: null },
    ]);
    const update = jest.spyOn(service, 'update');
    const result = await service.advanceJourney(user, 'case', {});
    expect(update).toHaveBeenCalledWith(user, 'case', { stage: CaseStage.ANSWER }, CaseStage.FILING);
    expect(prisma.case.updateMany).toHaveBeenCalledWith({ where: { id: 'case', stage: 'FILING' }, data: { stage: 'ANSWER', stageChangedAt: expect.any(Date) } });
    expect(prisma.case.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ stage: 'ANSWER', stageChangedAt: expect.any(Date) }) }));
    expect(caseFeed.log).toHaveBeenCalledWith(expect.objectContaining({ caseId: 'case', type: 'STAGE_CHANGE', stageTransition: { from: 'FILING', to: 'ANSWER', note: null, status: 'OPEN' } }));
    expect(result.steps.find((s) => s.state === 'current')?.key).toBe('ANSWER');
    expect(result.canAdvance).toBe(false);
    expect(result.currentTasks.map((t) => t.id)).toEqual(['next']);
  });

  it.each([[CaseStage.AWAITING_JUDGMENT, CaseStage.APPEAL], [CaseStage.APPEAL, CaseStage.SUPREME], [CaseStage.PRE_LITIGATION, CaseStage.CLOSING]])('sends %s → %s through the existing stage update', async (fromStage, toStage) => {
    prisma.case.findFirst.mockResolvedValue({ stage: fromStage, partyRole: null });
    const update = jest.spyOn(service, 'update').mockResolvedValue({} as any);
    await service.advanceJourney(user, 'case', { toStage });
    expect(update).toHaveBeenCalledWith(user, 'case', { stage: toStage }, fromStage);
  });

  it('refuses invalid explicit stage and advancing past CLOSING', async () => {
    prisma.case.findFirst.mockResolvedValue({ stage: 'FILING', partyRole: null });
    await expect(service.advanceJourney(user, 'case', { toStage: CaseStage.HEARING })).rejects.toThrow(BadRequestException);
    prisma.case.findFirst.mockResolvedValue({ stage: 'CLOSING', partyRole: null });
    await expect(service.advanceJourney(user, 'case', {})).rejects.toThrow(BadRequestException);
    expect(prisma.case.update).not.toHaveBeenCalled();
  });

  const pendingTask = { id: 't', title: 'ยื่นฟ้อง', status: 'TODO', parentId: null, labels: ['stage:FILING'], assignee: null, dueDate: null, skippedReason: null };
  const row = { id: 'case', stage: CaseStage.FILING, status: 'OPEN', partyRole: null, courtLevel: 'TRIAL', blackCaseNumber: null, redCaseNumber: null };

  it.each([CaseStage.ANSWER, CaseStage.CLOSING])('PATCH refuses %s while stage tasks are unresolved', async (stage) => {
    prisma.case.findFirst.mockResolvedValue(row);
    prisma.case.findUnique.mockResolvedValue(row);
    prisma.task.findMany.mockResolvedValue([pendingTask]);
    await expect(service.update(user, 'case', { stage })).rejects.toMatchObject({ status: 400, response: { blockers: ['งานยังไม่เสร็จหรือข้าม: ยื่นฟ้อง'] } });
    expect(prisma.case.update).not.toHaveBeenCalled();
  });

  it('PATCH refuses jumping over a stage even with no blockers', async () => {
    prisma.case.findFirst.mockResolvedValue(row);
    prisma.case.findUnique.mockResolvedValue(row);
    await expect(service.update(user, 'case', { stage: CaseStage.HEARING })).rejects.toMatchObject({ status: 400, response: { blockers: [expect.any(String)] } });
    expect(prisma.case.update).not.toHaveBeenCalled();
  });

  it.each(['PATCH', 'advance'])('%s refuses PRE_LITIGATION → SUPREME', async (path) => {
    const before = { ...row, stage: CaseStage.PRE_LITIGATION };
    prisma.case.findFirst.mockResolvedValue(before);
    prisma.case.findUnique.mockResolvedValue(before);
    const request = path === 'PATCH' ? service.update(user, 'case', { stage: CaseStage.SUPREME }) : service.advanceJourney(user, 'case', { toStage: CaseStage.SUPREME });
    await expect(request).rejects.toMatchObject({ status: 400, response: { blockers: [expect.any(String)] } });
    expect(prisma.case.update).not.toHaveBeenCalled();
  });

  it('re-checks blockers using the transaction client before advancing', async () => {
    prisma.case.findFirst.mockResolvedValue(row);
    prisma.case.findUnique.mockResolvedValue(row);
    const tx = { ...prisma, task: { findMany: jest.fn().mockResolvedValue([pendingTask]) } };
    prisma.$transaction.mockImplementation((fn) => fn(tx));
    await expect(service.advanceJourney(user, 'case', {})).rejects.toMatchObject({ status: 400, response: { blockers: ['งานยังไม่เสร็จหรือข้าม: ยื่นฟ้อง'] } });
    expect(tx.task.findMany).toHaveBeenCalled();
    expect(prisma.case.update).not.toHaveBeenCalled();
    expect(caseFeed.log).not.toHaveBeenCalled();
  });

  it('returns 409 when the conditional stage write loses a race', async () => {
    const before = { ...row, stage: CaseStage.AWAITING_JUDGMENT };
    prisma.case.findFirst.mockResolvedValue(before);
    prisma.case.findUnique.mockResolvedValue(before);
    prisma.case.updateMany.mockResolvedValue({ count: 0 });
    await expect(service.advanceJourney(user, 'case', {})).rejects.toMatchObject({ status: 409, message: 'สถานะคดีเปลี่ยนไปแล้ว รีเฟรชหน้า' });
    expect(prisma.case.update).not.toHaveBeenCalled();
    expect(caseFeed.log).not.toHaveBeenCalled();
  });

  it('does not overwrite an APPEAL entered after the initial journey read', async () => {
    const before = { ...row, stage: CaseStage.AWAITING_JUDGMENT };
    prisma.case.findFirst.mockResolvedValue(before);
    prisma.case.findUnique.mockResolvedValue({ ...row, stage: CaseStage.APPEAL });
    await expect(service.advanceJourney(user, 'case', {})).rejects.toMatchObject({ status: 409, message: 'สถานะคดีเปลี่ยนไปแล้ว รีเฟรชหน้า' });
    expect(prisma.case.update).not.toHaveBeenCalled();
    expect(caseFeed.log).not.toHaveBeenCalled();
  });

  it('detects a stage change between the update read and its transaction', async () => {
    prisma.case.findFirst.mockResolvedValue(row);
    prisma.case.findUnique.mockResolvedValue(row);
    const tx = { ...prisma, case: { ...prisma.case, findFirst: jest.fn().mockResolvedValue({ ...row, stage: CaseStage.APPEAL }) } };
    prisma.$transaction.mockImplementation((fn) => fn(tx));
    await expect(service.update(user, 'case', { stage: CaseStage.ANSWER })).rejects.toMatchObject({ status: 409, message: 'สถานะคดีเปลี่ยนไปแล้ว รีเฟรชหน้า' });
    expect(prisma.case.update).not.toHaveBeenCalled();
  });

  it('does not let a stale PATCH echo overwrite a concurrently advanced stage', async () => {
    prisma.case.findFirst.mockResolvedValue(row);
    prisma.case.findUnique.mockResolvedValue(row);
    const tx = { ...prisma, case: { ...prisma.case, findFirst: jest.fn().mockResolvedValue({ ...row, stage: CaseStage.ANSWER }) } };
    prisma.$transaction.mockImplementation((fn) => fn(tx));
    await expect(service.update(user, 'case', { stage: CaseStage.FILING, title: 'ชื่อใหม่' })).rejects.toMatchObject({ status: 409, message: 'สถานะคดีเปลี่ยนไปแล้ว รีเฟรชหน้า' });
    expect(prisma.case.update).not.toHaveBeenCalled();
  });

  it('only one of concurrent APPEAL and ENFORCEMENT advances wins', async () => {
    const current = { ...row, stage: CaseStage.AWAITING_JUDGMENT };
    prisma.case.findFirst.mockImplementation(async () => ({ ...current }));
    prisma.case.findUnique.mockImplementation(async () => ({ ...current }));
    prisma.case.updateMany.mockImplementation(async ({ where, data }) => {
      if (where.id !== current.id || where.stage !== current.stage) return { count: 0 };
      Object.assign(current, data);
      return { count: 1 };
    });
    prisma.case.update.mockImplementation(async ({ data }) => {
      Object.assign(current, data);
      return { ...current };
    });
    prisma.task.findMany.mockResolvedValue([{ ...pendingTask, labels: ['stage:APPEAL'], title: 'เตรียมอุทธรณ์' }]);
    const results = await Promise.allSettled([
      service.advanceJourney(user, 'case', { toStage: CaseStage.APPEAL }),
      service.advanceJourney(user, 'case', {}),
    ]);
    expect(results[0]).toMatchObject({ status: 'fulfilled', value: { canAdvance: false, blockers: ['งานยังไม่เสร็จหรือข้าม: เตรียมอุทธรณ์'] } });
    expect(results[1]).toMatchObject({ status: 'rejected', reason: { status: 409, message: 'สถานะคดีเปลี่ยนไปแล้ว รีเฟรชหน้า' } });
    expect(current.stage).toBe('APPEAL');
    expect(caseFeed.log).toHaveBeenCalledTimes(1);
  });

  it('PATCH allows resolved stage tasks to move directly to CLOSING', async () => {
    prisma.case.findFirst.mockResolvedValue(row);
    prisma.case.findUnique.mockResolvedValue(row);
    prisma.task.findMany.mockResolvedValue([{ ...pendingTask, status: 'DONE' }]);
    expect(await service.update(user, 'case', { stage: CaseStage.CLOSING })).toMatchObject({ stage: 'CLOSING' });
  });

  it('controllers forward identity/body and use scoped service checks (without the old 403 case guard)', async () => {
    const mock = { journey: jest.fn(), advanceJourney: jest.fn() };
    const controller = new CasesController(mock as any, {} as any, {} as any);
    controller.journey(user, 'case');
    controller.advanceJourney(user, 'case', { toStage: CaseStage.CLOSING });
    expect(mock.journey).toHaveBeenCalledWith(user, 'case');
    expect(mock.advanceJourney).toHaveBeenCalledWith(user, 'case', { toStage: 'CLOSING' });
    expect(Reflect.getMetadata('__guards__', CasesController.prototype.journey)).toBeUndefined();
  });

  it.each([null, 'FILING', 'HEARING', 'bogus'])('DTO rejects toStage %j', async (toStage) => {
    expect(await validate(plainToInstance(AdvanceJourneyDto, { toStage }))).not.toHaveLength(0);
  });
  it.each([{}, { toStage: 'APPEAL' }, { toStage: 'SUPREME' }, { toStage: 'CLOSING' }])('DTO accepts %j', async (body) => {
    expect(await validate(plainToInstance(AdvanceJourneyDto, body))).toHaveLength(0);
  });
});

import { CaseStage, CourtLevel, FirmRole } from '@lawfirm/shared';
import { CasesService } from './cases.service';
import { CasesController } from './cases.controller';
import { CaseAccessGuard } from '../common/guards/case-access.guard';

const user = { id: 'actor', firmId: 'firm', firmRole: FirmRole.OWNER } as any;
const dto = { courtLevel: CourtLevel.TRIAL, title: 'คดี', ownRef: 'REF-1', leadLawyerId: 'lead' };
const assessment = 'ประเมินและตัดสินใจแนวทาง (ฟ้อง / เจรจา / ส่งโนติส)';

describe('Case workflow round 1', () => {
  const prisma = {
    firm: { findUnique: jest.fn() }, firmMember: { count: jest.fn() },
    case: { findUnique: jest.fn(), findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
    caseAssignment: { deleteMany: jest.fn(), createMany: jest.fn() },
    emailThread: { findFirst: jest.fn() }, auditLog: { create: jest.fn() },
    caseProceeding: { upsert: jest.fn() }, $transaction: jest.fn(),
  };
  const access = { canAccessCase: jest.fn(), getTaskFilterForUser: jest.fn(), getEmailThreadFilterForUser: jest.fn() };
  const feed = { log: jest.fn() };
  const conflict = { gateNewCase: jest.fn(), recordForCase: jest.fn() };
  const notifier = { notifyAssigned: jest.fn() };
  let service: CasesService;
  beforeEach(() => {
    jest.resetAllMocks();
    jest.useFakeTimers().setSystemTime(new Date('2026-11-10T08:00:00Z'));
    prisma.firm.findUnique.mockResolvedValue(null);
    prisma.firmMember.count.mockResolvedValue(1);
    prisma.case.create.mockImplementation(async ({ data }) => ({ id: 'case', ...data }));
    prisma.case.update.mockImplementation(async ({ data }) => ({ id: 'case', status: 'OPEN', ...data }));
    prisma.$transaction.mockImplementation(async (fn) => fn(prisma));
    prisma.caseAssignment.deleteMany.mockResolvedValue({ count: 1 });
    access.canAccessCase.mockResolvedValue(true);
    access.getEmailThreadFilterForUser.mockResolvedValue({ firmId: 'firm' });
    access.getTaskFilterForUser.mockReturnValue({});
    prisma.emailThread.findFirst.mockResolvedValue(null);
    conflict.gateNewCase.mockResolvedValue({ result: 'CLEAR' });
    service = new CasesService(prisma as any, access as any, feed as any, {} as any, notifier as any, conflict as any, {} as any);
  });
  afterEach(() => jest.useRealTimers());

  it.each([CaseStage.PRE_LITIGATION, CaseStage.FILING, CaseStage.ANSWER, CaseStage.MEDIATION, CaseStage.HEARING, CaseStage.AWAITING_JUDGMENT, CaseStage.ENFORCEMENT])('opens at %s without earlier stage tasks', async (stage) => {
    await service.create(user, { ...dto, stage, courtName: 'ศาลแพ่ง', blackCaseNumber: 'พ.1/2569' });
    const data = prisma.case.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ stage, openedAtStage: stage });
    expect(data.tasks?.create?.title ?? null).toBe(stage === CaseStage.PRE_LITIGATION ? assessment : null);
  });
  it.each([CaseStage.CLOSING, CaseStage.APPEAL, CaseStage.SUPREME, CaseStage.INTAKE_REVIEW, 'BOGUS'])('rejects opening at %s', async (stage) => {
    await expect(service.create(user, { ...dto, stage } as any)).rejects.toMatchObject({ status: 400, message: 'ขั้นเริ่มต้นของคดีไม่ถูกต้อง' });
    expect(prisma.case.create).not.toHaveBeenCalled();
  });
  it('requires a court and either a black number or explicit unknown', async () => {
    await expect(service.create(user, { ...dto, stage: CaseStage.FILING })).rejects.toThrow('ระบุศาลเมื่อคดียื่นฟ้องแล้ว');
    await expect(service.create(user, { ...dto, stage: CaseStage.FILING, courtName: 'ศาลแพ่ง', blackCaseNumber: '  ' })).rejects.toThrow('ระบุหมายเลขคดีดำ หรือเลือก "ยังไม่ทราบเลขคดี"');
  });
  it('creates the unknown-number task with owner, actor, seven-day deadline and opening-stage label', async () => {
    await service.create(user, { ...dto, stage: CaseStage.HEARING, courtName: 'ศาลแพ่ง', blackCaseNumberUnknown: true });
    expect(prisma.case.create.mock.calls[0][0].data.tasks).toEqual({ create: expect.objectContaining({
      title: 'ใส่หมายเลขคดีดำ', assigneeId: 'lead', createdById: 'actor', firmId: 'firm',
      dueDate: new Date('2026-11-17T08:00:00Z'), labels: ['stage:HEARING'],
    }) });
  });
  it('defaults to pre-litigation and creates exactly one normal assessment task', async () => {
    await service.create(user, dto);
    expect(prisma.case.create.mock.calls[0][0].data).toMatchObject({ stage: 'PRE_LITIGATION', openedAtStage: 'PRE_LITIGATION', tasks: { create: {
      title: assessment, assigneeId: 'lead', createdById: 'actor', firmId: 'firm', dueDate: new Date('2026-11-17T08:00:00Z'), labels: ['stage:PRE_LITIGATION'],
    } } });
  });
  it('keeps the intake receiver as buddy and removes the incoming lead buddy on handover', async () => {
    jest.spyOn(service, 'findOne').mockResolvedValue({ id: 'case', leadLawyerId: 'old', stage: 'PRE_LITIGATION', intake: { receivedById: 'receiver' } } as any);
    await service.update(user, 'case', { leadLawyerId: 'lead' });
    expect(prisma.caseAssignment.createMany).toHaveBeenCalledWith({ data: [{ caseId: 'case', userId: 'receiver', assignmentType: 'BUDDY' }], skipDuplicates: true });
    expect(prisma.caseAssignment.deleteMany).toHaveBeenCalledWith({ where: { caseId: 'case', userId: 'lead', assignmentType: 'BUDDY' } });
  });
  it('does not add the receiver as buddy when they are the new lead', async () => {
    jest.spyOn(service, 'findOne').mockResolvedValue({ id: 'case', leadLawyerId: 'old', stage: 'PRE_LITIGATION', intake: { receivedById: 'lead' } } as any);
    await service.update(user, 'case', { leadLawyerId: 'lead' });
    expect(prisma.caseAssignment.createMany).not.toHaveBeenCalled();
    expect(prisma.caseAssignment.deleteMany).toHaveBeenCalled();
  });
  it('allows a buddy to leave and records a NOTE', async () => {
    prisma.case.findFirst.mockResolvedValue({ id: 'case', leadLawyerId: 'lead' });
    await expect((service as any).leaveTeam(user, 'case')).resolves.toEqual({ left: true });
    expect(prisma.caseAssignment.deleteMany).toHaveBeenCalledWith({ where: { caseId: 'case', userId: 'actor', assignmentType: 'BUDDY' } });
    expect(feed.log).toHaveBeenCalledWith({ caseId: 'case', userId: 'actor', type: 'NOTE', title: 'ออกจากทีมคดี' });
  });
  it('rejects the lead leaving and returns 404 for a non-buddy', async () => {
    prisma.case.findFirst.mockResolvedValue({ id: 'case', leadLawyerId: 'actor' });
    await expect((service as any).leaveTeam(user, 'case')).rejects.toMatchObject({ status: 400, message: 'เจ้าของคดีออกจากทีมไม่ได้ — เปลี่ยนเจ้าของคดีก่อน' });
    prisma.case.findFirst.mockResolvedValue({ id: 'case', leadLawyerId: 'lead' });
    prisma.caseAssignment.deleteMany.mockResolvedValue({ count: 0 });
    await expect((service as any).leaveTeam(user, 'case')).rejects.toMatchObject({ status: 404 });
  });
  it('exposes the earliest thread origin with inbound non-inline attachment counts in one query', async () => {
    prisma.case.findUnique.mockResolvedValue({ id: 'case', intake: { id: 'intake', receivedById: 'receiver', receivedBy: null, createdAt: new Date() } });
    prisma.emailThread.findFirst.mockResolvedValue({ id: 'thread', subject: 'ต้นเรื่อง', createdAt: new Date('2026-10-01'), messages: [
      { receivedAt: new Date('2026-10-01T01:00:00Z'), _count: { attachments: 2 } }, { receivedAt: new Date(), _count: { attachments: 1 } },
    ] });
    const result = await service.findOne(user, 'case');
    expect(result).toMatchObject({ originThread: { id: 'thread', subject: 'ต้นเรื่อง', receivedAt: new Date('2026-10-01T01:00:00Z'), attachmentCount: 3 } });
    expect(prisma.emailThread.findFirst).toHaveBeenCalledTimes(1);
    expect(prisma.emailThread.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { firmId: 'firm', caseId: 'case' }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], select: expect.objectContaining({ messages: expect.objectContaining({ where: { direction: 'INBOUND' } }) }) }));
    expect(prisma.case.findUnique.mock.calls[0][0].include.intake.select).toMatchObject({ receivedById: true, createdAt: true, receivedBy: { select: { id: true, firstName: true, lastName: true } } });
  });
  it('wires self-leave with case access and no owner capability', () => {
    const handler = (CasesController.prototype as any).leaveTeam;
    expect(handler).toBeDefined();
    expect(Reflect.getMetadata('__guards__', handler)).toContain(CaseAccessGuard);
    expect(Reflect.getMetadata('requireCapability', handler)).toBeUndefined();
  });
});

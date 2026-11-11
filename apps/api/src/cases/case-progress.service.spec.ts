import { AuthUser, FirmRole } from '@lawfirm/shared';
import { CaseAccessService } from '../common/services/case-access.service';
import { CasesController } from './cases.controller';
import { CasesService } from './cases.service';

const user = { id: 'u1', firmId: 'firm', firmRole: FirmRole.LAWYER } as AuthUser;
const now = new Date('2026-11-11T00:00:00.000Z');
const court = new Date('2026-12-01T00:00:00.000Z');
const row = (id: string) => ({
  id, stage: 'PRE_LITIGATION', openedAtStage: null, status: 'OPEN',
  partyRole: 'PLAINTIFF', intakeId: `intake-${id}`, title: 'คดี', clientId: 'client', clientName: null,
  caseTypeId: 'type', courtName: null, customFields: { claim: 'ครบ' },
  participants: [{ name: 'คู่ความ', side: 'OPPONENT', role: 'OTHER' }],
  intake: { title: 'คดีจากรับเรื่อง', clientId: 'client', clientName: null },
});

describe('case progress endpoint', () => {
  const prisma = {
    case: { findMany: jest.fn() }, task: { findMany: jest.fn() },
    appliedPlaybook: { findMany: jest.fn() }, conflictCheck: { findMany: jest.fn() },
    intakeDocumentRequest: { findMany: jest.fn() }, calendarEvent: { groupBy: jest.fn() },
    caseType: { findMany: jest.fn() },
  };
  const access = new CaseAccessService(prisma as any);
  const service = new CasesService(prisma as any, access, {} as any, {} as any, {} as any, {} as any, {} as any);

  beforeEach(() => {
    jest.resetAllMocks();
    jest.useFakeTimers().setSystemTime(now);
    for (const table of Object.values(prisma)) Object.values(table)[0].mockResolvedValue([]);
    prisma.caseType.findMany.mockResolvedValue([{ id: 'type', fieldSchema: [
      { key: 'claim', label: 'คำขอ', required: true },
      { key: 'opposingParty', label: 'คู่ความ', required: true },
    ] }]);
  });
  afterEach(() => jest.useRealTimers());

  it.each([1, 40])('uses seven batched queries for %i cases with the findAll access filter', async (count) => {
    const cases = Array.from({ length: count }, (_, i) => row(`case-${i}`));
    prisma.case.findMany.mockResolvedValue(cases);
    prisma.conflictCheck.findMany.mockResolvedValue(cases.map((c) => ({ caseId: c.id, intakeId: null, result: 'CLEAR', checkedAt: now })));
    const result = await service.progress(user);
    expect(result).toHaveLength(count);
    expect(result[0]).toEqual({ caseId: 'case-0', bucket: 'TODO', stepIndex: 0, stepTotal: 8, stepLabel: 'ก่อนฟ้อง', done: 3, total: 3, next: { kind: 'ADVANCE', text: 'ไปขั้นยื่นฟ้อง' }, nextCourtDate: null });
    expect(prisma.case.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: {
      firmId: 'firm', deletedAt: null,
      OR: [{ leadLawyerId: 'u1' }, { assignments: { some: { userId: 'u1' } } }, { tasks: { some: { assigneeId: 'u1' } } }],
    } }));
    for (const table of Object.values(prisma)) expect(Object.values(table)[0]).toHaveBeenCalledTimes(1);
    expect(prisma.task.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { caseId: { in: cases.map((c) => c.id) } },
      orderBy: [{ dueDate: { sort: 'asc', nulls: 'last' } }, { createdAt: 'asc' }, { id: 'asc' }],
    }));
    expect(prisma.appliedPlaybook.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { caseId: { in: cases.map((c) => c.id) }, release: { firmId: 'firm' } } }));
    expect(prisma.caseType.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { firmId: 'firm', id: { in: ['type'] } } }));
  });

  it('resolves intake-linked requests and the latest conflict, deduplicating records on both links', async () => {
    prisma.case.findMany.mockResolvedValue([row('case')]);
    prisma.conflictCheck.findMany.mockResolvedValue([
      { caseId: null, intakeId: 'intake-case', result: 'CLEAR', checkedAt: now },
      { caseId: 'case', intakeId: null, result: 'NEEDS_REVIEW', checkedAt: new Date('2026-10-01') },
    ]);
    prisma.intakeDocumentRequest.findMany.mockResolvedValue([
      { caseId: 'case', intakeId: 'intake-case', required: true, status: 'REQUESTED' },
    ]);
    prisma.calendarEvent.groupBy.mockResolvedValue([{ caseId: 'case', _min: { startAt: court } }]);
    expect(await service.progress(user)).toEqual([{
      caseId: 'case', bucket: 'WAITING_CLIENT', stepIndex: 0, stepTotal: 8, stepLabel: 'ก่อนฟ้อง', done: 2, total: 3,
      next: { kind: 'PRELIT', text: 'เอกสารจากลูกความ' }, nextCourtDate: court.toISOString(),
    }]);
    expect(prisma.conflictCheck.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { firmId: 'firm', OR: [{ caseId: { in: ['case'] } }, { intakeId: { in: ['intake-case'] } }] },
      orderBy: [{ checkedAt: 'desc' }, { id: 'desc' }],
    }));
    expect(prisma.intakeDocumentRequest.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { OR: [{ caseId: { in: ['case'] } }, { intakeId: { in: ['intake-case'] } }] } }));
    expect(prisma.calendarEvent.groupBy).toHaveBeenCalledWith({ by: ['caseId'], where: { caseId: { in: ['case'] }, type: 'COURT_DATE', startAt: { gte: now } }, _min: { startAt: true } });
  });

  it('uses the linked intake info and ignores old conflict results on another case', async () => {
    prisma.case.findMany.mockResolvedValue([{ ...row('case'), title: '', clientId: null }]);
    prisma.conflictCheck.findMany.mockResolvedValue([{ caseId: null, intakeId: 'intake-case', result: 'CLEAR', checkedAt: now }]);
    expect(await service.progress(user)).toMatchObject([{ done: 3, total: 3, next: { kind: 'ADVANCE' } }]);
  });

  it('preserves the query tie-break order for conflicts with equal checkedAt on different links', async () => {
    prisma.case.findMany.mockResolvedValue([row('case')]);
    prisma.conflictCheck.findMany.mockResolvedValue([
      { caseId: null, intakeId: 'intake-case', result: 'CLEAR', checkedAt: now },
      { caseId: 'case', intakeId: null, result: 'NEEDS_REVIEW', checkedAt: now },
    ]);
    expect(await service.progress(user)).toMatchObject([{ done: 3, total: 3, next: { kind: 'ADVANCE' } }]);
  });

  it('returns INFO for missing required case-type data using the same gate as journey', async () => {
    prisma.case.findMany.mockResolvedValue([{ ...row('case'), customFields: {}, participants: [] }]);
    expect(await service.progress(user)).toMatchObject([{ bucket: 'TODO', next: { kind: 'INFO', text: 'เติมข้อมูลคดีให้ครบ (คำขอ, คู่ความ)' } }]);
  });

  it('keeps intake-linked requests after filing without adding pre-lit checks', async () => {
    prisma.case.findMany.mockResolvedValue([{ ...row('case'), stage: 'FILING', courtName: 'ศาลแพ่ง' }]);
    prisma.intakeDocumentRequest.findMany.mockResolvedValue([{ caseId: null, intakeId: 'intake-case', required: true, status: 'MISSING' }]);
    expect(await service.progress(user)).toMatchObject([{ bucket: 'WAITING_CLIENT', done: 0, total: 0, next: { kind: 'WAIT_CLIENT', text: 'รอเอกสารจากลูกความ' } }]);
    expect(prisma.conflictCheck.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { firmId: 'firm', OR: [{ caseId: { in: [] } }, { intakeId: { in: [] } }] } }));
  });

  it('uses the first pending task in deadline order after excluding done, skipped and other-stage tasks', async () => {
    prisma.case.findMany.mockResolvedValue([{ ...row('case'), stage: 'FILING', courtName: 'ศาลแพ่ง' }]);
    const task = { caseId: 'case', title: 'ยื่นฟ้อง', status: 'TODO', labels: ['stage:FILING'], parentId: null, dueDate: court, skippedReason: null, assignee: { firstName: 'สมชาย', lastName: 'ใจดี' } };
    prisma.task.findMany.mockResolvedValue([
      { ...task, id: 'done', status: 'DONE' }, { ...task, id: 'skipped', skippedReason: 'ไม่ใช้' },
      { ...task, id: 'other', labels: ['stage:ANSWER'] }, { ...task, id: 'first' }, { ...task, id: 'undated', dueDate: null },
    ]);
    expect(await service.progress(user)).toMatchObject([{ done: 2, total: 4, next: { kind: 'TASK', text: 'ยื่นฟ้อง', taskId: 'first', dueDate: court.toISOString(), assigneeName: 'สมชาย ใจดี' } }]);
  });

  it('does no dependent queries when no cases are accessible', async () => {
    expect(await service.progress(user)).toEqual([]);
    expect(prisma.case.findMany).toHaveBeenCalledTimes(1);
    for (const [name, table] of Object.entries(prisma)) if (name !== 'case') expect(Object.values(table)[0]).not.toHaveBeenCalled();
  });

  it('registers the static progress route before the case-id route', () => {
    const methods = Object.getOwnPropertyNames(CasesController.prototype);
    expect(Reflect.getMetadata('path', CasesController.prototype.progress)).toBe('progress');
    expect(methods.indexOf('progress')).toBeLessThan(methods.indexOf('findOne'));
  });
});

import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { AuthUser, CaseStage, FirmRole } from '@lawfirm/shared';
import { FeePackagesService } from './fee-packages.service';

const owner = { id: 'u', firmId: 'f', firmRole: FirmRole.OWNER } as AuthUser;
const manager = { ...owner, firmRole: FirmRole.OFFICE_MANAGER };
const source = { id: 'p', firmId: 'f', caseTypeId: 'ct', name: 'ง่าย', version: 1, feeTaxClass: 'LITIGATION_EXEMPT', components: [{ type: 'FIXED', amount: 1000 }], milestones: [
  { id: 'a', label: 'เริ่ม', stage: CaseStage.FILING, percent: 50 }, { id: 'b', label: 'สืบ', stage: CaseStage.HEARING, percent: 50 },
] };
const first = { id: 'm1', firmId: 'f', caseId: 'c', caseFeeId: 'cf', label: 'เริ่ม', stage: 'FILING', sortOrder: 0, percent: 50, amount: 500, invoiceId: null, status: 'PENDING', notifiedAt: null, reachedAt: null };
const second = { ...first, id: 'm2', label: 'สืบ', stage: 'HEARING', sortOrder: 1 };
const saved = { id: 'cf', packageId: 'p', packageSnapshot: source, standardAmount: 1000, agreedAmount: 1000, feeTaxClass: 'LITIGATION_EXEMPT', milestones: [first, second] };

describe('FeePackagesService', () => {
  let db: any, feed: any, notifier: any, service: FeePackagesService;
  beforeEach(() => {
    db = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      case: { findFirst: jest.fn().mockResolvedValue({ id: 'c', firmId: 'f', caseTypeId: 'ct', stage: 'FILING', ownRef: 'C-1', leadLawyerId: 'lead' }), update: jest.fn() },
      caseType: { findFirst: jest.fn().mockResolvedValue({ id: 'ct' }) },
      feePackage: { findFirst: jest.fn().mockResolvedValue(source), findMany: jest.fn().mockResolvedValue([source]), create: jest.fn(), update: jest.fn() },
      caseFee: { findFirst: jest.fn().mockResolvedValue(saved), create: jest.fn().mockResolvedValue(saved), update: jest.fn().mockResolvedValue(saved) },
      caseFeeMilestone: { findMany: jest.fn().mockResolvedValue([first, second]), findFirst: jest.fn().mockResolvedValue(first), update: jest.fn(), deleteMany: jest.fn(), createMany: jest.fn() },
      auditLog: { create: jest.fn() },
    };
    db.$transaction = jest.fn((fn: any) => fn(db));
    feed = { log: jest.fn() };
    notifier = { notifyFirmOwners: jest.fn(), notifyAssigned: jest.fn() };
    service = new FeePackagesService(db, feed, notifier);
  });

  it.each(['create', 'update', 'archive'] as const)('allows only owners to %s packages', async method => {
    await expect(Promise.resolve().then(() => (service[method] as any)(manager, 'p', source))).rejects.toThrow(ForbiddenException);
    expect(db.feePackage.update).not.toHaveBeenCalled();
  });
  it('creates and versions validated packages scoped to the firm', async () => {
    await service.create(owner, { caseTypeId: 'ct', name: source.name, components: source.components, milestones: source.milestones } as any);
    expect(db.feePackage.create).toHaveBeenCalledWith({ data: expect.objectContaining({ firmId: 'f', createdById: 'u' }) });
    await service.update(owner, 'p', { name: 'ยาก' });
    expect(db.feePackage.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'p', firmId: 'f' }, data: expect.objectContaining({ version: { increment: 1 } }) }));
    db.caseType.findFirst.mockResolvedValue(null);
    await expect(service.create(owner, { ...source, caseTypeId: 'other' } as any)).rejects.toThrow(BadRequestException);
  });
  it('rejects a fee override without a reason before writing', async () => {
    await expect(service.setCaseFee(manager, 'c', { packageId: 'p', inputs: {}, agreedAmount: 800 })).rejects.toThrow(BadRequestException);
    expect(db.caseFee.update).not.toHaveBeenCalled();
  });
  it('writes the price audit, feed and estimatedFee under the case lock', async () => {
    await service.setCaseFee(manager, 'c', { packageId: 'p', inputs: {}, agreedAmount: 800, overrideReason: ' ส่วนลด ' });
    expect(db.$queryRaw.mock.calls[0][0].join('?')).toContain('FOR UPDATE');
    expect(db.$queryRaw.mock.calls[0].slice(1)).toEqual(['c', 'f']);
    expect(db.caseFee.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ agreedAmount: 800, standardAmount: 1000, overrideReason: 'ส่วนลด' }) }));
    expect(db.auditLog.create).toHaveBeenCalledWith({ data: expect.objectContaining({ firmId: 'f', action: 'CASE_FEE_CHANGED', metadata: expect.objectContaining({ from: expect.objectContaining({ agreedAmount: 1000 }), to: expect.objectContaining({ agreedAmount: 800 }), reason: 'ส่วนลด' }) }) });
    expect(feed.log).toHaveBeenCalledWith(expect.objectContaining({ caseId: 'c', description: expect.stringContaining('ส่วนลด') }), db);
    expect(db.case.update).toHaveBeenCalledWith({ where: { id: 'c', firmId: 'f' }, data: { estimatedFee: 800 } });
  });
  it.each(['INVOICED', 'PARTIAL', 'WAIVED'])('regenerates only PENDING and keeps %s', async status => {
    db.caseFee.findFirst.mockResolvedValue({ ...saved, milestones: [{ ...first, status }, second] });
    await service.setCaseFee(owner, 'c', { packageId: 'p', inputs: {}, agreedAmount: 1200, overrideReason: 'เพิ่มงาน' });
    expect(db.caseFeeMilestone.deleteMany).toHaveBeenCalledWith({ where: { firmId: 'f', caseId: 'c', caseFeeId: 'cf', status: 'PENDING' } });
    expect(db.caseFeeMilestone.createMany.mock.calls[0][0].data).toEqual([expect.objectContaining({ id: 'm2', amount: 700, sortOrder: 1 })]);
  });
  it('does not regenerate an invoiced source milestone when the package order changes', async () => {
    db.caseFee.findFirst.mockResolvedValue({ ...saved, milestones: [{ ...first, status: 'INVOICED' }, second] });
    db.feePackage.findFirst.mockResolvedValue({ ...source, milestones: [source.milestones[1], source.milestones[0]] });
    await service.setCaseFee(owner, 'c', { packageId: 'p', inputs: {} });
    expect(db.caseFeeMilestone.createMany.mock.calls[0][0].data).toEqual([expect.objectContaining({ id: 'm2', label: 'สืบ', sortOrder: 0, amount: 500 })]);
    expect(db.caseFeeMilestone.update).toHaveBeenCalledWith({ where: { id: 'm1', firmId: 'f', caseId: 'c' }, data: { sortOrder: 1 } });
  });

  it('requires used inputs and a matching case type/package firm', async () => {
    db.feePackage.findFirst.mockResolvedValue({ ...source, components: [{ type: 'PERCENT_CLAIM', rate: 10 }] });
    await expect(service.setCaseFee(owner, 'c', { packageId: 'p', inputs: {} })).rejects.toThrow(BadRequestException);
    db.feePackage.findFirst.mockResolvedValue({ ...source, caseTypeId: 'other' });
    await expect(service.setCaseFee(owner, 'c', { packageId: 'p', inputs: {} })).rejects.toThrow(BadRequestException);
    db.feePackage.findFirst.mockResolvedValue(null);
    await expect(service.setCaseFee(owner, 'c', { packageId: 'foreign', inputs: {} })).rejects.toThrow();
    expect(db.feePackage.findFirst).toHaveBeenLastCalledWith({ where: { id: 'foreign', firmId: 'f', archivedAt: null } });
  });
  it('computes reached by CASE_STAGE_ORDER rather than enum declaration', async () => {
    db.case.findFirst.mockResolvedValue({ stage: 'APPEAL' });
    db.caseFee.findFirst.mockResolvedValue({ ...saved, milestones: [{ ...first, stage: 'APPEAL' }, { ...second, stage: 'ENFORCEMENT' }] });
    expect((await service.getCaseFee(owner, 'c'))?.milestones.map(m => m.reached)).toEqual([true, false]);
  });
  it('claims each notification once and reaches only current/earlier stages', async () => {
    db.caseFeeMilestone.findMany.mockImplementation(() => db.caseFeeMilestone.update.mock.calls.length ? [] : [first, second]);
    await service.onStageChanged('c', 'f');
    await service.onStageChanged('c', 'f');
    expect(db.caseFeeMilestone.update).toHaveBeenCalledTimes(1);
    expect(db.caseFeeMilestone.update).toHaveBeenCalledWith(expect.objectContaining({ data: { reachedAt: expect.any(Date), notifiedAt: expect.any(Date) } }));
    expect(notifier.notifyFirmOwners).toHaveBeenCalledTimes(1);
    expect(notifier.notifyAssigned).toHaveBeenCalledTimes(1);
    expect(notifier.notifyFirmOwners).toHaveBeenCalledWith(expect.objectContaining({ actorUserId: 'lead', summaryText: 'ถึงงวด เริ่ม ของคดี C-1 · ฿500.00 — ออกใบแจ้งหนี้ได้' }));
  });
  it('WAIVE requires a reason and PARTIAL cannot exceed the milestone', async () => {
    await expect(service.closeOut(owner, 'c', { items: [{ milestoneId: 'm1', action: 'WAIVE' }] })).rejects.toThrow(BadRequestException);
    await expect(service.closeOut(owner, 'c', { items: [{ milestoneId: 'm1', action: 'PARTIAL', amount: 501 }] })).rejects.toThrow(BadRequestException);
    expect(db.caseFeeMilestone.update).not.toHaveBeenCalled();
    await service.closeOut(owner, 'c', { items: [{ milestoneId: 'm1', action: 'WAIVE', reason: 'จบก่อน' }] });
    expect(db.caseFeeMilestone.update).toHaveBeenLastCalledWith({ where: { id: 'm1', firmId: 'f', caseId: 'c' }, data: { status: 'WAIVED', closeAmount: 0, closeReason: 'จบก่อน' } });
    await service.closeOut(owner, 'c', { items: [{ milestoneId: 'm1', action: 'PARTIAL', amount: 250.25 }] });
    expect(db.caseFeeMilestone.update).toHaveBeenLastCalledWith(expect.objectContaining({ data: { status: 'PARTIAL', closeAmount: 250.25, closeReason: null } }));
    await service.closeOut(owner, 'c', { items: [{ milestoneId: 'm1', action: 'FULL' }] });
    expect(db.caseFeeMilestone.update).toHaveBeenLastCalledWith(expect.objectContaining({ data: { status: 'PENDING', closeAmount: 500, closeReason: null } }));
  });
  it('rejects duplicate or foreign-case close-out ids', async () => {
    await expect(service.closeOut(owner, 'c', { items: [{ milestoneId: 'm1', action: 'FULL' }, { milestoneId: 'm1', action: 'FULL' }] })).rejects.toThrow(BadRequestException);
    db.caseFeeMilestone.findFirst.mockResolvedValue(null);
    await expect(service.closeOut(owner, 'c', { items: [{ milestoneId: 'other-case', action: 'FULL' }] })).rejects.toThrow(BadRequestException);
    expect(db.caseFeeMilestone.findFirst).toHaveBeenCalledWith({ where: expect.objectContaining({ firmId: 'f', caseId: 'c', invoiceId: null }) });
  });
  it('returns only reached, unbilled milestones in this firm', async () => {
    db.caseFeeMilestone.findMany.mockResolvedValue([{ ...first, case: { stage: 'FILING' } }, { ...second, case: { stage: 'FILING' } }]);
    expect((await service.milestonesDue(manager)).map(m => m.id)).toEqual(['m1']);
    expect(db.caseFeeMilestone.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { firmId: 'f', invoiceId: null, status: { in: ['PENDING', 'PARTIAL'] }, case: { firmId: 'f', deletedAt: null } } }));
  });
});

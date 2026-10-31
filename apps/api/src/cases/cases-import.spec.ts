import { Test } from '@nestjs/testing';
import { CaseOutcome, CourtLevel, PLAN_LIMIT_CASES } from '@lawfirm/shared';
import { CasesService, CaseImportParams } from './cases.service';
import { PrismaService } from '../prisma/prisma.module';
import { CaseAccessService } from '../common/services/case-access.service';
import { CaseFeedService } from '../common/services/case-feed.service';
import { CaseActivitiesService } from './case-activities.service';
import { AssignmentNotifierService } from '../notifications/assignment-notifier.service';
import { ConflictCheckService } from '../conflict-check/conflict-check.service';

/** นำเข้าคดีเก่าจาก OneDrive — สร้างใน tx ของผู้เรียก ไม่แจ้งเตือน ไม่เปิดด่าน conflict */
describe('CasesService.createForImport', () => {
  const user = { id: 'u1', firmId: 'firm-1', firmRole: 'OWNER' } as any;
  let service: CasesService;
  let tx: any;
  const feed = { log: jest.fn() };
  const notifier = { notifyAssigned: jest.fn() };

  const base: CaseImportParams = {
    title: 'คำให้การ - พ264.69',
    blackCaseNumber: null,
    courtName: null,
    courtLevel: CourtLevel.TRIAL,
    leadLawyerId: 'lead',
    buddyIds: [],
    closed: null,
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    tx = {
      firm: { findUnique: jest.fn().mockResolvedValue({ subscriptionPlan: null, ownRefPrefix: 'TSB' }) },
      case: {
        count: jest.fn().mockResolvedValue(0),
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockImplementation(({ data }) => ({ id: 'case-1', ownRef: 'TSB-1', openedAt: new Date(), ...data })),
        update: jest.fn().mockResolvedValue({}),
      },
      caseProceeding: { upsert: jest.fn().mockResolvedValue({}) },
    };
    const module = await Test.createTestingModule({
      providers: [
        CasesService,
        { provide: PrismaService, useValue: {} },
        { provide: CaseFeedService, useValue: feed },
        { provide: CaseAccessService, useValue: {} },
        { provide: CaseActivitiesService, useValue: { create: jest.fn() } },
        { provide: AssignmentNotifierService, useValue: notifier },
        { provide: ConflictCheckService, useValue: { gateNewCase: jest.fn(), recordForCase: jest.fn() } },
      ],
    }).compile();
    service = module.get(CasesService);
    jest.spyOn(service, 'generateOwnRef').mockResolvedValue('TSB-1');
  });

  it('creates an open case at PRE_LITIGATION with buddies and a เปิดคดี feed entry in the tx', async () => {
    const result = await service.createForImport(tx, user, { ...base, buddyIds: ['lead', 'b1'] });

    expect(result).toEqual({ id: 'case-1', ownRef: 'TSB-1' });
    const data = tx.case.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ firmId: 'firm-1', stage: 'PRE_LITIGATION', leadLawyerId: 'lead', title: base.title });
    expect(data.status).toBeUndefined();
    expect(data.assignments.create).toEqual([{ user: { connect: { id: 'b1' } }, assignmentType: 'BUDDY' }]);
    expect(tx.case.update).not.toHaveBeenCalled();
    expect(feed.log).toHaveBeenCalledTimes(1);
    expect(feed.log).toHaveBeenCalledWith(expect.objectContaining({ caseId: 'case-1', title: 'เปิดคดี' }), tx);
  });

  it('creates a closed case with outcome, summary, closedAt and stage CLOSING', async () => {
    await service.createForImport(tx, user, {
      ...base,
      closed: { outcome: CaseOutcome.WITHDRAWN, closingSummary: '  นำเข้าจาก OneDrive: 76. ถอนฟ้อง  ' },
    });

    const data = tx.case.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ status: 'CLOSED', outcome: 'WITHDRAWN', closingSummary: 'นำเข้าจาก OneDrive: 76. ถอนฟ้อง' });
    expect(data.closedAt).toBeInstanceOf(Date);
    expect(tx.case.update).toHaveBeenCalledWith({
      where: { id: 'case-1' },
      data: { stage: 'CLOSING', stageChangedAt: expect.any(Date) },
    });
    expect(feed.log).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'ปิดคดี / Case Closed',
        statusTransition: { from: 'OPEN', to: 'CLOSED' },
        stageTransition: { from: 'PRE_LITIGATION', to: 'CLOSING' },
      }),
      tx,
    );
  });

  it('does not count a closed import against the plan', async () => {
    tx.firm.findUnique.mockResolvedValue({ subscriptionPlan: 'FREE', ownRefPrefix: 'TSB' });
    tx.case.count.mockResolvedValue(15);

    await expect(
      service.createForImport(tx, user, { ...base, closed: { outcome: CaseOutcome.WON, closingSummary: 'ชนะคดีแล้วนะครับ' } }),
    ).resolves.toBeDefined();
    await expect(service.createForImport(tx, user, base)).rejects.toMatchObject({
      response: expect.objectContaining({ code: PLAN_LIMIT_CASES }),
    });
  });

  it('snapshots the proceeding only when a court or number is present', async () => {
    await service.createForImport(tx, user, base);
    expect(tx.caseProceeding.upsert).not.toHaveBeenCalled();

    await service.createForImport(tx, user, { ...base, blackCaseNumber: 'พ264/2569' });
    expect(tx.caseProceeding.upsert).toHaveBeenCalledTimes(1);
  });

  it('sends no assignment notification', async () => {
    await service.createForImport(tx, { ...user, id: 'someone-else' }, { ...base, buddyIds: ['b1'] });
    expect(notifier.notifyAssigned).not.toHaveBeenCalled();
  });
});

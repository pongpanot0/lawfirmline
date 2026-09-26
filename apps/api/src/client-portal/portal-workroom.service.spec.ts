import { PortalWorkroomService } from './portal-workroom.service';

describe('PortalWorkroomService — case-backed requests', () => {
  const intakeFilter = { assignedLawyerId: 'lawyer-1' };
  const caseFilter = { members: { some: { userId: 'lawyer-1' } } };
  const access = {
    getIntakeFilterForUser: jest.fn().mockResolvedValue(intakeFilter),
    getCaseFilterForUser: jest.fn().mockReturnValue(caseFilter),
  };
  const lawyer = { id: 'lawyer-1', firmId: 'firm-1', firmRole: 'LAWYER' } as any;
  let db: any;
  let service: PortalWorkroomService;

  beforeEach(() => {
    jest.clearAllMocks();
    db = {
      $queryRaw: jest.fn(),
      portalIntakeSubmission: { findFirst: jest.fn(), findMany: jest.fn().mockResolvedValue([]), update: jest.fn() },
      auditLog: { create: jest.fn() },
    };
    db.$transaction = jest.fn((cb: (tx: any) => unknown) => cb(db));
    service = new PortalWorkroomService(db, access as any, {} as any);
  });

  it('lets a lawyer with case access see the workroom of a case-backed request', async () => {
    await service.list(lawyer);

    expect(db.portalIntakeSubmission.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { client: { firmId: 'firm-1' }, OR: [{ intake: intakeFilter }, { case: caseFilter }] },
      }),
    );
    expect(access.getCaseFilterForUser).toHaveBeenCalledWith(lawyer);
  });

  it('allows a scope proposal on a request backed by a case with no intake', async () => {
    db.portalIntakeSubmission.findFirst.mockResolvedValue({
      id: 'sub-1', intakeId: null, caseId: 'case-1', withdrawnByClient: false, deliveredAt: null,
      commitmentVersion: 0, scopeText: null, agreedDate: null,
    });
    db.portalIntakeSubmission.update.mockResolvedValue({ commitmentVersion: 1, scopeText: 'ร่างหนังสือ' });

    await expect(
      service.proposal(lawyer, 'sub-1', { scopeText: 'ร่างหนังสือ', proposedDate: '2026-10-01', version: 0 }),
    ).resolves.toEqual({ version: 1 });
  });

  it('still rejects a proposal on a request with neither intake nor case', async () => {
    db.portalIntakeSubmission.findFirst.mockResolvedValue({
      id: 'sub-1', intakeId: null, caseId: null, withdrawnByClient: false, deliveredAt: null, commitmentVersion: 0,
    });

    await expect(
      service.proposal(lawyer, 'sub-1', { scopeText: 'x', proposedDate: '2026-10-01', version: 0 }),
    ).rejects.toThrow('รับเข้า F01 หรือเปิดเป็นคดีก่อน');
  });
});

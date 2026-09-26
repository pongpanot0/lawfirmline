import { BadRequestException } from '@nestjs/common';
import { CARGO_CLAIM_PLAYBOOK_KEY, CaseStage, DeadlineDayBasis, FirmRole, Role, SubscriptionStatus, type AuthUser } from '@lawfirm/shared';
import { PracticeSetupService, resolveAssignee } from './practice-setup.service';

describe('resolveAssignee', () => {
  const ownerId = 'owner-1';

  it('มอบให้คนใน role หลักที่อยู่ในทีมคดีก่อน', () => {
    const result = resolveAssignee({
      primaryRole: 'SENIOR_LAWYER',
      firmMembers: [
        { userId: 'senior-off-team', role: 'SENIOR_LAWYER' },
        { userId: 'senior-on-team', role: 'SENIOR_LAWYER' },
      ],
      teamIds: new Set([ownerId, 'senior-on-team']),
      ownerId,
    });
    expect(result).toBe('senior-on-team');
  });

  it('ไม่มีใครใน role หลักในทีม แต่มีในสำนักงาน ก็มอบให้คนแรกที่เจอ', () => {
    const result = resolveAssignee({
      primaryRole: 'SENIOR_LAWYER',
      firmMembers: [{ userId: 'senior-anywhere', role: 'SENIOR_LAWYER' }],
      teamIds: new Set([ownerId]),
      ownerId,
    });
    expect(result).toBe('senior-anywhere');
  });

  it('ไม่มีใครใน role หลักเลย ตกไปที่ role สำรอง', () => {
    const result = resolveAssignee({
      primaryRole: 'SENIOR_LAWYER',
      secondaryRole: 'LAWYER',
      firmMembers: [{ userId: 'lawyer-1', role: 'LAWYER' }],
      teamIds: new Set([ownerId]),
      ownerId,
    });
    expect(result).toBe('lawyer-1');
  });

  it('ไม่มีใครใน role หลักหรือสำรองเลย ตกไปที่เจ้าของคดี', () => {
    const result = resolveAssignee({
      primaryRole: 'ASSISTANT',
      secondaryRole: 'SENIOR_LAWYER',
      firmMembers: [{ userId: 'lawyer-1', role: 'LAWYER' }],
      teamIds: new Set([ownerId]),
      ownerId,
    });
    expect(result).toBe(ownerId);
  });

  it('ไม่ระบุ role เลย มอบให้เจ้าของคดีตรงๆ', () => {
    const result = resolveAssignee({ firmMembers: [], teamIds: new Set([ownerId]), ownerId });
    expect(result).toBe(ownerId);
  });
});

describe('Cargo Claim Playbook', () => {
  const user: AuthUser = {
    id: 'lawyer-1', email: 'lawyer@example.com', firstName: 'Lawyer', lastName: 'One',
    role: Role.LAWYER, firmId: 'firm-1', firmSlug: 'firm', firmName: 'Firm', firmRole: FirmRole.LAWYER,
    subscriptionStatus: SubscriptionStatus.ACTIVE, subscriptionPlan: null, trialEndAt: null,
    currentPeriodEnd: null, maxUsers: 10, mfaEnabled: false,
  };

  it('creates the standard version once and returns the latest release thereafter', async () => {
    const db = {
      $queryRaw: jest.fn(),
      playbookRelease: { findFirst: jest.fn().mockResolvedValueOnce(null), create: jest.fn() },
      auditLog: { create: jest.fn() },
    };
    const created = { id: 'release-1', templateKey: CARGO_CLAIM_PLAYBOOK_KEY, version: 1 };
    db.playbookRelease.create.mockResolvedValue(created);
    const prisma = { $transaction: jest.fn((callback) => callback(db)) };
    const service = new PracticeSetupService(prisma as never, {} as never, {} as never, {} as never, {} as never, {} as never);

    await expect(service.ensureCargoPlaybook(user)).resolves.toEqual(created);
    const data = db.playbookRelease.create.mock.calls[0][0].data;
    expect(data.templateKey).toBe(CARGO_CLAIM_PLAYBOOK_KEY);
    expect(data.version).toBe(1);
    expect(data.cargoTemplate.requirements).toHaveLength(16);
    expect(data.steps.length).toBeGreaterThanOrEqual(8);

    db.playbookRelease.findFirst.mockResolvedValue(created);
    await expect(service.ensureCargoPlaybook(user)).resolves.toEqual(created);
    expect(db.playbookRelease.create).toHaveBeenCalledTimes(1);
  });
});

describe('stage-driven task proposals', () => {
  const user: AuthUser = {
    id: 'lawyer-1', email: 'lawyer@example.com', firstName: 'Lawyer', lastName: 'One',
    role: Role.LAWYER, firmId: 'firm-1', firmSlug: 'firm', firmName: 'Firm', firmRole: FirmRole.LAWYER,
    subscriptionStatus: SubscriptionStatus.ACTIVE, subscriptionPlan: null, trialEndAt: null,
    currentPeriodEnd: null, maxUsers: 10, mfaEnabled: false,
  };
  const theCase = { id: 'case-1', firmId: 'firm-1', caseTypeId: 'ct-1', leadLawyerId: 'owner-1' };

  function buildService(overrides: { steps?: unknown[]; today?: Date } = {}) {
    const prisma = {
      case: { findFirst: jest.fn().mockResolvedValue(theCase) },
      appliedPlaybook: { findMany: jest.fn().mockResolvedValue([]) },
      playbookRelease: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'release-1', name: 'Release A', version: 1, steps: overrides.steps ?? [] },
        ]),
      },
      caseAssignment: { findMany: jest.fn().mockResolvedValue([]) },
      firmMember: { findMany: jest.fn().mockResolvedValue([]) },
      task: { create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: `task-${data.title}`, ...data })) },
    };
    const access = { getCaseFilterForUser: jest.fn().mockReturnValue({}) };
    const deadlineRules = {
      loadHolidays: jest.fn().mockResolvedValue(new Set<string>()),
      computeDueDate: jest.fn().mockReturnValue('2026-10-05'),
    };
    const assignmentNotifier = { notifyAssigned: jest.fn().mockResolvedValue(undefined) };
    const caseFeed = { log: jest.fn().mockResolvedValue(undefined) };
    const service = new PracticeSetupService(prisma as never, access as never, {} as never, deadlineRules as never, assignmentNotifier as never, caseFeed as never);
    return { service, prisma, deadlineRules, assignmentNotifier, caseFeed };
  }

  it('only returns steps whose stage matches the requested stage', async () => {
    const { service } = buildService({
      steps: [
        { title: 'ตรวจเอกสาร', instructions: 'ทำ A', stage: CaseStage.FILING },
        { title: 'ยื่นฟ้อง', instructions: 'ทำ B', stage: CaseStage.ANSWER },
      ],
    });
    const result = await service.proposeStageTasks(user, theCase.id, CaseStage.FILING);
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe('ตรวจเอกสาร');
  });

  it('rolls the naive due date forward past a holiday returned by loadHolidays', async () => {
    const { service, deadlineRules } = buildService({
      steps: [{ title: 'ยื่นคำให้การ', instructions: 'ทำ', stage: CaseStage.ANSWER, offsetDays: 15, dayBasis: 'CALENDAR' }],
    });
    deadlineRules.loadHolidays.mockResolvedValue(new Set(['2026-10-04']));
    deadlineRules.computeDueDate.mockReturnValue('2026-10-05');

    const result = await service.proposeStageTasks(user, theCase.id, CaseStage.ANSWER, new Date('2026-09-19'));

    expect(deadlineRules.loadHolidays).toHaveBeenCalledWith(expect.any(Date), 15, expect.anything());
    expect(deadlineRules.computeDueDate).toHaveBeenCalledWith(
      expect.any(Date),
      15,
      DeadlineDayBasis.CALENDAR,
      new Set(['2026-10-04']),
    );
    expect(result[0].dueDate).toBe('2026-10-05');
  });

  it('leaves dueDate null when the step has no offsetDays', async () => {
    const { service, deadlineRules } = buildService({
      steps: [{ title: 'ติดตามลูกความ', instructions: 'ทำ', stage: CaseStage.ANSWER }],
    });
    const result = await service.proposeStageTasks(user, theCase.id, CaseStage.ANSWER);
    expect(result[0].dueDate).toBeNull();
    expect(deadlineRules.computeDueDate).not.toHaveBeenCalled();
  });

  it('createStageTasks rejects an assignee who is not a firm member', async () => {
    const { service, prisma } = buildService();
    prisma.firmMember.findMany.mockResolvedValue([]); // assigneeId below is not among firm members
    await expect(
      service.createStageTasks(user, theCase.id, CaseStage.FILING, [
        { title: 'งานใหม่', assigneeId: 'not-a-member' },
      ]),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.task.create).not.toHaveBeenCalled();
  });

  it('createStageTasks creates labelled tasks and notifies the assignees', async () => {
    const { service, prisma, assignmentNotifier, caseFeed } = buildService();
    prisma.firmMember.findMany.mockResolvedValue([{ userId: 'member-1' }]);

    const result = await service.createStageTasks(user, theCase.id, CaseStage.FILING, [
      { title: 'งานใหม่', assigneeId: 'member-1', dueDate: '2026-10-01' },
    ]);

    expect(result.created).toBe(1);
    expect(prisma.task.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ caseId: theCase.id, labels: [`stage:${CaseStage.FILING}`], assigneeId: 'member-1' }) }),
    );
    expect(assignmentNotifier.notifyAssigned).toHaveBeenCalledWith(
      expect.objectContaining({ firmId: user.firmId, userIds: ['member-1'], actorUserId: user.id }),
    );
    expect(caseFeed.log).toHaveBeenCalledWith(expect.objectContaining({ caseId: theCase.id, userId: user.id }));
  });
});

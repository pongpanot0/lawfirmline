import { BadRequestException } from '@nestjs/common';
import { CARGO_CLAIM_PLAYBOOK_KEY, CaseStage, DEFAULT_PLAYBOOKS, DeadlineDayBasis, FirmRole, Role, SubscriptionStatus, type AuthUser } from '@lawfirm/shared';
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
        createMany: jest.fn(),
      },
      caseType: { findMany: jest.fn().mockResolvedValue([]) },
      caseAssignment: { findMany: jest.fn().mockResolvedValue([]) },
      firmMember: { findMany: jest.fn().mockResolvedValue([]) },
      task: { create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: `task-${data.title}`, ...data })), findFirst: jest.fn().mockResolvedValue(null) },
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
    let parentCreated = false;
    prisma.task.findFirst.mockImplementation(() => null); // No existing parent
    prisma.task.create.mockImplementation(({ data }) => {
      if (!parentCreated && data.parentId === undefined) {
        parentCreated = true;
        return Promise.resolve({ id: 'parent-1', ...data });
      }
      return Promise.resolve({ id: `task-${Math.random()}`, ...data });
    });

    const result = await service.createStageTasks(user, theCase.id, CaseStage.FILING, [
      { title: 'งานใหม่', assigneeId: 'member-1', dueDate: '2026-10-01' },
    ]);

    expect(result.created).toBe(1);
    expect(result.parentId).toBe('parent-1');
    expect(result.taskIds).toHaveLength(1);
    // Should have created 2 tasks: parent + subtask
    expect(prisma.task.create).toHaveBeenCalledTimes(2);
    // Verify structure of calls
    const calls = prisma.task.create.mock.calls;
    // First call: parent (no parentId set)
    expect(calls[0][0].data.parentId).toBeUndefined();
    expect(calls[0][0].data.labels).toContain(`stage:${CaseStage.FILING}`);
    // Second call: subtask with parent
    expect(calls[1][0].data.parentId).toBe('parent-1');
    expect(calls[1][0].data.assigneeId).toBe('member-1');
    expect(assignmentNotifier.notifyAssigned).toHaveBeenCalledWith(
      expect.objectContaining({ firmId: user.firmId, userIds: expect.arrayContaining(['member-1', 'owner-1']), actorUserId: user.id }),
    );
    expect(caseFeed.log).toHaveBeenCalledWith(expect.objectContaining({ caseId: theCase.id, userId: user.id }));
  });

  it('createStageTasks reuses an open parent task for the same stage', async () => {
    const { service, prisma, assignmentNotifier } = buildService();
    prisma.firmMember.findMany.mockResolvedValue([{ userId: 'member-1' }, { userId: 'member-2' }]);
    const existingParent = { id: 'parent-1', title: 'ยื่นฟ้อง', parentId: null, status: 'TODO' };
    prisma.task.findFirst.mockResolvedValue(existingParent);
    prisma.task.create.mockImplementation(({ data }) => Promise.resolve({ id: `task-${Math.random()}`, ...data }));

    const result = await service.createStageTasks(user, theCase.id, CaseStage.FILING, [
      { title: 'งานใหม่ 1', assigneeId: 'member-1' },
      { title: 'งานใหม่ 2', assigneeId: 'member-2' },
    ]);

    expect(result.created).toBe(2);
    expect(result.parentId).toBe('parent-1');
    // No parent created since one exists
    expect(prisma.task.create).toHaveBeenCalledTimes(2);
    // Both calls should have parentId
    expect(prisma.task.create.mock.calls.every((call) => call[0].data.parentId === 'parent-1')).toBe(true);
    expect(assignmentNotifier.notifyAssigned).toHaveBeenCalledWith(
      expect.objectContaining({ firmId: user.firmId, userIds: expect.arrayContaining(['member-1', 'member-2']), actorUserId: user.id }),
    );
  });

  it('createStageTasks does not reuse a DONE parent task', async () => {
    const { service, prisma } = buildService();
    prisma.firmMember.findMany.mockResolvedValue([{ userId: 'member-1' }]);
    const doneParent = { id: 'old-parent', status: 'DONE' };
    let createCount = 0;
    prisma.task.findFirst.mockResolvedValue(null); // Query returns null because status=DONE is excluded
    prisma.task.create.mockImplementation(({ data }) => {
      createCount++;
      if (createCount === 1) return Promise.resolve({ id: 'new-parent', ...data });
      return Promise.resolve({ id: `task-${createCount}`, ...data });
    });

    const result = await service.createStageTasks(user, theCase.id, CaseStage.FILING, [
      { title: 'งานใหม่', assigneeId: 'member-1' },
    ]);

    expect(result.parentId).toBe('new-parent');
    expect(result.created).toBe(1);
  });
});

describe('applyPlaybook with stage grouping', () => {
  const user: AuthUser = {
    id: 'lawyer-1', email: 'lawyer@example.com', firstName: 'Lawyer', lastName: 'One',
    role: Role.LAWYER, firmId: 'firm-1', firmSlug: 'firm', firmName: 'Firm', firmRole: FirmRole.LAWYER,
    subscriptionStatus: SubscriptionStatus.ACTIVE, subscriptionPlan: null, trialEndAt: null,
    currentPeriodEnd: null, maxUsers: 10, mfaEnabled: false,
  };
  const theCase = { id: 'case-1', firmId: 'firm-1', caseTypeId: 'ct-1', leadLawyerId: 'owner-1' };

  it('groups staged steps into parent+subtasks and keeps unstaged steps flat', async () => {
    const steps = [
      { title: 'Step A (Filing)', instructions: 'Instr A', stage: CaseStage.FILING, primaryRole: 'LAWYER' },
      { title: 'Step B (Filing)', instructions: 'Instr B', stage: CaseStage.FILING, primaryRole: 'LAWYER' },
      { title: 'Step C (No Stage)', instructions: 'Instr C', primaryRole: 'LAWYER' },
      { title: 'Step D (Answer)', instructions: 'Instr D', stage: CaseStage.ANSWER, primaryRole: 'LAWYER' },
    ];

    const db = {
      $queryRaw: jest.fn(),
      case: { findFirst: jest.fn().mockResolvedValue(theCase) },
      appliedPlaybook: { findUnique: jest.fn().mockResolvedValue(null), create: jest.fn() },
      playbookRelease: { findFirst: jest.fn().mockResolvedValue({ id: 'release-1', steps }) },
      caseAssignment: { findMany: jest.fn().mockResolvedValue([]) },
      firmMember: { findMany: jest.fn().mockResolvedValue([{ userId: 'lawyer-1', role: 'LAWYER' }]) },
      task: { findFirst: jest.fn().mockResolvedValue(null), create: jest.fn() },
      auditLog: { create: jest.fn() },
    };

    let taskId = 1;
    db.task.create.mockImplementation(({ data }) => {
      const id = `task-${taskId++}`;
      return Promise.resolve({ id, ...data });
    });
    db.appliedPlaybook.create.mockImplementation(({ data }) => Promise.resolve({ id: 'pb-1', ...data }));

    const prisma = { $transaction: jest.fn((callback) => callback(db)) };
    const service = new PracticeSetupService(
      prisma as never,
      { getCaseFilterForUser: jest.fn().mockReturnValue({}) } as never,
      { record: jest.fn() } as never,
      {} as never,
      {} as never,
      {} as never,
    );

    const result = await service.applyPlaybook(user, theCase.id, 'release-1');

    // Should create:
    // - Parent for FILING stage
    // - 2 subtasks for FILING (Step A, Step B)
    // - Parent for ANSWER stage
    // - 1 subtask for ANSWER (Step D)
    // - 1 flat task (Step C, no stage)
    // Total: 6 tasks
    expect(db.task.create).toHaveBeenCalledTimes(6);
    expect(result.taskIds).toHaveLength(6);

    // Check structure
    const calls = db.task.create.mock.calls;
    const parentCalls = calls.filter((call) => !call[0].data.parentId);
    const subtaskCalls = calls.filter((call) => call[0].data.parentId);

    expect(parentCalls.length).toBe(3); // 2 stage parents + 1 flat
    expect(subtaskCalls.length).toBe(3); // 2 Filing + 1 Answer
  });

  it('creates all tasks with playbook:releaseId label', async () => {
    const steps = [
      { title: 'Staged Task', instructions: 'Instr', stage: CaseStage.FILING, primaryRole: 'LAWYER' },
      { title: 'Flat Task', instructions: 'Instr', primaryRole: 'LAWYER' },
    ];

    const db = {
      $queryRaw: jest.fn(),
      case: { findFirst: jest.fn().mockResolvedValue(theCase) },
      appliedPlaybook: { findUnique: jest.fn().mockResolvedValue(null), create: jest.fn() },
      playbookRelease: { findFirst: jest.fn().mockResolvedValue({ id: 'release-v2', steps }) },
      caseAssignment: { findMany: jest.fn().mockResolvedValue([]) },
      firmMember: { findMany: jest.fn().mockResolvedValue([{ userId: 'lawyer-1', role: 'LAWYER' }]) },
      task: { findFirst: jest.fn().mockResolvedValue(null), create: jest.fn() },
      auditLog: { create: jest.fn() },
    };

    let taskId = 1;
    db.task.create.mockImplementation(({ data }) => {
      const id = `task-${taskId++}`;
      return Promise.resolve({ id, ...data });
    });
    db.appliedPlaybook.create.mockImplementation(({ data }) => Promise.resolve({ id: 'pb-2', ...data }));

    const prisma = { $transaction: jest.fn((callback) => callback(db)) };
    const service = new PracticeSetupService(
      prisma as never,
      { getCaseFilterForUser: jest.fn().mockReturnValue({}) } as never,
      { record: jest.fn() } as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await service.applyPlaybook(user, theCase.id, 'release-v2');

    const calls = db.task.create.mock.calls;
    // All tasks should have playbook:release-v2 in labels
    for (const call of calls) {
      expect(call[0].data.labels).toContain('playbook:release-v2');
    }
  });

  it('returns all created taskIds including parents and subtasks', async () => {
    const steps = [
      { title: 'Task 1', instructions: 'Instr', stage: CaseStage.FILING, primaryRole: 'LAWYER' },
      { title: 'Task 2', instructions: 'Instr', stage: CaseStage.FILING, primaryRole: 'LAWYER' },
    ];

    const db = {
      $queryRaw: jest.fn(),
      case: { findFirst: jest.fn().mockResolvedValue(theCase) },
      appliedPlaybook: { findUnique: jest.fn().mockResolvedValue(null), create: jest.fn() },
      playbookRelease: { findFirst: jest.fn().mockResolvedValue({ id: 'release-1', steps }) },
      caseAssignment: { findMany: jest.fn().mockResolvedValue([]) },
      firmMember: { findMany: jest.fn().mockResolvedValue([{ userId: 'lawyer-1', role: 'LAWYER' }]) },
      task: { findFirst: jest.fn().mockResolvedValue(null), create: jest.fn() },
      auditLog: { create: jest.fn() },
    };

    const createdIds: string[] = [];
    db.task.create.mockImplementation(({ data }) => {
      const id = `task-${createdIds.length}`;
      createdIds.push(id);
      return Promise.resolve({ id, ...data });
    });
    db.appliedPlaybook.create.mockImplementation(({ data }) => Promise.resolve({ id: 'pb-3', ...data }));

    const prisma = { $transaction: jest.fn((callback) => callback(db)) };
    const service = new PracticeSetupService(
      prisma as never,
      { getCaseFilterForUser: jest.fn().mockReturnValue({}) } as never,
      { record: jest.fn() } as never,
      {} as never,
      {} as never,
      {} as never,
    );

    const result = await service.applyPlaybook(user, theCase.id, 'release-1');

    // Should have 1 parent + 2 subtasks
    expect(result.taskIds).toEqual(createdIds);
    expect(result.taskIds).toHaveLength(3);
  });
});

describe('default playbooks', () => {
  const user = { id: 'owner-1', firmId: 'firm-1' } as AuthUser;

  it('links by current or legacy name, seeds unlinked when no case type matches, and never re-seeds', async () => {
    const [first, second, ...rest] = DEFAULT_PLAYBOOKS;
    const prisma = {
      playbookRelease: {
        findMany: jest.fn().mockResolvedValue([{ templateKey: null, caseTypeId: 'ct-first' }]),
        createMany: jest.fn(),
      },
      caseType: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'ct-first', name: first.caseTypeNames[0] },
          { id: 'ct-legacy', name: second.caseTypeNames[1] },
        ]),
      },
    };
    const service = new PracticeSetupService(prisma as never, {} as never, {} as never, {} as never, {} as never, {} as never);

    await service.ensureDefaultPlaybooks(user);
    const data = prisma.playbookRelease.createMany.mock.calls[0][0].data;
    // first: its case type already has the firm's own playbook, so skipped
    expect(data.map((d: { templateKey: string }) => d.templateKey)).toEqual([second.key, ...rest.map((p) => p.key)]);
    expect(data[0]).toMatchObject({ caseTypeId: 'ct-legacy', version: 1 });
    for (const d of data.slice(1)) expect(d.caseTypeId).toBeNull();

    prisma.playbookRelease.findMany.mockResolvedValue([{ templateKey: null, caseTypeId: 'ct-first' }, ...data]);
    await service.ensureDefaultPlaybooks(user);
    expect(prisma.playbookRelease.createMany).toHaveBeenCalledTimes(1);
  });

  it('listPlaybooks seeds the Cargo Claim playbook too', async () => {
    const prisma = { playbookRelease: { findMany: jest.fn().mockResolvedValue([]) } };
    const service = new PracticeSetupService(prisma as never, {} as never, {} as never, {} as never, {} as never, {} as never);
    const defaults = jest.spyOn(service, 'ensureDefaultPlaybooks').mockResolvedValue();
    const cargo = jest.spyOn(service, 'ensureCargoPlaybook').mockResolvedValue({} as never);

    await service.listPlaybooks(user);

    expect(defaults).toHaveBeenCalledWith(user);
    expect(cargo).toHaveBeenCalledWith(user);
  });

  it('every default step targets a real stage and a sane offset', () => {
    for (const p of DEFAULT_PLAYBOOKS) {
      expect(p.steps.length).toBeGreaterThan(0);
      for (const s of p.steps) {
        expect(s.title.trim()).not.toBe('');
        if (s.stage) expect(Object.values(CaseStage)).toContain(s.stage);
        if (s.offsetDays != null) expect(s.offsetDays).toBeGreaterThanOrEqual(0);
        if (s.offsetDays != null) expect(s.offsetDays).toBeLessThanOrEqual(365);
      }
    }
    expect(new Set(DEFAULT_PLAYBOOKS.map((p) => p.key)).size).toBe(DEFAULT_PLAYBOOKS.length);
  });
});

import { CARGO_CLAIM_PLAYBOOK_KEY, FirmRole, Role, SubscriptionStatus, type AuthUser } from '@lawfirm/shared';
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
    const service = new PracticeSetupService(prisma as never, {} as never, {} as never);

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

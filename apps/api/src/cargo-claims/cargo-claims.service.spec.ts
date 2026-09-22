import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { AuthUser, FirmRole, Role, SubscriptionStatus } from '@lawfirm/shared';
import { CargoClaimsService } from './cargo-claims.service';

const user: AuthUser = {
  id: 'user-1',
  email: 'lawyer@example.com',
  firstName: 'Lawyer',
  lastName: 'One',
  role: Role.LAWYER,
  firmId: 'firm-1',
  firmSlug: 'firm',
  firmName: 'Firm',
  firmRole: FirmRole.LAWYER,
  subscriptionStatus: SubscriptionStatus.ACTIVE,
  subscriptionPlan: null,
  trialEndAt: null,
  currentPeriodEnd: null,
  maxUsers: 10,
  mfaEnabled: false,
};

function setup() {
  const prisma = {
    intake: { findFirst: jest.fn() },
    cargoClaim: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    cargoDocumentRequirement: { update: jest.fn() },
    document: { findFirst: jest.fn() },
  };
  const caseAccess = {
    canAccessCase: jest.fn(),
    getIntakeFilterForUser: jest.fn().mockResolvedValue({ firmId: 'firm-1' }),
  };
  const practiceSetup = {
    ensureCargoPlaybook: jest.fn().mockResolvedValue({
      id: 'release-1',
      name: 'Cargo Claim Assessment',
      version: 1,
      cargoTemplate: { requirements: [
        { code: 'INVOICE_PACKING_LIST', label: 'Invoice v1', requiredByDefault: true },
        { code: 'OTHER', label: 'Other v1', requiredByDefault: false },
      ] },
    }),
    applyPlaybook: jest.fn().mockResolvedValue({ id: 'applied-1' }),
  };
  return {
    prisma,
    caseAccess,
    practiceSetup,
    service: new CargoClaimsService(prisma as never, caseAccess as never, practiceSetup as never),
  };
}

describe('CargoClaimsService', () => {
  it('snapshots the checklist from the selected Cargo Playbook release', async () => {
    const { service, prisma, practiceSetup } = setup();
    prisma.intake.findFirst.mockResolvedValue({ id: 'intake-1', cargoClaim: null });
    prisma.cargoClaim.create.mockImplementation(async ({ data }) => ({ id: 'cargo-1', ...data }));

    await service.ensureForIntake(user, 'intake-1', { assuredName: 'ABC' });

    expect(prisma.cargoClaim.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          firmId: 'firm-1',
          intakeId: 'intake-1',
          playbookReleaseId: 'release-1',
          assuredName: 'ABC',
          requirements: {
            create: [
              { code: 'INVOICE_PACKING_LIST', label: 'Invoice v1', required: true },
              { code: 'OTHER', label: 'Other v1', required: false },
            ],
          },
        }),
      }),
    );
    expect(practiceSetup.ensureCargoPlaybook).toHaveBeenCalledWith(user);
  });

  it('reuses the intake profile and attaches that same record to its case', async () => {
    const { service, prisma, caseAccess, practiceSetup } = setup();
    const existing = { id: 'cargo-1', intakeId: 'intake-1', caseId: null, playbookReleaseId: 'release-1', requirements: [] };
    prisma.intake.findFirst.mockResolvedValue({ id: 'intake-1', cargoClaim: existing });
    caseAccess.canAccessCase.mockResolvedValue(true);
    prisma.cargoClaim.update.mockResolvedValue({ ...existing, caseId: 'case-1' });

    const ensured = await service.ensureForIntake(user, 'intake-1');
    const attached = await service.attachCase(user, 'intake-1', 'case-1');

    expect(ensured.id).toBe('cargo-1');
    expect(attached.id).toBe('cargo-1');
    expect(prisma.cargoClaim.create).not.toHaveBeenCalled();
    expect(prisma.cargoClaim.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'cargo-1' }, data: { caseId: 'case-1' } }),
    );
    expect(practiceSetup.applyPlaybook).toHaveBeenCalledWith(user, 'case-1', 'release-1');
  });

  it('rejects a direct-case cargo profile when the lawyer cannot access the case', async () => {
    const { service, caseAccess } = setup();
    caseAccess.canAccessCase.mockResolvedValue(false);

    await expect(service.ensureForCase(user, 'case-1')).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('does not silently create cargo data for an intake outside the visible scope', async () => {
    const { service, prisma } = setup();
    prisma.intake.findFirst.mockResolvedValue(null);

    await expect(service.ensureForIntake(user, 'intake-404')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('records the confirming lawyer and rejects confirmation by an assistant', async () => {
    const { service, prisma, caseAccess } = setup();
    const existing = { id: 'cargo-1', caseId: 'case-1', requirements: [] };
    caseAccess.canAccessCase.mockResolvedValue(true);
    prisma.cargoClaim.findUnique.mockResolvedValue(existing);
    prisma.cargoClaim.update.mockImplementation(async ({ data }) => ({ ...existing, ...data }));

    await service.updateForCase(user, 'case-1', { confirm: true });
    expect(prisma.cargoClaim.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ reviewStatus: 'CONFIRMED', confirmedById: user.id }),
    }));

    const assistant = { ...user, id: 'assistant-1', firmRole: FirmRole.ASSISTANT };
    await expect(service.updateForCase(assistant, 'case-1', { confirm: true })).rejects.toBeInstanceOf(ForbiddenException);
  });
});

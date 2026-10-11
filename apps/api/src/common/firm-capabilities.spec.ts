import { FirmRole, FIRM_ROLE_RANK, hasFirmCapability, canInviteFirmRole, FIRM_ROLE_LABELS, rolesWithCapability } from '@lawfirm/shared';

describe('firm capabilities', () => {
  it('OWNER has every capability', () => {
    for (const cap of ['viewAllCases', 'manageInvoices', 'approveExpenses', 'issueCashAdvance', 'manageMembers', 'manageSubscription', 'deleteCase', 'reassignCaseLead'] as const) {
      expect(hasFirmCapability(FirmRole.OWNER, cap)).toBe(true);
    }
  });

  it('OFFICE_MANAGER runs the office but cannot move money out or manage members', () => {
    const om = FirmRole.OFFICE_MANAGER;
    for (const cap of ['viewAllCases', 'manageInvoices', 'viewPettyCash', 'approveLeave', 'inviteMembers', 'runOperations', 'viewFirmReports', 'manageFirmContent'] as const) {
      expect(hasFirmCapability(om, cap)).toBe(true);
    }
    for (const cap of ['approveExpenses', 'issueCashAdvance', 'manageMembers', 'manageSubscription', 'deleteCase', 'reassignCaseLead'] as const) {
      expect(hasFirmCapability(om, cap)).toBe(false);
    }
  });

  it('lawyers, assistants and externals have no capabilities', () => {
    for (const role of [FirmRole.SENIOR_LAWYER, FirmRole.LAWYER, FirmRole.ASSISTANT, FirmRole.EXTERNAL]) {
      expect(hasFirmCapability(role, 'viewAllCases')).toBe(false);
      expect(hasFirmCapability(role, 'manageInvoices')).toBe(false);
    }
    expect(hasFirmCapability(undefined, 'viewAllCases')).toBe(false);
    expect(hasFirmCapability('NONSENSE', 'viewAllCases')).toBe(false);
  });

  it('office manager invites up to SENIOR_LAWYER only', () => {
    const om = FirmRole.OFFICE_MANAGER;
    expect(canInviteFirmRole(om, FirmRole.SENIOR_LAWYER)).toBe(true);
    expect(canInviteFirmRole(om, FirmRole.LAWYER)).toBe(true);
    expect(canInviteFirmRole(om, FirmRole.ASSISTANT)).toBe(true);
    expect(canInviteFirmRole(om, FirmRole.EXTERNAL)).toBe(true);
    expect(canInviteFirmRole(om, FirmRole.OWNER)).toBe(false);
    expect(canInviteFirmRole(om, FirmRole.OFFICE_MANAGER)).toBe(false);
    expect(canInviteFirmRole(FirmRole.OWNER, FirmRole.OWNER)).toBe(true);
    expect(canInviteFirmRole(FirmRole.LAWYER, FirmRole.ASSISTANT)).toBe(false);
  });

  it('rank and labels', () => {
    expect(FIRM_ROLE_RANK[FirmRole.OFFICE_MANAGER]).toBe(2);
    expect(FIRM_ROLE_LABELS[FirmRole.OFFICE_MANAGER]).toEqual({ th: 'ผู้จัดการสำนักงาน', en: 'Office manager' });
    expect(rolesWithCapability('approveLeave')).toEqual([FirmRole.OWNER, FirmRole.OFFICE_MANAGER]);
  });
});

import { FirmRole } from './firm-role';

/**
 * What a firm member may do beyond their own cases. OWNER holds all of them;
 * OFFICE_MANAGER runs the office but cannot pay money out, manage members or the subscription.
 * Every "owner-only" check in api/web/mobile asks one of these instead of comparing to OWNER.
 */
export type FirmCapability =
  | 'viewAllCases'
  | 'manageInvoices'
  | 'viewPettyCash'
  | 'approveLeave'
  | 'inviteMembers'
  | 'runOperations'
  | 'viewFirmReports'
  | 'manageFirmContent'
  | 'approveExpenses'
  | 'issueCashAdvance'
  | 'manageMembers'
  | 'manageSubscription'
  | 'deleteCase'
  | 'reassignCaseLead';

const OFFICE = [FirmRole.OWNER, FirmRole.OFFICE_MANAGER] as const;
const OWNER = [FirmRole.OWNER] as const;

export const FIRM_CAPABILITIES: Record<FirmCapability, readonly FirmRole[]> = {
  viewAllCases: OFFICE,
  manageInvoices: OFFICE,
  viewPettyCash: OFFICE,
  approveLeave: OFFICE,
  inviteMembers: OFFICE,
  runOperations: OFFICE,
  viewFirmReports: OFFICE,
  manageFirmContent: OFFICE,
  approveExpenses: OWNER,
  issueCashAdvance: OWNER,
  manageMembers: OWNER,
  manageSubscription: OWNER,
  deleteCase: OWNER,
  reassignCaseLead: OWNER,
};

export function hasFirmCapability(role: FirmRole | string | null | undefined, cap: FirmCapability): boolean {
  return !!role && (FIRM_CAPABILITIES[cap] as readonly string[]).includes(role);
}

export function rolesWithCapability(cap: FirmCapability): FirmRole[] {
  return [...FIRM_CAPABILITIES[cap]];
}

const OFFICE_MANAGER_INVITABLE: readonly FirmRole[] = [
  FirmRole.SENIOR_LAWYER,
  FirmRole.LAWYER,
  FirmRole.ASSISTANT,
  FirmRole.EXTERNAL,
];

/** May `inviter` invite someone into `target` role? Owners invite anyone; office managers up to SENIOR_LAWYER. */
export function canInviteFirmRole(inviter: FirmRole | string, target: FirmRole): boolean {
  if (inviter === FirmRole.OWNER) return true;
  if (inviter === FirmRole.OFFICE_MANAGER) return OFFICE_MANAGER_INVITABLE.includes(target);
  return false;
}

export const FIRM_ROLE_LABELS: Record<FirmRole, { th: string; en: string }> = {
  [FirmRole.OWNER]: { th: 'เจ้าของสำนักงาน', en: 'Owner' },
  [FirmRole.SENIOR_LAWYER]: { th: 'ทนายอาวุโส', en: 'Senior lawyer' },
  [FirmRole.OFFICE_MANAGER]: { th: 'ผู้จัดการสำนักงาน', en: 'Office manager' },
  [FirmRole.LAWYER]: { th: 'ทนายความ', en: 'Lawyer' },
  [FirmRole.ASSISTANT]: { th: 'ผู้ช่วย', en: 'Assistant' },
  [FirmRole.EXTERNAL]: { th: 'ผู้รับงานภายนอก', en: 'External' },
};

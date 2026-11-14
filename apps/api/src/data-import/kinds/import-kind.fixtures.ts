import { AuthUser, FirmRole, Role, SubscriptionStatus } from '@lawfirm/shared';
import type { RawImportRow } from '../../common/excel-import/types';
import type { ImportKindDeps } from '../import-kind';
import type { StaffCaseLookups } from '../kind-helpers';

export const importUser: AuthUser = {
  id: 'owner', email: 'owner@example.com', firstName: 'เจ้าของ', lastName: 'สำนักงาน', role: Role.ADMIN,
  firmId: 'firm-a', firmSlug: 'firm-a', firmRole: FirmRole.OWNER, firmName: 'สำนักงาน ก',
  subscriptionStatus: SubscriptionStatus.TRIAL, subscriptionPlan: null, trialEndAt: null, currentPeriodEnd: null, maxUsers: 10, mfaEnabled: false,
};
export const emptyDeps = {} as ImportKindDeps;
export const row = (values: RawImportRow['values'], rowNumber = 2): RawImportRow => ({ rowNumber, values });
export function staffLookups(): StaffCaseLookups {
  return {
    members: [
      { id: 'owner', email: 'owner@example.com', name: 'เจ้าของ สำนักงาน', role: FirmRole.OWNER, defaultHourlyRate: 2500 },
      { id: 'lawyer', email: 'lawyer@example.com', name: 'ทนาย หนึ่ง', role: FirmRole.LAWYER, defaultHourlyRate: null },
      { id: 'assistant', email: 'assistant@example.com', name: 'ผู้ช่วย หนึ่ง', role: FirmRole.ASSISTANT, defaultHourlyRate: 500 },
    ],
    cases: [{ id: 'case-a', ownRef: 'REF001', title: 'คดีหนึ่ง', leadLawyerId: 'lawyer', courtName: 'ศาลแพ่ง' }],
    existing: new Set(),
  };
}

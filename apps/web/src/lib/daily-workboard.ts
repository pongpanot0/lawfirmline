import { followUpReason, FIRM_ROLE_LABELS } from '@lawfirm/shared';
import type { DailyWorkTask } from '@lawfirm/shared';
export { daysLate, followUpReason, updatedOn, assignmentCandidates, taskDayKey } from '@lawfirm/shared';

export const ROLE_LABELS: Record<string, string> = { OWNER: 'Owner', SENIOR_LAWYER: 'ทนายอาวุโส', OFFICE_MANAGER: FIRM_ROLE_LABELS.OFFICE_MANAGER.th, LAWYER: 'ทนาย', ASSISTANT: 'ผู้ช่วย', EXTERNAL: 'ผู้รับงานภายนอก (ฟรีแลนซ์)' };

export const bangkokDay = (iso: string) => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Bangkok' }).format(new Date(iso));

export function needsOwner(task: DailyWorkTask, date: string) {
  return followUpReason(task, date) !== null;
}

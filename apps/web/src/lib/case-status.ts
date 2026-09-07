import type { CaseStatus } from '@lawfirm/shared';
import type { VariantProps } from 'class-variance-authority';
import { badgeVariants } from '@/components/ui/badge';

type BadgeVariant = NonNullable<VariantProps<typeof badgeVariants>['variant']>;

const STATUS_MAP: Record<string, { label: string; variant: BadgeVariant }> = {
  OPEN: { label: 'คดีใหม่', variant: 'new' },
  DRAFTING: { label: 'ร่างคำฟ้อง', variant: 'drafting' },
  IN_PROGRESS: { label: 'ยื่นฟ้องแล้ว', variant: 'filed' },
  COURT_DATE: { label: 'นัดศาล', variant: 'hearing' },
  PENDING: { label: 'รอคำพิพากษา', variant: 'judgment' },
  CLOSED: { label: 'ปิดคดี', variant: 'closed' },
};

export function getCaseStatusDisplay(status: CaseStatus | string) {
  return STATUS_MAP[status] ?? { label: String(status), variant: 'muted' as BadgeVariant };
}

/** Ordered case lifecycle stages, used to render the portal's stage-progress track. */
const STAGE_ORDER = ['OPEN', 'DRAFTING', 'IN_PROGRESS', 'COURT_DATE', 'PENDING', 'CLOSED'];

/** 0-based index of a case's status within its lifecycle, for a 5-segment stage track. */
export function getCaseStageIndex(status: CaseStatus | string): number {
  const index = STAGE_ORDER.indexOf(status as string);
  return index === -1 ? 0 : index;
}

export const CASE_STAGE_COUNT = STAGE_ORDER.length - 1;

/** Status filter options in display order, sharing the same Thai labels as the badge. */
export const CASE_STATUS_OPTIONS: { value: string; label: string }[] = [
  'OPEN',
  'DRAFTING',
  'IN_PROGRESS',
  'COURT_DATE',
  'PENDING',
  'CLOSED',
].map((value) => ({ value, label: STATUS_MAP[value].label }));

export const ACTIVITY_ICONS = {
  case: 'Briefcase',
  hearing: 'Gavel',
  document: 'FileText',
  payment: 'Banknote',
  task: 'CheckSquare',
} as const;

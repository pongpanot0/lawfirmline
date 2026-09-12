import type { CaseStatus } from '@lawfirm/shared';
import type { VariantProps } from 'class-variance-authority';
import { badgeVariants } from '@/components/ui/badge';

type BadgeVariant = NonNullable<VariantProps<typeof badgeVariants>['variant']>;

/** Status labels live in the i18n copy; callers pass `d.caseStatus` from useDashboardT(). */
export type CaseStatusLabels = Record<string, string>;

const STATUS_VARIANTS: Record<string, BadgeVariant> = {
  OPEN: 'new',
  DRAFTING: 'drafting',
  IN_PROGRESS: 'filed',
  COURT_DATE: 'hearing',
  PENDING: 'judgment',
  CLOSED: 'closed',
};

export function getCaseStatusDisplay(status: CaseStatus | string, labels: CaseStatusLabels) {
  return {
    label: labels[status as string] ?? String(status),
    variant: STATUS_VARIANTS[status as string] ?? ('muted' as BadgeVariant),
  };
}

/** Ordered case lifecycle stages, used to render the portal's stage-progress track. */
const STAGE_ORDER = ['OPEN', 'DRAFTING', 'IN_PROGRESS', 'COURT_DATE', 'PENDING', 'CLOSED'];

/** 0-based index of a case's status within its lifecycle, for a 5-segment stage track. */
export function getCaseStageIndex(status: CaseStatus | string): number {
  const index = STAGE_ORDER.indexOf(status as string);
  return index === -1 ? 0 : index;
}

export const CASE_STAGE_COUNT = STAGE_ORDER.length - 1;

/** Status filter options in lifecycle order, sharing the same labels as the badge. */
export function caseStatusOptions(labels: CaseStatusLabels): { value: string; label: string }[] {
  return STAGE_ORDER.map((value) => ({ value, label: labels[value] ?? value }));
}

export const ACTIVITY_ICONS = {
  case: 'Briefcase',
  hearing: 'Gavel',
  document: 'FileText',
  payment: 'Banknote',
  task: 'CheckSquare',
} as const;

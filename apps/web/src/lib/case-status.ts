import type { CaseStatus } from '@lawfirm/shared';
import type { VariantProps } from 'class-variance-authority';
import { badgeVariants } from '@/components/ui/badge';

type BadgeVariant = NonNullable<VariantProps<typeof badgeVariants>['variant']>;

const STATUS_MAP: Record<string, { label: string; variant: BadgeVariant }> = {
  OPEN: { label: 'New', variant: 'new' },
  DRAFTING: { label: 'Drafting', variant: 'drafting' },
  IN_PROGRESS: { label: 'Filed', variant: 'filed' },
  COURT_DATE: { label: 'Hearing', variant: 'hearing' },
  PENDING: { label: 'Judgment Pending', variant: 'judgment' },
  CLOSED: { label: 'Closed', variant: 'closed' },
};

export function getCaseStatusDisplay(status: CaseStatus | string) {
  return STATUS_MAP[status] ?? { label: String(status), variant: 'muted' as BadgeVariant };
}

export const ACTIVITY_ICONS = {
  case: 'Briefcase',
  hearing: 'Gavel',
  document: 'FileText',
  payment: 'Banknote',
  task: 'CheckSquare',
} as const;

import { CASE_STAGE_ORDER, type CaseStage, type CaseStatus } from '@lawfirm/shared';
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
  ARCHIVED: 'muted',
};

export function getCaseStatusDisplay(status: CaseStatus | string, labels: CaseStatusLabels) {
  return {
    label: labels[status as string] ?? String(status),
    variant: STATUS_VARIANTS[status as string] ?? ('muted' as BadgeVariant),
  };
}

/**
 * ลำดับสถานะงาน ใช้ทำตัวเลือกกรอง — ไม่ใช่ขั้นตอนของคดี
 * (ขั้นตอนอยู่ที่ `Case.stage` ดู `lib/stage-labels.ts`)
 */
const STATUS_ORDER = ['OPEN', 'DRAFTING', 'IN_PROGRESS', 'COURT_DATE', 'PENDING', 'CLOSED', 'ARCHIVED'];

/**
 * ตำแหน่งของคดีในกระบวนพิจารณา สำหรับแถบความคืบหน้าใน portal
 *
 * ก่อนหน้านี้ใช้ status มาแทน stage ซึ่งตอบผิดคำถาม — คดีที่ `PENDING`
 * อาจอยู่ขั้นสืบพยานหรือบังคับคดีก็ได้. ตอนนี้อ่านจาก `stage` จริง
 * และ fallback ไปที่ status เฉพาะข้อมูลเก่าที่ยังไม่มี stage
 */
export function getCaseStageIndex(stage: CaseStage | CaseStatus | string): number {
  const index = CASE_STAGE_ORDER.indexOf(stage as CaseStage);
  if (index !== -1) return index;
  return stage === 'CLOSED' || stage === 'ARCHIVED' ? CASE_STAGE_ORDER.length - 1 : 0;
}

export const CASE_STAGE_COUNT = CASE_STAGE_ORDER.length - 1;

/** Status filter options in lifecycle order, sharing the same labels as the badge. */
export function caseStatusOptions(labels: CaseStatusLabels): { value: string; label: string }[] {
  return STATUS_ORDER.map((value) => ({ value, label: labels[value] ?? value }));
}

export const ACTIVITY_ICONS = {
  case: 'Briefcase',
  hearing: 'Gavel',
  document: 'FileText',
  payment: 'Banknote',
  task: 'CheckSquare',
} as const;

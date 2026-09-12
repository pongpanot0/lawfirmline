'use client';

import { Badge } from '@/components/ui/badge';
import { getCaseStatusDisplay } from '@/lib/case-status';
import { useDashboardT } from '@/components/landing/LocaleProvider';

export function CaseStatusBadge({ status }: { status: string }) {
  const d = useDashboardT();
  const { label, variant } = getCaseStatusDisplay(status, d.caseStatus);
  return <Badge variant={variant}>{label}</Badge>;
}

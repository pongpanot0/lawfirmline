import { Badge } from '@/components/ui/badge';
import { getCaseStatusDisplay } from '@/lib/case-status';

export function CaseStatusBadge({ status }: { status: string }) {
  const { label, variant } = getCaseStatusDisplay(status);
  return <Badge variant={variant}>{label}</Badge>;
}

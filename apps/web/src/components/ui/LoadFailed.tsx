'use client';

import { Button } from '@/components/ui/button';
import { useDashboardT } from '@/components/landing/LocaleProvider';

/**
 * What a list shows when its data did not arrive. An empty list would read
 * as "nothing here", which is the one wrong answer a work list can give; this
 * says the load failed and offers the retry in place.
 */
export function LoadFailed({ message, onRetry }: { message?: string; onRetry: () => void }) {
  const d = useDashboardT();
  return (
    <div className="rounded-xl border bg-card p-6 shadow-soft">
      <p role="alert" className="text-sm text-destructive">{message ?? d.common.loadFailed}</p>
      <Button size="sm" variant="outline" className="mt-3" onClick={onRetry}>
        {d.common.retry}
      </Button>
    </div>
  );
}

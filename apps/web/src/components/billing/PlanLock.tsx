'use client';

import Link from 'next/link';
import { ArrowRight, Lock } from 'lucide-react';
import { hasFirmCapability } from '@lawfirm/shared';
import { useAuth } from '@/lib/auth';
import { Card } from '@/components/ui/card';

/**
 * What a plan doesn't include, said as a plan limit rather than a failure. Whoever can change
 * the plan gets a link to it; everyone else is told who can.
 */
export function PlanLock({ title, description }: { title: string; description: string }) {
  const { user } = useAuth();
  const canChangePlan = hasFirmCapability(user?.firmRole, 'manageSubscription');
  return (
    <Card role="status" className="flex flex-wrap items-center justify-between gap-3 p-5 sm:p-6">
      <div>
        <p className="flex items-center gap-2 font-semibold"><Lock className="h-4 w-4" aria-hidden />{title}</p>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </div>
      {canChangePlan ? (
        <Link href="/account/billing" className="inline-flex min-h-11 items-center gap-2 whitespace-nowrap rounded-md border px-4 text-sm font-medium" title="ดูและเปลี่ยนแพ็กเกจของสำนักงาน">
          ดูแพ็กเกจ <ArrowRight className="h-4 w-4" aria-hidden />
        </Link>
      ) : (
        <p className="text-sm text-muted-foreground">ติดต่อเจ้าของสำนักงานเพื่อเปลี่ยนแพ็กเกจ</p>
      )}
    </Card>
  );
}

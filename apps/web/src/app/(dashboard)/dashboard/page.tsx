'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { hasFirmCapability } from '@lawfirm/shared';
import { useAuth } from '@/lib/auth';
import { PageLoading } from '@/components/ui/misc';
import { TodayPage } from '@/components/agenda/TodayPage';
export default function DashboardPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  // Team workload only means something when there is a team; a one-seat firm starts on its own day.
  const canRunOps = hasFirmCapability(user?.firmRole, 'runOperations') && (user?.maxUsers ?? 2) > 1;
  useEffect(() => { if (canRunOps) router.replace('/operations'); }, [canRunOps, router]);
  if (loading || !user || canRunOps) return <PageLoading lines={5} />;
  return <TodayPage />;
}

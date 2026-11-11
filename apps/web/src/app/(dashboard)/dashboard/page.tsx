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
  const canRunOps = hasFirmCapability(user?.firmRole, 'runOperations');
  useEffect(() => { if (canRunOps) router.replace('/operations'); }, [canRunOps, router]);
  if (loading || !user || canRunOps) return <PageLoading lines={5} />;
  return <TodayPage />;
}

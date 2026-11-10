'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { api } from '@/lib/api';
import { PreLitigationIntake } from '@/components/journey/PreLitigationIntake';
import { PageLoading } from '@/components/ui/misc';
import { LoadFailed } from '@/components/ui/LoadFailed';

export default function IntakeDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { token } = useAuth();
  const [state, setState] = useState<'loading' | 'history' | 'error'>('loading');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!token) return;
    let active = true;
    api.getIntake(token, id).then((intake) => {
      if (!active) return;
      if (intake.case?.id) router.replace(`/cases/${intake.case.id}`);
      else setState('history');
    }).catch(() => { if (active) setState('error'); });
    return () => { active = false; };
  }, [token, id, router, attempt]);
  if (state === 'error') return <LoadFailed onRetry={() => { setState('loading'); setAttempt((n) => n + 1); }} />;
  if (state === 'history') return <><p className="mb-4 text-sm text-muted-foreground">ข้อมูลประวัติ (อ่านอย่างเดียว)</p><PreLitigationIntake id={id} history /></>;
  return <PageLoading variant="detail" title="กำลังโหลดข้อมูล" lines={4} />;
}

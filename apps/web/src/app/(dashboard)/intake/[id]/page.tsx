'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { api } from '@/lib/api';
import { PreLitigationIntake } from '@/components/journey/PreLitigationIntake';
import { PageLoading } from '@/components/ui/misc';
import { LoadFailed } from '@/components/ui/LoadFailed';
import { PageHeader } from '@/components/samnuan/PageHeader';
import { Badge } from '@/components/ui/badge';

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
  if (state === 'history') return <><PageHeader title="ประวัติเรื่องรับเข้า" description="ตรวจข้อมูลเรื่องที่บันทึกไว้" actions={<Badge variant="muted">อ่านอย่างเดียว</Badge>} /><PreLitigationIntake id={id} history /></>;
  return <PageLoading variant="detail" title="กำลังโหลดข้อมูล" lines={4} />;
}

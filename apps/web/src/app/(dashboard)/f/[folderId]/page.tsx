'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { api, type CaseDetail } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { PaperFileCard } from '@/components/cases/PaperFileCard';
import { PageHeader } from '@/components/samnuan/PageHeader';
import { buttonVariants } from '@/components/ui/button';
import { LoadFailed } from '@/components/ui/LoadFailed';
import { PageLoading } from '@/components/ui/misc';

export default function PaperFileScanPage() {
  const { folderId } = useParams<{ folderId: string }>();
  const { token } = useAuth();
  const [legalCase, setLegalCase] = useState<CaseDetail | null>(null);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    setLegalCase(null);
    setError('');
    void api.resolvePaperFile(token, folderId)
      .then(({ caseId }) => api.getCase(token, caseId))
      .then((result) => { if (!cancelled) setLegalCase(result); })
      .catch((err) => { if (!cancelled) setError(err instanceof Error ? err.message : 'ไม่พบสำนวน'); });
    return () => { cancelled = true; };
  }, [token, folderId, revision]);

  if (error) return <LoadFailed message={error} onRetry={() => setRevision((value) => value + 1)} />;
  if (!legalCase) return <PageLoading title="กำลังค้นหาสำนวน" lines={1} />;
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <PageHeader title="เบิกคืนสำนวน" description={`${legalCase.ownRef} · ${legalCase.title}`}
        actions={<Link href={`/cases/${legalCase.id}`} className={buttonVariants({ variant: 'outline' })}>เปิดคดี</Link>} />
      <PaperFileCard key={legalCase.id} caseId={legalCase.id} largeActions />
    </div>
  );
}

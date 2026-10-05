'use client';

import { useEffect, useState } from 'react';
import { LoadFailed } from '@/components/ui/LoadFailed';
import Link from 'next/link';
import { Role } from '@lawfirm/shared';
import { useAuth } from '@/lib/auth';
import { useDashboardT } from '@/components/landing/LocaleProvider';
import { api, CaseItem } from '@/lib/api';
import { CaseWorkflowBoard } from '@/components/CaseWorkflowBoard';
import { PageLoading } from '@/components/ui/misc';

export default function CaseBoardPage() {
  const d = useDashboardT();
  const { token, user } = useAuth();
  const [cases, setCases] = useState<CaseItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [loadError, setLoadError] = useState(false);

  const load = () => {
    if (!token) return;
    setLoadError(false);
    api.getCases(token).then(setCases).catch(() => setLoadError(true)).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [token]);

  const handleStatusChange = async (caseId: string, status: string) => {
    if (!token) return;
    setError('');
    try {
      await api.updateCase(token, caseId, { status });
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'เปลี่ยนสถานะไม่สำเร็จ กรุณาลองใหม่');
    }
  };

  const canEdit = user?.role === Role.ADMIN || user?.role === Role.LAWYER;

  return (
    <div>
      <div className="samnuan-page-header mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl text-foreground sm:text-3xl">{d.admin.boardTitle}</h1>
          <p className="mt-2 text-sm text-muted-foreground">แยกคดีตามสถานะปัจจุบัน เลือกคดีเพื่อทำงานต่อ</p>
        </div>
        <div className="flex gap-2">
          <Link href="/cases" className="inline-flex min-h-11 items-center rounded-lg border border-input bg-card px-4 py-2 text-sm hover:bg-accent">
            {d.admin.listView}
          </Link>
          {canEdit && (
            <Link href="/cases/new" className="inline-flex min-h-11 items-center rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground hover:bg-primary/90">
              + {d.admin.newCase}
            </Link>
          )}
        </div>
      </div>

      {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

      {loadError ? (
        <LoadFailed onRetry={load} />
      ) : loading ? (
        <PageLoading title={d.admin.loadingBoard} lines={4} />
      ) : (
        <CaseWorkflowBoard
          cases={cases}
          canDrag={canEdit}
          onStatusChange={handleStatusChange}
        />
      )}
    </div>
  );
}

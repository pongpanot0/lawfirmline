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
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{d.admin.boardTitle}</h1>
          <p className="mt-1 text-sm text-slate-500">Kanban view — เปิดคดี → ร่างเอกสาร → นัดศาล → ปิดคดี</p>
        </div>
        <div className="flex gap-2">
          <Link href="/cases" className="rounded-lg border border-slate-300 px-4 py-2 text-sm hover:bg-slate-50">
            {d.admin.listView}
          </Link>
          {canEdit && (
            <Link href="/cases/new" className="rounded-lg bg-brand-600 px-4 py-2 text-sm text-white hover:bg-brand-700">
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

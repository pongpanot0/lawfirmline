'use client';

import { useEffect, useState } from 'react';
import { LoadFailed } from '@/components/ui/LoadFailed';
import Link from 'next/link';
import { Role } from '@lawfirm/shared';
import { useAuth } from '@/lib/auth';
import { useDashboardT } from '@/components/landing/LocaleProvider';
import { api, CaseListItem } from '@/lib/api';
import { CaseWorkflowBoard } from '@/components/CaseWorkflowBoard';
import { PageLoading } from '@/components/ui/misc';
import { PageHeader } from '@/components/samnuan/PageHeader';
import { buttonVariants } from '@/components/ui/button';
import { List, Plus } from 'lucide-react';

export default function CaseBoardPage() {
  const d = useDashboardT();
  const { token, user } = useAuth();
  const [cases, setCases] = useState<CaseListItem[]>([]);
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
      <PageHeader
        title={d.admin.boardTitle}
        description="คดีแยกตามสถานะปัจจุบัน"
        actions={
          <>
            <Link href="/cases" className={buttonVariants({ variant: 'outline', size: 'sm' })}>
              <List aria-hidden="true" className="h-4 w-4" />{d.admin.listView}
            </Link>
            {canEdit && (
              <Link href="/cases/new" className={buttonVariants({ size: 'sm' })}>
                <Plus aria-hidden="true" className="h-4 w-4" />{d.admin.newCase}
              </Link>
            )}
          </>
        }
      />

      {error && <p role="alert" className="mb-4 text-sm text-destructive">{error}</p>}

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

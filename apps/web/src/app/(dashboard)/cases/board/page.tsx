'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Role } from '@lawfirm/shared';
import { useAuth } from '@/lib/auth';
import { api, CaseItem } from '@/lib/api';
import { CaseWorkflowBoard } from '@/components/CaseWorkflowBoard';

export default function CaseBoardPage() {
  const { token, user } = useAuth();
  const [cases, setCases] = useState<CaseItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = () => {
    if (!token) return;
    api.getCases(token).then(setCases).catch(console.error).finally(() => setLoading(false));
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
          <h1 className="text-2xl font-bold text-slate-900">Case Workflow Board / บอร์ดสถานะคดี</h1>
          <p className="mt-1 text-sm text-slate-500">Kanban view — เปิดคดี → ร่างเอกสาร → นัดศาล → ปิดคดี</p>
        </div>
        <div className="flex gap-2">
          <Link href="/cases" className="rounded-lg border border-slate-300 px-4 py-2 text-sm hover:bg-slate-50">
            List View / มุมมองรายการ
          </Link>
          {canEdit && (
            <Link href="/cases/new" className="rounded-lg bg-brand-600 px-4 py-2 text-sm text-white hover:bg-brand-700">
              + New Case / สร้างคดีใหม่
            </Link>
          )}
        </div>
      </div>

      {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

      {loading ? (
        <p className="text-slate-500">Loading board... / กำลังโหลด...</p>
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

'use client';

import { useEffect, useState } from 'react';
import {
  InsuranceClaimStage,
  INSURANCE_CLAIM_STAGE_ORDER,
  INSURANCE_CLAIM_STAGE_LABELS,
} from '@lawfirm/shared';
import { useAuth } from '@/lib/auth';
import { api, ApiError, InsuranceClaimItem } from '@/lib/api';
import { formatDate } from '@/lib/utils';
import { InlineEmptyState, PageLoading } from '@/components/ui/misc';

export function CaseInsurancePanel({ caseId }: { caseId: string }) {
  const id = caseId;
  const { token } = useAuth();
  const [claim, setClaim] = useState<InsuranceClaimItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ insurerName: '', policyNumber: '', claimNumber: '', incidentDate: '' });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    if (!token || !id) return;
    setLoading(true);
    setError(null);
    api
      .getInsuranceClaim(token, id)
      .then(setClaim)
      .catch((err) => {
        const isNotFound =
          err instanceof ApiError
            ? err.status === 404
            : err instanceof Error && /no insurance claim tracked/i.test(err.message);
        if (isNotFound) {
          setClaim(null);
        } else {
          setError(err instanceof Error ? err.message : 'โหลดข้อมูลเคลมประกันไม่สำเร็จ');
        }
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, [token, id]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !id) return;
    setSubmitting(true);
    setError(null);
    try {
      await api.createInsuranceClaim(token, id, {
        insurerName: form.insurerName,
        policyNumber: form.policyNumber || undefined,
        claimNumber: form.claimNumber || undefined,
        incidentDate: form.incidentDate,
      });
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'สร้างรายการติดตามเคลมไม่สำเร็จ');
    } finally {
      setSubmitting(false);
    }
  };

  const handleAdvance = async (stage: InsuranceClaimStage) => {
    if (!token || !id) return;
    const label = INSURANCE_CLAIM_STAGE_LABELS[stage];
    if (!window.confirm(`เปลี่ยนสถานะเป็น "${label}"? ระบบจะสร้างงาน/เตือนที่เกี่ยวข้องให้อัตโนมัติ`)) return;
    setSubmitting(true);
    setError(null);
    try {
      await api.advanceInsuranceClaimStage(token, id, stage);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'เปลี่ยนสถานะไม่สำเร็จ');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <PageLoading title="กำลังโหลดเคลมประกัน" lines={3} />;

  return (
    <div>
      <h2 className="mb-6 text-xl font-bold text-slate-900">ติดตามเคลมประกัน</h2>

      {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

      {!claim ? (
        <form onSubmit={handleCreate} className="max-w-md space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <InlineEmptyState title="คดีนี้ยังไม่มีการติดตามเคลมประกัน" description="กรอกข้อมูลพื้นฐานด้านล่างเพื่อเริ่มไทม์ไลน์เคลมและ deadline ที่เกี่ยวข้อง" />
          <div>
            <label className="block text-sm font-medium text-slate-700">บริษัทประกัน</label>
            <input
              required
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
              value={form.insurerName}
              onChange={(e) => setForm({ ...form, insurerName: e.target.value })}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700">เลขกรมธรรม์</label>
            <input
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
              value={form.policyNumber}
              onChange={(e) => setForm({ ...form, policyNumber: e.target.value })}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700">เลขเคลม</label>
            <input
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
              value={form.claimNumber}
              onChange={(e) => setForm({ ...form, claimNumber: e.target.value })}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700">วันวินาศภัย</label>
            <input
              required
              type="date"
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
              value={form.incidentDate}
              onChange={(e) => setForm({ ...form, incidentDate: e.target.value })}
            />
          </div>
          <button
            type="submit"
            disabled={submitting}
            className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
          >
            เริ่มติดตามเคลมประกัน
          </button>
        </form>
      ) : (
        <div className="space-y-6">
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
              {INSURANCE_CLAIM_STAGE_ORDER.filter(
                (s) => s !== InsuranceClaimStage.DENIED_OR_PARTIAL || claim.stage === InsuranceClaimStage.DENIED_OR_PARTIAL,
              ).map((stage, i, arr) => {
                const currentIndex = INSURANCE_CLAIM_STAGE_ORDER.indexOf(claim.stage);
                const stageIndex = INSURANCE_CLAIM_STAGE_ORDER.indexOf(stage);
                const done = stageIndex <= currentIndex;
                return (
                  <div key={stage} className="flex flex-1 items-center">
                    <div
                      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-medium ${
                        done ? 'bg-brand-600 text-white' : 'bg-slate-200 text-slate-500'
                      }`}
                    >
                      {i + 1}
                    </div>
                    <span className="ml-2 text-xs text-slate-600">{INSURANCE_CLAIM_STAGE_LABELS[stage]}</span>
                    {i < arr.length - 1 && <div className="mx-2 h-px flex-1 bg-slate-200" />}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm md:grid-cols-3">
            <div>
              <p className="text-sm text-slate-500">บริษัทประกัน</p>
              <p className="font-medium text-slate-900">{claim.insurerName}</p>
            </div>
            <div>
              <p className="text-sm text-slate-500">เลขกรมธรรม์ / เลขเคลม</p>
              <p className="font-medium text-slate-900">{claim.policyNumber ?? '—'} / {claim.claimNumber ?? '—'}</p>
            </div>
            <div>
              <p className="text-sm text-slate-500">วันวินาศภัย</p>
              <p className="font-medium text-slate-900">{formatDate(claim.incidentDate)}</p>
            </div>
            <div>
              <p className="text-sm text-slate-500">วันครบอายุความ</p>
              <p className="font-medium text-slate-900">
                {claim.limitationDeadline ? formatDate(claim.limitationDeadline) : '—'}
              </p>
            </div>
            <div>
              <p className="text-sm text-slate-500">กำหนดหนังสือทวงถาม</p>
              <p className="font-medium text-slate-900">
                {claim.demandLetterDeadline ? formatDate(claim.demandLetterDeadline) : '—'}
              </p>
            </div>
            <div>
              <p className="text-sm text-slate-500">วันยื่นร้องเรียน คปภ.</p>
              <p className="font-medium text-slate-900">
                {claim.oicComplaintDate ? formatDate(claim.oicComplaintDate) : '—'}
              </p>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="mb-3 text-sm font-medium text-slate-700">เปลี่ยนสถานะ</p>
            <div className="flex flex-wrap gap-2">
              {INSURANCE_CLAIM_STAGE_ORDER.filter(
                (s) => INSURANCE_CLAIM_STAGE_ORDER.indexOf(s) > INSURANCE_CLAIM_STAGE_ORDER.indexOf(claim.stage),
              ).map((stage) => (
                <button
                  key={stage}
                  type="button"
                  disabled={submitting}
                  onClick={() => handleAdvance(stage)}
                  className="rounded-md border border-brand-600 px-3 py-1.5 text-sm text-brand-600 hover:bg-brand-50 disabled:opacity-50"
                >
                  → {INSURANCE_CLAIM_STAGE_LABELS[stage]}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

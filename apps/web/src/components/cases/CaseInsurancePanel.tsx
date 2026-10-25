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
import { PageLoading } from '@/components/ui/misc';
import { LoadFailed } from '@/components/ui/LoadFailed';
import { Button } from '@/components/ui/button';
import { ChevronRight, Pencil } from 'lucide-react';
import { InsurerSelect } from '@/components/InsurerSelect';
import { ThaiDateInput } from '@/components/ui/ThaiDateInput';

export function CaseInsurancePanel({ caseId }: { caseId: string }) {
  const id = caseId;
  const { token } = useAuth();
  const [claim, setClaim] = useState<InsuranceClaimItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ insurerName: '', policyNumber: '', claimNumber: '', incidentDate: '' });
  const [submitting, setSubmitting] = useState(false);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = () => {
    if (!token || !id) return;
    setLoading(true);
    setError(null);
    setLoadError(null);
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
          setLoadError(err instanceof Error ? err.message : 'โหลดข้อมูลเคลมประกันไม่สำเร็จ');
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

  /** แก้ข้อมูลประกันของคดีได้ในที่เดียวกับที่มันแสดง ไม่ต้องไปหน้าอื่น */
  const startEdit = () => {
    if (!claim) return;
    setForm({
      insurerName: claim.insurerName,
      policyNumber: claim.policyNumber ?? '',
      claimNumber: claim.claimNumber ?? '',
      incidentDate: claim.incidentDate.slice(0, 10),
    });
    setEditing(true);
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !id) return;
    setSubmitting(true);
    setError(null);
    try {
      await api.updateInsuranceClaim(token, id, {
        insurerName: form.insurerName,
        policyNumber: form.policyNumber || undefined,
        claimNumber: form.claimNumber || undefined,
        incidentDate: form.incidentDate,
      });
      setEditing(false);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'บันทึกข้อมูลประกันไม่สำเร็จ');
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

  if (loading) return <PageLoading title="กำลังโหลดเคลมประกัน" lines={2} />;
  if (loadError) return <LoadFailed message={loadError} onRetry={load} />;

  return (
    <div className="rounded-xl border bg-card p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="font-semibold text-foreground">ประกันภัย</h2>
        {claim && !editing && (
          <Button type="button" variant="ghost" size="sm" onClick={startEdit}>
            <Pencil aria-hidden="true" className="h-4 w-4" />แก้ไขข้อมูลเคลม
          </Button>
        )}
      </div>

      {error && <p role="alert" className="mb-4 text-sm text-destructive">{error}</p>}

      {!claim || editing ? (
        <form onSubmit={editing ? handleSaveEdit : handleCreate} className="max-w-md space-y-4">
          {!claim && (
            <p className="text-sm text-muted-foreground">ยังไม่มีการติดตามเคลมประกันในคดีนี้</p>
          )}
          <div>
            <label htmlFor="claim-insurer" className="block text-sm font-medium text-foreground">บริษัทประกัน</label>
            <InsurerSelect
              id="claim-insurer"
              value={form.insurerName}
              onChange={(name) => setForm({ ...form, insurerName: name })}
            />
          </div>
          <div>
            <label htmlFor="claim-policy" className="block text-sm font-medium text-foreground">เลขกรมธรรม์</label>
            <input
              id="claim-policy"
              className="mt-1 min-h-10 w-full rounded-md border border-input bg-card px-3 py-2 text-sm"
              value={form.policyNumber}
              onChange={(e) => setForm({ ...form, policyNumber: e.target.value })}
            />
          </div>
          <div>
            <label htmlFor="claim-number" className="block text-sm font-medium text-foreground">เลขเคลม</label>
            <input
              id="claim-number"
              className="mt-1 min-h-10 w-full rounded-md border border-input bg-card px-3 py-2 text-sm"
              value={form.claimNumber}
              onChange={(e) => setForm({ ...form, claimNumber: e.target.value })}
            />
          </div>
          <div>
            <label htmlFor="claim-incident-date" className="block text-sm font-medium text-foreground">วันวินาศภัย<span aria-hidden="true" className="ml-1 text-destructive">*</span></label>
            <ThaiDateInput
              id="claim-incident-date"
              required
              className="mt-1"
              value={form.incidentDate}
              onChange={(v) => setForm({ ...form, incidentDate: v })}
            />
          </div>
          <div className="flex items-center gap-3">
            <Button type="submit" disabled={submitting}>
              {editing ? 'บันทึกข้อมูลเคลม' : 'เริ่มติดตามเคลมประกัน'}
            </Button>
            {editing && (
              <Button type="button" variant="ghost" onClick={() => setEditing(false)}>
                ยกเลิก
              </Button>
            )}
          </div>
        </form>
      ) : (
        <div className="space-y-5">
          <div>
            <ol aria-label="ขั้นตอนเคลม" className="flex items-center justify-between overflow-x-auto pb-1">
              {INSURANCE_CLAIM_STAGE_ORDER.filter(
                (s) => s !== InsuranceClaimStage.DENIED_OR_PARTIAL || claim.stage === InsuranceClaimStage.DENIED_OR_PARTIAL,
              ).map((stage, i, arr) => {
                const currentIndex = INSURANCE_CLAIM_STAGE_ORDER.indexOf(claim.stage);
                const stageIndex = INSURANCE_CLAIM_STAGE_ORDER.indexOf(stage);
                const done = stageIndex <= currentIndex;
                return (
                  <li key={stage} aria-current={stage === claim.stage ? 'step' : undefined} className="flex flex-1 items-center">
                    <div
                      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-medium ${
                        done ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
                      }`}
                    >
                      {i + 1}
                    </div>
                    <span className="ml-2 whitespace-nowrap text-xs text-muted-foreground">{INSURANCE_CLAIM_STAGE_LABELS[stage]}</span>
                    {i < arr.length - 1 && <div className="mx-2 h-px min-w-4 flex-1 bg-border" />}
                  </li>
                );
              })}
            </ol>
          </div>

          <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
            <div>
              <p className="text-sm text-muted-foreground">บริษัทประกัน</p>
              <p className="font-medium text-foreground">{claim.insurerName}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">เลขกรมธรรม์ / เลขเคลม</p>
              <p className="font-medium text-foreground">{claim.policyNumber ?? '—'} / {claim.claimNumber ?? '—'}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">วันวินาศภัย</p>
              <p className="font-medium text-foreground">{formatDate(claim.incidentDate)}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">วันครบอายุความ</p>
              <p className="font-medium text-foreground">
                {claim.limitationDeadline ? formatDate(claim.limitationDeadline) : '—'}
              </p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">กำหนดหนังสือทวงถาม</p>
              <p className="font-medium text-foreground">
                {claim.demandLetterDeadline ? formatDate(claim.demandLetterDeadline) : '—'}
              </p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">วันยื่นร้องเรียน คปภ.</p>
              <p className="font-medium text-foreground">
                {claim.oicComplaintDate ? formatDate(claim.oicComplaintDate) : '—'}
              </p>
            </div>
          </div>

          <div className="border-t pt-4">
            <p className="mb-3 text-sm font-medium text-foreground">เปลี่ยนสถานะ</p>
            <div className="flex flex-wrap gap-2">
              {INSURANCE_CLAIM_STAGE_ORDER.filter(
                (s) => INSURANCE_CLAIM_STAGE_ORDER.indexOf(s) > INSURANCE_CLAIM_STAGE_ORDER.indexOf(claim.stage),
              ).map((stage) => (
                <Button
                  key={stage}
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={submitting}
                  onClick={() => handleAdvance(stage)}
                >
                  <ChevronRight aria-hidden="true" className="h-4 w-4" />
                  {INSURANCE_CLAIM_STAGE_LABELS[stage]}
                </Button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

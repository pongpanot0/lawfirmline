'use client';

import { useCallback, useEffect, useState } from 'react';
import { COMMON_INTAKE_DOCUMENTS } from '@lawfirm/shared';
import { Check, Plus, Trash2, X } from 'lucide-react';
import { IntakeDocumentRequestItem, IntakeDocumentRequestsResult, api } from '@/lib/api';
import { useLocale } from '@/components/landing/LocaleProvider';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

const STATUS_LABELS: Record<string, { th: string; en: string; tone: string }> = {
  REQUESTED: { th: 'ขอแล้ว', en: 'Requested', tone: 'bg-amber-500/10 text-amber-600' },
  RECEIVED: { th: 'ได้รับแล้ว', en: 'Received', tone: 'bg-emerald-500/10 text-emerald-600' },
  MISSING: { th: 'ยังขาด', en: 'Missing', tone: 'bg-destructive/10 text-destructive' },
  NOT_APPLICABLE: { th: 'ไม่เกี่ยวข้อง', en: 'N/A', tone: 'bg-muted text-muted-foreground' },
};

/**
 * เอกสารที่ขอจากลูกความก่อนออกหนังสือ / เปิดคดี
 *
 * รายการที่ required และยังไม่ได้รับจะกั้นการออกหนังสือไว้ — ไปเจอว่าเอกสาร
 * ไม่ครบตอนต้องยื่นแล้วคือสิ่งที่ checklist นี้มีไว้กัน
 */
export function DocumentRequestChecklist({
  intakeId,
  token,
  onChanged,
}: {
  intakeId: string;
  token: string;
  onChanged?: (result: IntakeDocumentRequestsResult) => void;
}) {
  const { locale } = useLocale();
  const th = locale === 'th';
  const [state, setState] = useState<IntakeDocumentRequestsResult | null>(null);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const apply = useCallback(
    (result: IntakeDocumentRequestsResult) => {
      setState(result);
      onChanged?.(result);
    },
    [onChanged],
  );

  const load = useCallback(async () => {
    try {
      apply(await api.getIntakeDocumentRequests(token, intakeId));
    } catch (e) {
      setError(e instanceof Error ? e.message : th ? 'โหลดรายการเอกสารไม่สำเร็จ' : 'Could not load');
    }
  }, [token, intakeId, apply, th]);

  useEffect(() => {
    void load();
  }, [load]);

  async function run(action: () => Promise<IntakeDocumentRequestsResult>) {
    setBusy(true);
    setError('');
    try {
      apply(await action());
    } catch (e) {
      setError(e instanceof Error ? e.message : th ? 'บันทึกไม่สำเร็จ' : 'Could not save');
    } finally {
      setBusy(false);
    }
  }

  const add = (names: string[], required = true) =>
    run(() => api.addIntakeDocumentRequests(token, intakeId, names.map((n) => ({ name: n, required }))));

  const setStatus = (request: IntakeDocumentRequestItem, status: string) =>
    run(() => api.updateIntakeDocumentRequest(token, intakeId, request.id, { status }));

  const requests = state?.requests ?? [];
  const alreadyRequested = new Set(requests.map((r) => r.name));
  const remainingSuggestions = COMMON_INTAKE_DOCUMENTS.filter((n) => !alreadyRequested.has(n));

  return (
    <div className="rounded-xl border bg-card p-4 shadow-soft">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">
          {th ? 'เอกสารที่ต้องขอก่อนดำเนินการ' : 'Documents to collect'}
        </h3>
        {state && (
          <span
            className={`rounded-full px-2 py-0.5 text-xs ${
              state.missingCount
                ? 'bg-destructive/10 text-destructive'
                : 'bg-emerald-500/10 text-emerald-600'
            }`}
          >
            {state.missingCount
              ? th
                ? `ยังขาด ${state.missingCount} รายการ`
                : `${state.missingCount} still missing`
              : th
                ? 'ครบแล้ว'
                : 'Complete'}
          </span>
        )}
      </div>

      {state?.missingCount ? (
        <p className="mt-2 text-xs text-muted-foreground">
          {th
            ? 'ออกหนังสือได้ แต่ต้องกดรับทราบว่ายังขาดเอกสารเหล่านี้'
            : 'You can still issue a notice, but you must acknowledge the missing documents.'}
        </p>
      ) : null}

      {requests.length > 0 && (
        <ul className="mt-3 space-y-1.5">
          {requests.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center gap-2 rounded-lg border px-2 py-1.5 text-sm">
              <span className={`rounded px-1.5 py-0.5 text-xs ${STATUS_LABELS[r.status]?.tone}`}>
                {th ? STATUS_LABELS[r.status]?.th : STATUS_LABELS[r.status]?.en}
              </span>
              <span className={r.status === 'RECEIVED' ? 'line-through text-muted-foreground' : ''}>
                {r.name}
              </span>
              {!r.required && (
                <span className="text-xs text-muted-foreground">({th ? 'ไม่บังคับ' : 'optional'})</span>
              )}
              <div className="ml-auto flex items-center gap-1">
                {r.status !== 'RECEIVED' && (
                  <button
                    type="button"
                    title={th ? 'ได้รับแล้ว' : 'Received'}
                    disabled={busy}
                    onClick={() => setStatus(r, 'RECEIVED')}
                    className="rounded p-1 hover:bg-emerald-500/10"
                  >
                    <Check className="h-4 w-4 text-emerald-600" />
                  </button>
                )}
                {r.status !== 'NOT_APPLICABLE' && (
                  <button
                    type="button"
                    title={th ? 'ไม่เกี่ยวข้อง' : 'Not applicable'}
                    disabled={busy}
                    onClick={() => setStatus(r, 'NOT_APPLICABLE')}
                    className="rounded p-1 hover:bg-muted"
                  >
                    <X className="h-4 w-4 text-muted-foreground" />
                  </button>
                )}
                <button
                  type="button"
                  title={th ? 'ลบรายการ' : 'Remove'}
                  disabled={busy}
                  onClick={() => run(() => api.removeIntakeDocumentRequest(token, intakeId, r.id))}
                  className="rounded p-1 hover:bg-destructive/10"
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <form
        className="mt-3 flex flex-wrap items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          const trimmed = name.trim();
          if (!trimmed) return;
          setName('');
          void add([trimmed]);
        }}
      >
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={th ? 'เพิ่มเอกสารที่ต้องขอ' : 'Add a document to request'}
          className="max-w-sm"
        />
        <Button type="submit" variant="outline" size="sm" disabled={busy} className="min-h-9">
          <Plus className="mr-1 h-4 w-4" />
          {th ? 'เพิ่ม' : 'Add'}
        </Button>
      </form>

      {remainingSuggestions.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {remainingSuggestions.map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              disabled={busy}
              onClick={() => add([suggestion])}
              className="rounded-full border px-2 py-0.5 text-xs text-muted-foreground hover:border-primary/40 hover:text-foreground"
            >
              + {suggestion}
            </button>
          ))}
        </div>
      )}

      {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
    </div>
  );
}

'use client';
import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { useLocale } from '@/components/landing/LocaleProvider';
import { latestPlaybookReleases, PlaybookPreview, PlaybookRelease, setupRequest } from '@/lib/practice-setup';
import { Button } from '@/components/ui/button';
import { caseStageLabel } from '@/lib/stage-labels';

const ROLE_LABELS: Record<string, { th: string; en: string }> = {
  OWNER: { th: 'เจ้าของสำนักงาน', en: 'Firm owner' },
  SENIOR_LAWYER: { th: 'ทนายอาวุโส', en: 'Senior lawyer' },
  LAWYER: { th: 'ทนาย', en: 'Lawyer' },
  ASSISTANT: { th: 'ผู้ช่วย', en: 'Assistant' },
};

export function CasePlaybook({ caseId, caseTypeId, initialReleaseId = '', onApplied }: { caseId: string; caseTypeId?: string; initialReleaseId?: string; onApplied: () => void }) {
  const { token } = useAuth(); const { locale } = useLocale(); const th = locale === 'th';
  const [releases, setReleases] = useState<PlaybookRelease[]>([]);
  const [releaseId, setReleaseId] = useState(initialReleaseId);
  const [preview, setPreview] = useState<PlaybookPreview | null>(null);
  const [error, setError] = useState('');
  const [loadError, setLoadError] = useState('');
  const [busy, setBusy] = useState(false);
  const [previewBusy, setPreviewBusy] = useState(false);
  const [applied, setApplied] = useState(false);
  const [reload, setReload] = useState(0);
  const manuallySelected = useRef(false);
  useEffect(() => {
    if (!token) return;
    let active = true;
    setLoadError('');
    setupRequest<PlaybookRelease[]>(token, '/playbooks').then(items => {
      if (!active) return;
      const selected = items.find(item => item.id === initialReleaseId);
      const options = latestPlaybookReleases(items);
      if (selected && !options.some(item => item.id === selected.id)) options.push(selected);
      setReleases(options);
    }).catch(e => { if (active) setLoadError(e.message); });
    return () => { active = false; };
  }, [token, initialReleaseId, reload]);
  useEffect(() => {
    if (manuallySelected.current) return;
    setReleaseId(initialReleaseId || releases.find(item => item.caseTypeId === caseTypeId)?.id || '');
  }, [releases, initialReleaseId, caseTypeId]);
  useEffect(() => {
    setPreview(null);
    setError('');
    if (!token || !releaseId) { setPreviewBusy(false); return; }
    let active = true;
    setPreviewBusy(true);
    setupRequest<PlaybookPreview>(token, `/cases/${caseId}/preview`, { releaseId })
      .then(result => { if (active) setPreview(result); })
      .catch(e => { if (active) setError(e.message); })
      .finally(() => { if (active) setPreviewBusy(false); });
    return () => { active = false; };
  }, [token, caseId, releaseId, reload]);
  const readyPreview = preview?.release.id === releaseId ? preview : null;
  return <details open={Boolean(initialReleaseId)} className="mb-4 rounded-xl border bg-card p-4">
    <summary className="cursor-pointer font-medium">{th ? 'นำ SOP ไปใช้กับคดี' : 'Apply an SOP to this case'}</summary>
    <div className="mt-3 space-y-3">
      <p className="text-xs text-muted-foreground">{th ? 'เลือก SOP แล้วตรวจรายการด้านล่าง ระบบจะเพิ่มงานเมื่อคุณยืนยันเท่านั้น' : 'Choose an SOP and check the steps below. Tasks are added only after confirmation.'}</p>
      {(loadError || error) && <div role="alert" className="text-sm text-destructive">{loadError || error}<Button variant="outline" className="ml-2" disabled={busy || previewBusy} onClick={() => setReload(value => value + 1)}>{th ? 'ลองโหลดรายการงานอีกครั้ง' : 'Retry loading tasks'}</Button></div>}
      {applied && <p role="status">{th ? 'เพิ่มงานจาก SOP แล้ว' : 'SOP tasks added'}</p>}
      <label className="block text-sm">{th ? 'SOP อัตโนมัติ' : 'Automated SOP'}
        <select disabled={busy} value={releaseId} onChange={e => { manuallySelected.current = true; setReleaseId(e.target.value); setPreview(null); setApplied(false); }} className="h-11 w-full rounded-lg border bg-background px-2">
          <option value="">{th ? 'เลือก SOP' : 'Choose an SOP'}</option>
          {releases.map(r => <option key={r.id} value={r.id}>{r.name} · v{r.version}{caseTypeId && r.caseTypeId === caseTypeId ? (th ? ' · แนะนำสำหรับคดีนี้' : ' · Recommended') : ''}</option>)}
        </select>
      </label>
      {previewBusy && <p role="status" className="text-sm">{th ? 'กำลังตรวจรายการงาน…' : 'Loading task preview…'}</p>}
      {readyPreview && <p className="text-sm font-medium">{readyPreview.release.name} · {readyPreview.steps.length} {th ? 'ขั้นตอน' : 'steps'}</p>}
      {readyPreview && <ol className="list-decimal space-y-2 pl-5 text-sm">
        {readyPreview.steps.map((s, i) => <li key={i} className="break-words">{s.title}
          <p className="text-xs text-muted-foreground">
            {[s.primaryRole ? ROLE_LABELS[s.primaryRole][th ? 'th' : 'en'] : (th ? 'ทนายเจ้าของคดี' : 'Case lead'), s.secondaryRole && `${th ? 'สำรอง' : 'backup'}: ${ROLE_LABELS[s.secondaryRole][th ? 'th' : 'en']}`, s.stage && caseStageLabel(s.stage, locale)].filter(Boolean).join(' · ')}
          </p>
          {s.instructions && <p className="text-xs text-muted-foreground">{s.instructions}</p>}
        </li>)}
      </ol>}
      {readyPreview?.steps.some(step => step.stage) && <p className="text-xs text-muted-foreground">{th ? 'งานจะถูกจัดเป็นกลุ่มตามขั้นคดีที่กำหนดใน SOP' : 'Tasks will be grouped by their configured case stage.'}</p>}
      {readyPreview?.existing && <p>{th ? 'คดีนี้ใช้ SOP นี้แล้ว จะไม่เพิ่มงานซ้ำ' : 'This SOP is already applied; no duplicate tasks will be created.'}</p>}
      <Button disabled={busy || previewBusy || !readyPreview || !!readyPreview.existing || applied || !!loadError} onClick={async () => {
        if (!token) return; setBusy(true); setError('');
        try {
          await setupRequest(token, `/cases/${caseId}/apply`, { releaseId }); setApplied(true); onApplied();
        } catch (e) { setError(e instanceof Error ? e.message : 'Failed'); } finally { setBusy(false); }
      }}>{busy ? '…' : (th ? 'ยืนยันเพิ่มงานตามรายการ' : 'Confirm these tasks')}</Button>
    </div>
  </details>;
}

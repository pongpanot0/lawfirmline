'use client';
import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { useLocale } from '@/components/landing/LocaleProvider';
import { PlaybookPreview, PlaybookRelease, setupRequest } from '@/lib/practice-setup';
import { Button } from '@/components/ui/button';

const ROLE_LABELS: Record<string, { th: string; en: string }> = {
  OWNER: { th: 'เจ้าของสำนักงาน', en: 'Firm owner' },
  SENIOR_LAWYER: { th: 'ทนายอาวุโส', en: 'Senior lawyer' },
  LAWYER: { th: 'ทนาย', en: 'Lawyer' },
  ASSISTANT: { th: 'ผู้ช่วย', en: 'Assistant' },
};

export function CasePlaybook({ caseId, onApplied }: { caseId: string; onApplied: () => void }) {
  const { token } = useAuth(); const { locale } = useLocale(); const th = locale === 'th';
  const [releases, setReleases] = useState<PlaybookRelease[]>([]); const [releaseId, setReleaseId] = useState(''); const [preview, setPreview] = useState<PlaybookPreview | null>(null); const [error, setError] = useState(''); const [busy, setBusy] = useState(false); const [applied, setApplied] = useState(false);
  useEffect(() => { if (token) setupRequest<PlaybookRelease[]>(token, '/playbooks').then(setReleases).catch(e => setError(e.message)); }, [token]);
  return <details className="mb-4 rounded-xl border bg-card p-4">
    <summary className="cursor-pointer font-medium">{th ? 'เริ่มงานจาก Playbook' : 'Start from a playbook'}</summary>
    <div className="mt-3 space-y-3">
      <p className="text-xs text-muted-foreground">{th ? 'สร้างงานให้ตามผู้รับผิดชอบที่กำหนดไว้ในแต่ละขั้นตอน ติ๊กครบเมื่อไหร่ก็ได้ ไม่บังคับลำดับ' : 'Creates tasks assigned per each step’s configured owner. Check them off in any order.'}</p>
      {error && <p role="alert" className="text-destructive">{error}</p>}
      {applied && <p role="status">{th ? 'เพิ่มงานจาก Playbook แล้ว' : 'Playbook tasks added'}</p>}
      <label className="block text-sm">Playbook
        <select value={releaseId} onChange={e => { setReleaseId(e.target.value); setPreview(null); setApplied(false); }} className="h-11 w-full rounded-lg border bg-background px-2">
          <option value="">{th ? 'เลือก Playbook' : 'Choose a playbook'}</option>
          {releases.map(r => <option key={r.id} value={r.id}>{r.name} · v{r.version}</option>)}
        </select>
      </label>
      {preview && <ol className="list-decimal space-y-2 pl-5 text-sm">
        {preview.steps.map((s, i) => <li key={i}>{s.title}
          <p className="text-xs text-muted-foreground">
            {[s.primaryRole && ROLE_LABELS[s.primaryRole][th ? 'th' : 'en'], s.secondaryRole && `${th ? 'สำรอง' : 'backup'}: ${ROLE_LABELS[s.secondaryRole][th ? 'th' : 'en']}`].filter(Boolean).join(' · ')}
          </p>
          {s.instructions && <p className="text-xs text-muted-foreground">{s.instructions}</p>}
        </li>)}
      </ol>}
      {preview?.existing && <p>{th ? 'คดีนี้ใช้ Playbook นี้แล้ว จะไม่เพิ่มงานซ้ำ' : 'This playbook is already applied; no duplicate tasks will be created.'}</p>}
      <Button disabled={busy || !releaseId || !!preview?.existing || applied} onClick={async () => {
        if (!token) return; setBusy(true); setError('');
        try {
          if (!preview) setPreview(await setupRequest(token, `/cases/${caseId}/preview`, { releaseId }));
          else { await setupRequest(token, `/cases/${caseId}/apply`, { releaseId }); setApplied(true); onApplied(); }
        } catch (e) { setError(e instanceof Error ? e.message : 'Failed'); } finally { setBusy(false); }
      }}>{preview ? (th ? 'ยืนยันเพิ่มงานตามรายการ' : 'Confirm these tasks') : (th ? 'ดูรายการก่อนเพิ่ม' : 'Preview tasks')}</Button>
    </div>
  </details>;
}

'use client';

import { useEffect, useState } from 'react';
import { api, type LinkCandidate, type LinkCandidates, type ThreadMatchReason } from '@/lib/api';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { Paperclip } from 'lucide-react';

const labels: Record<ThreadMatchReason, string> = {
  SAME_REFERENCE: 'เลขอ้างอิงตรงกัน', CONTACT_EMAIL: 'ผู้ส่งเป็นผู้ติดต่อของลูกความ', OWN_REF: 'เลขคดีของสำนักงานตรงกัน', CASE_NUMBER: 'เลขคดีศาลตรงกัน',
};

export function EmailLinkCandidates({ token, caseId, clientId, selected, onChange, disabled }: {
  token: string; caseId?: string; clientId?: string; selected: LinkCandidate[]; onChange: (items: LinkCandidate[]) => void; disabled?: boolean;
}) {
  const [q, setQ] = useState('');
  const [data, setData] = useState<LinkCandidates | null>(null);
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!caseId && !clientId) { setData(null); return; }
    let active = true;
    setData(null); setFailed(false);
    const timer = setTimeout(() => {
      const query = q.trim().length >= 2 ? q.trim() : '';
      const request = caseId ? api.getCaseEmailLinkCandidates(token, caseId, query) : api.getEmailLinkCandidates(token, clientId!, query);
      request.then((result) => { if (active) setData(result); }).catch(() => { if (active) setFailed(true); });
    }, 300);
    return () => { active = false; clearTimeout(timer); };
  }, [token, caseId, clientId, q, retry]);
  return <div className="space-y-3">
    <input type="search" aria-label="ค้นหาอีเมล" placeholder="ค้นหาหัวเรื่องหรือเลขเคลม" value={q} onChange={(e) => setQ(e.target.value)} disabled={disabled} className="min-h-11 w-full rounded-lg border bg-background px-3 text-sm hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60" />
    {!caseId && !clientId ? <p className="text-sm text-muted-foreground">เลือกลูกความเพื่อดูอีเมลที่แนะนำ</p> : failed ? <p role="alert" className="text-sm text-destructive">โหลดอีเมลไม่สำเร็จ <Button type="button" variant="outline" disabled={disabled} onClick={() => setRetry((n) => n + 1)}>ลองใหม่</Button></p> : !data ? <p aria-busy="true" className="animate-pulse text-sm text-muted-foreground">กำลังโหลดอีเมล…</p> : <>
      <h3 className="text-sm font-semibold">แนะนำสำหรับคดีนี้</h3>
      {data.suggested.length === 0 && data.linkedElsewhere.length === 0 && <p className="text-sm text-muted-foreground">ไม่พบอีเมลที่น่าจะเกี่ยวข้อง — ลองค้นหาด้วยหัวเรื่องหรือเลขเคลม</p>}
      {data.suggested.map((row) => <label key={row.threadId} className="flex min-h-11 cursor-pointer items-start gap-3 rounded-lg border p-3 text-sm hover:bg-accent/50 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring has-[:disabled]:opacity-60">
        <Checkbox disabled={disabled} checked={selected.some((item) => item.threadId === row.threadId)} onChange={(e) => onChange(e.target.checked ? [...selected, row] : selected.filter((item) => item.threadId !== row.threadId))} />
        <span className="min-w-0 flex-1"><span className="block font-medium">{row.fromName || row.fromAddress || 'ไม่ทราบผู้ส่ง'}</span><span className="block truncate">{row.subject}</span><span className="text-xs text-muted-foreground">{new Date(row.lastMessageAt).toLocaleDateString('th-TH')} · <Paperclip aria-label="ไฟล์แนบ" className="inline h-3 w-3" /> {row.attachmentCount}</span> {row.reasons.map((reason) => <span key={reason} className="mr-1 inline-block rounded border px-1 text-xs">{labels[reason]}</span>)}</span>
      </label>)}
      {data.linkedElsewhere.length > 0 && <details className="rounded-lg border p-3"><summary className="min-h-11 cursor-pointer text-sm font-medium">ผูกกับคดีอื่นอยู่แล้ว ({data.linkedElsewhere.length})</summary>{data.linkedElsewhere.map((row) => <div key={row.threadId} className="border-t py-2 text-sm"><p>{row.fromName || row.fromAddress || 'ไม่ทราบผู้ส่ง'} · {row.subject} · {new Date(row.lastMessageAt).toLocaleDateString('th-TH')} · <Paperclip aria-label="ไฟล์แนบ" className="inline h-3 w-3" /> {row.attachmentCount}</p><p className="text-muted-foreground">ผูกกับ {row.linkedCase?.ownRef} — ยกเลิกการผูกเดิมก่อนถึงจะย้ายมาได้</p></div>)}</details>}
    </>}
  </div>;
}

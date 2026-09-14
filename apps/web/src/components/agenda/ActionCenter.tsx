'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Inbox } from 'lucide-react';
import { api } from '@/lib/api';
import { useLocale } from '@/components/landing/LocaleProvider';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export type ActionQueue = { items: { id: string; kind: string; title: string; detail: string | null; caseRef: string | null; owner: string | null; dueAt: string | null; url: string }[]; limited: boolean };
const labels: Record<string, [string, string]> = {
  ACKNOWLEDGEMENT: ['ใกล้กำหนดแต่ยังไม่รับงาน', 'Due soon · awaiting acknowledgement'],
  UNASSIGNED: ['ยังไม่มีผู้รับผิดชอบ', 'Needs an owner'],
  WAITING: ['รอติดตาม', 'Waiting for follow-up'],
  DATE_REVIEW: ['ตรวจและยืนยันวันที่', 'Confirm suggested date'],
  DOCUMENT_REVIEW: ['เอกสารรอคุณตรวจ', 'Awaiting your review'],
  CLIENT_DRAFT: ['ร่างแจ้งลูกค้ารอตรวจ', 'Review client update'],
};
export function ActionCenter({ token }: { token: string }) {
  const { locale } = useLocale();
  const th = locale === 'th';
  const [queue, setQueue] = useState<ActionQueue | null>(null);
  const [error, setError] = useState(false);
  const [filter, setFilter] = useState('ALL');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    setError(false);
    api.getActionQueue(token).then(q => { if (active) setQueue(q); }).catch(() => { if (active) setError(true); });
    return () => { active = false; };
  }, [token, attempt]);
  const items = queue?.items.filter(i => filter === 'ALL' || i.kind === filter) ?? [];
  return <Card>
    <CardHeader className="pb-3"><CardTitle className="flex items-center gap-2 text-base"><Inbox className="size-4" />{th ? 'เรื่องที่ต้องจัดการ' : 'Needs attention'}{queue && <span className="text-sm font-normal text-muted-foreground">{queue.items.length}</span>}</CardTitle><p className="text-sm text-muted-foreground">{th ? 'เปิดงานเดิมเพื่อจัดการ เห็นผู้รับผิดชอบและเหตุผลในที่เดียว' : 'Act on existing work, with its owner and next step in view.'}</p></CardHeader>
    <CardContent className="space-y-3">
      {error ? <div role="alert"><p>{th ? 'โหลดรายการไม่สำเร็จ' : 'Could not load actions'}</p><Button variant="outline" onClick={() => setAttempt(a => a + 1)}>{th ? 'ลองอีกครั้ง' : 'Retry'}</Button></div> : !queue ? <p role="status">{th ? 'กำลังโหลด…' : 'Loading…'}</p> : <>
        {queue.items.length > 0 && <div className="flex flex-wrap gap-2" aria-label={th ? 'กรองรายการ' : 'Filter actions'}>{['ALL', ...Object.keys(labels)].filter(k => k === 'ALL' || queue.items.some(i => i.kind === k)).map(k => <Button key={k} type="button" variant={filter === k ? 'default' : 'outline'} className="min-h-11 whitespace-normal" aria-pressed={filter === k} onClick={() => setFilter(k)}>{k === 'ALL' ? (th ? 'ทั้งหมด' : 'All') : labels[k][th ? 0 : 1]}</Button>)}</div>}
        {items.length === 0 && <p className="py-3 text-sm text-muted-foreground">{th ? 'ไม่มีรายการที่ต้องจัดการในหมวดนี้' : 'Nothing needs attention in this category.'}</p>}
        <ul className="divide-y">{items.map(item => <li key={item.id}><Link href={item.url} className="flex min-h-16 items-center gap-3 rounded-md py-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary hover:bg-muted/40"><div className="min-w-0 flex-1"><p className="text-xs font-medium text-primary">{labels[item.kind]?.[th ? 0 : 1]}</p><p className="break-words font-medium">{item.title}</p><p className="text-xs text-muted-foreground">{[item.caseRef, item.owner ?? (th ? 'ยังไม่มอบหมาย' : 'Unassigned'), item.dueAt ? new Date(item.dueAt).toLocaleDateString(th ? 'th-TH' : 'en-GB', { timeZone: 'Asia/Bangkok', day: 'numeric', month: 'short', year: 'numeric' }) : (th ? 'ยังไม่กำหนดวัน' : 'No date set')].filter(Boolean).join(' · ')}</p>{item.detail && <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{item.detail}</p>}</div><ArrowRight className="size-4 shrink-0" aria-hidden /></Link></li>)}</ul>
        {queue.limited && <p className="text-xs text-muted-foreground">{th ? 'แสดงสูงสุดหมวดละ 50 รายการ เปิดหน้ารายการเพื่อดูทั้งหมด' : 'Up to 50 items per category. Open the relevant list to see all.'}</p>}
      </>}
    </CardContent>
  </Card>;
}

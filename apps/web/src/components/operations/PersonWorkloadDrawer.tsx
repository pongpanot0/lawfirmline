'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { PersonWorkload, TASK_SIZES, TaskSize, taskPoints } from '@lawfirm/shared';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { formatDate, formatDateTime } from '@/lib/utils';
import { SideDrawer } from '@/components/ui/SideDrawer';
import { Badge } from '@/components/ui/badge';
import { ROLE_LABELS } from '@/lib/daily-workboard';

const LEAVE_LABELS: Record<string, string> = { SICK: 'ลาป่วย', PERSONAL: 'ลากิจ', VACATION: 'ลาพักร้อน' };
const SIZE_LABELS: Record<string, string> = Object.fromEntries(TASK_SIZES.map((s) => [s.value, s.label.split(' ')[0]]));

function Section({ title, empty, children }: { title: string; empty: boolean; children: React.ReactNode }) {
  return <section className="space-y-2">
    <h3 className="text-sm font-semibold">{title}</h3>
    {empty ? <p className="text-sm text-muted-foreground">ไม่มี</p> : <ul className="divide-y rounded-lg border">{children}</ul>}
  </section>;
}

/** Everything one member is carrying — cases, queue, reviews, hearings, leave — in one place. */
export function PersonWorkloadDrawer({ userId, onClose, onChanged }: { userId: string | null; onClose: () => void; onChanged?: () => void }) {
  const { token } = useAuth();
  const [data, setData] = useState<PersonWorkload | null>(null);
  const [error, setError] = useState('');
  const [sizing, setSizing] = useState<string | null>(null);
  const [savingSize, setSavingSize] = useState(false);
  const [sizeError, setSizeError] = useState('');

  const saveSize = async (taskId: string, size: TaskSize) => {
    if (!token || savingSize) return;
    setSavingSize(true); setSizeError('');
    try {
      await api.setTaskSize(token, taskId, size);
      setData((d) => d && { ...d, tasks: d.tasks.map((t) => t.id === taskId ? { ...t, size } : t) });
      setSizing(null);
      onChanged?.();
    } catch (err) { setSizeError(err instanceof Error ? err.message : 'บันทึกขนาดไม่ได้'); }
    finally { setSavingSize(false); }
  };

  useEffect(() => {
    if (!token || !userId) return;
    let cancelled = false;
    setData(null); setError(''); setSizing(null); setSizeError('');
    api.getPersonWorkload(token, userId)
      .then((d) => { if (!cancelled) setData(d); })
      .catch((err) => { if (!cancelled) setError(err instanceof Error ? err.message : 'โหลดข้อมูลไม่ได้'); });
    return () => { cancelled = true; };
  }, [token, userId]);

  const points = data?.tasks.reduce((sum, t) => sum + taskPoints(t.size), 0) ?? 0;
  const overdue = data?.tasks.filter((t) => t.overdue).length ?? 0;

  return <SideDrawer open={userId !== null} title={data ? `${data.firstName} ${data.lastName}` : 'ภาระงาน'} onClose={onClose}>
    <div className="space-y-5 p-5">
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {!data && !error && <p role="status" className="text-sm text-muted-foreground">กำลังโหลด…</p>}
      {data && <>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[['งานในคิว', `${data.tasks.length}`], ['แต้มภาระ', `${points}`], ['เลยกำหนด', `${overdue}`], ['คดีที่ถือ', `${data.cases.length}`]].map(([label, value]) =>
            <div key={label} className="rounded-lg border bg-card p-3"><p className="text-xs text-muted-foreground">{label}</p><p className={`mt-1 text-xl font-semibold ${label === 'เลยกำหนด' && overdue > 0 ? 'text-destructive' : ''}`}>{value}</p></div>)}
        </div>
        <p className="text-xs text-muted-foreground">{ROLE_LABELS[data.role] ?? data.role}</p>

        {data.leaves.length > 0 && <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          {data.leaves.map((l) => <p key={l.id}>{LEAVE_LABELS[l.type] ?? 'ลา'} {formatDate(`${l.startDate}T00:00:00+07:00`)}{l.endDate !== l.startDate ? ` – ${formatDate(`${l.endDate}T00:00:00+07:00`)}` : ''}</p>)}
        </div>}

        <Section title="งานในคิว (ตามลำดับ)" empty={data.tasks.length === 0}>
          {data.tasks.map((t) => <li key={t.id} className="px-3 py-2 text-sm">
            <div className="flex items-start justify-between gap-2">
              <span className="min-w-0 break-words font-medium">{t.title}</span>
              {sizing === t.id
                ? <span role="group" aria-label={`ขนาดของ ${t.title}`} className="flex shrink-0 overflow-hidden rounded-full border">
                  {TASK_SIZES.map((s) => <button key={s.value} type="button" disabled={savingSize} aria-pressed={t.size === s.value} onClick={() => void saveSize(t.id, s.value)}
                    className={`px-2.5 py-0.5 text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring disabled:opacity-50 ${t.size === s.value ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}>{SIZE_LABELS[s.value]}</button>)}
                </span>
                : <button type="button" onClick={() => { setSizing(t.id); setSizeError(''); }} aria-label={`แก้ขนาดงาน ${t.title}`}
                  className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${t.size ? 'bg-muted text-muted-foreground hover:bg-muted/70' : 'border border-dashed border-amber-400 text-amber-700 hover:bg-amber-50 dark:text-amber-300 dark:hover:bg-amber-950'}`}>
                  {t.size ? SIZE_LABELS[t.size] : 'ระบุขนาด'}
                </button>}
            </div>
            {sizing === t.id && sizeError && <p role="alert" className="mt-1 text-xs text-destructive">{sizeError}</p>}
            <p className="mt-0.5 text-xs text-muted-foreground">
              {t.case ? `${t.case.ownRef} · ` : ''}
              {t.scheduledFor ? `วางแผน ${formatDate(`${t.scheduledFor}T00:00:00+07:00`, { day: 'numeric', month: 'short' })}` : 'ยังไม่วางแผนวัน'}
              {t.dueDate && <span className={t.overdue ? ' text-destructive' : ''}> · ส่ง {formatDateTime(t.dueDate)}</span>}
            </p>
            {t.holdReason && <p className="mt-1 text-xs text-amber-700">พักไว้: {t.holdReason}</p>}
          </li>)}
        </Section>

        {data.reviews.length > 0 && <Section title="งานที่รอเขาตรวจ" empty={false}>
          {data.reviews.map((t) => <li key={t.id} className="px-3 py-2 text-sm">{t.title}{t.dueDate && <span className="block text-xs text-muted-foreground">ส่ง {formatDateTime(t.dueDate)}</span>}</li>)}
        </Section>}

        <Section title="นัดหมาย 7 วันข้างหน้า" empty={data.events.length === 0}>
          {data.events.map((e) => <li key={e.id} className="px-3 py-2 text-sm"><span className="font-medium">{e.title}</span><span className="block text-xs text-muted-foreground">{formatDateTime(e.startAt)}{e.courtName ? ` · ${e.courtName}` : ''}</span></li>)}
        </Section>

        <Section title="คดีที่รับผิดชอบ" empty={data.cases.length === 0}>
          {data.cases.map((c) => <li key={c.id}><Link href={`/cases/${c.id}`} className="flex items-center justify-between gap-2 px-3 py-2 text-sm hover:bg-muted/50">
            <span className="min-w-0 truncate">{c.ownRef} · {c.title}</span>
            <Badge variant={c.role === 'LEAD' ? 'default' : 'secondary'} className="shrink-0">{c.role === 'LEAD' ? 'หลัก' : 'ร่วม'}</Badge>
          </Link></li>)}
        </Section>
      </>}
    </div>
  </SideDrawer>;
}

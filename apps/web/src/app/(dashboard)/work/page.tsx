'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ArrowRight, Search, Plus, ListTodo } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { api } from '@/lib/api';
import { bangkokDateInputValue, bangkokDayLabel } from '@/lib/bangkok';
import { useLocale } from '@/components/landing/LocaleProvider';

export default function WorkInbox() {
  const { token, user } = useAuth();
  const { locale, d } = useLocale();
  const t = (th: string, en: string) => locale === 'th' ? th : en;
  const params = useSearchParams();
  const [items, setItems] = useState<Awaited<ReturnType<typeof api.getTaskInbox>>>([]);
  const [scope, setScope] = useState('all');
  const [due, setDue] = useState('all');
  const [status, setStatus] = useState('all');
  const [search, setSearch] = useState('');
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    const value = params.get('scope');
    setScope(value && ['mine', 'case', 'personal'].includes(value) ? value : 'all');
  }, [params]);

  useEffect(() => {
    if (!token) return;
    let active = true;
    setLoading(true); setError(false);
    api.getTaskInbox(token)
      .then(rows => { if (active) setItems(rows); })
      .catch(() => { if (active) setError(true); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [token, retry]);

  const today = bangkokDateInputValue(new Date());
  const dueKey = (task: typeof items[number]) => !task.dueDate ? 'undated' : bangkokDateInputValue(task.dueDate) < today ? 'overdue' : bangkokDateInputValue(task.dueDate) === today ? 'today' : 'later';
  const scopes = [
    ['all', t('ทั้งหมดที่ดูแล', 'All accessible')],
    ['mine', t('มอบหมายให้ฉัน', 'Assigned to me')],
    ['case', t('งานคดี', 'Case tasks')],
    ['personal', t('งานทั่วไป', 'General tasks')],
  ];
  const scoped = items.filter(task => scope === 'all' || scope === 'mine' && task.assigneeId === user?.id || scope === 'case' && task.caseId || scope === 'personal' && !task.caseId);
  const statuses: Record<string, string> = {
    TODO: d.todos.columnTodo, IN_PROGRESS: d.todos.columnInProgress,
    PENDING_REVIEW: d.todos.columnPendingReview, NEEDS_REVISION: d.todos.columnNeedsRevision,
  };
  const filtered = scoped.filter(task =>
    (due === 'all' || dueKey(task) === due) &&
    (status === 'all' || task.status === status) &&
    `${task.title} ${task.case?.ownRef ?? ''} ${task.case?.title ?? ''} ${task.assignee?.firstName ?? ''} ${task.assignee?.lastName ?? ''}`.toLowerCase().includes(search.trim().toLowerCase())
  );
  const clear = () => { setScope('all'); setDue('all'); setStatus('all'); setSearch(''); };
  const hasFilters = scope !== 'all' || due !== 'all' || status !== 'all' || !!search;
  const control = 'min-h-11 rounded-lg border border-input bg-background px-3 text-sm';

  return <div className="mx-auto max-w-6xl space-y-5">
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{t('งานที่ต้องทำ', 'Work inbox')}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{t('เริ่มจากงานใกล้กำหนด เลือกงานเพื่อดูรายละเอียดและอัปเดตความคืบหน้า', 'Start with approaching deadlines. Open a task to view details and update progress.')}</p>
      </div>
      <Link href="/todos?new=1" className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground"><Plus className="size-4" />{t('เพิ่มงานส่วนตัว', 'Add personal task')}</Link>
    </header>

    <section aria-label={t('กรองรายการงาน', 'Filter tasks')} className="space-y-4 rounded-xl border border-border bg-card p-4">
      <div className="grid grid-cols-2 gap-1 sm:flex sm:flex-wrap sm:gap-2">
        {scopes.map(([value, label]) => <button key={value} aria-pressed={scope === value} onClick={() => setScope(value)} className={`min-h-10 rounded-lg px-3 text-sm font-medium ${scope === value ? 'bg-foreground text-background' : 'text-muted-foreground hover:bg-muted'}`}>{label}</button>)}
      </div>
      <div className="flex flex-wrap gap-2 border-t border-border pt-4">
        {[
          ['all', t('ทุกกำหนด', 'Any due date')], ['overdue', t('เกินกำหนด', 'Overdue')],
          ['today', t('ครบกำหนดวันนี้', 'Due today')],
        ].map(([value, label]) => <button key={value} aria-pressed={due === value} onClick={() => setDue(value)} className={`inline-flex min-h-10 items-center gap-2 rounded-lg border px-3 text-xs font-medium ${due === value ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:bg-muted'}`}>
          {label}<span className={value === 'overdue' && scoped.some(task => dueKey(task) === value) ? 'font-semibold text-amber-600 dark:text-amber-400' : ''}>{loading || error ? '—' : value === 'all' ? scoped.length : scoped.filter(task => dueKey(task) === value).length}</span>
        </button>)}
      </div>
      <div className="flex flex-wrap gap-3">
        <label className="relative min-w-0 flex-1 basis-64"><Search aria-hidden className="absolute left-3 top-3.5 size-4 text-muted-foreground" /><input aria-label={t('ค้นหางาน', 'Search tasks')} placeholder={t('ค้นชื่องาน คดี เลขอ้างอิง หรือผู้รับผิดชอบ', 'Search task, case, reference or assignee')} value={search} onChange={event => setSearch(event.target.value)} className={`${control} w-full pl-9`} /></label>
        <select aria-label={t('สถานะงาน', 'Task status')} value={status} onChange={event => setStatus(event.target.value)} className={`${control} max-w-full`}><option value="all">{t('ทุกสถานะ', 'All statuses')}</option>{Object.entries(statuses).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select>
        {hasFilters && <button onClick={clear} className="min-h-11 px-2 text-sm text-primary hover:underline">{t('ล้างตัวกรอง', 'Clear filters')}</button>}
      </div>
    </section>

    {loading ? <p role="status" className="p-6 text-sm text-muted-foreground">{t('กำลังโหลดงาน…', 'Loading tasks…')}</p> : error ? <div role="alert" className="rounded-xl border border-destructive/30 p-5"><p>{t('โหลดงานไม่สำเร็จ', 'Unable to load tasks')}</p><button className="mt-2 min-h-10 text-primary underline" onClick={() => setRetry(n => n + 1)}>{t('ลองใหม่', 'Retry')}</button></div> : <>
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground"><p aria-live="polite">{t(`แสดง ${filtered.length} จาก ${items.length} งานที่ยังไม่เสร็จ`, `${filtered.length} of ${items.length} open tasks`)}</p><p>{t('เรียงตามวันส่ง · งานไม่กำหนดวันอยู่ท้ายรายการ', 'Earliest due first · Undated tasks last')}</p></div>
      {filtered.length ? <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
        {filtered.map(task => <li key={task.id}>
          <Link href={task.caseId ? `/cases/${task.caseId}?tab=tasks&task=${task.id}` : `/todos?task=${task.id}`} className="group flex items-start gap-3 p-4 transition-colors hover:bg-muted/50 sm:p-5">
            <span aria-hidden className={`mt-2 size-2 shrink-0 rounded-full ${dueKey(task) === 'overdue' ? 'bg-amber-500' : 'bg-primary/40'}`} />
            <div className="min-w-0 flex-1 space-y-2">
              <div className="flex flex-wrap items-start justify-between gap-2"><h2 className="min-w-0 break-words text-sm font-semibold group-hover:text-primary sm:text-base">{task.title}</h2><span className="shrink-0 rounded-md bg-muted px-2 py-1 text-xs">{statuses[task.status] ?? task.status}</span></div>
              <p className="break-words text-xs text-muted-foreground">{task.case ? `${task.case.ownRef} · ${task.case.title}` : t('งานทั่วไป', 'General task')}</p>
              <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs"><span className="text-muted-foreground">{t('ผู้รับผิดชอบ: ', 'Assigned to: ')}{task.assignee ? `${task.assignee.firstName} ${task.assignee.lastName}` : t('ยังไม่มอบหมาย', 'Unassigned')}</span><span className={dueKey(task) === 'overdue' ? 'font-medium text-amber-700 dark:text-amber-400' : dueKey(task) === 'today' ? 'font-medium text-primary' : 'text-muted-foreground'}>{dueKey(task) === 'overdue' ? t('เกินกำหนด · ', 'Overdue · ') : dueKey(task) === 'today' ? t('ครบกำหนดวันนี้ · ', 'Due today · ') : task.dueDate ? t('ส่งภายใน ', 'Due ') : ''}{task.dueDate ? bangkokDayLabel(bangkokDateInputValue(task.dueDate), locale === 'th' ? 'th-TH' : 'en-GB') : t('ยังไม่กำหนดวันส่ง', 'No due date')}</span></div>
            </div>
            <ArrowRight aria-hidden className="mt-1 size-4 shrink-0 text-muted-foreground group-hover:text-primary" />
            <span className="sr-only">{t('เปิดรายละเอียดงาน', 'Open task details')}</span>
          </Link>
        </li>)}
      </ul> : <div className="rounded-xl border border-dashed border-border py-12 text-center"><ListTodo aria-hidden className="mx-auto mb-3 size-7 text-muted-foreground" /><h2 className="font-medium">{items.length ? t('ไม่มีงานที่ตรงกับตัวกรอง', 'No matching tasks') : t('ยังไม่มีงานค้างในรายการ', 'No open tasks')}</h2><p className="mt-2 px-4 text-sm text-muted-foreground">{t('รายการนี้แสดงเฉพาะงานที่คุณมีสิทธิ์ดูและยังไม่เสร็จ', 'This list includes unfinished tasks you have permission to view.')}</p>{hasFilters && <button className="mt-4 min-h-11 rounded-lg border border-border px-4 text-sm text-primary" onClick={clear}>{t('กลับไปดูงานทั้งหมด', 'Show all tasks')}</button>}</div>}
    </>}
  </div>;
}

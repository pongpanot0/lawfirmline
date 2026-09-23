'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Plus, Search, CalendarDays, CheckCircle2, FileText } from 'lucide-react';
import { AgendaItemKind, FirmRole } from '@lawfirm/shared';
import { useAuth, getStoredToken } from '@/lib/auth';
import { api, DashboardStats, MyDayResponse, IntakeItem } from '@/lib/api';
import { bangkokDateInputValue, bangkokDayLabel, bangkokTime } from '@/lib/bangkok';
import { PageLoading } from '@/components/ui/misc';
import { CaseStatusBadge } from '@/components/samnuan/CaseStatusBadge';
import { useLocale } from '@/components/landing/LocaleProvider';

type Inbox = Awaited<ReturnType<typeof api.getTaskInbox>>;
const panel = 'overflow-hidden rounded-2xl border border-border bg-card';
const link = 'inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline';

export default function DashboardPage() {
  const { token, user } = useAuth();
  const { locale, d } = useLocale();
  const t = (th: string, en: string) => locale === 'th' ? th : en;
  const [data, setData] = useState<DashboardStats | null>(null);
  const [tasks, setTasks] = useState<Inbox | null>(null);
  const [intakes, setIntakes] = useState<IntakeItem[] | null>(null);
  const [agenda, setAgenda] = useState<MyDayResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [retry, setRetry] = useState(0);
  const [section, setSection] = useState<'tasks' | 'matters'>('tasks');
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    const authToken = token ?? getStoredToken();
    if (!authToken) { setLoading(false); return; }
    let active = true;
    setLoading(true);
    Promise.allSettled([
      api.getDashboardStats(authToken), api.getTaskInbox(authToken),
      api.getIntakes(authToken, { limit: 6 }), api.getMyDay(authToken),
    ]).then(([stats, inbox, intake, day]) => {
      if (!active) return;
      setData(stats.status === 'fulfilled' ? stats.value : null);
      setTasks(inbox.status === 'fulfilled' ? inbox.value : null);
      setIntakes(intake.status === 'fulfilled' ? intake.value.items : null);
      setAgenda(day.status === 'fulfilled' ? day.value : null);
      setLoading(false);
    });
    return () => { active = false; };
  }, [token, retry]);

  if (loading) return <PageLoading title={d.common.loading} lines={5} />;
  const failed = <div role="alert" className="p-6 text-sm text-muted-foreground">{t('โหลดข้อมูลไม่สำเร็จ', 'Unable to load data')} <button onClick={() => setRetry(x => x + 1)} className={link}>{t('ลองอีกครั้ง', 'Retry')}</button></div>;
  const today = bangkokDateInputValue(new Date());
  const overdue = (task: Inbox[number]) => !!task.dueDate && bangkokDateInputValue(task.dueDate) < today;
  const filtered = tasks?.filter(task => filter === 'mine' ? task.assigneeId === user?.id : filter === 'overdue' ? overdue(task) : true) ?? [];
  const visibleCases = data?.recentCases.slice(0, 4) ?? [];
  const visibleCaseIds = new Set(visibleCases.map(item => item.id));
  const recentMatters = [
    ...(intakes ?? []).filter(item => ![item.case?.id, item.relatedCaseId].some(id => id && visibleCaseIds.has(id))).map(item => ({
      id: `intake-${item.id}`,
      href: `/intake/${item.id}`,
      title: item.title || item.description?.slice(0, 100) || t('เรื่องรับเข้า', 'Intake'),
      detail: [item.insurerName || item.clientName || t('ยังไม่ระบุบริษัท / ลูกความ', 'Company / client not specified'), item.claimNumber ? `${t('เคลม', 'Claim')} ${item.claimNumber}` : null].filter(Boolean).join(' · '),
      at: item.receivedDate,
      kind: 'intake' as const,
    })),
    ...visibleCases.map(item => ({
      id: `case-${item.id}`,
      href: `/cases/${item.id}`,
      title: item.title,
      detail: item.ownRef,
      at: item.updatedAt,
      kind: 'case' as const,
      status: item.status,
    })),
  ].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime()).slice(0, 6);
  const events = agenda ? [...agenda.todayItems, ...agenda.tomorrow, ...agenda.upcoming.flatMap(day => day.items)]
    .filter(item => item.kind !== AgendaItemKind.TASK)
    .filter((item, index, items) => items.findIndex(other => other.id === item.id) === index)
    .sort((a, b) => a.at.localeCompare(b.at)).slice(0, 4) : [];
  const date = (iso: string) => bangkokDayLabel(bangkokDateInputValue(iso), locale === 'th' ? 'th-TH' : 'en-GB');
  const statuses: Record<string, string> = { TODO: d.todos.columnTodo, IN_PROGRESS: d.todos.columnInProgress, PENDING_REVIEW: d.todos.columnPendingReview, NEEDS_REVISION: d.todos.columnNeedsRevision, DONE: d.todos.columnDone };

  return <div className="mx-auto max-w-[1440px] space-y-6">
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <p className="mb-2 text-xs font-medium tracking-wide text-muted-foreground">{data?.firmName ?? 'SAMNUAN'} · {date(new Date().toISOString())}</p>
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{t('ภาพรวมงาน', 'Work overview')}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{t('รับเรื่อง ติดตามงาน และเตรียมพร้อมสำหรับนัดถัดไป', 'Receive matters, follow up on work, and prepare for your next appointment.')}</p>
      </div>
      <Link href="/intake/new" data-tour="new-intake" className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground shadow-sm hover:opacity-90"><Plus className="size-4" />{t('รับงานใหม่', 'New intake')}</Link>
    </header>

    <div className="grid grid-cols-2 gap-y-5 border-y border-border py-5 lg:grid-cols-4">
      {[
        { label: t('คดีที่ยังไม่ปิด', 'Unclosed cases'), value: data?.stats.openCases, href: '/cases' },
        { label: t('งานที่ยังไม่เสร็จ', 'Open tasks'), value: tasks?.length, href: '/todos' },
        { label: t('งานเกินกำหนด', 'Overdue tasks'), value: tasks?.filter(overdue).length, href: '#work-queue', warn: true },
        { label: t('นัดที่กำลังจะมาถึง', 'Upcoming events'), value: data?.stats.upcomingEvents, href: '/calendar' },
      ].map((item, i) => <Link key={item.label} href={item.href} data-tour={i === 0 ? 'kpi-cases' : undefined} onClick={() => { if (item.warn) { setSection('tasks'); setFilter('overdue'); } }} className="group border-l-2 border-border pl-4 first:border-primary">
        <span className={`block text-2xl font-semibold tabular-nums ${item.warn && item.value ? 'text-amber-600 dark:text-amber-400' : ''}`}>{item.value ?? '—'}</span>
        <span className="mt-1 block text-xs text-muted-foreground group-hover:text-primary">{item.label} ↗</span>
      </Link>)}
    </div>

    <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1.8fr)_minmax(280px,1fr)]">
      <div className="contents">
        <section id="work-queue" className={`${panel} order-1 min-w-0`} aria-label={t('รายการงาน', 'Work queue')}>
          <div className="flex border-b border-border px-5" role="tablist" aria-label={t('เลือกรายการ', 'Choose list')}>
            {(['tasks', 'matters'] as const).map(tab => <button key={tab} id={`tab-${tab}`} aria-controls={`panel-${tab}`} role="tab" tabIndex={section === tab ? 0 : -1} onKeyDown={event => {
              if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
                event.preventDefault();
                const next = event.key === 'Home' ? 'tasks' : event.key === 'End' ? 'matters' : tab === 'tasks' ? 'matters' : 'tasks';
                setSection(next);
                document.getElementById(`tab-${next}`)?.focus();
              }
            }} aria-selected={section === tab} onClick={() => setSection(tab)} className={`min-h-14 border-b-2 px-3 text-sm font-semibold ${section === tab ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>{tab === 'tasks' ? t('งานที่ต้องทำ', 'Tasks') : t('เรื่องและคดีล่าสุด', 'Recent matters')}</button>)}
          </div>
          <div role="tabpanel" id={`panel-${section}`} aria-labelledby={`tab-${section}`}>
          {section === 'tasks' ? <>
            <div className="flex flex-wrap items-center gap-2 px-5 py-4">
              {['all', 'mine', 'overdue'].map(value => <button key={value} aria-pressed={filter === value} onClick={() => setFilter(value)} className={`min-h-9 rounded-lg px-3 text-xs font-medium ${filter === value ? 'bg-foreground text-background' : 'bg-muted/60 text-muted-foreground hover:bg-muted'}`}>{value === 'all' ? t('ทั้งหมด', 'All') : value === 'mine' ? t('มอบหมายให้ฉัน', 'Assigned to me') : t('เกินกำหนด', 'Overdue')}</button>)}
              <span className="ml-auto text-xs text-muted-foreground">{tasks ? filtered.length : '—'} {t('งาน', 'tasks')}</span>
            </div>
            {!tasks ? failed : filtered.length === 0 ? <div className="px-6 py-10 text-center"><CheckCircle2 className="mx-auto mb-3 size-6 text-muted-foreground" /><p className="text-sm">{t('ไม่มีงานในรายการนี้', 'No tasks in this list')}</p><p className="mt-1 text-xs text-muted-foreground">{t('เลือกดูทั้งหมด หรือเปิดรายการงานเพื่อจัดการต่อ', 'Choose All or open your work list to continue.')}</p></div> : <div className="divide-y divide-border/70">
              {filtered.slice(0, 6).map(task => <Link key={task.id} href={task.caseId ? `/cases/${task.caseId}?tab=tasks&task=${task.id}` : `/todos?task=${task.id}`} className="group flex items-start gap-3 px-5 py-4 hover:bg-muted/40">
                <span className={`mt-1.5 size-2 shrink-0 rounded-full ${overdue(task) ? 'bg-amber-500' : 'bg-primary/50'}`} />
                <div className="min-w-0 flex-1"><p className="break-words text-sm font-medium group-hover:text-primary">{task.title}</p><p className="mt-1.5 flex flex-wrap gap-x-2 gap-y-1 text-xs text-muted-foreground"><span className="font-mono">{task.case?.ownRef ?? t('งานทั่วไป', 'General')}</span><span>· {task.assignee ? `${task.assignee.firstName} ${task.assignee.lastName}` : t('ยังไม่มอบหมาย', 'Unassigned')}</span><span>· {statuses[task.status] ?? task.status}</span></p><p className={`mt-2 text-xs ${overdue(task) ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground'}`}>{task.dueDate ? `${overdue(task) ? t('เกินกำหนด · ', 'Overdue · ') : t('กำหนด ', 'Due ')}${date(task.dueDate)}` : t('ยังไม่กำหนดวันส่ง', 'No due date')}</p></div><ArrowRight className="mt-1 size-4 shrink-0 text-muted-foreground" />
              </Link>)}
            </div>}
          </> : !intakes || !data ? failed : recentMatters.length === 0 ? <p className="p-8 text-center text-sm text-muted-foreground">{t('ยังไม่มีเรื่องหรือคดี เริ่มจากปุ่มรับงานใหม่', 'No matters yet. Start with New intake.')}</p> : <div className="divide-y divide-border/70">{recentMatters.map(item => <Link key={item.id} href={item.href} className="group flex items-start gap-3 px-5 py-4 hover:bg-muted/40"><FileText className="mt-1 size-4 shrink-0 text-muted-foreground" /><div className="min-w-0 flex-1"><p className="break-words text-sm font-medium group-hover:text-primary">{item.title}</p><p className="mt-1 text-xs text-muted-foreground">{item.detail} · {date(item.at)}</p></div>{item.kind === 'case' ? <CaseStatusBadge status={item.status} /> : <span className="rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground">{t('รับเรื่อง', 'Intake')}</span>}<ArrowRight className="mt-1 size-4 shrink-0 text-muted-foreground" /></Link>)}</div>}
          </div>
          <div className="border-t border-border px-5 py-3"><Link href={section === 'tasks' ? '/todos' : '/cases'} className={link}>{section === 'tasks' ? t('เปิดรายการงานทั้งหมด', 'Open all tasks') : t('เปิดเรื่องและคดีทั้งหมด', 'Open all matters')}<ArrowRight className="size-3.5" /></Link></div>
        </section>

      </div>

      <aside className="order-2 min-w-0 space-y-6 xl:col-start-2">
        <section className={panel}>
          <div className="flex items-center justify-between border-b border-border px-5 py-4"><h2 className="flex items-center gap-2 text-sm font-semibold"><CalendarDays className="size-4 text-muted-foreground" />{t('นัดและกำหนดถัดไป', 'Upcoming dates')}</h2><Link href="/calendar" className={link}>{t('ปฏิทิน', 'Calendar')}</Link></div>
          {!agenda ? failed : events.length === 0 ? <p className="px-5 py-6 text-sm text-muted-foreground">{t('ไม่มีนัดหรือกำหนดในช่วงที่แสดง', 'No upcoming dates in this agenda window.')}</p> : <div className="divide-y divide-border/70">{events.map(item => <Link key={item.id} href={item.kind === AgendaItemKind.COURT_DATE ? `/court-day/${item.entityId}` : item.url} className="block px-5 py-4 hover:bg-muted/40"><p className="text-xs font-medium text-primary">{date(item.at)} · {item.allDay ? t('ทั้งวัน', 'All day') : bangkokTime(item.at)}</p><p className="mt-2 break-words text-sm font-semibold">{item.title}</p><p className="mt-1 text-xs text-muted-foreground">{[item.caseRef, item.location].filter(Boolean).join(' · ')}</p></Link>)}</div>}
          <div className="border-t border-border px-5 py-3"><Link href="/my-day" className={link}>{t('เตรียมงานประจำวัน', 'Plan your day')}<ArrowRight className="size-3.5" /></Link></div>
        </section>
        <section className="rounded-2xl border border-primary/15 bg-primary/5 p-5">
          <Search className="mb-4 size-5 text-primary" />
          <h2 className="text-lg font-semibold">{t('ข้อเท็จจริงและฎีกาของเรื่อง', 'Research within a matter')}</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{t('เปิดเรื่องจากรายการเดียว เพื่อจัดข้อเท็จจริง ค้นฎีกา และสรุปเอกสาร ผลจะเก็บอยู่กับเรื่องนั้น', 'Open any matter from the shared list to organize facts, find precedents, and summarize documents. Results stay with that matter.')}</p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Link href="/cases" className={link}>{t('เปิดรายการเรื่องและคดี', 'Open matters')}<ArrowRight className="size-4" /></Link>
          </div>
        </section>
        {user?.firmRole === FirmRole.OWNER && <div className="flex flex-wrap gap-x-5 gap-y-3 px-1"><Link href="/reports" className={link}>{t('รายงานสำนักงาน', 'Firm reports')} ↗</Link><Link href="/expenses" className={link}>{t('ค่าใช้จ่าย', 'Expenses')} ↗</Link></div>}
      </aside>
    </div>
  </div>;
}

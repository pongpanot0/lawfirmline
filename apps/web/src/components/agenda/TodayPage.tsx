'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertCircle, CalendarDays, CheckCircle2, ClipboardList, ExternalLink, Gavel, ListChecks, Plus, SkipForward, ChevronDown } from 'lucide-react';
import { AgendaItemKind, Role, TaskStatus } from '@lawfirm/shared';
import { api, type CaseProgress, type DashboardStats, type IntakeItem, type MyDayResponse } from '@/lib/api';
import { useAuth, getStoredToken } from '@/lib/auth';
import { bangkokDateInputValue, bangkokDayLabel, bangkokTime } from '@/lib/bangkok';
import { Button, buttonVariants } from '@/components/ui/button';
import { Tabs, TabsList } from '@/components/ui/tabs';
import { PageLoading } from '@/components/ui/misc';
import { LoadFailed } from '@/components/ui/LoadFailed';
import type { ActionQueue } from './ActionCenter';
import { dayGroup, dayOffset } from './today-helpers';

type Task = Awaited<ReturnType<typeof api.getTaskInbox>>[number];
type Item = ActionQueue['items'][number] & { task?: Task; caseId?: string | null; caseTitle?: string | null; review?: boolean };
const card = 'overflow-hidden rounded-xl border bg-card shadow-sm';
const tabs = [{ id: 'mine', label: 'งานของฉัน', icon: ClipboardList }, { id: 'overdue', label: 'เกินกำหนด', icon: AlertCircle }, { id: 'review', label: 'รอฉันตรวจ', icon: CheckCircle2 }] as const;
type Tab = typeof tabs[number]['id'];
const diffDays = (date: string, today: string) => dayOffset(bangkokDateInputValue(date), today);

export function TodayPage() {
  const { token, user } = useAuth();
  const [data, setData] = useState<{ tasks: Task[]; queue: ActionQueue; day: MyDayResponse; stats: DashboardStats | null; intakes: IntakeItem[]; progress: CaseProgress[] } | null>(null);
  const [error, setError] = useState('');
  const [partial, setPartial] = useState(false);
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState('');
  const [tab, setTab] = useState<Tab>('mine');
  const [focus, setFocus] = useState(0);
  const load = useCallback(async () => {
    const auth = token ?? getStoredToken();
    if (!auth) return;
    try {
      const [tasks, queue, day, stats, intakes, progress] = await Promise.all([api.getTaskInbox(auth), api.getActionQueue(auth), api.getMyDay(auth), api.getDashboardStats(auth).catch(() => null), api.getIntakes(auth, { limit: 6 }).catch(() => null), api.getCaseProgress(auth).catch(() => [])]);
      setData({ tasks, queue, day, stats, intakes: intakes?.items ?? [], progress }); setPartial(!stats || !intakes); setError('');
    } catch (err) { setError(err instanceof Error ? err.message : 'โหลดข้อมูลไม่สำเร็จ'); }
  }, [token]);
  useEffect(() => { void load(); }, [load]);
  const complete = async (item: Item) => {
    const auth = token ?? getStoredToken(); if (!auth || !item.task) return;
    setBusy(item.id); setRowErrors(prev => ({ ...prev, [item.id]: '' }));
    try {
      if (item.task.caseId) await api.updateTask(auth, item.task.caseId, item.task.id, { status: TaskStatus.DONE });
      else await api.updateTodo(auth, item.task.id, { status: TaskStatus.DONE });
      await load();
    } catch (err) { setRowErrors(prev => ({ ...prev, [item.id]: err instanceof Error ? err.message : 'บันทึกไม่สำเร็จ ลองใหม่อีกครั้ง' })); }
    finally { setBusy(''); }
  };
  if (error && !data) return <LoadFailed message={error} onRetry={() => void load()} />;
  if (!data) return <PageLoading lines={5} />;
  const today = data.day.today || bangkokDateInputValue(new Date());
  const actionById = new Map(data.queue.items.map(item => [item.id, item]));
  const taskItems: Item[] = data.tasks.map(task => {
    const action = actionById.get(`task:${task.id}`);
    return { id: `task:${task.id}`, kind: action?.kind ?? 'TASK', title: task.title, detail: action?.detail ?? null, caseRef: task.case?.ownRef ?? action?.caseRef ?? null, caseTitle: task.case?.title, caseId: task.caseId, owner: task.assignee ? `${task.assignee.firstName} ${task.assignee.lastName}` : action?.owner ?? null, ownerId: task.assigneeId ?? action?.ownerId ?? null, dueAt: action?.dueAt ?? task.dueDate ?? null, url: action?.url ?? (task.caseId ? `/cases/${task.caseId}?tab=tasks&task=${task.id}` : `/todos?task=${task.id}`), task };
  });
  const ids = new Set(taskItems.map(item => item.id));
  const mine: Item[] = [...taskItems, ...data.queue.items.filter(item => !ids.has(item.id))].filter(item => item.ownerId === user?.id).sort((a, b) => (a.dueAt ?? '9999').localeCompare(b.dueAt ?? '9999'));
  const actionReviews = mine.filter(item => ['DATE_REVIEW', 'DOCUMENT_REVIEW', 'CLIENT_DRAFT', 'CUSTOMER_DRAFT'].includes(item.kind));
  const review: Item[] = [...actionReviews, ...data.day.reviewQueue.map(item => ({ id: `review:${item.id}`, kind: 'REVIEW', title: item.title, detail: null, caseRef: item.caseRef, caseTitle: item.caseTitle, caseId: item.caseId, owner: item.workerName, ownerId: user?.id ?? null, dueAt: item.dueDate, url: item.caseId ? `/cases/${item.caseId}/tasks?task=${item.id}` : `/todos?task=${item.id}`, review: true }))];
  const queue = [...mine, ...review.filter(item => !mine.some(other => other.id === item.id || other.task?.id === item.id.slice(7)))].sort((a, b) => (a.dueAt ?? '9999').localeCompare(b.dueAt ?? '9999'));
  const hero = queue[focus % (queue.length || 1)];
  const overdue = mine.filter(item => item.dueAt && diffDays(item.dueAt, today) < 0);
  const shown = tab === 'review' ? review : tab === 'overdue' ? overdue : mine;
  const groups = (['เกินกำหนด', 'วันนี้', 'พรุ่งนี้', 'ถัดไป'] as const).map(name => [name, shown.filter(item => dayGroup(item.dueAt ? diffDays(item.dueAt, today) : null) === name)] as const);
  const progress = hero?.caseId && data.progress.find(item => item.caseId === hero.caseId);
  const events = [...data.day.todayItems, ...data.day.tomorrow].filter(item => item.kind !== AgendaItemKind.TASK).filter((item, i, all) => all.findIndex(other => other.id === item.id) === i).sort((a, b) => a.at.localeCompare(b.at)).slice(0, 3);
  const caseIds = new Set((data.stats?.recentCases ?? []).slice(0, 4).map(item => item.id));
  const matters = [...data.intakes.filter(item => item.case?.id && !caseIds.has(item.case.id)).map(item => ({ id: item.case!.id, title: item.title || item.description || 'คดีก่อนฟ้อง', detail: item.insurerName || item.clientName || '', at: item.receivedDate })), ...(data.stats?.recentCases ?? []).slice(0, 4).map(item => ({ id: item.id, title: item.title, detail: item.ownRef, at: item.updatedAt }))].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 6);
  return <div className="mx-auto max-w-[1440px] space-y-6 pb-24">
    {partial && <p role="alert" className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm">โหลดเรื่องและคดีล่าสุดได้ไม่ครบ <button className="underline" onClick={() => void load()}>ลองอีกครั้ง</button></p>}
    {error && <p role="alert" className="rounded-lg border border-red-200 p-3 text-sm">{error} <button className="underline" onClick={() => void load()}>ลองอีกครั้ง</button></p>}
    <header className="flex flex-wrap items-start justify-between gap-4"><div><h1 className="text-3xl font-semibold">งานวันนี้</h1><p className="mt-2 text-muted-foreground">{bangkokDayLabel(today, 'th-TH')} {Number(today.slice(0, 4)) + 543} · งานที่ต้องทำและนัดที่ใกล้ถึง</p></div>{(user?.role === Role.ADMIN || user?.role === Role.LAWYER) && <div className="text-right"><Link href="/cases/new" className={buttonVariants({ variant: 'outline' })} title="กดเพื่อเปิดคดีหรือเรื่องก่อนฟ้อง"><Plus className="h-4 w-4" aria-hidden />เปิดคดีใหม่</Link><p className="mt-1 text-xs text-muted-foreground">กดเพื่อเปิดคดีหรือเรื่องก่อนฟ้อง</p></div>}</header>
    <section className="rounded-xl border border-l-4 border-amber-200 border-l-[var(--color-brass)] bg-[var(--operations-highlight)] p-5 shadow-sm sm:p-7">
      {hero ? <><div className="flex flex-wrap justify-between gap-2"><div className="flex gap-2"><span className="rounded bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-800">ทำต่อเลย</span>{hero.dueAt && diffDays(hero.dueAt, today) < 0 && <span className="inline-flex items-center gap-1 rounded-full border border-red-200 bg-red-50 px-2 text-xs text-red-700"><AlertCircle className="h-3.5 w-3.5" aria-hidden />เกินกำหนด {Math.abs(diffDays(hero.dueAt, today))} วัน</span>}</div>{hero.caseRef && <span className="text-sm text-muted-foreground">เลขอ้างอิงสำนักงาน: {hero.caseRef}</span>}</div><h2 className="mt-4 text-2xl font-semibold">{hero.title}</h2><p className="mt-2 text-sm text-muted-foreground">ผู้รับผิดชอบ: {hero.owner ?? 'ยังไม่ระบุ'}{progress && ` · ขั้น ${progress.stepIndex + 1} จาก ${progress.stepTotal} · ${progress.stepLabel}`}</p><div className="mt-6 flex flex-wrap items-start gap-5"><div><Link href={hero.url} className={buttonVariants()} title="กดเพื่อเปิดงานพร้อมเอกสารที่ต้องใช้"><ExternalLink className="h-4 w-4" aria-hidden />เปิดงานนี้</Link><p className="mt-1 text-xs text-muted-foreground">กดเพื่อเปิดงานพร้อมเอกสารที่ต้องใช้</p></div><Button variant="ghost" title="กดเพื่อดูงานถัดไป" onClick={() => setFocus(n => n + 1)}>ข้ามไปงานถัดไป <SkipForward className="h-4 w-4" aria-hidden /></Button></div></> : <><h2 className="text-xl font-semibold">วันนี้ไม่มีงานค้าง</h2><p className="mt-2 text-sm text-muted-foreground">งานที่มอบหมายและงานรอตรวจจะแสดงที่นี่</p><Link href="/todos?new=1" className={`${buttonVariants()} mt-4`} title="กดเพื่อเพิ่มงาน"><Plus className="h-4 w-4" aria-hidden />เพิ่มงาน</Link></>}
    </section>
    <Tabs value={tab} onValueChange={v => setTab(v as Tab)}><TabsList role="tablist" aria-label="เลือกรายการงาน" className="grid grid-cols-3 gap-0 rounded-xl border bg-card shadow-sm">{tabs.map(({ id, label, icon: Icon }, index) => <button key={id} id={`today-tab-${id}`} role="tab" aria-selected={tab === id} tabIndex={tab === id ? 0 : -1} onClick={() => setTab(id)} onKeyDown={e => { if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) { e.preventDefault(); const next = e.key === 'Home' ? 0 : e.key === 'End' ? 2 : (index + (e.key === 'ArrowRight' ? 1 : 2)) % 3; setTab(tabs[next].id); document.getElementById(`today-tab-${tabs[next].id}`)?.focus(); } }} className={`flex min-h-14 items-center justify-center gap-2 border-b-2 px-2 text-sm font-semibold ${tab === id ? 'border-primary bg-muted' : 'border-transparent text-muted-foreground'}`}><Icon className="h-4 w-4" aria-hidden />{label}<span className="rounded-full bg-muted px-2 text-xs">{id === 'mine' ? mine.length : id === 'overdue' ? overdue.length : review.length}</span></button>)}</TabsList></Tabs>
    <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(280px,1fr)]"><section className={card}><h2 className="flex items-center gap-2 border-b px-5 py-5 font-semibold"><ListChecks className="h-5 w-5" aria-hidden />รายการงานที่ต้องจัดการ <span className="ml-auto text-xs font-normal text-muted-foreground">เรียงตามกำหนดเวลา</span></h2>{groups.map(([name, items]) => items.length > 0 && <div key={name}><h3 className={`sticky top-0 z-10 border-b px-5 py-2 text-sm font-semibold ${name === 'เกินกำหนด' ? 'bg-red-50 text-red-700' : 'bg-muted'}`}>{name}</h3><ul className="divide-y">{items.map(item => <li key={item.id} className="px-5 py-3"><div className="flex flex-wrap items-center gap-3"><span className="h-5 w-5 rounded-full border" aria-hidden /><Link href={item.url} className="min-w-0 flex-1 font-medium hover:underline">{item.title}<span className="block text-sm font-normal text-muted-foreground">{[item.caseRef, item.caseTitle].filter(Boolean).join(' ')}</span></Link>{item.dueAt && <span className={`inline-flex items-center gap-1 text-sm ${diffDays(item.dueAt, today) < 0 ? 'text-red-700' : 'text-muted-foreground'}`}>{diffDays(item.dueAt, today) < 0 ? <><AlertCircle className="h-4 w-4" aria-hidden />เกินกำหนด {Math.abs(diffDays(item.dueAt, today))} วัน</> : bangkokDayLabel(bangkokDateInputValue(item.dueAt), 'th-TH')}</span>}<span className="rounded-full bg-muted px-2 py-1 text-xs" title={item.owner ?? 'ยังไม่ระบุ'}>{item.ownerId === user?.id ? 'คุณ' : item.owner?.slice(0, 2) ?? '–'}</span>{item.task && item.ownerId === user?.id && <Button variant="outline" size="sm" disabled={busy === item.id} title="กดเมื่อทำงานนี้เสร็จ" onClick={() => void complete(item)}>เสร็จแล้ว</Button>}</div>{rowErrors[item.id] && <p role="alert" className="mt-2 text-sm text-destructive">{rowErrors[item.id]}</p>}</li>)}</ul></div>)}{!shown.length && <p className="p-6 text-sm text-muted-foreground">ไม่มีงานในรายการนี้</p>}<div className="border-t px-5 py-3"><Link href="/todos" className="text-sm font-semibold text-primary hover:underline">ดูงานทั้งหมด →</Link></div></section>
    <aside className="space-y-5"><section className={card}><h2 className="flex items-center gap-2 border-b px-5 py-5 font-semibold"><CalendarDays className="h-5 w-5" aria-hidden />นัดวันนี้–พรุ่งนี้ <span className="ml-auto text-xs text-muted-foreground">{events.length} รายการ</span></h2><div className="space-y-3 p-5">{events.map(item => <Link key={item.id} href={item.kind === AgendaItemKind.COURT_DATE ? `/court-day/${item.entityId}` : item.url} className="flex gap-4 rounded-lg border bg-muted/40 p-3"><span className="w-16 shrink-0 text-center text-sm font-semibold">{item.allDay ? 'ทั้งวัน' : bangkokTime(item.at)}{!item.allDay && <span className="block text-xs font-normal text-muted-foreground">{Number(bangkokTime(item.at).slice(0, 2)) < 12 ? 'เช้า' : 'บ่าย'}</span>}</span><span className="min-w-0 border-l pl-4"><span className="block font-semibold">{item.title}</span>{item.location && <span className="mt-1 flex gap-1 text-sm text-muted-foreground"><Gavel className="h-4 w-4 shrink-0" aria-hidden />{item.location}</span>}</span></Link>)}{!events.length && <p className="text-sm text-muted-foreground">ไม่มีนัดวันนี้และพรุ่งนี้</p>}</div><div className="border-t px-5 py-3 text-right"><Link href="/court-schedule" className="text-sm font-semibold text-primary hover:underline">ดูตารางนัด →</Link></div></section><details className={card}><summary className="flex min-h-11 cursor-pointer list-none items-center justify-between px-5 py-4 font-semibold [&::-webkit-details-marker]:hidden">เรื่องและคดีล่าสุด ({matters.length})<ChevronDown className="h-4 w-4 transition-transform [details[open]_&]:rotate-180" aria-hidden /></summary><div className="divide-y border-t">{matters.map(item => <Link key={item.id} href={`/cases/${item.id}`} className="block px-5 py-3 text-sm hover:bg-muted"><span className="font-medium">{item.title}</span><span className="block text-muted-foreground">{item.detail}</span></Link>)}</div></details></aside></div>
  </div>;
}

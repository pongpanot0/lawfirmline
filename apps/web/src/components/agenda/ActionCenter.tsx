'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Inbox } from 'lucide-react';
import { api } from '@/lib/api';
import { bangkokDateInputValue } from '@/lib/bangkok';
import { useLocale } from '@/components/landing/LocaleProvider';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export type ActionQueue = { items: { id: string; kind: string; title: string; detail: string | null; caseRef: string | null; owner: string | null; ownerId: string | null; dueAt: string | null; url: string }[]; limited: boolean };
type TaskInbox = Awaited<ReturnType<typeof api.getTaskInbox>>;
type Scope = 'all' | 'mine' | 'overdue';
type QueueItem = ActionQueue['items'][number] & { status?: string };

const trackedDueKinds = new Set(['TASK', 'UNASSIGNED', 'INTAKE_FOLLOW_UP', 'WAITING', 'DOCUMENT_REVIEW']);
const reviewKinds = new Set(['DATE_REVIEW', 'DOCUMENT_REVIEW', 'CLIENT_DRAFT']);

function daysUntil(item: QueueItem, today: string) {
  if (!item.dueAt || !trackedDueKinds.has(item.kind)) return null;
  const due = bangkokDateInputValue(item.dueAt);
  return Math.round((Date.parse(`${due}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86400000);
}

function isOverdue(item: QueueItem, today: string) {
  const days = daysUntil(item, today);
  return days !== null && days < 0;
}

function actionPriority(item: QueueItem, today: string) {
  const days = daysUntil(item, today);
  if (days !== null && days < 0) return 0;
  if (days === 0) return 1;
  if (days !== null && days <= 2) return 2;
  if (item.kind === 'ACKNOWLEDGEMENT' && item.dueAt) {
    const untilEvent = Math.round((Date.parse(`${bangkokDateInputValue(item.dueAt)}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86400000);
    if (untilEvent >= 0 && untilEvent <= 2) return 2;
  }
  if (reviewKinds.has(item.kind)) return 3;
  if (item.kind === 'UNASSIGNED' || (item.kind === 'INTAKE_FOLLOW_UP' && !item.ownerId)) return 4;
  if (item.kind === 'INTAKE_FOLLOW_UP') return 5;
  if (item.kind === 'WAITING') return 6;
  return 8;
}

function focusReason(item: QueueItem, today: string, overdueCount: number, th: boolean) {
  const days = daysUntil(item, today);
  if (days !== null && days < 0) return th ? `${overdueCount} รายการเลยวันติดตามแล้ว · เริ่มจากรายการที่เก่าที่สุด` : `${overdueCount} follow-ups are overdue · start with the oldest`;
  if (days === 0) return th ? 'ครบกำหนดติดตามวันนี้' : 'Follow-up is due today';
  if (days !== null && days <= 2) return th ? `ครบกำหนดติดตามใน ${days} วัน` : `Follow-up is due in ${days} day${days === 1 ? '' : 's'}`;
  if (item.kind === 'ACKNOWLEDGEMENT') return th ? 'วันนัดใกล้ถึงแล้ว แต่ยังไม่ยืนยันผู้รับผิดชอบ' : 'The event is approaching without an acknowledged owner';
  if (item.kind === 'DATE_REVIEW') return th ? 'วันจากเอกสารยังรอทนายตรวจและยืนยัน' : 'A date extracted from a document still needs lawyer confirmation';
  if (item.kind === 'DOCUMENT_REVIEW') return th ? 'เอกสารรอผู้ตรวจตัดสินใจก่อนเดินงานต่อ' : 'A reviewer decision is needed before work can continue';
  if (item.kind === 'CLIENT_DRAFT') return th ? 'ร่างแจ้งลูกค้ายังรอตรวจ ก่อนส่งออก' : 'A client update is waiting for review before sending';
  if (item.kind === 'UNASSIGNED' || !item.ownerId) return th ? 'ยังไม่มีผู้รับผิดชอบ ระบุคนรับงานเพื่อให้งานเดินต่อ' : 'No owner is assigned; assign someone to move it forward';
  if (item.kind === 'INTAKE_FOLLOW_UP') return th ? 'ถึงรอบติดตามเรื่องรับเข้า' : 'An intake follow-up is due';
  if (item.kind === 'WAITING') return th ? 'งานกำลังรอข้อมูลหรือคำตอบ ควรตรวจรอบติดตาม' : 'Work is waiting on information or a response; check the follow-up';
  return th ? 'เรียงตามวันที่กำหนดและสถานะงาน' : 'Ranked by scheduled date and work status';
}

const labels: Record<string, [string, string]> = {
  TASK: ['งานที่ต้องทำ', 'Work task'],
  ACKNOWLEDGEMENT: ['ใกล้กำหนดแต่ยังไม่รับงาน', 'Due soon · awaiting acknowledgement'],
  UNASSIGNED: ['ยังไม่มีผู้รับผิดชอบ', 'Needs an owner'],
  INTAKE_FOLLOW_UP: ['ติดตามเรื่องรับเข้า', 'Follow up on intake'],
  WAITING: ['รอติดตาม', 'Waiting for follow-up'],
  DATE_REVIEW: ['ตรวจและยืนยันวันที่', 'Confirm suggested date'],
  DOCUMENT_REVIEW: ['เอกสารรอคุณตรวจ', 'Awaiting your review'],
  CLIENT_DRAFT: ['ร่างแจ้งลูกค้ารอตรวจ', 'Review client update'],
};

export function ActionCenter({ token, tasks, tasksFailed = false, userId, scope = 'all', onScopeChange, statuses = {}, onRetryTasks }: {
  token: string;
  tasks?: TaskInbox | null;
  tasksFailed?: boolean;
  userId?: string;
  scope?: Scope;
  onScopeChange?: (scope: Scope) => void;
  statuses?: Record<string, string>;
  onRetryTasks?: () => void;
}) {
  const { locale } = useLocale();
  const th = locale === 'th';
  const [queue, setQueue] = useState<ActionQueue | null>(null);
  const [error, setError] = useState(false);
  const [category, setCategory] = useState('ALL');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    setError(false);
    api.getActionQueue(token).then(q => { if (active) setQueue(q); }).catch(() => { if (active) setError(true); });
    return () => { active = false; };
  }, [token, attempt]);

  const taskActions = new Map((queue?.items ?? []).filter(item => item.id.startsWith('task:')).map(item => [item.id.slice(5), item]));
  const taskItems: QueueItem[] = (tasks ?? []).map(task => {
    const action = taskActions.get(task.id);
    return {
      id: `task:${task.id}`,
      kind: action?.kind ?? 'TASK',
      title: task.title,
      detail: action?.detail ?? task.description ?? null,
      caseRef: task.case?.ownRef ?? action?.caseRef ?? null,
      owner: task.assignee ? `${task.assignee.firstName} ${task.assignee.lastName}` : action?.owner ?? null,
      ownerId: task.assigneeId ?? action?.ownerId ?? null,
      dueAt: action?.dueAt ?? task.dueDate ?? null,
      url: task.caseId ? `/cases/${task.caseId}?tab=tasks&task=${task.id}` : `/todos?task=${task.id}`,
      status: statuses[task.status] ?? task.status,
    };
  });
  const taskIds = new Set(taskItems.map(item => item.id));
  const allItems: QueueItem[] = tasks === undefined ? (queue?.items ?? []) : [...taskItems, ...(queue?.items ?? []).filter(item => !taskIds.has(item.id))];
  const today = bangkokDateInputValue(new Date());
  const combined = allItems
    .filter(item => scope === 'all' || (scope === 'mine' ? item.ownerId === userId : isOverdue(item, today)))
    .filter(item => category === 'ALL' || item.kind === category)
    .sort((a, b) => actionPriority(a, today) - actionPriority(b, today) || (a.dueAt ?? '9999').localeCompare(b.dueAt ?? '9999') || a.id.localeCompare(b.id));
  const focus = combined[0];
  const overdueCount = combined.filter(item => isOverdue(item, today)).length;
  const loaded = tasks === undefined ? queue !== null || error : tasks !== null || tasksFailed || queue !== null || error;

  const content = <div className="space-y-3">
    <div className="flex flex-wrap items-center gap-2 px-5 py-4">
      {tasks !== undefined && (['all', 'mine', 'overdue'] as const).map(value => <button key={value} aria-pressed={scope === value} onClick={() => onScopeChange?.(value)} className={`min-h-9 rounded-lg px-3 text-xs font-medium ${scope === value ? 'bg-foreground text-background' : 'bg-muted/60 text-muted-foreground hover:bg-muted'}`}>{value === 'all' ? (th ? 'ทั้งหมด' : 'All') : value === 'mine' ? (th ? 'มอบหมายให้ฉัน' : 'Assigned to me') : (th ? 'เกินกำหนด' : 'Overdue')}</button>)}
      <label className="sr-only" htmlFor="action-queue-category">{th ? 'กรองตามประเภทงาน' : 'Filter by work type'}</label>
      <select id="action-queue-category" value={category} onChange={event => setCategory(event.target.value)} className="min-h-9 max-w-full rounded-lg border border-border bg-card px-3 text-xs">
        <option value="ALL">{th ? 'ทุกประเภท' : 'All work types'}</option>
        {Object.keys(labels).filter(kind => (tasks ?? []).some(task => (taskActions.get(task.id)?.kind ?? 'TASK') === kind) || (queue?.items ?? []).some(item => item.kind === kind)).map(kind => <option key={kind} value={kind}>{labels[kind][th ? 0 : 1]}</option>)}
      </select>
      <span className="ml-auto text-xs text-muted-foreground">{combined.length} {th ? 'รายการ' : 'items'}</span>
    </div>

    {focus && <div className="mx-5 flex flex-col gap-3 rounded-xl border border-primary/20 bg-primary/5 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="text-xs font-semibold uppercase tracking-wide text-primary">{th ? 'แนะนำให้จัดการก่อน' : 'Recommended next action'}</p>
        <p className="mt-1 break-words text-sm font-semibold">{focus.title || (th ? 'รายการที่ต้องจัดการ' : 'Action item')}</p>
        <p className="mt-1 text-xs text-muted-foreground">{focusReason(focus, today, overdueCount, th)}</p>
        <p className="mt-1 text-xs text-muted-foreground">{focus.caseRef ?? (th ? 'งานทั่วไป' : 'General')} · {focus.owner ?? (th ? 'ยังไม่มอบหมาย' : 'Unassigned')}</p>
      </div>
      <Link href={focus.url} className="inline-flex min-h-9 shrink-0 items-center justify-center gap-2 self-start rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary sm:self-center">
        {th ? 'เปิดรายการ' : 'Open item'} <ArrowRight className="size-3.5" aria-hidden />
      </Link>
    </div>}

    {(tasksFailed || error) && <div role="alert" className="mx-5 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-sm text-muted-foreground">
      {th ? 'โหลดคิวงานได้ไม่ครบ บางรายการอาจยังไม่แสดง' : 'The work queue could not be fully loaded; some items may be missing.'}{' '}
      {tasksFailed && <button onClick={onRetryTasks} className="font-medium text-primary hover:underline">{th ? 'ลองโหลดงานอีกครั้ง' : 'Retry tasks'}</button>}
      {error && <Button variant="link" className="h-auto p-0 text-sm" onClick={() => setAttempt(value => value + 1)}>{th ? 'ลองโหลดรายการรอตรวจอีกครั้ง' : 'Retry action items'}</Button>}
    </div>}
    {!loaded && <p role="status" className="px-5 py-6 text-sm text-muted-foreground">{th ? 'กำลังโหลดคิวงาน…' : 'Loading work queue…'}</p>}
    {combined.length === 0 && loaded && !error && <div className="px-6 py-10 text-center text-sm text-muted-foreground">{th ? 'ไม่มีงานในรายการนี้' : 'No work in this list.'}</div>}
    {combined.length > 1 && <ul className="divide-y divide-border/70">{combined.slice(1, 10).map(item => <li key={item.id}><Link href={item.url} className="group flex min-h-16 items-start gap-3 px-5 py-4 hover:bg-muted/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"><span className={`mt-1.5 size-2 shrink-0 rounded-full ${isOverdue(item, today) ? 'bg-amber-500' : 'bg-primary/50'}`} /><div className="min-w-0 flex-1"><p className="text-xs font-medium text-primary">{labels[item.kind]?.[th ? 0 : 1] ?? item.kind}</p><p className="break-words text-sm font-medium group-hover:text-primary">{item.title || (th ? 'รายการที่ต้องจัดการ' : 'Action item')}</p><p className="mt-1.5 flex flex-wrap gap-x-2 gap-y-1 text-xs text-muted-foreground"><span className="font-mono">{item.caseRef ?? (th ? 'งานทั่วไป' : 'General')}</span><span>· {item.owner ?? (th ? 'ยังไม่มอบหมาย' : 'Unassigned')}</span>{item.status && <span>· {item.status}</span>}</p><p className="mt-2 text-xs text-muted-foreground">{item.dueAt ? `${th ? 'กำหนด ' : 'Due '}${new Date(item.dueAt).toLocaleDateString(th ? 'th-TH' : 'en-GB', { timeZone: 'Asia/Bangkok', day: 'numeric', month: 'short', year: 'numeric' })}` : (th ? 'ยังไม่กำหนดวัน' : 'No due date')}</p>{item.detail && <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{item.detail}</p>}</div><ArrowRight className="mt-1 size-4 shrink-0 text-muted-foreground" aria-hidden /></Link></li>)}</ul>}
    {(combined.length > 10 || queue?.limited) && <p className="px-5 pb-4 text-xs text-muted-foreground">{th ? `แสดง 10 จาก ${combined.length} รายการ${queue?.limited ? ' · บางหมวดแสดงสูงสุด 50 รายการ' : ''}` : `Showing 10 of ${combined.length}${queue?.limited ? ' · Some categories are limited to 50 items' : ''}`}</p>}
  </div>;
  if (tasks !== undefined) return content;
  return <Card>
    <CardHeader className="pb-3"><CardTitle className="flex items-center gap-2 text-base"><Inbox className="size-4" />{th ? 'เรื่องที่ต้องจัดการ' : 'Needs attention'}{queue && <span className="text-sm font-normal text-muted-foreground">{queue.items.length}</span>}</CardTitle><p className="text-sm text-muted-foreground">{th ? 'เปิดงานเดิมเพื่อจัดการ เห็นผู้รับผิดชอบและเหตุผลในที่เดียว' : 'Act on existing work, with its owner and next step in view.'}</p></CardHeader>
    <CardContent className="space-y-3">{content}</CardContent>
  </Card>;
}

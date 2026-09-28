'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowDown, ArrowLeft, ArrowUp } from 'lucide-react';
import { DailyWorkboard, DailyWorkTask, FirmRole, PersonWorkload, TASK_SIZES, TASK_WORK_TYPES, TaskWorkType, taskPoints } from '@lawfirm/shared';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { bangkokDateInputValue, bangkokTime } from '@/lib/bangkok';
import { formatDate, formatDateTime } from '@/lib/utils';
import { bangkokDay, ROLE_LABELS, taskDayKey } from '@/lib/daily-workboard';
import { SideDrawer } from '@/components/ui/SideDrawer';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { SelectField } from '@/components/ui/form-fields';
import { TaskSizePicker } from './TaskSizePicker';
import { WorkAssignmentForm } from './WorkAssignmentForm';

const LEAVE_LABELS: Record<string, string> = { SICK: 'ลาป่วย', PERSONAL: 'ลากิจ', VACATION: 'ลาพักร้อน' };
const SIZE_LABELS: Record<string, string> = Object.fromEntries(TASK_SIZES.map((s) => [s.value, s.label.split(' ')[0]]));
const dayLabel = (day: string) => formatDate(`${day}T00:00:00+07:00`, { weekday: 'short', day: 'numeric', month: 'short' });

function Section({ title, empty, emptyText = 'ไม่มี', children }: { title: string; empty: boolean; emptyText?: string; children: React.ReactNode }) {
  return <section className="space-y-2">
    <h3 className="text-sm font-semibold">{title}</h3>
    {empty ? <p className="text-sm text-muted-foreground">{emptyText}</p> : <ul className="divide-y rounded-lg border">{children}</ul>}
  </section>;
}

/**
 * Everything one member is carrying. Any member can look (read-only, redacted by the API);
 * the owner can also reorder the queue, resize, hand work to someone else, and set work types.
 * `focusDay` (from a radar cell) puts that day's work on top; `from` sets the appointment window.
 */
export function PersonWorkloadDrawer({ userId, from, focusDay, onClose, onChanged }: {
  userId: string | null; from?: string; focusDay?: string | null; onClose: () => void; onChanged?: () => void;
}) {
  const { token, user } = useAuth();
  const isOwner = user?.firmRole === FirmRole.OWNER;
  const [data, setData] = useState<PersonWorkload | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState('');
  const [reassign, setReassign] = useState<{ board: DailyWorkboard; task: DailyWorkTask } | null>(null);
  const [reassignBusy, setReassignBusy] = useState(false);
  const [types, setTypes] = useState<TaskWorkType[] | null>(null);

  const load = useCallback(async () => {
    if (!token || !userId) return;
    try { setData(await api.getPersonWorkload(token, userId, from)); setError(''); }
    catch (err) { setError(err instanceof Error ? err.message : 'โหลดข้อมูลไม่ได้'); }
  }, [token, userId, from]);
  useEffect(() => {
    setData(null); setError(''); setActionError(''); setReassign(null); setTypes(null);
    void load();
  }, [load]);

  const changed = async () => { await load(); onChanged?.(); };
  const act = async (action: () => Promise<unknown>) => {
    if (busy) return;
    setBusy(true); setActionError('');
    try { await action(); await changed(); }
    catch (err) { setActionError(err instanceof Error ? err.message : 'ทำรายการไม่ได้'); }
    finally { setBusy(false); }
  };
  const openReassign = (taskId: string) => act(async () => {
    const board = await api.getDailyWorkboard(token!, bangkokDateInputValue(new Date()));
    const task = board.tasks.find((t) => t.id === taskId);
    if (!task) throw new Error('ไม่พบงานนี้ในสำนักงาน');
    setReassign({ board, task });
  });

  const close = () => { if (!reassignBusy && !busy) onClose(); };
  const points = data?.tasks.reduce((sum, t) => sum + taskPoints(t.size), 0) ?? 0;
  const overdue = data?.tasks.filter((t) => t.overdue).length ?? 0;
  const dayTasks = focusDay ? data?.tasks.filter((t) => taskDayKey(t) === focusDay) ?? [] : [];
  const dayEvents = focusDay ? data?.events.filter((e) => bangkokDay(e.startAt) === focusDay) ?? [] : [];
  const dayLeave = focusDay ? data?.leaves.find((l) => l.startDate <= focusDay && l.endDate >= focusDay) : undefined;

  const sizeBadge = (t: PersonWorkload['tasks'][number]) => isOwner
    ? <TaskSizePicker taskId={t.id} title={t.title} size={t.size} onSaved={() => void changed()} />
    : <span className="shrink-0 rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">{SIZE_LABELS[t.size]}</span>;
  const taskMeta = (t: PersonWorkload['tasks'][number]) => <p className="mt-0.5 text-xs text-muted-foreground">
    {t.case ? `${t.case.ownRef} · ` : ''}
    {t.scheduledFor ? `วางแผน ${formatDate(`${t.scheduledFor}T00:00:00+07:00`, { day: 'numeric', month: 'short' })}` : 'ยังไม่วางแผนวัน'}
    {t.dueDate && <span className={t.overdue ? ' text-destructive' : ''}> · ส่ง {formatDateTime(t.dueDate)}</span>}
  </p>;

  return <SideDrawer open={userId !== null} title={reassign ? 'ย้ายงานให้คนอื่น' : data ? `${data.firstName} ${data.lastName}` : 'ภาระงาน'} onClose={close}>
    {reassign && token
      ? <div>
        <Button variant="ghost" size="sm" className="mx-5 mt-4" disabled={reassignBusy} onClick={() => setReassign(null)}><ArrowLeft className="mr-1 h-4 w-4" />กลับ</Button>
        <WorkAssignmentForm key={reassign.task.id} board={reassign.board} task={reassign.task} token={token} onSaving={setReassignBusy}
          onSaved={() => { setReassign(null); void changed(); }} onClose={() => setReassign(null)} />
      </div>
      : <div className="space-y-5 p-5">
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        {!data && !error && <p role="status" className="text-sm text-muted-foreground">กำลังโหลด…</p>}
        {data && <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[['งานในคิว', `${data.tasks.length}`], ['แต้มภาระ', `${points}`], ['เลยกำหนด', `${overdue}`], ['คดีที่ถือ', `${data.cases.length + data.hiddenCaseCount}`]].map(([label, value]) =>
              <div key={label} className="rounded-lg border bg-card p-3"><p className="text-xs text-muted-foreground">{label}</p><p className={`mt-1 text-xl font-semibold ${label === 'เลยกำหนด' && overdue > 0 ? 'text-destructive' : ''}`}>{value}</p></div>)}
          </div>
          <p className="text-xs text-muted-foreground">{ROLE_LABELS[data.role] ?? data.role}</p>
          {actionError && <p role="alert" className="text-sm text-destructive">{actionError}</p>}

          {focusDay && <section className="space-y-2 rounded-xl border-2 border-primary/30 bg-primary/5 p-3">
            <h3 className="text-sm font-semibold">{dayLabel(focusDay)}</h3>
            {dayLeave && <p className="text-sm text-amber-800 dark:text-amber-300">{dayLeave.type ? LEAVE_LABELS[dayLeave.type] ?? 'ลา' : 'ลา'}ทั้งวัน</p>}
            {dayEvents.map((e) => <p key={e.id} className="text-sm"><span className="font-medium">{bangkokTime(e.startAt)}</span> {e.title}{e.courtName ? ` · ${e.courtName}` : ''}</p>)}
            {dayTasks.length > 0 && <ul className="divide-y rounded-lg border bg-card">
              {dayTasks.map((t) => <li key={t.id} className="px-3 py-2 text-sm"><div className="flex items-start justify-between gap-2"><span className="min-w-0 break-words font-medium">{t.title}</span>{sizeBadge(t)}</div>{taskMeta(t)}</li>)}
            </ul>}
            {!dayLeave && dayEvents.length === 0 && dayTasks.length === 0 && <p className="text-sm text-muted-foreground">ไม่มีงานหรือนัดที่ลงวันนี้ไว้{data.tasks.some((t) => !taskDayKey(t)) ? ' (มีงานที่ยังไม่ได้ลงวันอยู่ในคิวด้านล่าง)' : ''}</p>}
          </section>}

          {!focusDay && data.leaves.length > 0 && <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
            {data.leaves.map((l) => <p key={l.id}>{l.type ? LEAVE_LABELS[l.type] ?? 'ลา' : 'ลา'} {formatDate(`${l.startDate}T00:00:00+07:00`)}{l.endDate !== l.startDate ? ` – ${formatDate(`${l.endDate}T00:00:00+07:00`)}` : ''}</p>)}
          </div>}

          <Section title={isOwner ? 'คิวงาน (บนสุดทำก่อน)' : 'คิวงาน'} empty={data.tasks.length === 0} emptyText="ไม่มีงานในคิว">
            {data.tasks.map((t, i) => <li key={t.id} className="px-3 py-2 text-sm">
              <div className="flex items-start gap-2">
                {isOwner && <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded bg-muted text-[11px] font-semibold">{i + 1}</span>}
                <span className="min-w-0 flex-1 break-words font-medium">{t.title}</span>
                {sizeBadge(t)}
              </div>
              {taskMeta(t)}
              {t.holdReason && <p className="mt-1 text-xs text-amber-700">พักไว้: {t.holdReason}</p>}
              {isOwner && <div className="mt-1 flex items-center gap-1">
                <Button variant="ghost" size="icon" className="h-7 w-7" disabled={busy || i === 0} aria-label={`เลื่อน ${t.title} ขึ้น`} onClick={() => void act(() => api.moveDailyTask(token!, t.id, 'UP'))}><ArrowUp className="h-3.5 w-3.5" /></Button>
                <Button variant="ghost" size="icon" className="h-7 w-7" disabled={busy || i === data.tasks.length - 1} aria-label={`เลื่อน ${t.title} ลง`} onClick={() => void act(() => api.moveDailyTask(token!, t.id, 'DOWN'))}><ArrowDown className="h-3.5 w-3.5" /></Button>
                <Button variant="ghost" size="sm" className="h-7" disabled={busy} onClick={() => void openReassign(t.id)}>ย้ายให้คนอื่น</Button>
              </div>}
            </li>)}
          </Section>

          {data.reviews.length > 0 && <Section title="งานที่รอเขาตรวจ" empty={false}>
            {data.reviews.map((t) => <li key={t.id} className="px-3 py-2 text-sm">{t.title}{t.dueDate && <span className="block text-xs text-muted-foreground">ส่ง {formatDateTime(t.dueDate)}</span>}</li>)}
          </Section>}

          {!focusDay && <Section title="นัดหมาย 7 วันข้างหน้า" empty={data.events.length === 0}>
            {data.events.map((e) => <li key={e.id} className="px-3 py-2 text-sm"><span className="font-medium">{e.title}</span><span className="block text-xs text-muted-foreground">{formatDateTime(e.startAt)}{e.courtName ? ` · ${e.courtName}` : ''}</span></li>)}
          </Section>}

          <Section title="คดีที่รับผิดชอบ" empty={data.cases.length === 0 && data.hiddenCaseCount === 0}>
            {data.cases.map((c) => <li key={c.id}><Link href={`/cases/${c.id}`} className="flex items-center justify-between gap-2 px-3 py-2 text-sm hover:bg-muted/50">
              <span className="min-w-0 truncate">{c.ownRef} · {c.title}</span>
              <Badge variant={c.role === 'LEAD' ? 'default' : 'secondary'} className="shrink-0">{c.role === 'LEAD' ? 'หลัก' : 'ร่วม'}</Badge>
            </Link></li>)}
            {data.hiddenCaseCount > 0 && <li className="px-3 py-2 text-xs text-muted-foreground">และอีก {data.hiddenCaseCount} คดีที่คุณไม่มีสิทธิ์ดู</li>}
          </Section>

          {isOwner && <section className="space-y-2">
            <div className="flex items-center justify-between"><h3 className="text-sm font-semibold">ประเภทงานที่ทำได้</h3>
              {types === null && <Button variant="ghost" size="sm" onClick={() => setTypes(data.workTypes)}>แก้ไข</Button>}</div>
            {types === null
              ? <p className="text-sm text-muted-foreground">{data.workTypes.length ? data.workTypes.map((v) => TASK_WORK_TYPES.find((t) => t.value === v)?.label).join(' · ') : 'ยังไม่ได้กำหนด (ใช้ประกอบคำแนะนำตอนมอบหมายงาน)'}</p>
              : <div className="space-y-2 rounded-lg border p-3">
                <SelectField label="เพิ่มประเภทงาน" value="" disabled={busy} onChange={(e) => { if (e.target.value) setTypes([...types, e.target.value as TaskWorkType]); }}>
                  <option value="">เลือกประเภทงาน</option>
                  {TASK_WORK_TYPES.filter((t) => !types.includes(t.value)).map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                </SelectField>
                <div className="flex flex-wrap gap-1.5">{types.map((v) => <button key={v} type="button" disabled={busy} onClick={() => setTypes(types.filter((x) => x !== v))} aria-label={`เอา ${TASK_WORK_TYPES.find((t) => t.value === v)?.label} ออก`}
                  className="rounded-full bg-muted px-2.5 py-1 text-xs hover:bg-destructive/10 hover:text-destructive">{TASK_WORK_TYPES.find((t) => t.value === v)?.label} ✕</button>)}</div>
                <div className="flex gap-2"><Button size="sm" disabled={busy} onClick={() => void act(async () => { await api.setMemberWorkTypes(token!, data.userId, types); setTypes(null); })}>{busy ? 'กำลังบันทึก…' : 'บันทึก'}</Button>
                  <Button size="sm" variant="outline" disabled={busy} onClick={() => setTypes(null)}>ยกเลิก</Button></div>
              </div>}
          </section>}
        </>}
      </div>}
  </SideDrawer>;
}

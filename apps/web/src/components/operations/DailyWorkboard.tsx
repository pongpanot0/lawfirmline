'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, Plus, RefreshCw } from 'lucide-react';
import { DailyWorkboard as Board, DailyWorkMember, DailyWorkTask, FirmRole, Role, TASK_WORK_TYPES, TaskStatus, TaskWorkType } from '@lawfirm/shared';
import { api, UserItem } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { bangkokDateInputValue } from '@/lib/bangkok';
import { formatDateTime } from '@/lib/utils';
import { needsOwner, updatedOn } from '@/lib/daily-workboard';
import { DateField, SelectField } from '@/components/ui/form-fields';
import { Button } from '@/components/ui/button';
import { SideDrawer } from '@/components/ui/SideDrawer';
import { TaskDetailDrawer } from '@/components/tasks/TaskDetailDrawer';
import { WorkAssignmentForm } from './WorkAssignmentForm';

const statuses: Record<string, string> = { TODO: 'รอเริ่ม', IN_PROGRESS: 'กำลังทำ', PENDING_REVIEW: 'รอตรวจ', NEEDS_REVISION: 'แก้ไขงาน', DONE: 'เสร็จแล้ว' };
const roles: Record<string, string> = { OWNER: 'Owner', SENIOR_LAWYER: 'ทนายอาวุโส', LAWYER: 'ทนาย', ASSISTANT: 'ผู้ช่วย' };
const active = (t: DailyWorkTask) => ![TaskStatus.DONE, TaskStatus.PENDING_REVIEW].includes(t.status as TaskStatus);

export function DailyWorkboard() {
  const { token } = useAuth();
  const [date, setDate] = useState(bangkokDateInputValue(new Date()));
  const [board, setBoard] = useState<Board | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState('ALL');
  const [taskId, setTaskId] = useState<string | null>(null);
  const [assignment, setAssignment] = useState<DailyWorkTask | 'NEW' | null>(null);
  const [assignmentBusy, setAssignmentBusy] = useState(false);
  const [member, setMember] = useState<DailyWorkMember | null>(null);
  const [types, setTypes] = useState<TaskWorkType[]>([]);
  const [typeToAdd, setTypeToAdd] = useState('');
  const [memberError, setMemberError] = useState('');
  const requestVersion = useRef(0);
  const load = useCallback(async () => {
    if (!token) return;
    const version = ++requestVersion.current;
    setLoading(true); setError('');
    try {
      const data = await api.getDailyWorkboard(token, date);
      if (version === requestVersion.current) setBoard(data);
    } catch (err) { if (version === requestVersion.current) { setBoard(null); setError(err instanceof Error ? err.message : 'โหลดข้อมูลไม่ได้'); } }
    finally { if (version === requestVersion.current) setLoading(false); }
  }, [token, date]);
  useEffect(() => { void load(); return () => { requestVersion.current++; }; }, [load]);
  const closeTask = useCallback(() => setTaskId(null), []);
  const closeAssignment = useCallback(() => { if (!assignmentBusy) setAssignment(null); }, [assignmentBusy]);
  const closeMember = useCallback(() => { if (!busy) setMember(null); }, [busy]);

  const move = async (task: DailyWorkTask, direction: 'UP' | 'DOWN') => {
    if (!token || busy) return;
    setBusy(true); setError('');
    try { await api.moveDailyTask(token, task.id, direction); await load(); }
    catch (err) { setError(err instanceof Error ? err.message : 'ปรับลำดับไม่ได้'); }
    finally { setBusy(false); }
  };

  const taskRow = (task: DailyWorkTask, index?: number, queueLength?: number) => <div key={task.id} className="border-t border-border/70 px-4 py-3 first:border-t-0">
    <div className="flex items-start gap-3">
      {index !== undefined && <span className="mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded bg-muted text-xs font-semibold">{index + 1}</span>}
      <button type="button" onClick={() => setTaskId(task.id)} className="min-w-0 flex-1 text-left hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <span className="block break-words text-sm font-medium">{task.title}</span>
        <span className="mt-1 block text-xs text-muted-foreground">{task.case ? `${task.case.ownRef} · ` : ''}{statuses[task.status]}{task.scheduledFor?.slice(0, 10) === date ? ' · วางแผนทำวันนี้' : ''}</span>
        {task.dueDate && <span className={`mt-1 block text-xs ${new Date(task.dueDate) < new Date() && task.status !== TaskStatus.DONE ? 'text-destructive' : 'text-muted-foreground'}`}>ส่ง {formatDateTime(task.dueDate)}</span>}
      </button>
      {index !== undefined && <div className="flex shrink-0 gap-1">
        <Button variant="ghost" size="icon" disabled={busy || index === 0} onClick={() => void move(task, 'UP')} aria-label={`เลื่อน ${task.title} ขึ้น`}><ArrowUp className="h-4 w-4" /></Button>
        <Button variant="ghost" size="icon" disabled={busy || index === (queueLength ?? 0) - 1} onClick={() => void move(task, 'DOWN')} aria-label={`เลื่อน ${task.title} ลง`}><ArrowDown className="h-4 w-4" /></Button>
      </div>}
    </div>
    {index !== undefined && <Button size="sm" variant="ghost" className="mt-1" disabled={busy || loading} onClick={() => setAssignment(task)}>จัดคนทำงาน</Button>}
    {task.status !== TaskStatus.DONE && (task.holdReason || task.blockedBy || task.blocker) && <p className="mt-2 rounded bg-amber-50 px-2 py-1.5 text-xs text-amber-900">ติด: {task.holdReason || task.blocker || `รอ ${task.blockedBy}`}</p>}
    {task.assignedAt && !task.acknowledgedAt && active(task) && <p className="mt-1 text-xs text-amber-700">ยังไม่ยืนยันรับทราบ</p>}
    {task.workerId && task.scheduledFor?.slice(0, 10) === date && active(task) && <p className="mt-1 text-xs text-muted-foreground">{task.planConfirmedAt ? 'ผู้ทำงานยืนยันแผนแล้ว' : 'ผู้ทำงานยังไม่ยืนยันแผน'}</p>}
    {task.latestUpdate ? <div className="mt-2 text-xs"><p className="whitespace-pre-line text-muted-foreground">{task.latestUpdate.body}</p><p className="mt-1 text-[11px] text-muted-foreground">{task.latestUpdate.authorName} · {formatDateTime(task.latestUpdate.createdAt)}{!updatedOn(task, date) ? ' · ยังไม่มีอัปเดตในวันที่เลือก' : ''}</p></div> : active(task) && <p className="mt-2 text-xs text-muted-foreground">ยังไม่มีความคืบหน้าที่บันทึกไว้</p>}
  </div>;

  const unassigned = board?.tasks.filter((t) => !t.assigneeId && t.status !== TaskStatus.DONE) ?? [];
  const help = board?.tasks.filter((t) => needsOwner(t, date)) ?? [];
  const done = board?.tasks.filter((t) => t.status === TaskStatus.DONE) ?? [];
  const users: UserItem[] = board?.members.map((m) => ({ id: m.userId, firstName: m.firstName, lastName: m.lastName, email: m.email, role: Role.LAWYER, firmRole: m.role as FirmRole })) ?? [];
  const people = board?.members.filter((m) => view === 'ALL' || board.tasks.some((t) => t.workerId === m.userId && needsOwner(t, date))) ?? [];

  return <section className="space-y-5">
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div><h2 className="text-xl font-semibold">วันนี้ทีมทำอะไร</h2><p className="mt-1 text-sm text-muted-foreground">คิวงานปัจจุบัน และความคืบหน้าของวันที่เลือก</p></div>
      <div className="flex flex-wrap items-end gap-2">
        <DateField label="วันที่ติดตาม" value={date} onChange={(e) => { if (e.target.value) { setDate(e.target.value); setBoard(null); } }} containerClassName="w-40" />
        <Button variant="outline" aria-label="โหลดข้อมูลใหม่" disabled={loading} onClick={() => void load()}><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /></Button>
        <Button disabled={!board || loading} onClick={() => setAssignment('NEW')}><Plus className="mr-1 h-4 w-4" />เพิ่มงาน</Button>
      </div>
    </div>
    {error && <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}<Button variant="ghost" className="ml-2" onClick={() => void load()}>ลองใหม่</Button></div>}
    {loading && <p role="status" className="text-sm text-muted-foreground">กำลังโหลดงานของทีม…</p>}
    {board && <>
      <div className="grid grid-cols-3 gap-3">
        {[['ยังไม่มอบหมาย', unassigned.length], ['ต้องติดตาม', help.length], ['เสร็จในวันที่เลือก', done.length]].map(([label, value]) => <div key={label} className="rounded-xl border bg-card p-3 sm:p-4"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 text-2xl font-semibold">{value}</p></div>)}
      </div>
      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-4">
          <div className="flex items-end justify-between gap-3"><h3 className="font-semibold">งานเรียงตามคน</h3><SelectField label="แสดงสมาชิก" value={view} onChange={(e) => setView(e.target.value)} containerClassName="w-44"><option value="ALL">ทุกคน</option><option value="HELP">คนที่ต้องติดตาม</option></SelectField></div>
          {people.length === 0 && <p className="rounded-xl border p-6 text-sm text-muted-foreground">ไม่มีสมาชิกในมุมมองนี้</p>}
          {people.map((m) => {
            const all = board.tasks.filter((t) => t.workerId === m.userId);
            const queue = all.filter(active);
            const other = all.filter((t) => !active(t));
            const reviews = board.tasks.filter((t) => t.status === TaskStatus.PENDING_REVIEW && t.assigneeId === m.userId && t.workerId !== m.userId);
            return <article key={m.userId} className="overflow-hidden rounded-xl border bg-card">
              <div className="flex items-center justify-between gap-2 px-4 py-3"><div className="flex min-w-0 items-center gap-3"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">{m.firstName.slice(0, 1)}</span><div><h4 className="text-sm font-semibold">{m.firstName} {m.lastName}</h4><p className="text-xs text-muted-foreground">{roles[m.role]} · {queue.length} งานในคิว{m.onLeave ? ' · ลางาน' : ''}</p></div></div><Button size="sm" variant="ghost" onClick={() => { setMember(m); setTypes(m.workTypes); setTypeToAdd(''); setMemberError(''); }}>ประเภทงาน</Button></div>
              {m.appointments.length > 0 && <div className="border-t bg-muted/30 px-4 py-2 text-xs text-muted-foreground">{m.appointments.map((a) => <p key={a.id}>นัด {formatDateTime(a.startAt)} · {a.title}</p>)}</div>}
              {all.length === 0 && reviews.length === 0 && <p className="border-t px-4 py-4 text-sm text-muted-foreground">ไม่มีงานที่บันทึกในคิว · ยังสรุปความพร้อมไม่ได้</p>}
              {queue.map((t, i) => taskRow(t, i, queue.length))}{other.map((t) => taskRow(t))}
              {reviews.length > 0 && <div className="border-t"><h5 className="bg-muted/30 px-4 py-2 text-xs font-medium">งานที่ต้องตรวจ ({reviews.length})</h5>{reviews.map((t) => taskRow(t))}</div>}
            </article>;
          })}
          {board.tasks.some((t) => t.workerId && !board.members.some((m) => m.userId === t.workerId)) && <div className="rounded-xl border bg-card"><h3 className="p-4 font-semibold">งานของผู้ที่ไม่ได้เป็นสมาชิกปัจจุบัน</h3>{board.tasks.filter((t) => t.workerId && !board.members.some((m) => m.userId === t.workerId)).map((t) => <div key={t.id}>{taskRow(t)}{active(t) && <Button variant="outline" className="mx-4 mb-3" onClick={() => setAssignment(t)}>มอบหมายใหม่</Button>}</div>)}</div>}
        </div>
        <div className="space-y-4">
          <section className="overflow-hidden rounded-xl border bg-card"><h3 className="border-b p-4 text-sm font-semibold">งานเข้า · ยังไม่มอบหมาย</h3>
            {unassigned.length === 0 ? <p className="p-4 text-sm text-muted-foreground">ทุกงานมีผู้รับผิดชอบแล้ว</p> : unassigned.map((t) => <div key={t.id} className="border-b last:border-0">{taskRow(t)}<Button size="sm" className="mx-4 mb-3" disabled={loading} onClick={() => setAssignment(t)}>เลือกคนทำงาน</Button></div>)}
          </section>
          <section className="overflow-hidden rounded-xl border bg-card"><h3 className="border-b p-4 text-sm font-semibold">Owner ต้องช่วยอะไร</h3>
            {help.length === 0 ? <p className="p-4 text-sm text-muted-foreground">ไม่มีงานที่เข้าข่ายต้องติดตาม</p> : help.map((t) => <button key={t.id} type="button" onClick={() => setTaskId(t.id)} className="block w-full border-b p-4 text-left hover:bg-muted/50 last:border-0"><span className="block text-sm font-medium">{t.title}</span><span className="mt-1 block text-xs text-amber-700">{t.holdReason || (t.blockedBy ? `รอ ${t.blockedBy}` : t.status === TaskStatus.PENDING_REVIEW ? `รอ ${board.members.find((m) => m.userId === t.assigneeId)?.firstName ?? 'ผู้ตรวจ'}` : t.assignedAt && !t.acknowledgedAt ? 'ยังไม่รับทราบ' : 'ยังไม่อัปเดตงานที่วางแผนวันนี้')}</span></button>)}
          </section>
          <p className="text-xs text-muted-foreground">ข้อมูลล่าสุด {formatDateTime(board.fetchedAt)} · จำนวนงานไม่ใช่จำนวนชั่วโมงว่าง</p>
        </div>
      </div>
    </>}
    <TaskDetailDrawer taskId={taskId} users={users} onClose={closeTask} onChanged={load} onNavigate={setTaskId} />
    <SideDrawer open={assignment !== null} title={assignment === 'NEW' ? 'เพิ่มงานใหม่' : 'มอบหมายงาน'} onClose={closeAssignment}>
      {board && token && assignment && <WorkAssignmentForm key={assignment === 'NEW' ? 'new' : assignment.id} board={board} token={token} task={assignment === 'NEW' ? undefined : assignment} onSaving={setAssignmentBusy} onSaved={() => { setAssignment(null); void load(); }} onClose={closeAssignment} />}
    </SideDrawer>
    <SideDrawer open={member !== null} title={`ประเภทงานของ ${member?.firstName ?? ''}`} onClose={closeMember}>
      {member && <form className="space-y-4 p-5" onSubmit={async (e) => { e.preventDefault(); if (!token || busy) return; setBusy(true); setMemberError(''); try { await api.setMemberWorkTypes(token, member.userId, types); setMember(null); await load(); } catch (err) { setMemberError(err instanceof Error ? err.message : 'บันทึกไม่ได้'); } finally { setBusy(false); } }}>
        <p className="text-sm text-muted-foreground">ใช้ประกอบคำแนะนำเวลาจัดงาน Owner ยังเป็นผู้ตัดสินใจ</p>
        <SelectField label="เพิ่มประเภทงานที่ทำได้" value={typeToAdd} disabled={busy} onChange={(e) => { const value = e.target.value as TaskWorkType; if (value) setTypes([...types, value]); setTypeToAdd(''); }}><option value="">เลือกประเภทงาน</option>{TASK_WORK_TYPES.filter((t) => !types.includes(t.value)).map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}</SelectField>
        {types.length === 0 && <p className="text-sm text-muted-foreground">ยังไม่ได้กำหนดประเภทงาน</p>}
        <ul className="space-y-2">{types.map((value) => <li key={value} className="flex items-center justify-between rounded-lg border p-2 text-sm"><span>{TASK_WORK_TYPES.find((t) => t.value === value)?.label}</span><Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => setTypes(types.filter((t) => t !== value))}>เอาออก</Button></li>)}</ul>
        {memberError && <p role="alert" className="text-sm text-destructive">{memberError}</p>}
        <Button disabled={busy} type="submit">{busy ? 'กำลังบันทึก…' : 'บันทึกประเภทงาน'}</Button>
      </form>}
    </SideDrawer>
  </section>;
}

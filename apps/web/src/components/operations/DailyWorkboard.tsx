'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { BellRing, Plus, RefreshCw } from 'lucide-react';
import { DailyWorkboard as Board, DailyWorkTask, FirmRole, Role, TaskStatus } from '@lawfirm/shared';
import { api, UserItem } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { bangkokDateInputValue, bangkokTime } from '@/lib/bangkok';
import { formatDateTime } from '@/lib/utils';
import { daysLate, followUpReason } from '@/lib/daily-workboard';
import { DateField } from '@/components/ui/form-fields';
import { Button } from '@/components/ui/button';
import { SideDrawer } from '@/components/ui/SideDrawer';
import { TaskDetailDrawer } from '@/components/tasks/TaskDetailDrawer';
import { WorkAssignmentForm } from './WorkAssignmentForm';
import { PersonWorkloadDrawer } from './PersonWorkloadDrawer';

const notSubmitted = (t: DailyWorkTask) => ![TaskStatus.DONE, TaskStatus.PENDING_REVIEW].includes(t.status as TaskStatus);

/**
 * The owner's inbox for the day: work nobody has picked up, and work that needs a nudge.
 * Who is carrying what lives on the team radar and the person drawer, not here.
 */
export function DailyWorkboard() {
  const { token } = useAuth();
  const [date, setDate] = useState(bangkokDateInputValue(new Date()));
  const [board, setBoard] = useState<Board | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [taskId, setTaskId] = useState<string | null>(null);
  const [assignment, setAssignment] = useState<DailyWorkTask | 'NEW' | null>(null);
  const [assignmentBusy, setAssignmentBusy] = useState(false);
  const [personId, setPersonId] = useState<string | null>(null);
  const [nudging, setNudging] = useState<string | null>(null);
  const [nudgeError, setNudgeError] = useState<{ id: string; message: string } | null>(null);
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
  const closePerson = useCallback(() => setPersonId(null), []);

  const nudge = async (task: DailyWorkTask) => {
    if (!token || nudging) return;
    setNudging(task.id); setNudgeError(null);
    try {
      const { followedUpAt } = await api.followUpTask(token, task.id);
      setBoard((b) => b && { ...b, tasks: b.tasks.map((t) => t.id === task.id ? { ...t, followedUpAt } : t) });
    } catch (err) { setNudgeError({ id: task.id, message: err instanceof Error ? err.message : 'ส่งไม่ได้' }); }
    finally { setNudging(null); }
  };

  const memberName = (id: string | null) => { const m = board?.members.find((x) => x.userId === id); return m ? `${m.firstName} ${m.lastName}` : null; };
  const unassigned = board?.tasks.filter((t) => !t.assigneeId && t.status !== TaskStatus.DONE) ?? [];
  const followUps = (board?.tasks ?? [])
    .filter((t) => t.assigneeId && t.status !== TaskStatus.DONE)
    .map((t) => ({ task: t, reason: t.workerId && !memberName(t.workerId) ? 'ผู้รับผิดชอบไม่ได้อยู่ในสำนักงานแล้ว' : followUpReason(t, date), late: daysLate(t, date) }))
    .filter((f): f is { task: DailyWorkTask; reason: string; late: number | null } => f.reason !== null)
    .sort((a, b) => (b.late ?? -1) - (a.late ?? -1));
  const done = board?.tasks.filter((t) => t.status === TaskStatus.DONE) ?? [];
  const users: UserItem[] = board?.members.map((m) => ({ id: m.userId, firstName: m.firstName, lastName: m.lastName, email: m.email, role: Role.LAWYER, firmRole: m.role as FirmRole })) ?? [];

  const meta = (t: DailyWorkTask) => [t.case?.ownRef, t.dueDate && `ส่ง ${formatDateTime(t.dueDate)}`].filter(Boolean).join(' · ');

  return <section className="space-y-5">
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h2 className="text-xl font-semibold">ต้องจัดการวันนี้</h2>
        <p className="mt-1 text-sm text-muted-foreground">งานที่ยังไม่มีคนรับ และงานที่ควรตาม · ดูว่าใครถืองานอะไรที่แท็บภาพรวมทีม</p>
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <DateField label="วันที่" value={date} onChange={(e) => { if (e.target.value) { setDate(e.target.value); setBoard(null); } }} containerClassName="w-40" />
        <Button variant="outline" aria-label="โหลดข้อมูลใหม่" disabled={loading} onClick={() => void load()}><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /></Button>
        <Button disabled={!board || loading} onClick={() => setAssignment('NEW')}><Plus className="mr-1 h-4 w-4" />เพิ่มงาน</Button>
      </div>
    </div>
    {error && <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}<Button variant="ghost" className="ml-2" onClick={() => void load()}>ลองใหม่</Button></div>}
    {loading && !board && <p role="status" className="text-sm text-muted-foreground">กำลังโหลด…</p>}
    {board && <>
      <div className="grid grid-cols-3 gap-3">
        {[['ยังไม่มีคนรับ', unassigned.length], ['ต้องตาม', followUps.length], ['เสร็จในวันที่เลือก', done.length]].map(([label, value]) => <div key={label} className="rounded-xl border bg-card p-3 sm:p-4"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 text-2xl font-semibold">{value}</p></div>)}
      </div>

      {unassigned.length === 0 && followUps.length === 0
        ? <p className="rounded-xl border bg-card p-8 text-center text-sm text-muted-foreground">วันนี้ไม่มีอะไรต้องจัดการ ทุกงานมีคนรับและเดินตามแผน</p>
        : <div className="grid items-start gap-5 lg:grid-cols-2">
          <section className="overflow-hidden rounded-xl border bg-card">
            <h3 className="border-b p-4 text-sm font-semibold">ยังไม่มีคนรับ ({unassigned.length})</h3>
            {unassigned.length === 0 ? <p className="p-4 text-sm text-muted-foreground">ทุกงานมีผู้รับผิดชอบแล้ว</p> : unassigned.map((t) => <div key={t.id} className="flex items-start justify-between gap-3 border-b p-4 last:border-0">
              <button type="button" onClick={() => setTaskId(t.id)} className="min-w-0 text-left hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <span className="block break-words text-sm font-medium">{t.title}</span>
                {meta(t) && <span className="mt-1 block text-xs text-muted-foreground">{meta(t)}</span>}
              </button>
              <Button size="sm" className="shrink-0" disabled={loading} onClick={() => setAssignment(t)}>เลือกคนทำ</Button>
            </div>)}
          </section>

          <section className="overflow-hidden rounded-xl border bg-card">
            <h3 className="border-b p-4 text-sm font-semibold">ต้องตาม ({followUps.length})</h3>
            {followUps.length === 0 ? <p className="p-4 text-sm text-muted-foreground">ไม่มีงานที่ต้องตาม</p> : followUps.map(({ task: t, reason, late }) => <div key={t.id} className="border-b p-4 last:border-0">
              <button type="button" onClick={() => setTaskId(t.id)} className="block text-left hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <span className="block break-words text-sm font-medium">{t.title}</span>
              </button>
              <p className="mt-1 text-xs text-muted-foreground">
                {memberName(t.workerId ?? t.assigneeId)
                  ? <button type="button" className="font-medium text-foreground hover:text-primary hover:underline" onClick={() => setPersonId(t.workerId ?? t.assigneeId)}>{memberName(t.workerId ?? t.assigneeId)}</button>
                  : 'ไม่ระบุ'}
                {meta(t) && ` · ${meta(t)}`}
              </p>
              <p className={`mt-1.5 text-xs font-medium ${late !== null ? 'text-destructive' : 'text-amber-700 dark:text-amber-400'}`}>{reason}</p>
              {t.latestUpdate && <p className="mt-1.5 line-clamp-2 whitespace-pre-line text-xs text-muted-foreground">{t.latestUpdate.body.split('\n')[0]} · {t.latestUpdate.authorName} {formatDateTime(t.latestUpdate.createdAt)}</p>}
              {notSubmitted(t) && <div className="mt-2 flex flex-wrap items-center gap-2">
                {t.followedUpAt
                  ? <span className="flex items-center gap-1 text-xs text-muted-foreground"><BellRing className="h-3.5 w-3.5" />ถามแล้ว {bangkokTime(t.followedUpAt)} · รอคำตอบ</span>
                  : <Button size="sm" variant="outline" disabled={nudging !== null} onClick={() => void nudge(t)}><BellRing className="mr-1 h-3.5 w-3.5" />{nudging === t.id ? 'กำลังส่ง…' : 'ถามความคืบหน้า'}</Button>}
                <Button size="sm" variant="ghost" disabled={loading} onClick={() => setAssignment(t)}>ย้ายให้คนอื่น</Button>
              </div>}
              {nudgeError?.id === t.id && <p role="alert" className="mt-1 text-xs text-destructive">{nudgeError.message}</p>}
            </div>)}
          </section>
        </div>}
      <p className="text-xs text-muted-foreground">ข้อมูลล่าสุด {formatDateTime(board.fetchedAt)} · "ถามความคืบหน้า" ส่งข้อความ LINE ให้ผู้รับผิดชอบ วันละครั้งต่องาน</p>
    </>}
    <TaskDetailDrawer taskId={taskId} users={users} onClose={closeTask} onChanged={load} onNavigate={setTaskId} />
    <SideDrawer open={assignment !== null} title={assignment === 'NEW' ? 'เพิ่มงานใหม่' : 'มอบหมายงาน'} onClose={closeAssignment}>
      {board && token && assignment && <WorkAssignmentForm key={assignment === 'NEW' ? 'new' : assignment.id} board={board} token={token} task={assignment === 'NEW' ? undefined : assignment} onSaving={setAssignmentBusy} onSaved={() => { setAssignment(null); void load(); }} onClose={closeAssignment} />}
    </SideDrawer>
    <PersonWorkloadDrawer userId={personId} onClose={closePerson} onChanged={() => void load()} />
  </section>;
}

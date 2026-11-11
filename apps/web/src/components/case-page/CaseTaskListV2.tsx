'use client';

import { useState, type ReactNode } from 'react';
import { Check, ChevronDown, Plus } from 'lucide-react';
import { TasksRowMenu } from './TasksRowMenu';
import { TaskStatus } from '@lawfirm/shared';
import type { TaskItem } from '@/lib/api';
import { caseStageLabel } from '@/lib/stage-labels';
import { taskStageGroups } from '@/components/cases/task-stage-groups';
import { daysUntil } from '@/components/process/helpers';
import v2 from './v2.module.css';

type Quick = 'all' | 'mine' | 'overdue' | 'done';
const shortDate = (value: string) => new Date(value).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', timeZone: 'Asia/Bangkok' });
const isDone = (task: TaskItem) => task.status === TaskStatus.DONE;
const isOverdue = (task: TaskItem) => !isDone(task) && !!task.dueDate && (daysUntil(task.dueDate) ?? 0) < 0;
const initials = (first: string, last: string) => `${first.slice(0, 1)}${last.slice(0, 1)}`.toUpperCase();

/** The case tasks tab exactly as docs/design/2026-11-11-case-page-v2 scene "tab-tasks". */
export function CaseTaskListV2({ tasks, currentStage, userId, onToggle, onOpen, onAdd, onSkip, controls, panels, board }: {
  tasks: TaskItem[];
  currentStage?: string | null;
  userId?: string;
  onToggle: (task: TaskItem) => void;
  onOpen: (taskId: string) => void;
  onAdd: () => void;
  onSkip: (task: TaskItem, reason: string) => Promise<void>;
  controls: ReactNode;
  panels: ReactNode;
  board?: (tasks: TaskItem[]) => ReactNode;
}) {
  const [quick, setQuick] = useState<Quick>('all');
  const counts = { all: tasks.length, mine: tasks.filter((task) => !isDone(task) && task.assignee?.id === userId).length, overdue: tasks.filter(isOverdue).length, done: tasks.filter(isDone).length };
  const shown = tasks.filter((task) => quick === 'all' || (quick === 'mine' ? !isDone(task) && task.assignee?.id === userId : quick === 'overdue' ? isOverdue(task) : isDone(task)));
  const groups = taskStageGroups(shown, currentStage);
  const chip = (key: Quick, label: string, danger = false) => <button key={key} type="button" aria-pressed={quick === key} onClick={() => setQuick(key)} className={`${v2.btn} ${quick === key ? v2.primary : v2.outline} ${danger && quick !== key ? 'text-[#a83232]' : ''}`}>{label} {counts[key]}</button>;
  const segments = (list: TaskItem[]) => [...list].map((task) => (isDone(task) ? 0 : isOverdue(task) ? 1 : 2)).sort().slice(0, 10).map((rank, index) => <i key={index} className={`h-2 flex-1 rounded-full ${['bg-[#227052]', 'bg-[#a83232]', 'bg-[#dedad0]'][rank]}`} />);

  const row = (task: TaskItem) => {
    const done = isDone(task);
    const days = task.dueDate ? daysUntil(task.dueDate) : null;
    const overdue = isOverdue(task);
    const person = task.assignee;
    return <li key={task.id} className={`flex flex-wrap items-center gap-4 px-5 py-4 ${overdue ? 'bg-[#fdf6f6]' : ''} ${done ? 'text-muted-foreground' : ''}`}>
      <input type="checkbox" className="h-6 w-6 shrink-0" checked={done} onChange={() => onToggle(task)} aria-label={done ? `ยกเลิกเสร็จ: ${task.title}` : `ทำเสร็จแล้ว: ${task.title}`} />
      <div className="min-w-0 flex-1"><button type="button" className="text-left font-bold hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={() => onOpen(task.id)}>{done ? <s className="font-normal">{task.title}</s> : task.title}</button>{!done && task.description && <div className={`${v2.label} line-clamp-1`}>{task.description.split('\n')[0]}</div>}</div>
      {done ? <span className="text-sm">เสร็จแล้ว{person ? ` · ${person.firstName}` : ''}</span> : <>
        {person && <span className={v2.chip}>{initials(person.firstName, person.lastName)} {person.firstName}{person.id === userId ? ' (ฉัน)' : ''}</span>}
        {task.dueDate && days != null && (overdue
          ? <span className="rounded-full bg-[#fbeaea] px-3 py-1 text-sm font-semibold text-[#a83232]">เลยกำหนด {-days} วัน</span>
          : days <= 10
            ? <span className="rounded-full bg-[#fbf3e0] px-3 py-1 text-sm font-semibold text-[#6b4f0b]">ครบ {shortDate(task.dueDate)} · {days === 0 ? 'วันนี้' : `อีก ${days} วัน`}</span>
            : <span className="rounded-full bg-[#eeebe3] px-3 py-1 text-sm">ครบ {shortDate(task.dueDate)}</span>)}
      </>}
      <TasksRowMenu task={task} onOpen={onOpen} onSkip={onSkip} />
    </li>;
  };

  return <div className="space-y-5">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex flex-wrap gap-2">{chip('all', 'ทั้งหมด')}{chip('mine', 'ของฉัน')}{chip('overdue', 'เลยกำหนด', true)}{chip('done', 'เสร็จแล้ว')}</div>
      <div className="flex flex-wrap items-center gap-2">{controls}<button type="button" className={`${v2.btn} ${v2.primary}`} onClick={onAdd}><Plus aria-hidden="true" className="h-[1.1em] w-[1.1em]" />เพิ่มงาน</button></div>
    </div>
    {panels}
    <p className={v2.hint}>“บอร์ด” จัดงานเป็นคอลัมน์ตามสถานะ · “ตัวกรอง” หางานตามคน ความสำคัญ หรือป้าย · “ใช้ SOP” สร้างชุดงานมาตรฐานของคดีประเภทนี้</p>
    {board ? board(shown) : <>{!shown.length && <section className={`${v2.card} p-5`}><p className="font-semibold">{tasks.length ? 'ไม่มีงานในตัวกรองนี้' : 'ยังไม่มีงานในคดีนี้'}</p><p className={v2.hint}>{tasks.length ? 'กด “ทั้งหมด” เพื่อดูงานทุกงาน' : 'กด “เพิ่มงาน” เพื่อสร้างงานแรกและมอบให้คนในทีม'}</p></section>}
    {groups.map(([stage, list]) => {
      const done = list.filter(isDone).length;
      const label = stage ? `ขั้น${caseStageLabel(stage, 'th')}` : 'งานที่ไม่ได้ระบุขั้น';
      const current = !!stage && stage === currentStage;
      if (!current && done === list.length) return <details key={stage || 'none'} className={`${v2.card} group`}>
        <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-5 py-4 [&::-webkit-details-marker]:hidden"><span><b className="text-lg">{label}</b> <span className={v2.label}>· <Check aria-hidden="true" className="inline h-[1.1em] w-[1.1em]" /> เสร็จครบ {list.length} งาน</span></span><span className="inline-flex items-center gap-1 text-sm font-semibold underline">ดูงาน <ChevronDown aria-hidden="true" className="h-4 w-4 transition-transform group-open:rotate-180" /></span></summary>
        <ul className="divide-y divide-[#e2e0d8] border-t border-[#e2e0d8]">{list.map(row)}</ul>
      </details>;
      return <section key={stage || 'none'} className={`${v2.card} shadow-[0_4px_16px_rgba(20,46,67,.06)]`}>
        <div className="flex items-center justify-between rounded-t-xl border-b border-[#e2e0d8] bg-[#f7f5ef] px-5 py-3"><h3 className="text-lg font-bold">{label} <span className={v2.label}>{current ? '· ขั้นปัจจุบัน ' : ''}· เสร็จ {done}/{list.length}</span></h3><span aria-hidden="true" className="flex w-40 gap-1">{segments(list)}</span></div>
        <ul className="divide-y divide-[#e2e0d8]">{[...list].sort((a, b) => Number(isDone(a)) - Number(isDone(b)) || (a.dueDate ? Date.parse(a.dueDate) : Infinity) - (b.dueDate ? Date.parse(b.dueDate) : Infinity)).map(row)}</ul>
      </section>;
    })}</>}
  </div>;
}

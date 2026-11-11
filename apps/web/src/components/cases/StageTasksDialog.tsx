'use client';

import { ThaiDateField } from '@/components/ui/ThaiDateField';
import { AlertTriangle, ArrowRight } from 'lucide-react';

import { useEffect, useRef, useState } from 'react';
import { ThaiDateInput } from '@/components/ui/ThaiDateInput';
import { AssigneeOptions } from '@/components/ui/AssigneeOptions';
import { leaveFlagsForDate, leaveWarning } from '@/lib/leave-flags';
import { useAuth } from '@/lib/auth';
import { api, LeaveItem, StageTaskDraft, StageTaskProposal, UserItem } from '@/lib/api';

type DraftRow = StageTaskProposal & { checked: boolean };

/**
 * เปิดเมื่อ Playbook แนะนำงานให้สร้างตอนย้ายขั้นตอนคดี — เลือก/แก้ไขรายการ
 * แล้วเลือก "ย้ายขั้นอย่างเดียว" หรือ "ย้ายและสร้างงาน"
 */
export function StageTasksDialog({
  open,
  stageLabel,
  proposals,
  lawyers,
  busy,
  moving,
  onClose,
  onSkip,
  onConfirm,
  fromLabel,
  caseRef,
}: {
  open: boolean;
  stageLabel: string;
  proposals: StageTaskProposal[];
  lawyers: UserItem[];
  busy: boolean;
  moving: boolean;
  onClose: () => void;
  onSkip: () => void;
  onConfirm: (tasks: StageTaskDraft[]) => void;
  fromLabel?: string;
  caseRef?: string;
}) {
  const { token } = useAuth();
  const [rows, setRows] = useState<DraftRow[]>([]);
  const [leaves, setLeaves] = useState<LeaveItem[]>([]);

  useEffect(() => {
    if (open) setRows(proposals.map((p) => ({ ...p, checked: true })));
  }, [open, proposals]);

  // Fetch leave once for the whole span of due dates the rows use, then
  // narrow to each row's own date with leaveFlagsForDate below.
  const dueDates = rows.map((r) => r.dueDate).filter((v): v is string => !!v);
  const minDate = dueDates.length > 0 ? dueDates.reduce((a, b) => (a < b ? a : b)) : null;
  const maxDate = dueDates.length > 0 ? dueDates.reduce((a, b) => (a > b ? a : b)) : null;
  useEffect(() => {
    if (!open || !token || !minDate || !maxDate) {
      setLeaves([]);
      return;
    }
    let active = true;
    api
      .getLeaves(token, minDate, maxDate)
      .then((ls) => { if (active) setLeaves(ls); })
      .catch(() => { if (active) setLeaves([]); });
    return () => { active = false; };
  }, [open, token, minDate, maxDate]);

  const edit = (index: number, patch: Partial<DraftRow>) =>
    setRows((r) => r.map((row, i) => (i === index ? { ...row, ...patch } : row)));

  const selectedCount = rows.filter((r) => r.checked).length;

  const confirm = () => {
    const tasks: StageTaskDraft[] = rows
      .filter((r) => r.checked)
      .map(({ title, description, dueDate, assigneeId, routineSource }) => ({ title, description, dueDate, assigneeId, ...(routineSource ? { routineSource } : {}) }));
    onConfirm(tasks);
  };

  const [editing, setEditing] = useState<number | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { const el = dialog.current; if (!el) return; if (open && !el.open) el.showModal(); if (!open && el.open) el.close(); }, [open]);
  const hint = 'mt-[.3rem] text-[.82rem] leading-[1.45] text-muted-foreground';
  const label = 'text-[.8rem] text-muted-foreground';
  const btn = 'inline-flex min-h-11 items-center justify-center gap-[.4rem] rounded-lg px-4 text-[.95rem] font-semibold disabled:opacity-60';
  const releases = [...new Set(rows.map((r) => r.releaseName).filter(Boolean))];
  const due = (value: string) => new Date(value).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', timeZone: 'Asia/Bangkok' });

  return (
    <dialog ref={dialog} aria-labelledby="stage-tasks-title" onCancel={(e) => { e.preventDefault(); if (!busy) onClose(); }} className="m-auto w-[min(42rem,calc(100vw-2rem))] max-w-none rounded-2xl bg-[#fffdfa] p-0 text-foreground shadow-2xl backdrop:bg-[#101d2a]/45">
      {open && <div className="flex max-h-[calc(100dvh-2rem)] flex-col">
        <div className="border-b border-[#e2e0d8] px-6 py-4">{caseRef && <p className={label}>{moving ? 'ย้ายคดี' : 'งานแนะนำของคดี'} {caseRef}</p>}<h2 id="stage-tasks-title" tabIndex={-1} autoFocus className="flex flex-wrap items-center gap-2 text-xl font-bold outline-none">{moving && fromLabel ? <>{fromLabel} <ArrowRight aria-hidden="true" className="h-[1.1em] w-[1.1em]" /> {stageLabel}</> : moving ? `ย้ายไปขั้น${stageLabel}` : `งานแนะนำขั้น${stageLabel}`}</h2></div>
        <div className="min-h-0 space-y-4 overflow-y-auto overscroll-contain px-6 py-5">
          <p><b>เลือกงานที่จะสร้างในขั้นใหม่</b> <span className={hint}>· {releases.length ? `แนะนำจาก SOP “${releases.join('”, “')}” — ` : ''}ติ๊กออกได้ถ้าไม่ต้องใช้</span></p>
          {rows.length === 0 ? <p className={hint}>ขั้นนี้ไม่มีงานแนะนำจาก SOP — ย้ายขั้นได้เลย แล้วเพิ่มงานเองในแท็บงาน</p> : <ul className="divide-y divide-[#e2e0d8] rounded-lg border border-[#e2e0d8] bg-white text-sm">
            {rows.map((row, i) => {
              const rowFlags = row.dueDate ? leaveFlagsForDate(leaves, row.dueDate) : new Map();
              const rowAssignee = lawyers.find((u) => u.id === row.assigneeId);
              return <li key={i} className={`px-4 py-3 ${row.checked ? '' : 'text-muted-foreground'}`}>
                <div className="flex items-start gap-3">
                  <input type="checkbox" className="mt-1 h-5 w-5 shrink-0" checked={row.checked} onChange={(e) => edit(i, { checked: e.target.checked })} aria-label={row.title} />
                  <div className="min-w-0 flex-1"><b>{row.title}</b><div className={label}>{[row.dueDate ? `ครบ ${due(row.dueDate)}` : null, `คนทำ: ${rowAssignee?.firstName ?? 'ยังไม่มอบหมาย'}`].filter(Boolean).join(' · ')}</div></div>
                  {row.checked && <button type="button" onClick={() => setEditing(editing === i ? null : i)} aria-expanded={editing === i} className={`${btn} min-h-9 py-1 text-[.85rem] text-muted-foreground`}>{editing === i ? 'เสร็จ' : 'แก้วันหรือคนทำ'}</button>}
                </div>
                {row.checked && editing === i && <div className="mt-2 flex flex-wrap items-center gap-2 pl-8">
                  <ThaiDateField className="w-48" ariaLabel="วันครบกำหนด" value={row.dueDate ?? ''} onChange={(v) => edit(i, { dueDate: v || null })} />
                  <select className="min-h-11 rounded-lg border border-[#c9ccc6] bg-white px-2 text-sm" aria-label="คนทำ" value={row.assigneeId ?? ''} onChange={(e) => edit(i, { assigneeId: e.target.value || null })}>
                    <option value="">ยังไม่มอบหมาย</option>
                    <AssigneeOptions users={lawyers} flags={rowFlags} nameOf={(u) => u.firstName} />
                  </select>
                </div>}
                {row.checked && rowAssignee && row.dueDate && rowFlags.has(rowAssignee.id) && <p className="mt-1 flex items-start gap-1 pl-8 text-xs text-warning"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />{leaveWarning(rowAssignee.firstName, row.dueDate, rowFlags.get(rowAssignee.id)?.kind)}</p>}
              </li>;
            })}
          </ul>}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#e2e0d8] px-6 py-4">
          <p className={hint}>{moving ? (selectedCount ? `ระบบจะย้ายขั้นและสร้าง ${selectedCount} งานที่ติ๊กไว้ แจ้งคนทำทุกคน` : 'ระบบจะย้ายขั้นโดยไม่สร้างงาน') : `ระบบจะสร้าง ${selectedCount} งานที่ติ๊กไว้ แจ้งคนทำทุกคน`}</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={busy} onClick={onClose} className={`${btn} text-muted-foreground`}>ยกเลิก</button>
            {selectedCount > 0 && <button type="button" disabled={busy} onClick={onSkip} className={`${btn} border border-[#c9ccc6] bg-white text-[#142e43]`}>{moving ? 'ย้ายขั้นอย่างเดียว' : 'ไม่สร้างตอนนี้'}</button>}
            {selectedCount === 0 ? <button type="button" disabled={busy} onClick={onSkip} className={`${btn} bg-[#227052] text-white`}>{moving ? 'ย้ายขั้นอย่างเดียว' : 'ไม่สร้างตอนนี้'} <ArrowRight aria-hidden="true" className="h-[1.1em] w-[1.1em]" /></button>
              : <button type="button" disabled={busy || selectedCount === 0} onClick={confirm} className={`${btn} bg-[#227052] text-white`}>{moving ? `ย้ายขั้นและสร้าง ${selectedCount} งาน` : `สร้าง ${selectedCount} งาน`} <ArrowRight aria-hidden="true" className="h-[1.1em] w-[1.1em]" /></button>}
          </div>
        </div>
      </div>}
    </dialog>
  );
}

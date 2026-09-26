'use client';

import { useEffect, useState } from 'react';
import { SideDrawer } from '@/components/ui/SideDrawer';
import { Button } from '@/components/ui/button';
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
  onClose,
  onSkip,
  onConfirm,
}: {
  open: boolean;
  stageLabel: string;
  proposals: StageTaskProposal[];
  lawyers: UserItem[];
  busy: boolean;
  onClose: () => void;
  onSkip: () => void;
  onConfirm: (tasks: StageTaskDraft[]) => void;
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
      .map(({ title, description, dueDate, assigneeId }) => ({ title, description, dueDate, assigneeId }));
    onConfirm(tasks);
  };

  return (
    <SideDrawer open={open} title={`ย้ายไป "${stageLabel}"?`} onClose={onClose}>
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Playbook แนะนำให้สร้างงานต่อไปนี้ — เลือกรายการที่ต้องการสร้าง แก้ไขวันส่งหรือผู้รับผิดชอบได้
        </p>
        <ul className="space-y-3">
          {rows.map((row, i) => {
            const rowFlags = row.dueDate ? leaveFlagsForDate(leaves, row.dueDate) : new Map();
            const rowAssignee = lawyers.find((u) => u.id === row.assigneeId);
            return (
              <li key={i} className="rounded-lg border border-border p-3">
                <label className="flex items-start gap-2 text-sm font-medium">
                  <input
                    type="checkbox"
                    className="mt-1 h-4 w-4"
                    checked={row.checked}
                    onChange={(e) => edit(i, { checked: e.target.checked })}
                  />
                  <span className="min-w-0 flex-1">
                    {row.title}
                    <span className="block text-xs font-normal text-muted-foreground">{row.releaseName}</span>
                  </span>
                </label>
                {row.checked && (
                  <div className="mt-2 pl-6">
                    <div className="flex flex-wrap items-center gap-2">
                      <ThaiDateInput value={row.dueDate} onChange={(v) => edit(i, { dueDate: v || null })} />
                      <select
                        className="h-9 rounded-lg border border-input bg-background px-2 text-sm"
                        aria-label="ผู้รับผิดชอบ"
                        value={row.assigneeId ?? ''}
                        onChange={(e) => edit(i, { assigneeId: e.target.value || null })}
                      >
                        <option value="">ยังไม่มอบหมาย</option>
                        <AssigneeOptions users={lawyers} flags={rowFlags} nameOf={(u) => u.firstName} />
                      </select>
                    </div>
                    {rowAssignee && row.dueDate && rowFlags.has(rowAssignee.id) && (
                      <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">
                        {leaveWarning(rowAssignee.firstName, row.dueDate, rowFlags.get(rowAssignee.id)?.kind)}
                      </p>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </div>
      <div className="mt-4 flex flex-wrap justify-end gap-2 border-t border-border pt-3">
        <Button type="button" variant="outline" disabled={busy} onClick={onSkip}>
          ย้ายขั้นอย่างเดียว
        </Button>
        <Button type="button" disabled={busy || selectedCount === 0} onClick={confirm}>
          {`ย้ายและสร้าง ${selectedCount} งาน`}
        </Button>
      </div>
    </SideDrawer>
  );
}

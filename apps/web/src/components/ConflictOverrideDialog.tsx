'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/misc';
import { ConflictMatchItem, describeConflictMatch, OVERRIDE_MIN_LENGTH } from '@/lib/conflict';

/**
 * The server found a name of ours on the other side somewhere (or the reverse).
 * Opening anyway needs a written reason, which is stored with the conflict check and audited.
 */
export function ConflictOverrideDialog({
  matches,
  busy,
  onCancel,
  onConfirm,
}: {
  matches: ConflictMatchItem[];
  busy: boolean;
  onCancel: () => void;
  onConfirm: (reason: string) => void;
}) {
  const [reason, setReason] = useState('');
  const ok = reason.trim().length >= OVERRIDE_MIN_LENGTH;

  // Escape belongs to this dialog alone: swallow it before a modal underneath sees it,
  // and ignore it while the case is being opened.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      if (!busy) onCancel();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [busy, onCancel]);

  return (
    <Modal open onClose={onCancel} closeOnBackdrop={!busy} className="max-w-xl" ariaLabel="พบชื่อที่อาจขัดกัน">
      <form
        className="space-y-4"
        onSubmit={(e) => { e.preventDefault(); if (ok && !busy) onConfirm(reason.trim()); }}
      >
        <div>
          <h2 className="text-lg font-semibold">พบชื่อที่อาจขัดกัน (conflict of interest)</h2>
          <p className="mt-1 text-sm text-muted-foreground">ตรวจรายการด้านล่าง ถ้ายืนยันเปิดต่อ ระบบจะบันทึกเหตุผลไว้เป็นหลักฐาน</p>
        </div>
        <ul className="max-h-60 space-y-2 overflow-y-auto text-sm">
          {matches.map((m, i) => (
            <li key={`${m.kind}-${m.caseId ?? m.intakeId ?? m.name}-${i}`} className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 dark:border-amber-700 dark:bg-amber-950">
              {m.caseId ? <Link href={`/cases/${m.caseId}`} target="_blank" className="underline">{describeConflictMatch(m)}</Link> : describeConflictMatch(m)}
            </li>
          ))}
        </ul>
        <label className="block text-sm font-medium">
          เหตุผลที่เปิดต่อ (อย่างน้อย {OVERRIDE_MIN_LENGTH} ตัวอักษร)
          <textarea
            required
            rows={3}
            maxLength={2000}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
            placeholder="เช่น คดีเดิมจบแล้ว และลูกความทั้งสองฝ่ายยินยอมเป็นหนังสือ"
          />
        </label>
        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={!ok || busy}>{busy ? 'กำลังเปิด…' : 'ยืนยันเปิดต่อ'}</Button>
          <Button type="button" variant="outline" disabled={busy} onClick={onCancel}>ยกเลิก</Button>
        </div>
      </form>
    </Modal>
  );
}

'use client';

import { useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { ThaiDateInput } from '@/components/ui/ThaiDateInput';
import { PRE_LITIGATION_STATUS_LABELS } from '@/lib/pre-litigation';

/**
 * ออกหนังสือทวงถาม (Notice) จากหน้าคดีโดยตรง — ข้อมูลโนติสยังบันทึกอยู่บน
 * intake ที่ผูก 1:1 กับคดี จึงเรียก endpoint เดิมของ intake
 */
export function CaseNoticeDialog({
  intakeId,
  defaultRecipient,
  open,
  onClose,
  onDone,
}: {
  intakeId: string;
  defaultRecipient?: string | null;
  open: boolean;
  onClose: () => void;
  onDone: () => void;
}) {
  const { token } = useAuth();
  const [recipient, setRecipient] = useState(defaultRecipient ?? '');
  const [deadline, setDeadline] = useState('');
  const [result, setResult] = useState('');
  const [ackMissing, setAckMissing] = useState(false);
  const [missingWarning, setMissingWarning] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  if (!open) return null;

  const submit = async () => {
    if (!token || !recipient.trim() || busy) return;
    setBusy(true);
    setError('');
    try {
      await api.noticeIntake(token, intakeId, {
        noticeRecipient: recipient.trim(),
        noticeDeadline: deadline || undefined,
        noticeResult: result.trim() || undefined,
        acknowledgeMissingDocuments: ackMissing || undefined,
      });
      onDone();
      onClose();
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'เกิดข้อผิดพลาด';
      // เอกสารยังไม่ครบ — ให้กดรับทราบแล้วออกได้ (เหมือนหน้า intake)
      if (message.includes('ขาดเอกสาร')) {
        setMissingWarning(message);
        setAckMissing(false);
      }
      setError(message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-xl bg-card p-5 shadow-xl">
        <h2 className="mb-4 text-lg font-semibold">ออกหนังสือทวงถาม (Notice)</h2>
        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium">ผู้รับหนังสือ *</label>
            <input
              value={recipient}
              onChange={(e) => setRecipient(e.target.value)}
              className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
              placeholder="เช่น บริษัทคู่กรณี / ผู้ละเมิด"
              autoFocus
            />
          </div>
          <div>
            <label className="block text-sm font-medium">ครบกำหนดตามหนังสือ</label>
            <ThaiDateInput value={deadline} onChange={setDeadline} className="mt-1" />
          </div>
          <div>
            <label className="block text-sm font-medium">ผล / หมายเหตุ</label>
            <textarea
              value={result}
              onChange={(e) => setResult(e.target.value)}
              rows={2}
              className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm resize-none"
            />
          </div>
          {missingWarning && (
            <label className="flex items-start gap-2 text-sm text-destructive">
              <input
                type="checkbox"
                checked={ackMissing}
                onChange={(e) => setAckMissing(e.target.checked)}
                className="mt-0.5 h-4 w-4"
              />
              รับทราบว่าเอกสารยังไม่ครบ แต่ยืนยันออกหนังสือ
            </label>
          )}
          {error && !missingWarning && <p className="text-sm text-destructive">{error}</p>}
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>ยกเลิก</Button>
          <Button onClick={submit} disabled={busy || !recipient.trim()}>
            {busy ? 'กำลังบันทึก...' : 'ออกหนังสือ'}
          </Button>
        </div>
      </div>
    </div>
  );
}

/** อัปเดตสถานะเจรจา/ก่อนฟ้อง จากหน้าคดีโดยตรง — เขียนกลับลง intake ที่ผูก 1:1 */
export function PreLitigationUpdateDialog({
  intakeId,
  currentStatus,
  currentOffer,
  open,
  onClose,
  onDone,
}: {
  intakeId: string;
  currentStatus?: string | null;
  currentOffer?: number | null;
  open: boolean;
  onClose: () => void;
  onDone: () => void;
}) {
  const { token } = useAuth();
  const [status, setStatus] = useState(currentStatus ?? 'NOT_STARTED');
  const [offer, setOffer] = useState(currentOffer != null ? String(currentOffer) : '');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  if (!open) return null;

  const submit = async () => {
    if (!token || busy) return;
    setBusy(true);
    setError('');
    try {
      await api.updateIntake(token, intakeId, {
        preLitigationStatus: status,
        settlementOfferAmount: offer.trim() ? Number(offer) : undefined,
        preLitigationNotes: note.trim() || undefined,
      });
      onDone();
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'เกิดข้อผิดพลาด');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-xl bg-card p-5 shadow-xl">
        <h2 className="mb-4 text-lg font-semibold">อัปเดตงานก่อนฟ้อง</h2>
        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium">สถานะก่อนฟ้อง</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
            >
              {Object.entries(PRE_LITIGATION_STATUS_LABELS).map(([key, label]) => (
                <option key={key} value={key}>{label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium">ข้อเสนอจ่าย/ค่าสินไหม (บาท)</label>
            <input
              type="number"
              min={0}
              step="0.01"
              value={offer}
              onChange={(e) => setOffer(e.target.value)}
              className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
              placeholder="ถ้ามี"
            />
          </div>
          <div>
            <label className="block text-sm font-medium">บันทึก</label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm resize-none"
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>ยกเลิก</Button>
          <Button onClick={submit} disabled={busy}>{busy ? 'กำลังบันทึก...' : 'บันทึก'}</Button>
        </div>
      </div>
    </div>
  );
}

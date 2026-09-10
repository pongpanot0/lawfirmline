'use client';

import { useState } from 'react';
import { DocumentItem, IntakeItem, UserItem } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Modal } from '@/components/ui/misc';

const SELECT_CLASS = 'w-full h-9 rounded-lg border border-input bg-card px-3 text-sm';

export interface ConvertToCaseDialogProps {
  intake: IntakeItem;
  documents: DocumentItem[];
  lawyers: UserItem[];
  analysisCount: number;
  submitting: boolean;
  error?: string;
  onClose: () => void;
  onConfirm: (payload: {
    title: string;
    leadLawyerId?: string;
    claimedAmount?: number;
  }) => void;
}

/**
 * What opening a case does with the intake, before it happens.
 *
 * Everything already recorded carries over on its own — this is not a second
 * wizard asking for the client and the description again. It shows where each
 * piece lands, names what is still missing, and asks only for what the intake
 * genuinely cannot answer: whether the estimated damage is also the amount
 * being claimed, which is a different figure and never copied on its own.
 */
export function ConvertToCaseDialog({
  intake,
  documents,
  lawyers,
  analysisCount,
  submitting,
  error,
  onClose,
  onConfirm,
}: ConvertToCaseDialogProps) {
  const attachingToExisting = !!intake.relatedCase;
  const suggestedTitle =
    intake.title ||
    (intake.clientName && intake.matterType
      ? `${intake.clientName} - ${intake.matterType}`
      : intake.clientName || '');

  const [title, setTitle] = useState(suggestedTitle);
  const [leadLawyerId, setLeadLawyerId] = useState('');
  const [useDamageAsClaim, setUseDamageAsClaim] = useState(false);

  const missing = [
    !intake.clientId && !intake.clientName ? 'ลูกค้า' : null,
    !intake.description ? 'รายละเอียดเรื่อง' : null,
    documents.length === 0 ? 'ไฟล์เอกสาร' : null,
  ].filter(Boolean) as string[];

  const carried = [
    intake.clientId || intake.clientName
      ? `ลูกค้า: ${intake.clientName ?? 'ตามที่ผูกไว้'}`
      : null,
    intake.description ? 'รายละเอียดเรื่อง → รายละเอียดคดี' : null,
    documents.length ? `ไฟล์ ${documents.length} รายการ → เอกสารคดี` : null,
    analysisCount ? `ผลวิเคราะห์ ${analysisCount} ครั้ง → คดี` : null,
    intake.assignedUserIds?.length
      ? `ทีมที่มอบหมายไว้ ${intake.assignedUserIds.length} คน`
      : null,
    intake.deadlineDate ? 'วันครบกำหนด → นัดในปฏิทินคดี' : null,
  ].filter(Boolean) as string[];

  return (
    <Modal open onClose={onClose} className="max-w-lg">
      <h2 className="text-lg font-semibold">
        {attachingToExisting
          ? `เพิ่มเรื่องนี้ลงคดีเดิม ${intake.relatedCase?.ownRef ?? ''}`
          : 'เปิดเป็นคดีใหม่'}
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        {attachingToExisting
          ? 'ข้อมูลและไฟล์ของเรื่องนี้จะไปอยู่ในคดีเดิม ไม่มีการสร้างคดีใหม่'
          : 'ข้อมูลที่กรอกไว้แล้วจะถูกใช้ต่อ ไม่ต้องกรอกซ้ำ'}
      </p>

      <div className="mt-4 space-y-4">
        {!attachingToExisting && (
          <label className="block text-sm">
            <span className="mb-1 block text-muted-foreground">ชื่อคดี</span>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} />
          </label>
        )}

        {!attachingToExisting && (
          <label className="block text-sm">
            <span className="mb-1 block text-muted-foreground">ทนายเจ้าของคดี</span>
            <select
              value={leadLawyerId}
              onChange={(e) => setLeadLawyerId(e.target.value)}
              className={SELECT_CLASS}
            >
              <option value="">ตัวฉันเอง</option>
              {lawyers.map((lawyer) => (
                <option key={lawyer.id} value={lawyer.id}>
                  {lawyer.firstName} {lawyer.lastName}
                </option>
              ))}
            </select>
          </label>
        )}

        {!attachingToExisting && intake.estimatedDamage != null && (
          <label className="flex items-start gap-2 rounded-lg border border-border p-3 text-sm">
            <input
              type="checkbox"
              className="mt-1"
              checked={useDamageAsClaim}
              onChange={(e) => setUseDamageAsClaim(e.target.checked)}
            />
            <span>
              ใช้ความเสียหายโดยประมาณ{' '}
              <strong>{intake.estimatedDamage.toLocaleString('th-TH')} บาท</strong>{' '}
              เป็นทุนทรัพย์ที่เรียกร้อง
              <span className="mt-0.5 block text-xs text-muted-foreground">
                สองค่านี้ไม่จำเป็นต้องเท่ากัน — ไม่ติ๊กก็เปิดคดีได้ แล้วกรอกทีหลัง
              </span>
            </span>
          </label>
        )}

        <div className="rounded-lg border border-border p-3 text-sm">
          <p className="font-medium">ข้อมูลที่จะไปกับคดี</p>
          {carried.length ? (
            <ul className="mt-1 list-disc space-y-0.5 ps-5 text-muted-foreground">
              {carried.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          ) : (
            <p className="mt-1 text-muted-foreground">ยังไม่มีข้อมูลที่บันทึกไว้</p>
          )}
        </div>

        {missing.length > 0 && (
          <div className="rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm">
            <p className="font-medium">ยังขาด: {missing.join(' · ')}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              เปิดคดีได้เลย แล้วเติมในคดีภายหลัง
            </p>
          </div>
        )}

        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        <Button
          type="button"
          disabled={submitting}
          onClick={() =>
            onConfirm({
              title: title.trim(),
              leadLawyerId: leadLawyerId || undefined,
              claimedAmount:
                useDamageAsClaim && intake.estimatedDamage != null
                  ? intake.estimatedDamage
                  : undefined,
            })
          }
        >
          {submitting
            ? 'กำลังบันทึก...'
            : attachingToExisting
              ? 'เพิ่มลงคดีเดิม'
              : 'เปิดเป็นคดี'}
        </Button>
        <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>
          ยกเลิก
        </Button>
      </div>
    </Modal>
  );
}

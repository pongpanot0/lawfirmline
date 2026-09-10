'use client';

import { useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Modal } from '@/components/ui/misc';

interface EligibleMember {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
}

export interface CreateReviewRoundDialogProps {
  caseId: string;
  documentId: string;
  documentVersionId: string;
  onClose: () => void;
  onCreated: () => void;
}

/**
 * Reviewer/editor choices are narrowed to members already staffed on this
 * case (owner, lead lawyer, case assignment) — the backend enforces this
 * too, this list is just so the picker never offers someone it will reject.
 */
export function CreateReviewRoundDialog({
  caseId,
  documentId,
  documentVersionId,
  onClose,
  onCreated,
}: CreateReviewRoundDialogProps) {
  const { token } = useAuth();
  const [members, setMembers] = useState<EligibleMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [reviewerIds, setReviewerIds] = useState<string[]>([]);
  const [editorIds, setEditorIds] = useState<string[]>([]);
  const [approvalRule, setApprovalRule] = useState<'ALL' | 'ANY_ONE'>('ALL');
  const [scope, setScope] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    setLoadError('');
    api
      .getReviewEligibleMembers(token, caseId, documentId)
      .then(setMembers)
      .catch(() => setLoadError('โหลดรายชื่อสมาชิกไม่สำเร็จ'))
      .finally(() => setLoading(false));
  }, [token, caseId, documentId]);

  const toggle = (list: string[], setList: (v: string[]) => void, id: string) => {
    setList(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
  };

  const handleSubmit = async () => {
    if (!token || reviewerIds.length === 0) return;
    setSubmitting(true);
    setError('');
    try {
      await api.createReviewRound(token, caseId, documentId, {
        documentVersionId,
        reviewerIds,
        editorIds,
        approvalRule,
        scope: scope.trim() || undefined,
      });
      onCreated();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'ส่งตรวจไม่สำเร็จ');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal open onClose={onClose} className="max-w-md">
      <div className="p-5">
        <h2 className="mb-1 text-lg font-semibold">ส่งตรวจเอกสาร</h2>
        <p className="mb-4 text-sm text-muted-foreground">
          เลือกผู้ตรวจจากสมาชิกที่มีสิทธิ์ในคดีนี้ — เลือกได้มากกว่าหนึ่งคน
        </p>

        {loadError ? (
          <p className="text-sm text-destructive">{loadError}</p>
        ) : loading ? (
          <p className="text-sm text-muted-foreground">กำลังโหลด...</p>
        ) : (
          <>
            <div className="mb-4">
              <p className="mb-2 text-xs font-medium text-muted-foreground">ผู้ตรวจ</p>
              <div className="max-h-40 space-y-1 overflow-y-auto rounded-lg border p-2">
                {members.map((member) => (
                  <label key={member.id} className="flex items-center gap-2 rounded px-1 py-1 text-sm hover:bg-accent">
                    <Checkbox
                      checked={reviewerIds.includes(member.id)}
                      onChange={() => toggle(reviewerIds, setReviewerIds, member.id)}
                    />
                    {member.firstName} {member.lastName} · {member.email}
                  </label>
                ))}
                {members.length === 0 && <p className="text-xs text-muted-foreground">ไม่มีสมาชิกในคดีนี้</p>}
              </div>
            </div>

            <div className="mb-4">
              <p className="mb-2 text-xs font-medium text-muted-foreground">ผู้แก้ไข (ถ้ามีมากกว่าผู้ที่อัปโหลด)</p>
              <div className="max-h-32 space-y-1 overflow-y-auto rounded-lg border p-2">
                {members.map((member) => (
                  <label key={member.id} className="flex items-center gap-2 rounded px-1 py-1 text-sm hover:bg-accent">
                    <Checkbox
                      checked={editorIds.includes(member.id)}
                      onChange={() => toggle(editorIds, setEditorIds, member.id)}
                    />
                    {member.firstName} {member.lastName}
                  </label>
                ))}
              </div>
            </div>

            <div className="mb-4">
              <p className="mb-2 text-xs font-medium text-muted-foreground">กติกาการอนุมัติ</p>
              <div className="flex gap-4 text-sm">
                <label className="flex items-center gap-1.5">
                  <input
                    type="radio"
                    checked={approvalRule === 'ALL'}
                    onChange={() => setApprovalRule('ALL')}
                  />
                  ผู้ตรวจทุกคนต้องผ่าน
                </label>
                <label className="flex items-center gap-1.5">
                  <input
                    type="radio"
                    checked={approvalRule === 'ANY_ONE'}
                    onChange={() => setApprovalRule('ANY_ONE')}
                  />
                  ผู้ตรวจคนใดคนหนึ่งผ่านก็พอ
                </label>
              </div>
            </div>

            <div className="mb-4">
              <p className="mb-1 text-xs font-medium text-muted-foreground">ขอบเขตการตรวจ (ถ้ามี)</p>
              <input
                className="w-full rounded-lg border px-3 py-1.5 text-sm"
                placeholder="เช่น ตรวจเฉพาะตัวเลขและวันที่"
                value={scope}
                onChange={(e) => setScope(e.target.value)}
              />
            </div>

            {error && <p className="mb-3 text-sm text-destructive">{error}</p>}

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={onClose} disabled={submitting}>
                ยกเลิก
              </Button>
              <Button onClick={handleSubmit} disabled={submitting || reviewerIds.length === 0}>
                {submitting ? 'กำลังส่ง...' : 'ส่งตรวจ'}
              </Button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}

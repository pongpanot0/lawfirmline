'use client';

import { useCallback, useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/lib/auth';
import { api, type ClosingEmailDraft, type CaseActivityItem } from '@/lib/api';
import { formatDate, formatDateTime } from '@/lib/utils';
import { InlineEmptyState, PageLoading } from '@/components/ui/misc';

export function CaseClosingReportPanel({ caseId }: { caseId: string }) {
  const { token } = useAuth();
  const [activities, setActivities] = useState<CaseActivityItem[]>([]);
  const [drafts, setDrafts] = useState<ClosingEmailDraft[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [draft, setDraft] = useState<ClosingEmailDraft | null>(null);
  const [dirty, setDirty] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [busy, setBusy] = useState<'generate' | 'save' | 'approve' | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    if (!token || !caseId) return;
    setLoading(true);
    setLoadError('');
    try {
      const [caseActivities, existing] = await Promise.all([
        api.getCaseActivities(token, caseId),
        api.listClosingEmailDrafts(token, caseId),
      ]);
      setActivities(caseActivities);
      setDrafts(existing);
      // Come back to this page and the draft is here waiting, not a blank
      // panel inviting a second one.
      const latest = existing[0];
      if (latest) {
        setDraft(latest);
        setSelectedIds(latest.selectedActivityIds ?? []);
      }
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'โหลดข้อมูลไม่สำเร็จ');
    } finally {
      setLoading(false);
    }
  }, [token, caseId]);

  useEffect(() => {
    void load();
  }, [load]);

  const toggleActivity = (activityId: string) =>
    setSelectedIds((previous) =>
      previous.includes(activityId)
        ? previous.filter((id) => id !== activityId)
        : [...previous, activityId],
    );

  const handleGenerate = async () => {
    if (!token || !caseId || busy) return;
    setBusy('generate');
    setError('');
    setNotice('');
    try {
      const created = await api.createClosingEmailDraft(token, caseId, selectedIds);
      setDraft(created);
      setDrafts((previous) => [created, ...previous]);
      setDirty(false);
      setNotice('สร้างร่างใหม่แล้ว — ยังไม่ได้ส่งให้ใคร');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'สร้างร่างไม่สำเร็จ กรุณาลองใหม่');
    } finally {
      setBusy(null);
    }
  };

  const handleCopy = async () => {
    if (!draft) return;
    await navigator.clipboard.writeText(`หัวข้อ: ${draft.subject}\n\n${draft.bodyText}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSaveDraft = async () => {
    if (!token || !caseId || !draft || busy) return;
    setBusy('save');
    setError('');
    setNotice('');
    try {
      const saved = await api.updateClosingEmailDraft(token, caseId, draft.id, {
        subject: draft.subject,
        bodyText: draft.bodyText,
      });
      setDraft(saved);
      setDrafts((previous) => previous.map((item) => (item.id === saved.id ? saved : item)));
      setDirty(false);
      setNotice('บันทึกร่างแล้ว');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'บันทึกร่างไม่สำเร็จ กรุณาลองใหม่');
    } finally {
      setBusy(null);
    }
  };

  const handleApprove = async () => {
    if (!token || !caseId || !draft || busy) return;
    setError('');
    setNotice('');
    setBusy('approve');
    try {
      const approved = await api.approveClosingEmailDraft(token, caseId, draft.id);
      setDraft(approved);
      setDrafts((previous) => previous.map((item) => (item.id === approved.id ? approved : item)));
      setNotice('อนุมัติแล้ว — ยังไม่ได้ส่ง คัดลอกไปส่งเองได้เลย');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'อนุมัติไม่สำเร็จ กรุณาลองใหม่');
    } finally {
      setBusy(null);
    }
  };

  if (loading) return <PageLoading title="กำลังโหลดรายงานปิดงาน" lines={3} />;

  if (loadError) {
    return (
      <div className="rounded-xl border bg-card p-6 shadow-soft">
        <p role="alert" className="text-sm text-destructive">{loadError}</p>
        <Button size="sm" variant="outline" className="mt-3" onClick={() => void load()}>
          ลองใหม่
        </Button>
      </div>
    );
  }

  const approved = draft?.status === 'APPROVED';

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      {error && (
        <p role="alert" className="text-sm text-destructive md:col-span-2">{error}</p>
      )}
      {notice && <p className="text-sm text-muted-foreground md:col-span-2">{notice}</p>}

      <Card>
        <CardHeader>
          <CardTitle>เหตุการณ์ที่จะนำมาใช้</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="mb-3 text-sm text-muted-foreground">
            ติ๊กเหตุการณ์ที่ควรอยู่ในหนังสือปิดคดี แล้วกดสร้างร่าง
          </p>
          {activities.length === 0 ? (
            <InlineEmptyState title="ยังไม่มีความเคลื่อนไหวของคดี" description="บันทึกผลนัดหรือกิจกรรมในหน้าคดีก่อน แล้วค่อยนำมาสร้างหนังสือปิดงาน" />
          ) : (
            activities.map((activity) => (
              <label key={activity.id} className="flex items-start gap-2 py-1 text-sm">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={selectedIds.includes(activity.id)}
                  onChange={() => toggleActivity(activity.id)}
                />
                <span>
                  {formatDate(activity.activityAt)} — {activity.title}
                </span>
              </label>
            ))
          )}
          <Button
            className="mt-4"
            onClick={handleGenerate}
            disabled={busy !== null || activities.length === 0}
          >
            {busy === 'generate'
              ? 'กำลังสร้าง...'
              : draft
                ? 'สร้างร่างใหม่จากที่เลือก'
                : 'สร้างร่าง'}
          </Button>
          {draft && (
            <p className="mt-2 text-xs text-muted-foreground">
              ร่างเดิมยังอยู่ในรายการด้านขวา การสร้างใหม่ไม่ลบของเดิม
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>ตัวอย่างอีเมล</CardTitle>
        </CardHeader>
        <CardContent>
          {draft ? (
            <>
              <p className="mb-2 text-xs text-muted-foreground">
                ร่างเมื่อ {formatDateTime(draft.createdAt)} ·{' '}
                {approved ? 'อนุมัติแล้ว' : 'ยังเป็นร่าง'}
                {drafts.length > 1 && ` · มีร่างทั้งหมด ${drafts.length} ฉบับ`}
              </p>
              {draft.missingDataNotes.length > 0 && (
                <div className="mb-2 rounded-lg border border-warning/40 bg-warning/10 p-2 text-sm">
                  {draft.missingDataNotes.map((note) => (
                    <div key={note}>⚠ {note}</div>
                  ))}
                </div>
              )}
              <Input
                className="mb-2"
                aria-label="หัวข้ออีเมล"
                value={draft.subject}
                readOnly={approved}
                onChange={(e) => {
                  setDraft({ ...draft, subject: e.target.value });
                  setDirty(true);
                }}
              />
              <textarea
                aria-label="เนื้อหาอีเมล"
                className="h-64 w-full rounded-lg border border-input bg-card p-2 text-sm"
                value={draft.bodyText}
                readOnly={approved}
                onChange={(e) => {
                  setDraft({ ...draft, bodyText: e.target.value });
                  setDirty(true);
                }}
              />
              <div className="mt-3 flex flex-wrap gap-2">
                {!approved && (
                  <Button onClick={handleSaveDraft} disabled={busy !== null || !dirty}>
                    {busy === 'save' ? 'กำลังบันทึก...' : 'บันทึกร่าง'}
                  </Button>
                )}
                <Button variant="outline" onClick={handleCopy}>
                  {copied ? 'คัดลอกแล้ว' : 'คัดลอกไปคลิปบอร์ด'}
                </Button>
                <Button
                  variant="secondary"
                  onClick={handleApprove}
                  disabled={busy !== null || approved || dirty}
                >
                  {approved ? 'อนุมัติแล้ว' : busy === 'approve' ? 'กำลังอนุมัติ...' : 'อนุมัติ'}
                </Button>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                {dirty
                  ? 'บันทึกร่างก่อนจึงจะอนุมัติได้'
                  : 'อนุมัติคือการยืนยันข้อความ ระบบไม่ส่งอีเมลให้ — คัดลอกไปส่งเอง'}
              </p>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              เลือกเหตุการณ์แล้วกด &quot;สร้างร่าง&quot;
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

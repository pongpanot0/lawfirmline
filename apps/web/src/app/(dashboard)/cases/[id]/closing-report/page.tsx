'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/lib/auth';
import { api, type ClosingEmailDraft, type CaseActivityItem } from '@/lib/api';

export default function ClosingReportPage() {
  const { id: caseId } = useParams<{ id: string }>();
  const { token } = useAuth();
  const [activities, setActivities] = useState<CaseActivityItem[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [draft, setDraft] = useState<ClosingEmailDraft | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!token || !caseId) return;
    api.getCaseActivities(token, caseId).then(setActivities);
  }, [token, caseId]);

  const toggleActivity = (activityId: string) => {
    setSelectedIds((prev) =>
      prev.includes(activityId)
        ? prev.filter((activityIdInList) => activityIdInList !== activityId)
        : [...prev, activityId],
    );
  };

  const handleGenerate = async () => {
    if (!token || !caseId) return;
    const created = await api.createClosingEmailDraft(token, caseId, selectedIds);
    setDraft(created);
  };

  const handleCopy = async () => {
    if (!draft) return;
    await navigator.clipboard.writeText(`หัวข้อ: ${draft.subject}\n\n${draft.bodyText}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSaveDraft = async () => {
    if (!token || !caseId || !draft) return;
    const saved = await api.updateClosingEmailDraft(token, caseId, draft.id, {
      subject: draft.subject,
      bodyText: draft.bodyText,
    });
    setDraft(saved);
  };

  const handleApprove = async () => {
    if (!token || !caseId || !draft) return;
    const approved = await api.approveClosingEmailDraft(token, caseId, draft.id);
    setDraft(approved);
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <Card>
        <CardHeader>
          <CardTitle>เหตุการณ์ที่จะนำมาใช้</CardTitle>
        </CardHeader>
        <CardContent>
          {activities.map((activity) => (
            <label key={activity.id} className="flex items-start gap-2 py-1">
              <input
                type="checkbox"
                checked={selectedIds.includes(activity.id)}
                onChange={() => toggleActivity(activity.id)}
              />
              <span>
                {new Date(activity.activityAt).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' })} —{' '}
                {activity.title}
              </span>
            </label>
          ))}
          <button
            className="mt-4 rounded bg-blue-600 px-4 py-2 text-white"
            onClick={handleGenerate}
          >
            สร้างร่าง
          </button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>ตัวอย่างอีเมล</CardTitle>
        </CardHeader>
        <CardContent>
          {draft ? (
            <>
              {draft.missingDataNotes.length > 0 && (
                <div className="mb-2 rounded bg-yellow-50 p-2 text-sm text-yellow-800">
                  {draft.missingDataNotes.map((note) => (
                    <div key={note}>⚠ {note}</div>
                  ))}
                </div>
              )}
              <input
                className="mb-2 w-full border p-2"
                value={draft.subject}
                onChange={(e) =>
                  setDraft({ ...draft, subject: e.target.value })
                }
              />
              <textarea
                className="h-64 w-full border p-2"
                value={draft.bodyText}
                onChange={(e) =>
                  setDraft({ ...draft, bodyText: e.target.value })
                }
              />
              <div className="mt-2 flex gap-2">
                {draft.status !== 'APPROVED' && (
                  <button
                    className="rounded bg-blue-600 px-4 py-2 text-white"
                    onClick={handleSaveDraft}
                  >
                    บันทึกร่าง
                  </button>
                )}
                <button
                  className="rounded bg-gray-600 px-4 py-2 text-white"
                  onClick={handleCopy}
                >
                  {copied ? 'คัดลอกแล้ว' : 'คัดลอกไปคลิปบอร์ด'}
                </button>
                <button
                  className="rounded bg-green-600 px-4 py-2 text-white"
                  onClick={handleApprove}
                  disabled={draft.status === 'APPROVED'}
                >
                  {draft.status === 'APPROVED' ? 'อนุมัติแล้ว' : 'อนุมัติ'}
                </button>
              </div>
            </>
          ) : (
            <p className="text-gray-500">เลือกเหตุการณ์แล้วกด &quot;สร้างร่าง&quot;</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

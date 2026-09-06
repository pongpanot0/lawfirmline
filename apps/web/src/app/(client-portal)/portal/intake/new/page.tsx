'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { portalApi } from '@/lib/portal-api';
import { usePortalAuth } from '@/lib/portal-auth';

export default function NewIntakePage() {
  const router = useRouter();
  const { contact, token, loading } = usePortalAuth();
  const [title, setTitle] = useState('');
  const [detail, setDetail] = useState('');
  const [clientRequestedDate, setClientRequestedDate] = useState('');
  const [urgencyFlag, setUrgencyFlag] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [referenceNumber, setReferenceNumber] = useState<string | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!loading && !contact) router.replace('/portal/login');
  }, [loading, contact, router]);

  const handleSubmit = async () => {
    if (!token) return;
    setSubmitting(true);
    setError('');
    try {
      const result = await portalApi.submitIntake(token, {
        title,
        detail,
        clientRequestedDate: clientRequestedDate || undefined,
        urgencyFlag,
      });
      setReferenceNumber(result.referenceNumber);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'ส่งเรื่องไม่สำเร็จ กรุณาลองใหม่');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading || !contact) return null;

  if (referenceNumber) {
    return (
      <div className="min-h-screen w-full bg-background p-6">
        <Card>
          <CardContent className="p-6">
            <p className="text-lg font-medium">ส่งเรื่องสำเร็จ</p>
            <p className="mt-2">เลขอ้างอิงของท่านคือ: {referenceNumber}</p>
            <button
              className="mt-4 rounded bg-blue-600 px-4 py-2 text-white"
              onClick={() => router.push('/portal/intake')}
            >
              ดูรายการเรื่องที่ส่ง
            </button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full bg-background p-6">
      <Card>
        <CardHeader>
          <CardTitle>ส่งเรื่องใหม่</CardTitle>
        </CardHeader>
        <CardContent>
          <label className="block text-sm font-medium">หัวข้อ</label>
          <input
            className="mb-4 w-full border p-2"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <label className="block text-sm font-medium">รายละเอียด</label>
          <textarea
            className="mb-4 h-32 w-full border p-2"
            value={detail}
            onChange={(e) => setDetail(e.target.value)}
          />
          <label className="block text-sm font-medium">วันที่ต้องการ (ถ้ามี)</label>
          <input
            type="date"
            className="mb-4 w-full border p-2"
            value={clientRequestedDate}
            onChange={(e) => setClientRequestedDate(e.target.value)}
          />
          <label className="mb-4 flex items-center gap-2">
            <input
              type="checkbox"
              checked={urgencyFlag}
              onChange={(e) => setUrgencyFlag(e.target.checked)}
            />
            เรื่องเร่งด่วน
          </label>
          {error && <p className="mb-4 text-sm text-destructive">{error}</p>}
          <button
            className="rounded bg-blue-600 px-4 py-2 text-white disabled:opacity-50"
            onClick={handleSubmit}
            disabled={submitting || !title || !detail}
          >
            {submitting ? 'กำลังส่ง...' : 'ส่งเรื่อง'}
          </button>
        </CardContent>
      </Card>
    </div>
  );
}

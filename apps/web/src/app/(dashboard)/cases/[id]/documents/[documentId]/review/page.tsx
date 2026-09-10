'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft, Download, CheckCircle2, RotateCcw, Clock } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { api, ApiError, DocumentItem, ReviewRoundItem } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { LoadFailed } from '@/components/ui/LoadFailed';
import { CreateReviewRoundDialog } from '@/components/documents/CreateReviewRoundDialog';
import { DocumentDropZone } from '@/components/DocumentDropZone';
import { InlineEmptyState, PageLoading } from '@/components/ui/misc';

const VERSION_STATUS_LABELS: Record<string, string> = {
  DRAFT: 'ฉบับร่าง',
  WAITING_REVIEW: 'รอตรวจ',
  RETURNED_FOR_CHANGES: 'ส่งกลับแก้ไข',
  APPROVED: 'ผ่านการตรวจ',
  SUPERSEDED: 'ถูกแทนที่ด้วยฉบับใหม่',
};

const VERSION_STATUS_VARIANT: Record<string, string> = {
  DRAFT: 'bg-gray-100 text-gray-700',
  WAITING_REVIEW: 'bg-amber-100 text-amber-700',
  RETURNED_FOR_CHANGES: 'bg-red-100 text-red-700',
  APPROVED: 'bg-green-100 text-green-700',
  SUPERSEDED: 'bg-gray-100 text-gray-400',
};

function formatDateTime(date: string) {
  return new Date(date).toLocaleString('th-TH', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function ReviewerStatusList({ round, memberNames }: { round: ReviewRoundItem; memberNames: Record<string, string> }) {
  return (
    <div className="space-y-1">
      {round.reviewerIds.map((reviewerId) => {
        const decision = round.decisions.find((d) => d.reviewerId === reviewerId);
        return (
          <div key={reviewerId} className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">{memberNames[reviewerId] ?? `${reviewerId.slice(0, 8)}…`}</span>
            {!decision ? (
              <span className="inline-flex items-center gap-1 text-amber-700">
                <Clock className="h-3 w-3" /> ยังไม่ตรวจ
              </span>
            ) : decision.decision === 'APPROVED' ? (
              <span className="inline-flex items-center gap-1 text-green-700">
                <CheckCircle2 className="h-3 w-3" /> ผ่านแล้ว
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-red-700">
                <RotateCcw className="h-3 w-3" /> ส่งกลับแก้ไข
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function DocumentReviewPage() {
  const { id: caseId, documentId } = useParams<{ id: string; documentId: string }>();
  const { token, user } = useAuth();

  const [document, setDocument] = useState<DocumentItem | null>(null);
  const [rounds, setRounds] = useState<ReviewRoundItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [showCreateRound, setShowCreateRound] = useState(false);
  const [returnReason, setReturnReason] = useState('');
  const [showReturnBox, setShowReturnBox] = useState(false);
  const [deciding, setDeciding] = useState(false);
  const [error, setError] = useState('');
  const [staleNotice, setStaleNotice] = useState(false);
  const [uploadingVersion, setUploadingVersion] = useState(false);
  const [versionNotes, setVersionNotes] = useState('');
  const [memberNames, setMemberNames] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    if (!token || !caseId || !documentId) return;
    setLoading(true);
    setLoadError(false);
    try {
      const [docs, roundList, members] = await Promise.all([
        api.getDocuments(token, caseId),
        api.getReviewRounds(token, caseId, documentId),
        api.getReviewEligibleMembers(token, caseId, documentId),
      ]);
      const doc = docs.find((d) => d.id === documentId) ?? null;
      setDocument(doc);
      setRounds(roundList);
      setMemberNames(Object.fromEntries(members.map((m) => [m.id, `${m.firstName} ${m.lastName}`])));
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [token, caseId, documentId]);

  useEffect(() => {
    load();
  }, [load]);

  const latestVersion = document?.versions?.[0] ?? null;
  const activeRound = useMemo(() => rounds.find((r) => r.status === 'WAITING_REVIEW') ?? rounds[0] ?? null, [rounds]);
  const myDecision = activeRound?.decisions.find((d) => d.reviewerId === user?.id);
  const iAmReviewer = !!user && !!activeRound && activeRound.reviewerIds.includes(user.id);

  const handleDownload = async () => {
    if (!token || !document) return;
    try {
      const blob = await api.downloadDocument(token, caseId, document.id);
      const url = URL.createObjectURL(blob);
      const a = window.document.createElement('a');
      a.href = url;
      a.download = document.filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setError('เปิดไฟล์ไม่สำเร็จ');
    }
  };

  const handleUploadNewVersion = async (file: File) => {
    if (!token || !document) return;
    setUploadingVersion(true);
    setError('');
    try {
      await api.uploadDocumentVersion(token, caseId, document.id, file, versionNotes.trim() || undefined);
      setVersionNotes('');
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'อัปโหลดฉบับใหม่ไม่สำเร็จ');
    } finally {
      setUploadingVersion(false);
    }
  };

  const handleDecision = async (action: 'approve' | 'return') => {
    if (!token || !activeRound) return;
    if (action === 'return' && !returnReason.trim()) {
      setError('กรุณาระบุเหตุผลที่ส่งกลับแก้ไข');
      return;
    }
    setDeciding(true);
    setError('');
    setStaleNotice(false);
    try {
      await api.recordReviewDecision(token, caseId, documentId, activeRound.id, {
        action,
        reason: action === 'return' ? returnReason.trim() : undefined,
        reviewedDocumentVersionId: activeRound.documentVersionId,
      });
      setReturnReason('');
      setShowReturnBox(false);
      await load();
    } catch (e) {
      if (e instanceof ApiError && e.message.includes('ฉบับใหม่')) {
        setStaleNotice(true);
      } else {
        setError(e instanceof ApiError ? e.message : 'บันทึกไม่สำเร็จ');
      }
    } finally {
      setDeciding(false);
    }
  };

  if (loadError) return <LoadFailed onRetry={load} />;
  if (loading || !document) return <PageLoading title="กำลังโหลดหน้าตรวจเอกสาร" lines={3} />;

  return (
    <div className="pb-24">
      <Link
        href={`/cases/${caseId}?tab=documents`}
        className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
      >
        <ArrowLeft className="h-4 w-4" /> กลับไปที่เอกสาร
      </Link>
      <h1 className="mt-2 mb-1 text-2xl font-bold tracking-tight">{document.filename}</h1>
      <p className="mb-6 text-sm text-muted-foreground">หน้าตรวจเอกสาร</p>

      {error && <p className="mb-4 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
      {staleNotice && (
        <p className="mb-4 rounded-lg bg-amber-100 p-3 text-sm text-amber-800">
          เอกสารถูกแก้เป็นฉบับใหม่ระหว่างที่เปิดหน้านี้ กรุณาโหลดหน้าใหม่ก่อนตรวจ
          <Button size="sm" variant="outline" className="ml-3" onClick={load}>
            โหลดฉบับล่าสุด
          </Button>
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardContent className="p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-semibold">ฉบับที่กำลังตรวจ</h2>
              {latestVersion && (
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${VERSION_STATUS_VARIANT[latestVersion.status] ?? ''}`}>
                  {VERSION_STATUS_LABELS[latestVersion.status] ?? latestVersion.status}
                </span>
              )}
            </div>
            {latestVersion ? (
              <div className="space-y-1 text-sm">
                <p>เวอร์ชัน v{latestVersion.version} — {latestVersion.filename}</p>
                <p className="text-xs text-muted-foreground">อัปโหลดเมื่อ {formatDateTime(latestVersion.createdAt)}</p>
                {latestVersion.notes && <p className="text-xs text-muted-foreground">หมายเหตุ: {latestVersion.notes}</p>}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">ไม่พบข้อมูลเวอร์ชัน</p>
            )}
            <Button size="sm" variant="outline" className="mt-3" onClick={handleDownload}>
              <Download className="mr-1 h-3.5 w-3.5" /> เปิด/ดาวน์โหลดฉบับนี้
            </Button>

            {!activeRound && latestVersion && (
              <div className="mt-4 border-t pt-4">
                <InlineEmptyState title="ยังไม่มีการส่งตรวจฉบับนี้" description="ส่งตรวจเมื่อเอกสารพร้อมให้ผู้เกี่ยวข้องอนุมัติหรือส่งกลับแก้ไข" />
                <Button size="sm" onClick={() => setShowCreateRound(true)}>
                  ส่งตรวจฉบับนี้
                </Button>
              </div>
            )}

            {latestVersion && (
              <div className="mt-4 border-t pt-4">
                {latestVersion.status === 'RETURNED_FOR_CHANGES' && (
                  <p className="mb-2 text-sm font-medium text-red-700">ฉบับนี้ถูกส่งกลับแก้ไข</p>
                )}
                <p className="mb-2 text-xs text-muted-foreground">
                  {latestVersion.status === 'APPROVED'
                    ? 'อัปโหลดฉบับใหม่ได้ตลอด — ผลตรวจของฉบับที่ผ่านแล้วจะไม่ถูกใช้กับฉบับใหม่โดยอัตโนมัติ'
                    : 'แก้ไขแล้วอัปโหลดฉบับใหม่ก่อนส่งตรวจอีกครั้ง'}
                </p>
                <input
                  className="mb-2 w-full rounded-lg border px-3 py-1.5 text-sm"
                  placeholder="หมายเหตุการแก้ไข (ถ้ามี)"
                  value={versionNotes}
                  onChange={(e) => setVersionNotes(e.target.value)}
                />
                <DocumentDropZone
                  onFile={handleUploadNewVersion}
                  loading={uploadingVersion}
                  label="ลากไฟล์ฉบับใหม่มาวาง หรือคลิกที่นี่"
                  loadingLabel="กำลังอัปโหลด..."
                />
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <h2 className="mb-3 font-semibold">สถานะการตรวจ</h2>
            {activeRound ? (
              <div className="space-y-3">
                <p className="text-xs text-muted-foreground">
                  กติกา: {activeRound.approvalRule === 'ALL' ? 'ผู้ตรวจทุกคนต้องผ่าน' : 'ผู้ตรวจคนใดคนหนึ่งผ่านก็พอ'}
                  {activeRound.scope ? ` · ขอบเขต: ${activeRound.scope}` : ''}
                </p>
                <ReviewerStatusList round={activeRound} memberNames={memberNames} />

                {activeRound.status === 'APPROVED' && (
                  <p className="rounded-lg bg-green-100 p-2 text-sm font-medium text-green-800">ผ่านการตรวจครบแล้ว</p>
                )}
                {activeRound.status === 'RETURNED' && (
                  <div className="rounded-lg bg-red-100 p-2 text-sm text-red-800">
                    <p className="font-medium">ส่งกลับแก้ไข</p>
                    {activeRound.decisions
                      .filter((d) => d.decision === 'RETURNED')
                      .map((d, i) => (
                        <p key={i} className="mt-1 text-xs">{d.reason}</p>
                      ))}
                    <p className="mt-1 text-xs">ผู้แก้ไขต้องอัปโหลดฉบับใหม่ก่อนส่งตรวจอีกครั้ง</p>
                  </div>
                )}

                {iAmReviewer && activeRound.status === 'WAITING_REVIEW' && (
                  <div className="border-t pt-3">
                    {myDecision ? (
                      <p className="rounded-lg bg-green-50 p-2 text-sm text-green-700">
                        คุณตรวจผ่านแล้ว {activeRound.decisions.filter((d) => d.decision === 'APPROVED').length < activeRound.reviewerIds.length ? '· ยังรอผู้ตรวจอื่น' : ''}
                      </p>
                    ) : showReturnBox ? (
                      <div className="space-y-2">
                        <textarea
                          className="w-full rounded-lg border px-3 py-2 text-sm"
                          rows={3}
                          placeholder="ระบุสิ่งที่ต้องแก้ไข"
                          value={returnReason}
                          onChange={(e) => setReturnReason(e.target.value)}
                        />
                        <div className="flex gap-2">
                          <Button size="sm" variant="destructive" disabled={deciding} onClick={() => handleDecision('return')}>
                            ยืนยันส่งกลับแก้ไข
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => setShowReturnBox(false)}>
                            ยกเลิก
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex gap-2">
                        <Button disabled={deciding} onClick={() => handleDecision('approve')}>
                          ผ่านการตรวจฉบับนี้
                        </Button>
                        <Button variant="outline" disabled={deciding} onClick={() => setShowReturnBox(true)}>
                          ส่งกลับแก้ไข
                        </Button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <InlineEmptyState title="ยังไม่มีรอบตรวจ" description="เมื่อส่งตรวจแล้ว สถานะของผู้ตรวจแต่ละคนจะแสดงที่นี่" />
            )}
          </CardContent>
        </Card>
      </div>

      {rounds.length > 1 && (
        <Card className="mt-6">
          <CardContent className="p-4">
            <h2 className="mb-3 font-semibold">ประวัติรอบตรวจ</h2>
            <div className="space-y-3">
              {rounds.map((round) => (
                <div key={round.id} className="rounded-lg border p-3 text-sm">
                  <div className="flex items-center justify-between">
                    <span>เวอร์ชัน v{round.documentVersion.version}</span>
                    <span className="text-xs text-muted-foreground">{formatDateTime(round.createdAt)}</span>
                  </div>
                  <ReviewerStatusList round={round} memberNames={memberNames} />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {showCreateRound && latestVersion && (
        <CreateReviewRoundDialog
          caseId={caseId}
          documentId={documentId}
          documentVersionId={latestVersion.id}
          onClose={() => setShowCreateRound(false)}
          onCreated={() => {
            setShowCreateRound(false);
            load();
          }}
        />
      )}
    </div>
  );
}

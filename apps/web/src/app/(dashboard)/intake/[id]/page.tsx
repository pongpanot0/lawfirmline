'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/auth';
import { api, IntakeItem, ApiError } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

const STATUS_LABELS: Record<string, string> = {
  RECEIVED: 'รับเรื่อง',
  ASSESSING: 'กำลังประเมิน',
  ACCEPTED: 'รับเป็นคดี',
  REJECTED: 'ปฏิเสธ',
  CONVERTED: 'แปลงเป็นคดีแล้ว',
};

const STATUS_COLOR: Record<string, string> = {
  RECEIVED: 'bg-gray-100 text-gray-700',
  ASSESSING: 'bg-blue-100 text-blue-700',
  ACCEPTED: 'bg-green-100 text-green-700',
  REJECTED: 'bg-red-100 text-red-700',
  CONVERTED: 'bg-purple-100 text-purple-700',
};

const DRAFT_NOTICE_COST = 5;

const DECISION_LABELS: Record<string, string> = {
  FILE_SUIT: 'ฟ้อง',
  DO_NOT_FILE: 'ไม่ฟ้อง',
  NEGOTIATE_FIRST: 'เจรจาก่อน',
  SEND_NOTICE: 'ออก Notice',
  COMPLAIN_TO_AUTHORITY: 'ร้องเรียน',
  PENDING: 'รอตัดสินใจ',
};

const REFERRAL_TYPE_LABELS: Record<string, string> = {
  INDIVIDUAL: 'บุคคลทั่วไป',
  LAWYER: 'ทนายความ',
  HOSPITAL: 'โรงพยาบาล',
  COMPANY: 'บริษัท',
  GOVERNMENT: 'หน่วยงานรัฐ',
  OTHER: 'อื่นๆ',
};

const REFERRAL_CHANNEL_LABELS: Record<string, string> = {
  WALK_IN: 'Walk-in',
  PHONE: 'โทรศัพท์',
  EMAIL: 'อีเมล',
  LINE: 'Line',
  REFERRAL: 'แนะนำ',
  OTHER: 'อื่นๆ',
};

const MATTER_TYPE_LABELS: Record<string, string> = {
  CIVIL: 'แพ่ง',
  CRIMINAL: 'อาญา',
  ADMINISTRATIVE: 'ปกครอง',
  MEDICAL: 'ทางการแพทย์',
  LABOR: 'แรงงาน',
  OTHER: 'อื่นๆ',
};

function formatDate(date: string | null | undefined) {
  if (!date) return '—';
  return new Date(date).toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric' });
}

function InfoRow({ label, value }: { label: string; value?: string | number | null }) {
  return (
    <div className="flex gap-2 py-1.5 border-b last:border-0">
      <span className="w-40 shrink-0 text-sm text-muted-foreground">{label}</span>
      <span className="text-sm">{value ?? '—'}</span>
    </div>
  );
}

type ModalType = 'assess' | 'decide' | 'notice' | null;

export default function IntakeDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { token, user } = useAuth();
  const router = useRouter();
  const [intake, setIntake] = useState<IntakeItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<ModalType>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  // Assess form
  const [assessNotes, setAssessNotes] = useState('');
  const [caseStrength, setCaseStrength] = useState('กลาง');

  // Decide form
  const [decision, setDecision] = useState('PENDING');
  const [decisionNotes, setDecisionNotes] = useState('');

  // Notice form
  const [noticeRecipient, setNoticeRecipient] = useState('');
  const [noticeDeadline, setNoticeDeadline] = useState('');
  const [noticeResult, setNoticeResult] = useState('');
  const [noticeContent, setNoticeContent] = useState('');
  const [noticeReviewed, setNoticeReviewed] = useState(false);
  const [drafting, setDrafting] = useState(false);

  useEffect(() => {
    if (!token || !id) return;
    setLoading(true);
    api.getIntake(token, id)
      .then(setIntake)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [token, id]);

  const reload = async () => {
    if (!token || !id) return;
    const updated = await api.getIntake(token, id);
    setIntake(updated);
  };

  const handleAssess = async () => {
    if (!token || !id) return;
    setSubmitting(true);
    setError('');
    try {
      await api.assessIntake(token, id, { assessmentNotes: assessNotes, caseStrength });
      await reload();
      setModal(null);
      setAssessNotes('');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'เกิดข้อผิดพลาด');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDecide = async () => {
    if (!token || !id) return;
    setSubmitting(true);
    setError('');
    try {
      await api.decideIntake(token, id, { decision, decisionNotes: decisionNotes || undefined });
      await reload();
      setModal(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'เกิดข้อผิดพลาด');
    } finally {
      setSubmitting(false);
    }
  };

  const handleNotice = async () => {
    if (!token || !id) return;
    if (noticeContent && !noticeReviewed) {
      setError('กรุณายืนยันว่าตรวจสอบเนื้อหาหนังสือแล้วก่อนบันทึก');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      await api.noticeIntake(token, id, {
        noticeRecipient: noticeRecipient || undefined,
        noticeDeadline: noticeDeadline || undefined,
        noticeResult: noticeResult || undefined,
        noticeContent: noticeContent || undefined,
        noticeContentReviewed: noticeContent ? noticeReviewed : undefined,
      });
      await reload();
      setModal(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'เกิดข้อผิดพลาด');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDraftNotice = async () => {
    if (!token || !id) return;
    setDrafting(true);
    setError('');
    try {
      const { content } = await api.draftNoticeIntake(token, id);
      setNoticeContent(content);
      setNoticeReviewed(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'เกิดข้อผิดพลาด');
    } finally {
      setDrafting(false);
    }
  };

  const handleConvert = async () => {
    if (!token || !id) return;
    if (!confirm('แปลงเรื่องนี้เป็นคดีใหม่?')) return;
    setSubmitting(true);
    setError('');
    try {
      const result = await api.convertIntake(token, id) as IntakeItem;
      if (result.case?.id) {
        router.push(`/cases/${result.case.id}`);
      } else {
        await reload();
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'เกิดข้อผิดพลาด');
      setSubmitting(false);
    }
  };

  if (loading) return <p className="p-8 text-center text-muted-foreground">กำลังโหลด...</p>;
  if (!intake) return <p className="p-8 text-center text-muted-foreground">ไม่พบข้อมูล</p>;

  const STEPS = ['RECEIVED', 'ASSESSING', 'ACCEPTED'];
  const currentStep = STEPS.indexOf(intake.status);

  return (
    <div className="w-full space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">
            {intake.title || intake.matterType || intake.clientName || intake.client?.name || '(ไม่ระบุชื่อ)'}
          </h1>
          <p className="text-sm text-muted-foreground">{intake.referralName || intake.clientName || intake.client?.name || '—'} · รับเมื่อ {formatDate(intake.receivedDate)}</p>
        </div>
        <span className={`rounded-full px-3 py-1 text-sm font-medium ${STATUS_COLOR[intake.status] ?? 'bg-gray-100 text-gray-700'}`}>
          {STATUS_LABELS[intake.status] ?? intake.status}
        </span>
      </div>

      {/* Status timeline */}
      {intake.status !== 'REJECTED' && intake.status !== 'CONVERTED' && (
        <div className="flex items-center gap-2">
          {STEPS.map((s, i) => (
            <div key={s} className="flex items-center gap-2">
              <div className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${i <= currentStep ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>
                {i + 1}
              </div>
              <span className={`text-xs ${i <= currentStep ? 'text-foreground font-medium' : 'text-muted-foreground'}`}>
                {STATUS_LABELS[s]}
              </span>
              {i < STEPS.length - 1 && <div className={`h-px w-8 ${i < currentStep ? 'bg-primary' : 'bg-muted'}`} />}
            </div>
          ))}
        </div>
      )}

      {/* Action buttons */}
      <div className="flex flex-wrap gap-2">
        {intake.status === 'RECEIVED' && (
          <Button onClick={() => setModal('assess')}>บันทึกผลการประเมิน</Button>
        )}
        {intake.status === 'ASSESSING' && (
          <Button onClick={() => setModal('decide')}>บันทึกการตัดสินใจ</Button>
        )}
        {intake.status === 'ACCEPTED' && (
          <>
            <Button variant="outline" onClick={() => setModal('notice')}>ออก Notice</Button>
            <Button onClick={handleConvert} disabled={submitting}>แปลงเป็นคดี</Button>
          </>
        )}
        {intake.status === 'CONVERTED' && intake.case && (
          <Link href={`/cases/${intake.case.id}`}>
            <Button variant="outline">ดูคดี {intake.case.ownRef}</Button>
          </Link>
        )}
      </div>

      {error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>
      )}

      {/* Info cards */}
      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-base">ผู้ส่งเรื่อง</CardTitle></CardHeader>
          <CardContent className="space-y-0">
            <InfoRow label="ประเภท" value={REFERRAL_TYPE_LABELS[intake.referralType] ?? intake.referralType} />
            <InfoRow label="ช่องทาง" value={REFERRAL_CHANNEL_LABELS[intake.referralChannel] ?? intake.referralChannel} />
            <InfoRow label="ชื่อ" value={intake.referralName} />
            <InfoRow label="รับโดย" value={intake.receivedBy ? `${intake.receivedBy.firstName} ${intake.receivedBy.lastName}` : undefined} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">ลูกค้า</CardTitle></CardHeader>
          <CardContent className="space-y-0">
            <InfoRow label="ลูกค้า" value={intake.client?.name ?? intake.clientName} />
          </CardContent>
        </Card>

        <Card className="sm:col-span-2">
          <CardHeader><CardTitle className="text-base">รายละเอียดเรื่อง</CardTitle></CardHeader>
          <CardContent className="space-y-0">
            <InfoRow label="ประเภทเรื่อง" value={intake.matterType ? (MATTER_TYPE_LABELS[intake.matterType] ?? intake.matterType) : undefined} />
            <InfoRow label="คู่กรณี" value={intake.opposingParty} />
            <InfoRow label="วันเกิดเหตุ" value={formatDate(intake.incidentDate)} />
            <InfoRow label="ความเสียหาย (บาท)" value={intake.estimatedDamage != null ? intake.estimatedDamage.toLocaleString('th-TH') : undefined} />
            <InfoRow label="รายละเอียด" value={intake.description} />
          </CardContent>
        </Card>

        {(intake.assessmentNotes || intake.caseStrength || intake.assessor) && (
          <Card>
            <CardHeader><CardTitle className="text-base">ผลการประเมิน</CardTitle></CardHeader>
            <CardContent className="space-y-0">
              <InfoRow label="ความแข็งแกร่งของคดี" value={intake.caseStrength} />
              <InfoRow label="หมายเหตุ" value={intake.assessmentNotes} />
              <InfoRow label="ผู้ประเมิน" value={intake.assessor ? `${intake.assessor.firstName} ${intake.assessor.lastName}` : undefined} />
            </CardContent>
          </Card>
        )}

        {(intake.decision !== 'PENDING' || intake.decisionNotes) && (
          <Card>
            <CardHeader><CardTitle className="text-base">การตัดสินใจ</CardTitle></CardHeader>
            <CardContent className="space-y-0">
              <InfoRow label="การตัดสินใจ" value={DECISION_LABELS[intake.decision] ?? intake.decision} />
              <InfoRow label="หมายเหตุ" value={intake.decisionNotes} />
            </CardContent>
          </Card>
        )}

        {intake.noticeIssuedAt && (
          <Card>
            <CardHeader><CardTitle className="text-base">Notice</CardTitle></CardHeader>
            <CardContent className="space-y-0">
              <InfoRow label="ออกเมื่อ" value={formatDate(intake.noticeIssuedAt)} />
              <InfoRow label="ผู้รับ" value={intake.noticeRecipient} />
              <InfoRow label="กำหนดตอบ" value={formatDate(intake.noticeDeadline)} />
              <InfoRow label="ผล" value={intake.noticeResult} />
              {intake.noticeContent && (
                <div className="pt-2">
                  <p className="text-sm text-muted-foreground">เนื้อหาหนังสือ</p>
                  <p className="whitespace-pre-wrap text-sm">{intake.noticeContent}</p>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      {/* Modals */}
      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl bg-background p-6 shadow-xl">
            {modal === 'assess' && (
              <>
                <h2 className="mb-4 text-lg font-semibold">บันทึกผลการประเมิน</h2>
                <div className="space-y-3">
                  <div>
                    <label className="block text-sm font-medium">ความแข็งแกร่งของคดี</label>
                    <select
                      value={caseStrength}
                      onChange={(e) => setCaseStrength(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                    >
                      <option value="สูง">สูง</option>
                      <option value="กลาง">กลาง</option>
                      <option value="ต่ำ">ต่ำ</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium">หมายเหตุการประเมิน</label>
                    <textarea
                      value={assessNotes}
                      onChange={(e) => setAssessNotes(e.target.value)}
                      rows={3}
                      className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm resize-none"
                    />
                  </div>
                </div>
                <div className="mt-4 flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setModal(null)}>ยกเลิก</Button>
                  <Button onClick={handleAssess} disabled={submitting}>
                    {submitting ? 'กำลังบันทึก...' : 'บันทึก'}
                  </Button>
                </div>
              </>
            )}

            {modal === 'decide' && (
              <>
                <h2 className="mb-4 text-lg font-semibold">บันทึกการตัดสินใจ</h2>
                <div className="space-y-3">
                  <div>
                    <label className="block text-sm font-medium">การตัดสินใจ</label>
                    <select
                      value={decision}
                      onChange={(e) => setDecision(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                    >
                      {Object.entries(DECISION_LABELS).map(([k, v]) => (
                        <option key={k} value={k}>{v}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium">หมายเหตุ</label>
                    <textarea
                      value={decisionNotes}
                      onChange={(e) => setDecisionNotes(e.target.value)}
                      rows={3}
                      className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm resize-none"
                    />
                  </div>
                </div>
                <div className="mt-4 flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setModal(null)}>ยกเลิก</Button>
                  <Button onClick={handleDecide} disabled={submitting}>
                    {submitting ? 'กำลังบันทึก...' : 'บันทึก'}
                  </Button>
                </div>
              </>
            )}

            {modal === 'notice' && (
              <>
                <h2 className="mb-4 text-lg font-semibold">ออก Notice</h2>
                <div className="space-y-3">
                  <div>
                    <label className="block text-sm font-medium">ผู้รับ Notice</label>
                    <input
                      value={noticeRecipient}
                      onChange={(e) => setNoticeRecipient(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                      placeholder="ชื่อผู้รับ"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium">กำหนดตอบ</label>
                    <input
                      type="date"
                      value={noticeDeadline}
                      onChange={(e) => setNoticeDeadline(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium">ผล</label>
                    <input
                      value={noticeResult}
                      onChange={(e) => setNoticeResult(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                      placeholder="ผลที่ได้รับ (ถ้ามี)"
                    />
                  </div>
                  <div>
                    <div className="flex items-center justify-between">
                      <label className="block text-sm font-medium">เนื้อหาหนังสือ</label>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={handleDraftNotice}
                        disabled={drafting || (user?.aiCredits ?? 0) < DRAFT_NOTICE_COST}
                        title={
                          (user?.aiCredits ?? 0) < DRAFT_NOTICE_COST
                            ? `credit ไม่พอ (ต้องใช้ ${DRAFT_NOTICE_COST}, เหลือ ${user?.aiCredits ?? 0})`
                            : undefined
                        }
                      >
                        {drafting
                          ? 'กำลังร่าง...'
                          : `ให้ AI ช่วยร่าง (ใช้ ${DRAFT_NOTICE_COST} credit, เหลือ ${user?.aiCredits ?? 0})`}
                      </Button>
                    </div>
                    <textarea
                      value={noticeContent}
                      onChange={(e) => {
                        setNoticeContent(e.target.value);
                        setNoticeReviewed(false);
                      }}
                      rows={10}
                      className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                      placeholder="กด 'ให้ AI ช่วยร่าง' เพื่อให้ร่างจากข้อมูลของเรื่องนี้ แล้วตรวจสอบ/แก้ไขก่อนบันทึก"
                    />
                    <p className="mt-1 text-xs text-muted-foreground">
                      AI ร่างให้เท่านั้น ต้องตรวจสอบและแก้ไขให้ถูกต้องก่อนบันทึก/ส่งจริงทุกครั้ง
                    </p>
                    {noticeContent && (
                      <label className="mt-2 flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={noticeReviewed}
                          onChange={(e) => setNoticeReviewed(e.target.checked)}
                        />
                        ฉันตรวจสอบเนื้อหาหนังสือนี้แล้วและยืนยันว่าถูกต้อง
                      </label>
                    )}
                  </div>
                </div>
                <div className="mt-4 flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setModal(null)}>ยกเลิก</Button>
                  <Button
                    onClick={handleNotice}
                    disabled={submitting || (!!noticeContent && !noticeReviewed)}
                  >
                    {submitting ? 'กำลังบันทึก...' : 'บันทึก'}
                  </Button>
                </div>
              </>
            )}

            {error && (
              <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

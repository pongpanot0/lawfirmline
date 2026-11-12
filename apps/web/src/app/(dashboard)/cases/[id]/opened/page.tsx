'use client';
import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { ArrowRight, Check, Copy } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { api, type CaseDetail, type CaseJourney, type StageTaskProposal } from '@/lib/api';
import styles from '@/components/case-page/v2.module.css';
import { PageLoading } from '@/components/ui/misc';
import { LoadFailed } from '@/components/ui/LoadFailed';

export default function OpenedPage() { return <Suspense fallback={<PageLoading title="กำลังโหลดคดี" />}><OpenedContent /></Suspense>; }
function OpenedContent() {
  const { id } = useParams<{ id: string }>();
  const { token, user } = useAuth();
  const sop = useSearchParams().get('sop');
  const [data, setData] = useState<{ legalCase: CaseDetail; journey: CaseJourney; proposals: StageTaskProposal[] } | null>(null);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!token) return;
    setError(false);
    Promise.all([api.getCase(token, id), api.getCaseJourney(token, id)]).then(async ([legalCase, journey]) => {
      const proposals = legalCase.stage ? await api.getStageTaskProposals(token, id, legalCase.stage) : [];
      setData({ legalCase, journey, proposals });
    }).catch(() => setError(true));
  }, [token, id, retry]);
  if (error) return <LoadFailed onRetry={() => setRetry((value) => value + 1)} />;
  if (!data) return <PageLoading title="กำลังโหลดคดี" />;
  const { legalCase, journey, proposals } = data;
  const date = (value: string, time = false) => new Intl.DateTimeFormat('th-TH', { dateStyle: 'medium', timeZone: 'Asia/Bangkok', ...(time ? { timeStyle: 'short' } : {}) }).format(new Date(value));
  const completed: string[] = [];
  const conflict = journey.preLitSteps.find((step) => step.key === 'CONFLICT');
  if (conflict?.state === 'done') completed.push('ตรวจสอบผลประโยชน์ขัดกันแล้ว');
  if (legalCase.limitationDeadline) completed.push(`ตั้งแจ้งเตือนอายุความ (ครบ ${date(legalCase.limitationDeadline)})`);
  // The API notifies the lead lawyer whenever they are not the person who opened the case.
  if (legalCase.leadLawyer && legalCase.leadLawyer.id !== user?.id) completed.push(`แจ้งคุณ${legalCase.leadLawyer.firstName} (เจ้าของคดี) แล้ว`);
  for (const event of legalCase.calendarEvents ?? []) if (event.type === 'COURT_DATE') completed.push(`นัดศาล ${event.title} · ${date(event.startAt, true)}`);
  const next: string[] = [];
  if (proposals.length) next.push(`สร้างงานตามชุดงานอัตโนมัติ (${proposals.length} งาน)`);
  else if (sop) next.push('เพิ่มงานจากชุดงานที่เลือกตอนเปิดคดี');
  if (journey.infoMissing.length) next.push(`เติมข้อมูลคดีให้ครบ (${journey.infoMissing.join(', ')})`);
  if (journey.preLitNext && !next.includes(journey.preLitNext.text)) next.push(journey.preLitNext.text);
  if (!next.length && journey.next) next.push(journey.next.text);
  const proposalSop = sop || proposals[0]?.routineSource?.releaseId;
  // A task set picked on the create form goes with the first step even before any stage proposal exists.
  const firstHref = proposals.length || sop ? `/cases/${id}?tab=tasks${proposalSop ? `&sop=${encodeURIComponent(proposalSop)}` : ''}` : `/cases/${id}`;
  return <div className="mx-auto max-w-2xl px-6 py-10 text-center">
    <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-[#e6f3ec] text-3xl text-[#227052]"><Check aria-hidden="true" className="h-[1.1em] w-[1.1em]" /></div>
    <h1 className="font-display mt-3 text-[32px]">เปิดคดีสำเร็จ</h1>
    <p className="mt-1">เลขอ้างอิงสำนักงาน <b className="font-mono">{legalCase.ownRef}</b> <button type="button" className={`${styles.btn} ${styles.ghost} min-w-11 py-1 focus-visible:ring-2 focus-visible:ring-ring`} aria-label="คัดลอกเลขอ้างอิงสำนักงาน" onClick={() => void navigator.clipboard.writeText(legalCase.ownRef).then(() => setCopied(true))}><Copy aria-hidden="true" className="h-[1.1em] w-[1.1em]" /></button>{copied && <span>คัดลอกแล้ว</span>}</p>
    {completed.length > 0 && <section className={`${styles.card} mt-6 p-5 text-left shadow-[0_4px_16px_rgba(20,46,67,.06)]`}><h2 className="font-bold">สิ่งที่ระบบทำให้แล้ว</h2><ul className="mt-3 space-y-2">{completed.map((item) => <li key={item} className="flex items-start gap-1 text-[#227052]"><Check aria-hidden="true" className="mt-1 h-[1.1em] w-[1.1em] shrink-0" /><span className="text-foreground">{item}</span></li>)}</ul></section>}
    <section className={`${styles.card} mt-4 p-5 text-left shadow-[0_4px_16px_rgba(20,46,67,.06)]`}><h2 className="font-bold">ขั้นต่อไปของคดีนี้</h2>{next.length ? <ol className="mt-3 space-y-2">{next.map((item, index) => <li key={item} className={`rounded-lg border px-4 py-3 ${index === 0 ? 'border-[#c9d6e3] bg-[#f3f7fb]' : 'border-border'}`}><b>{index + 1}</b> {item}</li>)}</ol> : <p className={styles.hint}>ตรวจรายละเอียดคดีเพื่อดำเนินการต่อ</p>}</section>
    <div className="mt-6 grid gap-3"><Link className={`${styles.btn} ${styles.primary}`} href={firstHref}>เริ่มขั้นที่ 1 <ArrowRight aria-hidden="true" className="h-[1.1em] w-[1.1em]" /></Link><p className={`${styles.hint} -mt-1`}>{proposals.length ? 'เปิดหน้าคดีพร้อมรายการงานจากชุดงานอัตโนมัติให้เลือกสร้าง' : 'เปิดหน้าคดีเพื่อดำเนินการต่อ'}</p><Link className={`${styles.btn} ${styles.outline}`} href={`/cases/${id}`}>ไปหน้าคดี</Link>{sop && !proposals.length && <Link href={`/cases/${id}?tab=tasks&sop=${encodeURIComponent(sop)}`} className="min-h-11 text-sm underline">ดูชุดงานที่เลือก</Link>}{legalCase.cargoClaim && <Link href={`/cases/${id}?tab=cargo-claim`} className="min-h-11 text-sm underline">ไปยัง Cargo Claim</Link>}<Link href="/cases/new" className="min-h-11 text-sm underline">เปิดคดีใหม่อีกคดี</Link><Link href="/cases" className="min-h-11 text-sm underline">กลับไปหน้ารวมคดี</Link></div>
  </div>;
}

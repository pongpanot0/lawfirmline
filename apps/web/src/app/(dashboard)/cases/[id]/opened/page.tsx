'use client';
import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { ArrowLeft, ArrowRight, Check, CheckCircle2, Copy } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { api, type CaseDetail, type CaseJourney, type StageTaskProposal } from '@/lib/api';
import { buttonVariants } from '@/components/ui/button';
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
  if (proposals.length) next.push(`สร้างงานตาม SOP (${proposals.length} งาน)`);
  if (journey.infoMissing.length) next.push(`เติมข้อมูลคดีให้ครบ (${journey.infoMissing.join(', ')})`);
  if (journey.preLitNext && !next.includes(journey.preLitNext.text)) next.push(journey.preLitNext.text);
  if (!next.length && journey.next) next.push(journey.next.text);
  const proposalSop = sop || proposals[0]?.routineSource?.releaseId;
  const firstHref = proposals.length ? `/cases/${id}?tab=tasks${proposalSop ? `&sop=${encodeURIComponent(proposalSop)}` : ''}` : `/cases/${id}`;
  return <main className="mx-auto max-w-2xl space-y-5 pb-10"><Link href="/cases" className="inline-flex min-h-11 items-center text-sm text-muted-foreground"><ArrowLeft aria-hidden="true" className="mr-2 h-4 w-4" />กลับไปหน้ารวมคดี</Link><div className="space-y-3 text-center"><CheckCircle2 aria-hidden="true" className="mx-auto h-16 w-16 text-success" /><h1 className="text-2xl font-semibold">เปิดคดีสำเร็จ</h1><div className="inline-flex items-center gap-2 rounded border bg-card px-3 py-2 text-sm">เลขอ้างอิงสำนักงาน <strong>{legalCase.ownRef}</strong><button type="button" className="inline-flex min-h-11 min-w-11 items-center justify-center focus-visible:ring-2 focus-visible:ring-ring" aria-label="คัดลอกเลขอ้างอิงสำนักงาน" onClick={() => void navigator.clipboard.writeText(legalCase.ownRef).then(() => setCopied(true))}><Copy className="h-4 w-4" /></button>{copied && <span>คัดลอกแล้ว</span>}</div><p className="font-semibold">{legalCase.title}</p><p className="text-sm text-muted-foreground">เปิดเมื่อ {date(legalCase.openedAt, true)}</p></div>
    {completed.length > 0 && <section className="rounded-lg border bg-card p-5"><h2 className="border-b pb-3 font-semibold">ระบบดำเนินการให้แล้ว</h2><ul className="space-y-3 pt-4">{completed.map((item) => <li key={item} className="flex items-start gap-2"><Check aria-hidden="true" className="mt-1 h-4 w-4 shrink-0 text-success" /><span>{item}</span></li>)}</ul></section>}
    <section className="rounded-lg border bg-card p-5"><h2 className="border-b pb-3 font-semibold">ขั้นต่อไปของคดีนี้</h2>{next.length ? <ol className="space-y-3 pt-4">{next.map((item, index) => <li key={item} className="rounded-lg border p-3"><span className="mr-3 font-semibold">{index + 1}</span>{item}</li>)}</ol> : <p className="pt-4 text-sm text-muted-foreground">ตรวจรายละเอียดคดีเพื่อดำเนินการต่อ</p>}</section>
    <div className="grid gap-3"><Link className={buttonVariants()} href={firstHref}>เริ่มขั้นที่ 1 <ArrowRight aria-hidden="true" className="ml-2 h-4 w-4" /></Link><p className="-mt-1 text-center text-sm text-muted-foreground">{proposals.length ? 'เปิดหน้าคดีพร้อมรายการงาน SOP ให้เลือกสร้าง' : 'เปิดหน้าคดีเพื่อดำเนินการต่อ'}</p><Link className={buttonVariants({ variant: 'outline' })} href={`/cases/${id}`}>ไปหน้าคดี</Link>{sop && !proposals.length && <Link href={`/cases/${id}?tab=tasks&sop=${encodeURIComponent(sop)}`} className="min-h-11 text-center text-sm text-muted-foreground underline">ดู SOP ที่เลือก</Link>}{legalCase.cargoClaim && <Link href={`/cases/${id}?tab=cargo-claim`} className="min-h-11 text-center text-sm text-muted-foreground underline">ไปยัง Cargo Claim</Link>}<Link href="/cases/new" className="min-h-11 text-center text-sm text-muted-foreground underline">เปิดคดีใหม่อีกคดี</Link></div></main>;
}

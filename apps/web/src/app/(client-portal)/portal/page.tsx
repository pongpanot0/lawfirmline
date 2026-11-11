'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { CalendarDays, ChevronRight, FileText, MessageSquare, Clock, Send } from 'lucide-react';
import { usePortalAuth } from '@/lib/portal-auth';
import { portalApi, PortalCaseSummary, PortalDashboardSummary } from '@/lib/portal-api';
import { buttonVariants } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/misc';
import { LoadFailed } from '@/components/ui/LoadFailed';
import { PortalShell } from '@/components/layout/PortalShell';
import { PortalCaseCard } from '@/components/portal/PortalCaseCard';
import { formatDateTime } from '@/lib/utils';

export default function PortalDashboardPage() {
  const { contact, token, loading } = usePortalAuth();
  const router = useRouter();
  const [cases, setCases] = useState<PortalCaseSummary[]>([]);
  const [summary, setSummary] = useState<PortalDashboardSummary | null>(null);
  const [loadingData, setLoadingData] = useState(true);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => { if (!loading && !contact) router.replace('/portal/login'); }, [loading, contact, router]);
  useEffect(() => {
    if (!token) return;
    setLoadingData(true); setFailed(false);
    Promise.all([portalApi.getCases(token), portalApi.getDashboardSummary(token)]).then(([c, s]) => { setCases(c); setSummary(s); }).catch(() => setFailed(true)).finally(() => setLoadingData(false));
  }, [token, attempt]);
  if (loading || !contact) return null;
  const next = cases.filter(c => c.nextHearing && new Date(c.nextHearing.startAt).getTime() >= Date.now()).sort((a, b) => new Date(a.nextHearing!.startAt).getTime() - new Date(b.nextHearing!.startAt).getTime())[0];
  const highlight = 'rounded-xl border border-l-4 border-amber-200 border-l-[var(--color-brass)] bg-[var(--operations-highlight)] p-5 shadow-sm sm:p-7';
  return <PortalShell>
    <h1 className="font-display text-2xl font-semibold sm:text-3xl">สวัสดี คุณ{/^[A-Za-z]/.test(contact.name.trim()) ? ' ' : ''}{contact.name}</h1>
    <p className="mt-1 text-muted-foreground">{!loadingData && !cases.length ? 'ที่นี่คุณจะเห็นคดี นัดศาล และเอกสารจากสำนักงาน' : 'สรุปคดีและสิ่งที่ต้องทำต่อของคุณ'}</p>
    {failed ? <LoadFailed onRetry={() => setAttempt(n => n + 1)} /> : loadingData ? <Skeleton className="mt-8 h-48 w-full" /> : !cases.length ? <div className="mt-8 max-w-3xl space-y-5">
      <section className={highlight}><Send className="mb-5 h-8 w-8 text-amber-700" aria-hidden /><h2 className="font-display text-2xl font-semibold">ยังไม่มีคดี — ส่งเรื่องแรกให้สำนักงานดู</h2><p className="mt-3 text-muted-foreground">เล่าเรื่องสั้น ๆ และแนบเอกสารที่มี ทนายจะอ่านแล้วติดต่อกลับภายใน 1 วันทำการ</p><Link href="/portal/intake/new" className={buttonVariants({ className: 'mt-5 w-full' })}>ส่งเรื่องใหม่ <Send className="ml-2 h-4 w-4" aria-hidden /></Link><p className="mt-2 text-center text-xs text-muted-foreground">กดเพื่อเปิดแบบฟอร์มส่งเรื่อง</p></section>
      <section className="rounded-xl border bg-card p-5"><h2 className="font-display text-xl font-semibold">สิ่งที่จะเกิดขึ้นหลังส่งเรื่อง</h2><ol className="mt-4 space-y-4 border-t pt-4">{['ส่งเรื่อง|คุณเล่าเรื่องและแนบเอกสาร', 'สำนักงานตรวจ|ทนายอ่านและติดต่อกลับ', 'รับดำเนินการ|เรื่องกลายเป็นคดี ติดตามได้ที่นี่'].map((s,i) => { const [a,b] = s.split('|'); return <li key={a} className="flex gap-4"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted font-semibold">{i+1}</span><div><p className="font-semibold">{a}</p><p className="text-sm text-muted-foreground">{b}</p></div></li>; })}</ol></section>
    </div> : <div className="mt-8 grid items-start gap-5 lg:grid-cols-[2fr_1fr]">
      <div className="space-y-6">{next?.nextHearing && <section className={highlight}><p className="flex items-center gap-2 text-sm font-semibold text-amber-700"><CalendarDays className="h-4 w-4" aria-hidden />ต่อไป</p><h2 className="mt-3 text-xl font-semibold">{next.nextHearing.title}{next.courtName ? ` · ${next.courtName}` : ''}</h2><p className="mt-2 text-lg font-semibold">{formatDateTime(next.nextHearing.startAt)}</p><p className="mt-2 text-sm text-muted-foreground">{next.ownRef}</p><div className="mt-5 border-t border-amber-200 pt-4"><Link href={`/portal/cases/${next.id}`} className={buttonVariants({ className: 'w-full sm:w-auto' })}>ดูรายละเอียดนัด</Link><p className="mt-2 text-center text-xs text-muted-foreground sm:text-left">กดเพื่อดูรายละเอียดนัด</p></div></section>}
      <section><div className="mb-3 flex items-center justify-between"><h2 className="text-lg font-semibold">คดีของฉัน ({cases.length})</h2><Link href="/portal/operations" className="flex min-h-11 items-center text-sm font-medium">ดูทั้งหมด</Link></div><div className="space-y-3">{cases.slice(0,3).map(c => <PortalCaseCard key={c.id} item={c} />)}</div></section></div>
      {summary && <div className="divide-y overflow-hidden rounded-xl border bg-card shadow-sm">{[{ icon: FileText, label: 'เอกสารใหม่จากสำนักงาน', count: summary.pendingDocuments, href: summary.recentDocuments[0] ? `/portal/cases/${summary.recentDocuments[0].caseId}` : '/portal/operations' }, { icon: MessageSquare, label: 'ข้อความใหม่จากทนาย', count: summary.unreadMessages, href: '/portal/operations' }, { icon: Clock, label: 'กิจกรรมล่าสุด', count: null, href: summary.recentActivity[0] ? `/portal/cases/${summary.recentActivity[0].caseId}` : '/portal/operations' }].map(({icon: Icon,label,count,href}) => <Link href={href} key={label} className="flex min-h-16 items-center gap-4 p-4"><Icon className="h-5 w-5" aria-hidden /><span className="flex-1 font-medium">{label}</span>{count !== null && <span className="rounded-full bg-muted px-2 text-sm">{count}</span>}<ChevronRight className="h-4 w-4 text-muted-foreground" aria-hidden /></Link>)}</div>}
    </div>}
  </PortalShell>;
}

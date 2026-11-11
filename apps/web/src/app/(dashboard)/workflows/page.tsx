'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { AlertTriangle } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { api, type WorkflowPipelineRun } from '@/lib/api';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { PageHeader } from '@/components/samnuan/PageHeader';
import { EmptyState, Skeleton } from '@/components/ui/misc';
import { LoadFailed } from '@/components/ui/LoadFailed';
import { WorkflowTemplates } from '@/components/workflows/WorkflowTemplates';
import { shortThaiDate } from '@/components/workflows/workflow-ui';

export default function WorkflowsPage() {
  return <Suspense><WorkflowsContent /></Suspense>;
}

function WorkflowsContent() {
  const { token, user } = useAuth();
  if (!token || !user) return null;
  return <div className="mx-auto max-w-6xl space-y-6 pb-24">
    <PageHeader title="สายงานส่งต่อ" description="งานที่ส่งต่อกันเป็นขั้น ๆ ในแต่ละคดี ดูว่าขั้นไหนค้างและต้องตามใคร" actions={<Link href="/sops?tab=flows" className="text-sm text-primary hover:underline" title="แก้ขั้นตอนของแม่แบบ">จัดการแม่แบบ</Link>} />
    <Pipeline token={token} />
  </div>;
}

function Pipeline({ token }: { token: string }) {
  const [runs, setRuns] = useState<WorkflowPipelineRun[] | null>(null);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  useEffect(() => {
    setError('');
    api.getWorkflowRuns(token, 'ACTIVE').then(setRuns).catch((e) => setError(e.message));
  }, [token, reload]);

  if (error) return <LoadFailed message={error} onRetry={() => setReload((n) => n + 1)} />;
  if (!runs) return <div role="status" aria-label="กำลังโหลดสายงาน" className="space-y-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-28 w-full rounded-lg" />)}</div>;
  if (!runs.length) return <EmptyState title="ไม่มีสายงานที่กำลังเดิน" description="เริ่มสายงานได้จากแท็บงานในหน้าคดี" action={<Link href="/cases" className="inline-flex min-h-11 items-center text-sm font-medium text-primary hover:underline">ไปที่คดี</Link>} />;

  // Late or overdue first: that is what the owner opens this page for.
  const sorted = [...runs].sort((a, b) => (b.lateByDays + (b.currentStep?.overdueDays ?? 0)) - (a.lateByDays + (a.currentStep?.overdueDays ?? 0)));
  const urgent = sorted.filter(run => run.lateByDays > 0 || (run.currentStep?.overdueDays ?? 0) > 0 || (run.currentStep?.dueDate && new Date(run.currentStep.dueDate).toDateString() === new Date().toDateString()));
  const normal = sorted.filter(run => !urgent.includes(run));
  return (
    <div className="space-y-6">
      {[{ title: 'ต้องตามวันนี้', items: urgent, primary: true }, { title: 'กำลังเดินตามแผน', items: normal, primary: false }].map(group => <section key={group.title} className={group.primary ? 'space-y-3 rounded-xl border-l-4 border-[var(--color-brass)] bg-[var(--operations-highlight)] p-5' : 'space-y-3 rounded-xl border bg-card p-5'}><h2 className="text-lg font-semibold">{group.title} ({group.items.length})</h2>
      {group.items.map((run) => {
        const step = run.currentStep;
        return (
          <article key={run.id} className="rounded-lg border bg-card p-4">
            <div className="flex flex-wrap items-center gap-2">
              <Link href={`/cases/${run.case.id}?tab=tasks`} className="font-medium text-primary hover:underline">{run.case.ownRef}</Link>
              <span className="font-medium">{run.name}</span>
              <span className="text-xs tabular-nums text-muted-foreground">{run.stepsDone}/{run.stepsTotal} ขั้นตอน</span>
              {run.lateByDays > 0 && <Badge variant="destructive"><AlertTriangle className="mr-1 h-3.5 w-3.5" aria-hidden />ช้ากว่าที่สัญญา {run.lateByDays} วัน</Badge>}
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden>
              <div className="h-full bg-primary" style={{ width: `${(run.stepsDone / Math.max(run.stepsTotal, 1)) * 100}%` }} />
            </div>
            {step && (
              <p className="mt-2 text-sm">
                ขั้น {step.index + 1}: <span className="font-medium">{step.title}</span> · {step.assignee?.name ?? 'ยังไม่มีผู้รับ'} · กำหนด {shortThaiDate(step.dueDate)}
                {step.overdueDays > 0 && <span className="ml-1 font-medium text-destructive">เลยกำหนด {step.overdueDays} วัน</span>}
              </p>
            )}
            <p className="mt-1 text-xs text-muted-foreground">
              คาดว่าจะเสร็จ {shortThaiDate(run.projectedFinish)}{run.promisedAt ? ` · สัญญาลูกความ ${shortThaiDate(run.promisedAt)}` : ''}
            </p>
          </article>
        );
      })}</section>)}
    </div>
  );
}

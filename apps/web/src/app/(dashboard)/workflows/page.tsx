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
  const searchParams = useSearchParams();
  const [tab, setTab] = useState(searchParams.get('tab') === 'templates' ? 'templates' : 'pipeline');
  if (!token || !user) return null;
  const canEdit = user.firmRole === 'OWNER' || user.firmRole === 'SENIOR_LAWYER';

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader title="สายงาน" description="งานที่ส่งต่อกันเป็นทอด อยู่ขั้นไหน ค้างที่ใคร และส่งลูกความทันไหม" />
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="pipeline">กำลังเดิน</TabsTrigger>
          <TabsTrigger value="templates">แม่แบบ</TabsTrigger>
        </TabsList>
        <TabsContent value="pipeline" className="mt-6"><Pipeline token={token} /></TabsContent>
        <TabsContent value="templates" className="mt-6"><WorkflowTemplates token={token} canEdit={canEdit} /></TabsContent>
      </Tabs>
    </div>
  );
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
  return (
    <div className="space-y-3">
      {sorted.map((run) => {
        const step = run.currentStep;
        return (
          <article key={run.id} className="rounded-lg border bg-card p-4">
            <div className="flex flex-wrap items-center gap-2">
              <Link href={`/cases/${run.case.id}?tab=tasks`} className="font-medium text-primary hover:underline">{run.case.ownRef}</Link>
              <span className="font-medium">{run.name}</span>
              <span className="text-xs tabular-nums text-muted-foreground">{run.stepsDone}/{run.stepsTotal} ขั้น</span>
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
      })}
    </div>
  );
}

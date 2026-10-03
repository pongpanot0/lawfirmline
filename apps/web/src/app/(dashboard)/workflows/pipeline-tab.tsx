'use client';

import { useEffect, useState } from 'react';
import { api, WorkflowRun } from '@/lib/api';
import Link from 'next/link';
import { AlertCircle } from 'lucide-react';

interface PipelineTabProps {
  token: string;
  th: boolean;
}

export function PipelineTab({ token, th }: PipelineTabProps) {
  const [runs, setRuns] = useState<WorkflowRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    api.getWorkflowRuns(token, 'ACTIVE')
      .then(setRuns)
      .catch(e => setError(e instanceof Error ? e.message : 'Failed to load runs'))
      .finally(() => setLoading(false));
  }, [token]);

  if (loading) return <p className="text-sm text-muted-foreground">{th ? 'กำลังโหลด…' : 'Loading…'}</p>;
  if (error) return <p className="text-sm text-destructive">{error}</p>;

  return (
    <div className="space-y-4">
      {runs.length === 0 ? (
        <p className="rounded-lg border bg-card p-6 text-center text-sm text-muted-foreground">{th ? 'ไม่มีสายงานที่กำลังเดิน' : 'No active workflows'}</p>
      ) : (
        <div className="space-y-3">
          {runs.map(run => (
            <Link key={run.id} href={`/cases/${run.case?.id}`} className="block">
              <div className="rounded-lg border bg-card p-4 hover:border-primary/50 hover:bg-primary/5 transition-colors">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <h3 className="font-semibold text-sm">{run.name}</h3>
                    <p className="text-xs text-muted-foreground">{run.case?.ownRef} · {run.case?.title}</p>
                    {run.currentStep && (
                      <p className="mt-2 text-xs">
                        {th ? 'ขั้นที่ ' : 'Step '}
                        {run.currentStep.index + 1}: {run.currentStep.title}
                        {run.currentStep.assignee && ` · ${run.currentStep.assignee.name}`}
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground mt-1">
                      {run.stepsDone}/{run.stepsTotal} {th ? 'ขั้นตอน' : 'steps'} · {run.currentStep?.dueDate && `due ${new Date(run.currentStep.dueDate).toLocaleDateString(th ? 'th-TH' : 'en-US')}`}
                    </p>
                  </div>
                  {run.lateByDays && run.lateByDays > 0 && (
                    <div className="flex items-center gap-1 text-destructive text-xs">
                      <AlertCircle className="h-4 w-4" />
                      {run.lateByDays} {th ? 'วนล่าช้า' : 'days late'}
                    </div>
                  )}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

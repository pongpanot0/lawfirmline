'use client';

import { Suspense, useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { api, WorkflowTemplate, WorkflowRun } from '@/lib/api';
import { useLocale } from '@/components/landing/LocaleProvider';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { Plus, AlertCircle } from 'lucide-react';

export default function WorkflowsPage() {
  return <Suspense><WorkflowsContent /></Suspense>;
}

function WorkflowsContent() {
  const { token, user } = useAuth();
  const { locale } = useLocale();
  const [activeTab, setActiveTab] = useState('pipeline');
  const th = locale === 'th';

  if (!token || !user) return null;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">{th ? 'สายงาน' : 'Workflows'}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{th ? 'จัดการแม่แบบสายงานและโครงการที่กำลังเดิน' : 'Manage workflow templates and active runs'}</p>
      </header>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="pipeline">{th ? 'กำลังเดิน' : 'Pipeline'}</TabsTrigger>
          {user.firmRole === 'OWNER' || user.firmRole === 'SENIOR_LAWYER' ? (
            <TabsTrigger value="templates">{th ? 'แม่แบบ' : 'Templates'}</TabsTrigger>
          ) : null}
        </TabsList>

        <TabsContent value="pipeline" className="mt-6">
          <PipelineTab token={token} th={th} />
        </TabsContent>

        {user.firmRole === 'OWNER' || user.firmRole === 'SENIOR_LAWYER' ? (
          <TabsContent value="templates" className="mt-6">
            <TemplatesTab token={token} th={th} />
          </TabsContent>
        ) : null}
      </Tabs>
    </div>
  );
}

function TemplatesTab({ token, th }: { token: string; th: boolean }) {
  const [templates, setTemplates] = useState<WorkflowTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    api.getWorkflowTemplates(token)
      .then(setTemplates)
      .catch(e => setError(e instanceof Error ? e.message : 'Failed to load templates'))
      .finally(() => setLoading(false));
  }, [token]);

  if (loading) return <p className="text-sm text-muted-foreground">{th ? 'กำลังโหลด…' : 'Loading…'}</p>;
  if (error) return <p className="text-sm text-destructive">{error}</p>;

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button>{th ? 'สร้างแม่แบบใหม่' : 'New Template'}<Plus className="ml-2 h-4 w-4" /></Button>
      </div>

      <div className="space-y-2">
        {templates.length === 0 ? (
          <p className="rounded-lg border bg-card p-6 text-center text-sm text-muted-foreground">{th ? 'ยังไม่มีแม่แบบ' : 'No templates yet'}</p>
        ) : (
          templates.map(t => (
            <div key={t.id} className="rounded-lg border bg-card p-4 hover:border-primary/50">
              <h3 className="font-semibold">{t.name}</h3>
              {t.description && <p className="text-sm text-muted-foreground">{t.description}</p>}
              <p className="mt-2 text-xs text-muted-foreground">{t.steps.length} {th ? 'ขั้นตอน' : 'steps'}</p>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function PipelineTab({ token, th }: { token: string; th: boolean }) {
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

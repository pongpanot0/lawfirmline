'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { AlertTriangle, Pencil, Plus, Trash2 } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { api, type WorkflowPipelineRun, type WorkflowTemplate } from '@/lib/api';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { TemplateDrawer } from '@/components/workflows/TemplateDrawer';
import { ROLE_LABELS, shortThaiDate } from '@/components/workflows/workflow-ui';

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
      <header>
        <h1 className="text-2xl font-semibold">สายงาน</h1>
        <p className="mt-1 text-sm text-muted-foreground">งานที่ส่งต่อกันเป็นทอด — อยู่ขั้นไหน ค้างที่ใคร และจะส่งลูกความทันไหม</p>
      </header>
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="pipeline">กำลังเดิน</TabsTrigger>
          <TabsTrigger value="templates">แม่แบบ</TabsTrigger>
        </TabsList>
        <TabsContent value="pipeline" className="mt-6"><Pipeline token={token} /></TabsContent>
        <TabsContent value="templates" className="mt-6"><Templates token={token} canEdit={canEdit} /></TabsContent>
      </Tabs>
    </div>
  );
}

function Pipeline({ token }: { token: string }) {
  const [runs, setRuns] = useState<WorkflowPipelineRun[] | null>(null);
  const [error, setError] = useState('');
  useEffect(() => { api.getWorkflowRuns(token, 'ACTIVE').then(setRuns).catch((e) => setError(e.message)); }, [token]);

  if (error) return <p role="alert" className="text-sm text-destructive">{error}</p>;
  if (!runs) return <p className="text-sm text-muted-foreground">กำลังโหลด…</p>;
  if (!runs.length) return <p className="rounded-lg border bg-card p-6 text-center text-sm text-muted-foreground">ไม่มีสายงานที่กำลังเดิน — เริ่มได้จากหน้าคดี แท็บงาน</p>;

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
              <span className="text-xs text-muted-foreground">{run.stepsDone}/{run.stepsTotal} ขั้น</span>
              {run.lateByDays > 0 && <Badge variant="destructive"><AlertTriangle className="mr-1 h-3 w-3" />ช้ากว่าที่สัญญา {run.lateByDays} วัน</Badge>}
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

function Templates({ token, canEdit }: { token: string; canEdit: boolean }) {
  const [templates, setTemplates] = useState<WorkflowTemplate[] | null>(null);
  const [editing, setEditing] = useState<WorkflowTemplate | null>(null);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState('');
  const [savingDefault, setSavingDefault] = useState(false);
  const load = useCallback(() => { api.getWorkflowTemplates(token).then(setTemplates).catch((e) => setError(e.message)); }, [token]);
  useEffect(load, [load]);

  const remove = async (t: WorkflowTemplate) => {
    if (!window.confirm(`ลบแม่แบบ "${t.name}"? สายงานที่เริ่มไปแล้วไม่ได้รับผลกระทบ`)) return;
    try { await api.deleteWorkflowTemplate(token, t.id); load(); } catch (e) { setError(e instanceof Error ? e.message : 'ลบไม่สำเร็จ'); }
  };

  const setDefault = async (t: WorkflowTemplate) => {
    setSavingDefault(true); setError('');
    try {
      await api.updateWorkflowTemplate(token, t.id, { isDefault: !t.isDefault });
      setTemplates(await api.getWorkflowTemplates(token));
    } catch (e) { setError(e instanceof Error ? e.message : 'ตั้งค่าเริ่มต้นไม่สำเร็จ กรุณาลองใหม่'); }
    finally { setSavingDefault(false); }
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">แม่แบบเริ่มต้นใช้ร่วมกันทั้งสำนักงาน ระบบจะเลือกให้เมื่อกดเริ่มสายงานในคดี และให้ตรวจผู้รับแต่ละขั้นก่อนเริ่ม</p>
      {canEdit && (
        <div className="flex justify-end">
          <Button onClick={() => { setEditing(null); setOpen(true); }}><Plus className="mr-1 h-4 w-4" />สร้างแม่แบบ</Button>
        </div>
      )}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {templates && !templates.length && (
        <p className="rounded-lg border bg-card p-6 text-center text-sm text-muted-foreground">ยังไม่มีแม่แบบ — สร้างครั้งเดียว ใช้ซ้ำกับทุกคดี</p>
      )}
      {templates?.map((t) => (
        <article key={t.id} className="rounded-lg border bg-card p-4">
          <div className="flex flex-wrap items-start gap-2">
            <div className="min-w-0 flex-1">
              <h3 className="font-semibold">{t.name}</h3>
              {t.isDefault && <Badge className="mt-1" variant="default">ค่าเริ่มต้นของสำนักงาน</Badge>}
              {t.description && <p className="text-sm text-muted-foreground">{t.description}</p>}
            </div>
            {canEdit && (
              <>
                <Button size="icon" variant="ghost" aria-label={`แก้ ${t.name}`} onClick={() => { setEditing(t); setOpen(true); }}><Pencil className="h-4 w-4" /></Button>
                <Button size="icon" variant="ghost" aria-label={`ลบ ${t.name}`} onClick={() => remove(t)}><Trash2 className="h-4 w-4" /></Button>
              </>
            )}
          </div>
          {canEdit && <Button size="sm" variant="outline" className="mt-3" disabled={savingDefault}
            aria-label={`${t.isDefault ? 'ยกเลิกค่าเริ่มต้น' : 'ตั้งเป็นค่าเริ่มต้น'} ${t.name}`}
            onClick={() => setDefault(t)}>{t.isDefault ? 'ยกเลิกค่าเริ่มต้น' : 'ตั้งเป็นค่าเริ่มต้น'}</Button>}
          <ol className="mt-2 flex flex-wrap items-center gap-1 text-sm">
            {t.steps.map((s, i) => (
              <li key={i} className="flex items-center gap-1">
                {i > 0 && <span className="text-muted-foreground">→</span>}
                <span className="rounded-md bg-muted px-2 py-0.5">{s.title} <span className="text-xs text-muted-foreground">({ROLE_LABELS[s.role]}, {s.durationDays} วัน)</span></span>
              </li>
            ))}
          </ol>
        </article>
      ))}
      {canEdit && <TemplateDrawer open={open} token={token} template={editing} onClose={() => setOpen(false)} onSaved={load} />}
    </div>
  );
}

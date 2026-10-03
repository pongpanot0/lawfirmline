'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { api, ExternalStep } from '@/lib/api';
import { useLocale } from '@/components/landing/LocaleProvider';
import { Button } from '@/components/ui/button';
import { CheckCircle2, AlertCircle } from 'lucide-react';

export default function ExternalWorkPage() {
  const { token } = useAuth();
  const { locale } = useLocale();
  const th = locale === 'th';

  const [steps, setSteps] = useState<ExternalStep[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [completing, setCompleting] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    api.getExternalSteps(token)
      .then(setSteps)
      .catch(e => setError(e instanceof Error ? e.message : 'Failed to load'))
      .finally(() => setLoading(false));
  }, [token]);

  const handleComplete = async (taskId: string) => {
    if (!token) return;
    setCompleting(taskId);
    try {
      await api.completeExternalStep(token, taskId);
      setSteps(s => s.filter(st => st.taskId !== taskId));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to complete');
    } finally {
      setCompleting(null);
    }
  };

  if (loading) return <p className="text-sm text-muted-foreground">{th ? 'กำลังโหลด…' : 'Loading…'}</p>;
  if (error) return <p className="text-sm text-destructive">{error}</p>;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">{th ? 'งานของฉัน' : 'My Work'}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{th ? 'ขั้นตอนงานที่มอบหมายให้คุณ' : 'Your assigned workflow steps'}</p>
      </header>

      {steps.length === 0 ? (
        <div className="rounded-lg border bg-card p-8 text-center">
          <p className="text-sm text-muted-foreground">{th ? 'ยังไม่มีงานที่มอบหมาย' : 'No work assigned yet'}</p>
        </div>
      ) : (
        <div className="space-y-4">
          {steps.map(step => (
            <div key={step.taskId} className="rounded-lg border bg-card p-6 space-y-4">
              <div>
                <div className="flex items-start justify-between mb-2">
                  <h3 className="font-semibold">{step.title}</h3>
                  <span className="text-xs px-2 py-1 rounded-full bg-blue-100 text-blue-700">{step.run.name}</span>
                </div>
                <p className="text-sm text-muted-foreground">{th ? 'เคส: ' : 'Case: '}{step.run.caseRef}</p>
                {step.instructions && (
                  <p className="text-sm mt-2 text-foreground">{step.instructions}</p>
                )}
                {step.dueDate && (
                  <p className="text-xs text-muted-foreground mt-2">
                    {th ? 'ครบกำหนด: ' : 'Due: '}{new Date(step.dueDate).toLocaleDateString(th ? 'th-TH' : 'en-US')}
                  </p>
                )}
              </div>

              {step.blocked && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground bg-muted p-3 rounded">
                  <AlertCircle className="h-4 w-4" />
                  {th ? 'รอขั้นก่อนหน้า' : 'Waiting for previous step'}
                </div>
              )}

              {step.inputs.length > 0 && !step.blocked && (
                <div className="space-y-2">
                  <p className="text-sm font-medium">{th ? 'ไฟล์จากขั้นก่อน' : 'Files from previous step'}</p>
                  <div className="space-y-1">
                    {step.inputs.map(input => (
                      <a key={input.attachmentId} href={`/api/external/files/${input.attachmentId}`} className="text-xs text-blue-600 hover:underline block">
                        📄 {input.filename}
                      </a>
                    ))}
                  </div>
                </div>
              )}

              {step.outputs.length > 0 && (
                <div className="space-y-2">
                  <p className="text-sm font-medium">{th ? 'ไฟล์งานของฉัน' : 'My work files'}</p>
                  <div className="space-y-1">
                    {step.outputs.map(output => (
                      <p key={output.attachmentId} className="text-xs text-muted-foreground">
                        📄 {output.filename}
                      </p>
                    ))}
                  </div>
                </div>
              )}

              <Button
                onClick={() => handleComplete(step.taskId)}
                disabled={step.blocked || step.status === 'DONE' || completing === step.taskId}
                className="w-full"
              >
                {step.status === 'DONE' ? (
                  <>
                    <CheckCircle2 className="h-4 w-4 mr-2" />
                    {th ? 'ส่งแล้ว' : 'Done'}
                  </>
                ) : step.blocked ? (
                  th ? 'รอขั้นก่อนหน้า' : 'Waiting'
                ) : (
                  th ? 'ส่งงาน / เสร็จแล้ว' : 'Submit / Done'
                )}
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

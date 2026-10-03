'use client';

import { useEffect, useState } from 'react';
import { api, WorkflowTemplate } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';

interface TemplatesTabProps {
  token: string;
  th: boolean;
}

export function TemplatesTab({ token, th }: TemplatesTabProps) {
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

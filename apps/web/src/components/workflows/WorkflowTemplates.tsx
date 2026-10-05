'use client';

import { useCallback, useEffect, useState } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { api, type WorkflowTemplate } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { TemplateDrawer } from './TemplateDrawer';
import { ROLE_LABELS } from './workflow-ui';

export function WorkflowTemplates({ token, canEdit, search = '' }: { token: string; canEdit: boolean; search?: string }) {
  const [templates, setTemplates] = useState<WorkflowTemplate[] | null>(null);
  const [editing, setEditing] = useState<WorkflowTemplate | null>(null);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState('');
  const [savingDefault, setSavingDefault] = useState(false);
  const load = useCallback(() => {
    setError('');
    api.getWorkflowTemplates(token).then(setTemplates).catch((e) => setError(e.message));
  }, [token]);
  useEffect(load, [load]);
  const query = search.trim().toLocaleLowerCase();
  const visible = templates?.filter(t => [t.name, t.description, ...t.steps.flatMap(s => [s.title, s.instructions])]
    .join(' ').toLocaleLowerCase().includes(query));

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
    <section aria-label="สายงานส่งต่อ" className="min-w-0 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-semibold">สายงานส่งต่อ (Handoff flow)</h2>
        {canEdit && <Button onClick={() => { setEditing(null); setOpen(true); }}><Plus className="mr-1 h-4 w-4" />สร้าง Handoff flow</Button>}
      </div>
      <p className="text-sm text-muted-foreground">กำหนดขั้นตอน บทบาทผู้รับ และเวลาส่งต่อ แม่แบบเริ่มต้นใช้ร่วมกันทั้งสำนักงาน ระบบจะเลือกให้เมื่อกดเริ่มสายงานในคดี และให้ตรวจผู้รับแต่ละขั้นก่อนเริ่ม</p>
      {error && <div role="alert" className="flex flex-wrap items-center gap-2 text-sm text-destructive">{error}<Button size="sm" variant="outline" onClick={load}>ลองใหม่</Button></div>}
      {!templates && !error && <p role="status" className="text-sm text-muted-foreground">กำลังโหลดสายงานส่งต่อ…</p>}
      {visible && !visible.length && <p className="rounded-lg border bg-card p-6 text-center text-sm text-muted-foreground">{query ? 'ไม่พบสายงานส่งต่อที่ค้นหา' : 'ยังไม่มีแม่แบบ — สร้างครั้งเดียว ใช้ซ้ำกับทุกคดี'}</p>}
      {visible?.map((t) => (
        <article key={t.id} className="min-w-0 rounded-lg border bg-card p-4">
          <div className="flex flex-wrap items-start gap-2">
            <div className="min-w-0 flex-1 break-words">
              <h3 className="font-semibold">{t.name}</h3>
              {t.isDefault && <Badge className="mt-1" variant="default">ค่าเริ่มต้นของสำนักงาน</Badge>}
              {t.description && <p className="text-sm text-muted-foreground">{t.description}</p>}
            </div>
            {canEdit && <>
              <Button size="icon" variant="ghost" aria-label={`แก้ ${t.name}`} onClick={() => { setEditing(t); setOpen(true); }}><Pencil className="h-4 w-4" /></Button>
              <Button size="icon" variant="ghost" aria-label={`ลบ ${t.name}`} onClick={() => remove(t)}><Trash2 className="h-4 w-4" /></Button>
            </>}
          </div>
          {canEdit && <Button size="sm" variant="outline" className="mt-3" disabled={savingDefault}
            aria-label={`${t.isDefault ? 'ยกเลิกค่าเริ่มต้น' : 'ตั้งเป็นค่าเริ่มต้น'} ${t.name}`}
            onClick={() => setDefault(t)}>{t.isDefault ? 'ยกเลิกค่าเริ่มต้น' : 'ตั้งเป็นค่าเริ่มต้น'}</Button>}
          <ol className="mt-2 flex flex-wrap items-center gap-1 text-sm">
            {t.steps.map((s, i) => <li key={i} className="flex min-w-0 max-w-full items-center gap-1">
              {i > 0 && <span className="text-muted-foreground">→</span>}
              <span className="min-w-0 break-words rounded-md bg-muted px-2 py-0.5">{s.title} <span className="text-xs text-muted-foreground">({ROLE_LABELS[s.role]}, {s.durationDays} วัน)</span></span>
            </li>)}
          </ol>
        </article>
      ))}
      {canEdit && <TemplateDrawer open={open} token={token} template={editing} onClose={() => setOpen(false)} onSaved={load} />}
    </section>
  );
}

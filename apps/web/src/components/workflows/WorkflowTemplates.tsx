'use client';

import { useCallback, useEffect, useState } from 'react';
import { ChevronDown, Pencil, Plus, Trash2 } from 'lucide-react';
import { api, type WorkflowTemplate } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { TemplateDrawer } from './TemplateDrawer';
import { ROLE_LABELS } from './workflow-ui';

export function WorkflowTemplates({ token, canEdit, search = '', editor, onEditorChange }: {
  token: string; canEdit: boolean; search?: string;
  editor?: WorkflowTemplate | 'new' | null;
  onEditorChange?: (template: WorkflowTemplate | 'new' | null) => void;
}) {
  const [templates, setTemplates] = useState<WorkflowTemplate[] | null>(null);
  const [localEditor, setLocalEditor] = useState<WorkflowTemplate | 'new' | null>(null);
  const editing = editor === undefined ? localEditor : editor;
  const setEditor = onEditorChange ?? setLocalEditor;
  const closeEditor = useCallback(() => setEditor(null), [setEditor]);
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

  const defaultTemplate = templates?.find(t => t.isDefault);
  const setDefault = async (id: string) => {
    const template = templates?.find(t => t.id === id) ?? defaultTemplate;
    if (!template || savingDefault) return;
    setSavingDefault(true); setError('');
    try {
      await api.updateWorkflowTemplate(token, template.id, { isDefault: Boolean(id) });
      setTemplates(await api.getWorkflowTemplates(token));
    } catch (e) { setError(e instanceof Error ? e.message : 'ตั้งค่าเริ่มต้นไม่สำเร็จ กรุณาลองใหม่'); }
    finally { setSavingDefault(false); }
  };

  return (
    <section aria-label="สายงานส่งต่อ" className="min-w-0 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-semibold">สายงานส่งต่อ (Handoff flow)</h2>
        {canEdit && !onEditorChange && <Button onClick={() => setEditor('new')}><Plus className="mr-1 h-4 w-4" />สร้าง Handoff flow</Button>}
      </div>
      <p className="text-sm text-muted-foreground">ส่งงานทีละขั้น เมื่อขั้นก่อนเสร็จจึงส่งต่อให้ผู้รับขั้นถัดไป</p>
      {templates && <div className="grid min-w-0 gap-3 rounded-lg border border-primary/20 bg-primary/5 p-4 sm:grid-cols-2">
        <div>
          <p className="text-sm font-semibold">สายงานเริ่มต้น</p>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">เลือกให้เมื่อกดเริ่มสายงานในคดี ตรวจผู้รับแต่ละขั้นก่อนยืนยันเริ่ม ใช้ร่วมกันทั้งสำนักงาน</p>
        </div>
        {canEdit ? <label className="min-w-0 text-xs text-muted-foreground">แม่แบบเริ่มต้นของสำนักงาน
          <select aria-label="แม่แบบเริ่มต้นของสำนักงาน" className="mt-1 min-h-11 w-full min-w-0 rounded-md border border-input bg-card px-3 text-sm text-foreground"
            value={defaultTemplate?.id ?? ''} disabled={savingDefault} onChange={e => void setDefault(e.target.value)}>
            <option value="">ไม่เลือกแม่แบบให้ล่วงหน้า</option>
            {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          {savingDefault && <span role="status" className="mt-1 block">กำลังบันทึกค่าเริ่มต้น…</span>}
        </label> : <p className="self-center break-words text-sm font-medium">{defaultTemplate?.name ?? 'ยังไม่มีแม่แบบเริ่มต้น'}</p>}
      </div>}
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
              <Button size="icon" variant="ghost" aria-label={`แก้ ${t.name}`} onClick={() => setEditor(t)}><Pencil className="h-4 w-4" /></Button>
              <Button size="icon" variant="ghost" aria-label={`ลบ ${t.name}`} onClick={() => remove(t)}><Trash2 className="h-4 w-4" /></Button>
            </>}
          </div>
          <details className="group mt-3 border-t pt-2">
            <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 text-sm [&::-webkit-details-marker]:hidden">
              <span>{t.steps.length} ขั้น · รวม {t.steps.reduce((days, s) => days + s.durationDays, 0)} วันทำการ</span>
              <span className="flex shrink-0 items-center gap-1 text-xs text-primary">ดูขั้นตอน<ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" /></span>
            </summary>
            <ol className="mt-2 space-y-3 border-l border-primary/20 pl-3">
              {t.steps.map((s, i) => <li key={i} className="min-w-0 break-words text-sm">
                <p className="font-medium">{i + 1}. {s.title}</p>
                <p className="text-xs text-muted-foreground">{ROLE_LABELS[s.role]} · ภายใน {s.durationDays} วันทำการ{s.requiresReview && ' · ตรวจงานก่อนส่งต่อ'}</p>
                {s.instructions && <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{s.instructions}</p>}
              </li>)}
            </ol>
          </details>
        </article>
      ))}
      {canEdit && <TemplateDrawer open={editing !== null} token={token} template={editing === 'new' ? null : editing} onClose={closeEditor} onSaved={load} />}
    </section>
  );
}

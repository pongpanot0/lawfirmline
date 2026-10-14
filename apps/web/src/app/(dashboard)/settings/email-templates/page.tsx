'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { api, type EmailTemplate, type EmailTemplateVariable } from '@/lib/api';
import { insertAtCursor, previewTemplate } from '@/lib/case-email-compose';
import { SideDrawer } from '@/components/ui/SideDrawer';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { PageLoading } from '@/components/ui/misc';

type Draft = { id: string | null; name: string; subject: string; body: string };
type Field = 'subject' | 'body';

/** ตั้งค่า → เทมเพลตอีเมล: ตัวอย่างของระบบแก้ไม่ได้ ("คัดลอกไปแก้" ก่อน) */
export default function EmailTemplatesPage() {
  const { token } = useAuth();
  const [templates, setTemplates] = useState<EmailTemplate[] | null>(null);
  const [variables, setVariables] = useState<EmailTemplateVariable[]>([]);
  const [loadError, setLoadError] = useState('');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [listError, setListError] = useState('');
  const subjectRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const lastField = useRef<Field>('body');

  const load = useCallback(async () => {
    if (!token) return;
    setLoadError('');
    try {
      const [list, vars] = await Promise.all([api.getEmailTemplates(token), api.getEmailTemplateVariables(token)]);
      setTemplates(list);
      setVariables(vars);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'โหลดเทมเพลตไม่สำเร็จ');
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  const closeDrawer = useCallback(() => setDraft(null), []);

  const insertVariable = (key: string) => {
    const field = lastField.current;
    const el = field === 'subject' ? subjectRef.current : bodyRef.current;
    setDraft((d) => {
      if (!d) return d;
      const text = d[field];
      const start = el?.selectionStart ?? text.length;
      const end = el?.selectionEnd ?? text.length;
      const next = insertAtCursor(text, start, end, `{{${key}}}`);
      requestAnimationFrame(() => {
        el?.focus();
        el?.setSelectionRange(next.caret, next.caret);
      });
      return { ...d, [field]: next.text };
    });
  };

  const save = async () => {
    if (!token || !draft || saving) return;
    if (!draft.name.trim() || !draft.subject.trim() || !draft.body.trim()) {
      setFormError('กรุณากรอกชื่อ หัวเรื่อง และข้อความให้ครบ');
      return;
    }
    setSaving(true);
    setFormError('');
    const data = { name: draft.name.trim(), subject: draft.subject.trim(), body: draft.body };
    try {
      if (draft.id) await api.updateEmailTemplate(token, draft.id, data);
      else await api.createEmailTemplate(token, data);
      setDraft(null);
      await load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'บันทึกไม่สำเร็จ');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    if (!token || deleteBusy) return;
    setDeleteBusy(true);
    setListError('');
    try {
      await api.deleteEmailTemplate(token, id);
      setDeletingId(null);
      await load();
    } catch (err) {
      setListError(err instanceof Error ? err.message : 'ลบไม่สำเร็จ');
    } finally {
      setDeleteBusy(false);
    }
  };

  const preview = useMemo(
    () => (draft ? { subject: previewTemplate(draft.subject, variables), body: previewTemplate(draft.body, variables) } : null),
    [draft, variables],
  );

  return (
    <div className="space-y-4">
      <Link href="/settings" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> ตั้งค่า
      </Link>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold">เทมเพลตอีเมล</h1>
          <p className="text-sm text-muted-foreground">ข้อความสำเร็จรูปที่ทุกคนเลือกใช้ได้ตอนเขียนอีเมลในคดี ช่อง {'{{…}}'} จะถูกเติมจากข้อมูลคดีให้อัตโนมัติ</p>
        </div>
        <Button onClick={() => setDraft({ id: null, name: '', subject: '', body: '' })}>+ สร้างเทมเพลต</Button>
      </div>

      {listError && <p role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{listError}</p>}

      {loadError ? (
        <div role="alert" className="space-y-2 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
          <p>{loadError}</p>
          <Button size="sm" variant="outline" onClick={() => void load()}>
            ลองใหม่
          </Button>
        </div>
      ) : !templates ? (
        <PageLoading />
      ) : templates.length === 0 ? (
        <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">ยังไม่มีเทมเพลต</p>
      ) : (
        <ul className="space-y-2">
          {templates.map((t) => (
            <li key={t.id}>
              <Card>
                <CardContent className="space-y-1 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="truncate font-medium">{t.name}</span>
                      {t.builtIn && <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">ตัวอย่าง</span>}
                    </div>
                    <div className="flex items-center gap-2">
                      {t.builtIn ? (
                        <Button size="sm" variant="outline" onClick={() => setDraft({ id: null, name: `${t.name} (สำเนา)`, subject: t.subject, body: t.body })}>
                          คัดลอกไปแก้
                        </Button>
                      ) : deletingId === t.id ? (
                        <>
                          <span className="text-sm">ลบเทมเพลตนี้?</span>
                          <Button size="sm" variant="destructive" disabled={deleteBusy} onClick={() => void remove(t.id)}>
                            {deleteBusy ? 'กำลังลบ…' : 'ลบ'}
                          </Button>
                          <Button size="sm" variant="ghost" disabled={deleteBusy} onClick={() => setDeletingId(null)}>
                            ยกเลิก
                          </Button>
                        </>
                      ) : (
                        <>
                          <Button size="sm" variant="outline" onClick={() => setDraft({ id: t.id, name: t.name, subject: t.subject, body: t.body })}>
                            แก้ไข
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => setDeletingId(t.id)}>
                            ลบ
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                  <p className="truncate text-sm text-muted-foreground">{t.subject}</p>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}

      <SideDrawer open={!!draft} title={draft?.id ? 'แก้ไขเทมเพลต' : 'สร้างเทมเพลต'} onClose={closeDrawer}>
        {draft && preview && (
          <div className="space-y-4">
            <label className="block space-y-1 text-sm">
              <span className="font-medium">ชื่อเทมเพลต</span>
              <Input value={draft.name} maxLength={100} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="เช่น แจ้งนัดศาล" />
            </label>
            <label className="block space-y-1 text-sm">
              <span className="font-medium">หัวเรื่อง</span>
              <Input
                ref={subjectRef}
                value={draft.subject}
                maxLength={255}
                onFocus={() => (lastField.current = 'subject')}
                onChange={(e) => setDraft({ ...draft, subject: e.target.value })}
              />
            </label>
            <label className="block space-y-1 text-sm">
              <span className="font-medium">ข้อความ</span>
              <Textarea
                ref={bodyRef}
                rows={10}
                maxLength={20000}
                value={draft.body}
                onFocus={() => (lastField.current = 'body')}
                onChange={(e) => setDraft({ ...draft, body: e.target.value })}
              />
            </label>

            <div className="space-y-1">
              <p className="text-sm font-medium">แทรกข้อมูลคดี (กดเพื่อแทรกตรงตำแหน่งเคอร์เซอร์)</p>
              <div className="flex flex-wrap gap-1.5">
                {variables.map((v) => (
                  <button
                    key={v.key}
                    type="button"
                    title={`ตัวอย่าง: ${v.example}`}
                    className="rounded-full border border-border px-2.5 py-1 text-xs hover:bg-muted"
                    onClick={() => insertVariable(v.key)}
                  >
                    {v.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1 rounded-lg border border-border bg-muted/40 p-3 text-sm">
              <p className="text-xs font-medium text-muted-foreground">ตัวอย่างที่ผู้รับจะเห็น</p>
              <p className="font-medium">{preview.subject || '—'}</p>
              <p className="whitespace-pre-wrap">{preview.body || '—'}</p>
            </div>

            {formError && <p role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{formError}</p>}
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={closeDrawer} disabled={saving}>
                ยกเลิก
              </Button>
              <Button onClick={() => void save()} disabled={saving}>
                {saving ? 'กำลังบันทึก…' : 'บันทึก'}
              </Button>
            </div>
          </div>
        )}
      </SideDrawer>
    </div>
  );
}

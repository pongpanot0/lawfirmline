'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Plus } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { api, ApiError, type EmailTemplate, type EmailTemplateVariable } from '@/lib/api';
import { insertAtCursor, previewTemplate } from '@/lib/case-email-compose';
import { SideDrawer } from '@/components/ui/SideDrawer';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { EmptyState, PageLoading } from '@/components/ui/misc';
import { Badge } from '@/components/ui/badge';
import { LoadFailed } from '@/components/ui/LoadFailed';
import { PageHeader } from '@/components/samnuan/PageHeader';
import { TextField } from '@/components/ui/form-fields';

type Draft = { id: string | null; name: string; subject: string; body: string };
type Field = 'subject' | 'body';

/** การ์ดตั้งเวลาเตือนอีเมลลูกความที่ยังไม่ได้ตอบ — ซ่อนถ้าไม่มีสิทธิ์ (403) */
function ReplyReminderCard() {
  const { token } = useAuth();
  const [hours, setHours] = useState<string | null>(null);
  const [hidden, setHidden] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    if (!token) return;
    api
      .getSlaConfig(token)
      .then((c) => setHours(String(c.emailReplyHours)))
      .catch(() => setHidden(true));
  }, [token]);

  if (hidden || hours === null) return null;

  const save = async () => {
    const n = Number(hours);
    if (!Number.isInteger(n) || n < 1 || n > 168) {
      setMsg({ ok: false, text: 'กรอกเป็นจำนวนเต็ม 1–168 ชั่วโมง' });
      return;
    }
    setSaving(true);
    setMsg(null);
    try {
      await api.updateSlaConfig(token!, { emailReplyHours: n });
      setMsg({ ok: true, text: 'บันทึกแล้ว' });
    } catch (e) {
      if (e instanceof ApiError && e.status === 403) setHidden(true);
      setMsg({ ok: false, text: e instanceof Error ? e.message : 'บันทึกไม่สำเร็จ' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <section aria-labelledby="reply-reminder-heading" className="space-y-2">
      <h2 id="reply-reminder-heading" className="text-base font-semibold">เตือนอีเมลที่ยังไม่ได้ตอบ</h2>
      <Card>
        <CardContent className="flex flex-wrap items-center gap-2 p-4 text-sm">
          <label htmlFor="email-reply-hours">เตือนเมื่ออีเมลลูกความไม่ได้ตอบภายใน</label>
          <Input id="email-reply-hours" type="number" min={1} max={168} className="w-20 tabular-nums" value={hours} onChange={(e) => setHours(e.target.value)} />
          <span>ชั่วโมง</span>
          <Button size="sm" variant="outline" disabled={saving} onClick={() => void save()}>
            {saving ? 'กำลังบันทึก…' : 'บันทึกเวลาเตือน'}
          </Button>
          {msg && (
            <span role={msg.ok ? 'status' : 'alert'} className={msg.ok ? 'text-success' : 'text-destructive'}>
              {msg.text}
            </span>
          )}
        </CardContent>
      </Card>
    </section>
  );
}

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
      <div>
        <Link href="/settings?view=office" className="inline-flex min-h-11 items-center gap-1 text-sm text-primary hover:underline">
          <ArrowLeft className="h-4 w-4" aria-hidden />ตั้งค่าสำนักงาน
        </Link>
        <PageHeader
          title="เทมเพลตอีเมล"
          description={`ข้อความสำเร็จรูปสำหรับอีเมลในคดี ช่อง {{…}} เติมจากข้อมูลคดี`}
          actions={
            <Button onClick={() => setDraft({ id: null, name: '', subject: '', body: '' })}>
              <Plus className="h-4 w-4" aria-hidden />สร้างเทมเพลต
            </Button>
          }
        />
      </div>

      {listError && <p role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{listError}</p>}

      {loadError ? (
        <LoadFailed message={loadError} onRetry={() => void load()} />
      ) : !templates ? (
        <PageLoading lines={2} />
      ) : templates.length === 0 ? (
        <EmptyState
          title="ยังไม่มีเทมเพลต"
          action={<Button variant="outline" onClick={() => setDraft({ id: null, name: '', subject: '', body: '' })}><Plus className="h-4 w-4" aria-hidden />สร้างเทมเพลต</Button>}
        />
      ) : (
        <ul className="space-y-2">
          {templates.map((t) => (
            <li key={t.id}>
              <Card>
                <CardContent className="space-y-1 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="truncate font-medium">{t.name}</span>
                      {t.builtIn && <Badge variant="muted" className="shrink-0">ตัวอย่าง</Badge>}
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {t.builtIn ? (
                        <Button size="sm" variant="outline" onClick={() => setDraft({ id: null, name: `${t.name} (สำเนา)`, subject: t.subject, body: t.body })}>
                          คัดลอกไปแก้
                        </Button>
                      ) : deletingId === t.id ? (
                        <>
                          <span className="text-sm">ลบเทมเพลต &quot;{t.name}&quot;?</span>
                          <Button size="sm" variant="ghost" disabled={deleteBusy} onClick={() => setDeletingId(null)}>
                            ยกเลิก
                          </Button>
                          <Button size="sm" variant="outline" className="border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive" disabled={deleteBusy} onClick={() => void remove(t.id)}>
                            {deleteBusy ? 'กำลังลบ…' : 'ลบเทมเพลต'}
                          </Button>
                        </>
                      ) : (
                        <>
                          <Button size="sm" variant="outline" onClick={() => setDraft({ id: t.id, name: t.name, subject: t.subject, body: t.body })}>
                            แก้ไข
                          </Button>
                          <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => setDeletingId(t.id)}>
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
            <TextField label="ชื่อเทมเพลต" required value={draft.name} maxLength={100} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="เช่น แจ้งนัดศาล" />
            <label className="block space-y-1 text-sm">
              <span className="font-medium">หัวเรื่อง<span aria-hidden="true" className="ml-1 text-destructive">*</span></span>
              <Input
                ref={subjectRef}
                value={draft.subject}
                maxLength={255}
                onFocus={() => (lastField.current = 'subject')}
                onChange={(e) => setDraft({ ...draft, subject: e.target.value })}
              />
            </label>
            <label className="block space-y-1 text-sm">
              <span className="font-medium">ข้อความ<span aria-hidden="true" className="ml-1 text-destructive">*</span></span>
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
              <p className="text-sm font-medium">แทรกข้อมูลคดี</p>
              <div className="flex flex-wrap gap-1.5">
                {variables.map((v) => (
                  <button
                    key={v.key}
                    type="button"
                    title={`ตัวอย่าง: ${v.example}`}
                    className="min-h-11 rounded-full border border-border px-2.5 py-1 text-xs hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:min-h-8"
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
                {saving ? 'กำลังบันทึก…' : 'บันทึกเทมเพลต'}
              </Button>
            </div>
          </div>
        )}
      </SideDrawer>

      <ReplyReminderCard />
    </div>
  );
}

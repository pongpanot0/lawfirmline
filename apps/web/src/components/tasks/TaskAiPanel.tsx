'use client';

import { FormEvent, useEffect, useRef, useState } from 'react';
import { AlertCircle, ArrowRight, Check, Loader2, Sparkles, X } from 'lucide-react';
import { AI_CREDIT_COST, canAssignFirmRole, TASK_WORK_TYPES, TaskStatus, TaskLogAction } from '@lawfirm/shared';
import { api, ApiError, TaskAiInsight, TaskDetail, UserItem } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useLocale } from '@/components/landing/LocaleProvider';
import { bangkokDateInputValue } from '@/lib/bangkok';
import { formatDate, formatDateTime } from '@/lib/utils';
import { Button } from '@/components/ui/button';

type AiTab = 'summary' | 'source' | 'history';

interface Props {
  task: TaskDetail;
  users: UserItem[];
  tab: AiTab;
  onTabChange: (tab: AiTab) => void;
  onChanged: () => void;
  onNavigate: (taskId: string) => void;
}

export function TaskAiPanel({ task, users, tab, onTabChange, onChanged, onNavigate }: Props) {
  const { token, user } = useAuth();
  const { locale } = useLocale();
  const t = (th: string, en: string) => locale === 'th' ? th : en;
  const [insight, setInsight] = useState<TaskAiInsight | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [confirm, setConfirm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [success, setSuccess] = useState<{ id: string; title: string; alreadyCreated: boolean } | null>(null);
  const [draft, setDraft] = useState({ title: '', description: '', assigneeId: '', followUpDate: '' });
  const dialogRef = useRef<HTMLDialogElement>(null);
  const latestCommentId = task.comments.at(-1)?.id;
  const revision = `${task.id}:${task.updatedAt}:${latestCommentId}`;
  const currentRevision = useRef(revision);
  currentRevision.current = revision;
  const requestId = useRef(0);
  const stale = !!insight && (insight.taskUpdatedAt !== task.updatedAt || insight.latestCommentId !== (latestCommentId ?? null));

  useEffect(() => {
    setInsight(task.aiAnalysis ?? null);
    setError('');
    setLoading(false);
    setSuccess(null);
    setConfirm(false);
    requestId.current += 1;
  }, [task.id]);

  useEffect(() => {
    if (task.aiAnalysis) setInsight((current) => !current || task.aiAnalysis!.analyzedAt > current.analyzedAt ? task.aiAnalysis! : current);
  }, [task.aiAnalysis]);

  const analyze = async () => {
    if (!token || loading || !task.comments.length) return;
    setLoading(true);
    setError('');
    const requestedRevision = revision;
    const request = ++requestId.current;
    try {
      const result = await api.analyzeTask(token, task.id);
      if (request !== requestId.current) return;
      setInsight(result);
      if (currentRevision.current !== requestedRevision) setError(t('มีข้อมูลใหม่ระหว่างวิเคราะห์ กรุณาวิเคราะห์อีกครั้ง', 'The task changed during analysis. Analyze again.'));
      onChanged();
    } catch (err) {
      if (request !== requestId.current) return;
      setError(err instanceof ApiError && err.status === 402
        ? t('เครดิต AI ไม่พอ', 'Not enough AI credits')
        : err instanceof ApiError ? err.message : t('วิเคราะห์งานไม่สำเร็จ', 'Could not analyze this task'));
    } finally {
      if (request === requestId.current) setLoading(false);
    }
  };

  useEffect(() => {
    const dialog = dialogRef.current;
    if (confirm && dialog && !dialog.open) dialog.showModal();
    if (!confirm && dialog?.open) dialog.close();
  }, [confirm]);

  const openConfirm = () => {
    if (insight?.status !== 'blocker' || stale) return;
    setSaveError('');
    setDraft({ title: insight.title, description: insight.description, assigneeId: user?.id ?? '', followUpDate: '' });
    setConfirm(true);
  };

  const createFollowUp = async (event: FormEvent) => {
    event.preventDefault();
    if (!token || insight?.status !== 'blocker' || saving || stale) return;
    setSaving(true);
    setSaveError('');
    try {
      const saved = await api.createAiFollowUp(token, task.id, {
        sourceCommentId: insight.sourceCommentId, latestCommentId: insight.latestCommentId,
        taskUpdatedAt: insight.taskUpdatedAt, quote: insight.quote,
        title: draft.title.trim(), description: draft.description.trim(),
        assigneeId: draft.assigneeId || undefined, followUpDate: draft.followUpDate,
      });
      setInsight({ ...insight, existingFollowUpId: saved.id });
      setSuccess({ id: saved.id, title: draft.title.trim(), alreadyCreated: saved.alreadyCreated });
      setConfirm(false);
      onChanged();
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setConfirm(false);
        setError(err.message);
        onChanged();
      } else {
        setSaveError(err instanceof ApiError ? err.message : t('สร้างงานติดตามไม่สำเร็จ', 'Could not create follow-up task'));
      }
    } finally {
      setSaving(false);
    }
  };

  const assignableUsers = users.filter((candidate) =>
    candidate.id === user?.id || (!!user && candidate.firmRole != null && canAssignFirmRole(user.firmRole, candidate.firmRole)),
  );
  const statusLabels = {
    [TaskStatus.TODO]: t('รอเริ่ม', 'To do'),
    [TaskStatus.IN_PROGRESS]: t('กำลังทำ', 'In progress'),
    [TaskStatus.PENDING_REVIEW]: t('รอตรวจ', 'Awaiting review'),
    [TaskStatus.NEEDS_REVISION]: t('ต้องแก้ไข', 'Needs revision'),
    [TaskStatus.DONE]: t('เสร็จแล้ว', 'Done'),
  };
  const personName = (person?: { firstName: string; lastName: string } | null) => person ? `${person.firstName} ${person.lastName}` : t('ไม่ระบุผู้ทำรายการ', 'Unknown actor');
  const actionLabels = {
    [TaskLogAction.ASSIGNED]: t('มอบหมายงาน', 'Assigned task'),
    [TaskLogAction.HANDED_OFF]: t('ส่งต่อให้ตรวจ', 'Handed off for review'),
    [TaskLogAction.REJECTED]: t('ส่งกลับให้แก้ไข', 'Returned for revision'),
  };
  const history: Array<{ id: string; date: string; actor: string; text: string; taskId?: string }> = [
    { id: 'created', date: task.createdAt, actor: personName(task.createdBy), text: t('สร้างงาน', 'Created task') },
    ...task.comments.map((comment) => ({ id: comment.id, date: comment.createdAt, actor: personName(comment.author), text: `${t('เพิ่มข้อความอัปเดต', 'Added update')}: ${comment.body}` })),
    ...task.attachments.map((file) => ({ id: file.id, date: file.createdAt, actor: personName(file.uploadedBy), text: `${t('แนบไฟล์', 'Attached file')}: ${file.filename}` })),
    ...(task.assignmentLogs ?? []).map((log, index) => ({ id: `assignment-${index}`, date: log.createdAt, actor: personName(log.performedBy), text: `${actionLabels[log.action]} → ${personName(log.toUser)}${log.note ? ` · ${log.note}` : ''}` })),
    ...(task.history ?? []).map((event) => ({ id: event.id, date: event.createdAt, actor: personName(event.user), text: event.metadata.changes.map((change) => change.field === 'status' ? `${t('เปลี่ยนสถานะ', 'Changed status')}: ${statusLabels[change.before as TaskStatus]} → ${statusLabels[change.after as TaskStatus]}` : `${t('เปลี่ยนกำหนดส่ง', 'Changed due date')}: ${change.before ? formatDate(change.before) : t('ยังไม่กำหนด', 'Not set')} → ${change.after ? formatDate(change.after) : t('ยังไม่กำหนด', 'Not set')}`).join(' · ') })),
    ...(task.followUps ?? []).map((followUp) => ({ id: followUp.id, date: followUp.createdAt, actor: personName(followUp.createdBy), text: `${t('สร้างงานติดตาม', 'Created follow-up')}: ${followUp.title}`, taskId: followUp.id })),
  ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  const currentData = <section className="rounded-xl border border-border bg-muted/30 p-4">
    <h3 className="text-sm font-semibold">{t('ข้อมูลงานปัจจุบัน', 'Current task')}</h3>
    <dl className="mt-3 grid grid-cols-[7rem_1fr] gap-y-2 text-xs">
      <dt className="text-muted-foreground">{t('ประเภทงาน', 'Type')}</dt><dd>{TASK_WORK_TYPES.find((item) => item.value === task.workType)?.label ?? t('ยังไม่ระบุ', 'Not set')}</dd>
      <dt className="text-muted-foreground">{t('ผู้รับผิดชอบ', 'Assignee')}</dt><dd>{task.assignee ? `${task.assignee.firstName} ${task.assignee.lastName}` : t('ยังไม่มอบหมาย', 'Unassigned')}</dd>
      <dt className="text-muted-foreground">{t('กำหนดส่ง', 'Due date')}</dt><dd>{task.dueDate ? formatDate(task.dueDate) : t('ยังไม่กำหนด', 'Not set')}</dd>
      <dt className="text-muted-foreground">{t('สถานะ', 'Status')}</dt><dd>{statusLabels[task.status]}</dd>
    </dl>
  </section>;

  return <div className="space-y-4">
    {success && <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm dark:border-emerald-900 dark:bg-emerald-950/30"><p className="flex items-center gap-2 font-semibold"><Check className="h-4 w-4" />{success.alreadyCreated ? t('มีงานติดตามนี้แล้ว', 'This follow-up already exists') : t('สร้างงานติดตามแล้ว', 'Follow-up created')}</p><p className="mt-2 break-words">{success.title}</p><Button size="sm" variant="outline" className="mt-3" onClick={() => onNavigate(success.id)}>{t('เปิดงานติดตาม', 'Open follow-up')}</Button></div>}
    {tab === 'summary' && <>
      {insight && <p className="text-xs text-muted-foreground">{t('วิเคราะห์ล่าสุด', 'Last analyzed')} · {formatDateTime(insight.analyzedAt)}</p>}
      {loading ? <div role="status" className="flex items-center gap-2 rounded-xl border p-4 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />{t('กำลังวิเคราะห์ข้อความอัปเดต…', 'Analyzing task updates…')}</div>
        : error ? <div role="alert" className="rounded-xl border border-destructive/20 bg-destructive/5 p-4 text-sm"><p>{error}</p><Button size="sm" variant="outline" className="mt-3" onClick={() => void analyze()}>{t('ลองใหม่', 'Retry')}</Button></div>
        : stale ? <div role="status" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm dark:border-amber-900 dark:bg-amber-950/30"><p className="font-semibold">{t('มีข้อมูลใหม่หลังวิเคราะห์', 'New information since analysis')}</p><p className="mt-1 text-xs text-muted-foreground">{t('วิเคราะห์อีกครั้งก่อนใช้ข้อเสนอสร้างงาน', 'Analyze again before creating a suggested task.')}</p><Button size="sm" className="mt-3" onClick={() => void analyze()} disabled={!task.comments.length}>{t('วิเคราะห์ใหม่ · 1 เครดิต', 'Analyze again · 1 credit')}</Button></div>
        : !task.comments.length || insight?.status === 'insufficient' ? <div className="rounded-xl border border-dashed p-5 text-sm text-muted-foreground"><p className="font-medium text-foreground">{t('ยังสรุปสิ่งที่ติดขัดไม่ได้', 'Not enough information yet')}</p><p className="mt-1">{t('เพิ่มข้อความอัปเดตในแท็บแก้ไขงาน แล้วกลับมาดูใหม่', 'Add a task update in Edit task, then check again.')}</p></div>
        : !insight ? <div className="rounded-xl border border-blue-200 bg-blue-50 p-5 dark:border-blue-900 dark:bg-blue-950/30"><div className="flex items-center gap-2 text-sm font-semibold"><Sparkles className="h-4 w-4 text-primary" />{t('ดูว่างานนี้ติดอะไร', 'Find what is blocking this task')}</div><p className="mt-2 text-xs leading-6 text-muted-foreground">{t('AI จะอ่านเฉพาะข้อความอัปเดตของงานนี้ โดยปกปิดเลขประจำตัว เบอร์โทร และอีเมลก่อนส่งไปวิเคราะห์', 'AI reads only this task’s updates. Personal identifiers are redacted before analysis.')}</p><Button size="sm" className="mt-4" disabled={(user?.aiCredits ?? 0) < AI_CREDIT_COST.TASK_UPDATE_ANALYSIS} onClick={() => void analyze()}>{t(`วิเคราะห์งานนี้ · ${AI_CREDIT_COST.TASK_UPDATE_ANALYSIS} เครดิต`, `Analyze · ${AI_CREDIT_COST.TASK_UPDATE_ANALYSIS} credit`)}</Button>{(user?.aiCredits ?? 0) < AI_CREDIT_COST.TASK_UPDATE_ANALYSIS && <p className="mt-2 text-xs text-destructive">{t('เครดิต AI ไม่พอ', 'Not enough AI credits')}</p>}</div>
        : insight?.status === 'clear' ? <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm dark:border-emerald-900 dark:bg-emerald-950/30"><div className="flex items-center gap-2 font-semibold text-emerald-800 dark:text-emerald-300"><Check className="h-4 w-4" />{t('ยังไม่พบสิ่งที่ติดขัด', 'No blocker found in these updates')}</div><p className="mt-2 text-xs text-muted-foreground">{t('สรุปจากข้อความที่วิเคราะห์เท่านั้น ไม่ได้ยืนยันว่าคดีไม่มีความเสี่ยง', 'Based only on the analyzed updates; this is not a case risk assessment.')}</p></div>
        : insight?.status === 'blocker' ? <>
          <p className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground"><Sparkles className="h-3.5 w-3.5" />{t('ข้อเสนอจาก AI · รอตรวจยืนยัน', 'AI suggestion · review before acting')}</p>
          <section className="rounded-xl border border-rose-200 bg-rose-50 p-4 dark:border-rose-900 dark:bg-rose-950/30">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-rose-900 dark:text-rose-200"><AlertCircle className="h-4 w-4" />{t('สิ่งที่ติดขัด', 'Blocker')}</h3>
            <p className="mt-2 text-sm font-semibold">{insight.blocker}</p>
            <blockquote className="mt-3 border-l-2 border-rose-300 pl-3 text-xs leading-6 text-muted-foreground">“{insight.quote}”</blockquote>
            <button type="button" className="mt-2 text-xs font-semibold text-primary hover:underline" onClick={() => onTabChange('source')}>{t('ดูข้อความต้นทาง', 'View source update')} →</button>
          </section>
          <section className="rounded-xl border border-blue-200 bg-blue-50 p-4 dark:border-blue-900 dark:bg-blue-950/30">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-blue-900 dark:text-blue-200"><ArrowRight className="h-4 w-4" />{t('ข้อเสนอขั้นตอนต่อไป', 'Suggested next step')}</h3>
            <p className="mt-2 text-sm font-medium">{insight.title}</p>
            <p className="mt-1 text-xs leading-6 text-muted-foreground">{insight.description}</p>
            <div className="mt-4 flex items-center justify-between gap-2 border-t border-blue-200 pt-3 dark:border-blue-900">
              <span className="text-[11px] text-muted-foreground">{t('ไม่มีการสร้างงานหรือแจ้งเตือนก่อนยืนยัน', 'Nothing is created or sent before confirmation.')}</span>
              <Button size="sm" onClick={() => insight.existingFollowUpId ? onNavigate(insight.existingFollowUpId) : openConfirm()}>{insight.existingFollowUpId ? t('เปิดงานติดตาม', 'Open follow-up') : t('สร้างงานนี้', 'Create this task')}</Button>
            </div>
          </section>
        </> : null}
      {currentData}
      {!!task.followUps?.length && <section className="rounded-xl border p-4"><h3 className="text-sm font-semibold">{t('งานติดตามที่สร้างแล้ว', 'Created follow-ups')}</h3>{task.followUps.map((followUp) => <button key={followUp.id} type="button" className="mt-3 block w-full text-left text-xs text-primary hover:underline" onClick={() => onNavigate(followUp.id)}>{followUp.title} · {statusLabels[followUp.status]} →</button>)}</section>}
    </>}

    {tab === 'source' && <section className="space-y-3">
      <h3 className="text-sm font-semibold">{t('ข้อความต้นทาง', 'Source updates')}</h3>
      {task.comments.length ? [...task.comments].reverse().map((comment) => <article key={comment.id} className={`rounded-xl border p-4 ${insight?.status === 'blocker' && insight.sourceCommentId === comment.id ? 'border-primary/40 bg-primary/5' : 'border-border'}`}>
        <p className="text-xs text-muted-foreground">{comment.author.firstName} {comment.author.lastName} · {formatDateTime(comment.createdAt)}</p>
        <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6">{comment.body}</p>
        {insight?.status === 'blocker' && insight.sourceCommentId === comment.id && <p className="mt-2 text-xs font-medium text-primary">{t('ข้อความที่ AI ใช้อ้างอิง', 'Referenced by the AI suggestion')}: “{insight.quote}”</p>}
      </article>) : <p className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">{t('ยังไม่มีข้อความอัปเดต', 'No updates yet')}</p>}
    </section>}

    {tab === 'history' && <section className="space-y-3">
      <h3 className="text-sm font-semibold">{t('ประวัติงาน', 'Task history')}</h3>
      {history.map((event) => <article key={event.id} className="border-l-2 border-primary/30 py-1 pl-3 text-sm"><p className="whitespace-pre-wrap break-words">{event.text}</p><p className="mt-1 text-xs text-muted-foreground">{event.actor} · {formatDateTime(event.date)}</p>{event.taskId && <button type="button" className="mt-2 text-xs font-semibold text-primary hover:underline" onClick={() => onNavigate(event.taskId!)}>{t('เปิดงานติดตาม', 'Open follow-up')} →</button>}</article>)}
      <p className="text-xs text-muted-foreground">{t('ประวัติเปลี่ยนสถานะและกำหนดส่งเริ่มเก็บตั้งแต่เปิดใช้ฟีเจอร์นี้', 'Status and due-date changes are recorded from when this feature is enabled.')}</p>
    </section>}

    <dialog ref={dialogRef} onCancel={(event) => { if (saving) event.preventDefault(); }} onClose={() => setConfirm(false)} aria-labelledby="ai-followup-title" className="max-h-[calc(100dvh-2rem)] overflow-y-auto w-[min(28rem,calc(100vw-2rem))] rounded-2xl border border-border bg-card p-0 text-foreground shadow-2xl backdrop:bg-slate-950/50">
      <div className="flex items-start justify-between gap-3 border-b p-5"><div><h2 id="ai-followup-title" className="font-semibold">{t('ตรวจและสร้างงานติดตาม', 'Review and create follow-up')}</h2><p className="mt-1 text-xs text-muted-foreground">{t('ข้อมูลนี้ยังไม่เปลี่ยนจนกว่าจะกดยืนยัน', 'Nothing changes until you confirm.')}</p></div><button type="button" aria-label={t('ปิด', 'Close')} onClick={() => setConfirm(false)}><X className="h-4 w-4" /></button></div>
      <form onSubmit={(event) => void createFollowUp(event)} className="space-y-4 p-5">
        <fieldset disabled={saving} className="space-y-4">
        <label className="block text-xs font-medium">{t('ชื่องานติดตาม', 'Follow-up title')}<input required maxLength={200} value={draft.title} onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))} className="mt-1 w-full rounded-lg border bg-background px-3 py-2 text-sm" /></label>
        <label className="block text-xs font-medium">{t('รายละเอียด', 'Details')}<textarea required maxLength={2000} rows={3} value={draft.description} onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))} className="mt-1 w-full rounded-lg border bg-background px-3 py-2 text-sm" /></label>
        <label className="block text-xs font-medium">{t('ผู้รับผิดชอบ', 'Assignee')}<select required value={draft.assigneeId} onChange={(event) => setDraft((current) => ({ ...current, assigneeId: event.target.value }))} className="mt-1 w-full rounded-lg border bg-background px-3 py-2 text-sm"><option value="">{t('เลือกผู้รับผิดชอบ', 'Choose assignee')}</option>{assignableUsers.map((member) => <option key={member.id} value={member.id}>{member.firstName} {member.lastName}</option>)}</select></label>
        <label className="block text-xs font-medium">{t('วันติดตาม', 'Follow-up date')}<input type="date" required min={bangkokDateInputValue(new Date())} value={draft.followUpDate} onChange={(event) => setDraft((current) => ({ ...current, followUpDate: event.target.value }))} className="mt-1 w-full rounded-lg border bg-background px-3 py-2 text-sm" /></label>
        <p className="rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground">{t('งานใหม่เชื่อมกับงานแม่และข้อความต้นทาง วันติดตามไม่เปลี่ยนกำหนดส่งเดิม', 'The new task links to this task and its source update. Its date does not change the original due date.')}</p>
        {saveError && <p role="alert" className="text-xs text-destructive">{saveError}</p>}
        <div className="flex justify-end gap-2"><Button type="button" variant="outline" disabled={saving} onClick={() => setConfirm(false)}>{t('ยกเลิก', 'Cancel')}</Button><Button type="submit" disabled={saving || !draft.title.trim() || !draft.description.trim() || !draft.assigneeId || !draft.followUpDate}>{saving ? t('กำลังสร้าง…', 'Creating…') : t('ยืนยันสร้างงาน', 'Create follow-up')}</Button></div>
        </fieldset>
      </form>
    </dialog>
  </div>;
}

import React, { useState } from 'react';
import { Alert, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { dailyUpdateParts, hasFirmCapability, isEligibleReviewer, routineMissing, TASK_HANDOFF_NOTE_MIN } from '@lawfirm/shared';
import { useAuth } from '@/api/auth';
import { api } from '@/api/client';
import { taskDraftScope } from '@/api/drafts';
import { useTaskDraft } from '@/hooks/useTaskDraft';
import { useCase, useLawyers } from '@/api/hooks';
import type { TaskItem } from '@/api/types';
import { openCaseDocument, openTaskAttachment, uploadTaskAttachment } from '@/api/files';
import { bangkokDay, thDate, thTime } from '@/format';
import { canReviewTask } from '@/workflow';
import { CirclePause, FileText, ListChecks } from 'lucide-react-native';
import { colors, spacing, typeScale } from '@/theme';
import { Text } from './AppText';
import { AttachmentFile, Attachments } from './Attachments';
import { CheckRow, FormPage, StickyBar } from './Form';
import { Disclosure } from './Disclosure';
import { DateField, SelectField, TextArea } from './Input';
import { EmptyState, ErrorState, InlineError, LoadingState } from './States';
import { ActionRow, Button, Card, SectionLabel, Tag, TASK_STATUS_LABEL, taskStatusTone } from './ui';

/** The task itself is the work surface; editing its metadata remains an optional action. */
export function TaskWorkView({ task, onEdit }: { task: TaskItem; onEdit: () => void }) {
  const { user } = useAuth();
  const router = useRouter();
  const client = useQueryClient();
  const { bottom } = useSafeAreaInsets();
  const legalCase = useCase(task.caseId ?? '');
  const members = useLawyers();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [files, setFiles] = useState<AttachmentFile[]>([]);
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const [handoffNote, setHandoffNote] = useState('');
  const [holdReason, setHoldReason] = useState('');
  const [holdCategory, setHoldCategory] = useState('WAITING_CLIENT');
  const [holdFollowUp, setHoldFollowUp] = useState('');
  const [showNote, setShowNote] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const [exampleOpen, setExampleOpen] = useState(false);
  const latest = task.comments?.filter(c => c.kind === 'DAILY_UPDATE').at(-1);
  const previous = dailyUpdateParts(latest?.body ?? '');
  const [completed, setCompleted] = useState(previous.completed);
  const [remaining, setRemaining] = useState(previous.remaining);
  const [blocker, setBlocker] = useState(previous.blocker);
  const [reviewerId, setReviewerId] = useState(task.reviewerId ?? '');
  const worker = task.assigneeId === user?.id && !['DONE', 'PENDING_REVIEW'].includes(task.status);
  const reviewer = !!user && canReviewTask(task, user, task.case?.leadLawyerId ?? legalCase.data?.leadLawyer?.id);
  const targetReviewer = task.reviewerId ?? (task.caseId ? legalCase.data?.leadLawyer?.id : reviewerId);
  const reviewerName = members.data?.find(p => p.id === targetReviewer);
  const reviewerLabel = task.reviewer ? `${task.reviewer.firstName} ${task.reviewer.lastName}` : reviewerName ? `${reviewerName.firstName} ${reviewerName.lastName}` : 'ผู้ตรวจที่กำหนด';
  const routine = task.routine;
  const ready = routineMissing(routine, task.routineCompletedChecks ?? [], task.attachments ?? [], previous.blocker);
  const rejectReason = task.status === 'NEEDS_REVISION' ? task.assignmentLogs?.filter(log => log.action === 'REJECTED').at(-1)?.note : null;
  const documents = useQuery({ queryKey: ['case-documents', task.caseId], enabled: sourcesOpen && !!task.caseId,
    queryFn: () => api<Array<{ id: string; filename: string }>>(`/cases/${task.caseId}/documents`) });
  const draftValue = { files, reason, note, handoffNote, completed, remaining, blocker, reviewerId, reporting, showNote };
  const dirty = !!(files.length || reason.trim() || note.trim() || handoffNote.trim() || completed !== previous.completed || remaining !== previous.remaining || blocker !== previous.blocker || reviewerId !== (task.reviewerId ?? ''));
  const draft = useTaskDraft(user ? `${taskDraftScope(user)}work:${task.id}` : null, draftValue, value => {
    setFiles(value.files);
    for (const [text, set] of [[value.reason, setReason], [value.note, setNote], [value.handoffNote, setHandoffNote], [value.completed, setCompleted], [value.remaining, setRemaining], [value.blocker, setBlocker], [value.reviewerId, setReviewerId]] as const) if (typeof text === 'string') set(text);
    setReporting(!!value.reporting || !!value.blocker); setShowNote(!!value.showNote || !!value.note);
  }, dirty, { name: task.title, route: `/task/new?id=${task.id}` });

  const refresh = async () => {
    const updated = await api<TaskItem>(`/tasks/${task.id}`);
    client.setQueryData(['task', task.id], updated);
    await Promise.all(['todos', 'my-day', 'workload', 'daily-workboard', 'actions', 'case-tasks'].map(key => client.invalidateQueries({ queryKey: [key] })));
    return updated;
  };
  const perform = async (action: () => Promise<unknown>) => {
    if (busy) return;
    setBusy(true); setError('');
    try { if (dirty) await draft.persist(); await action(); await refresh(); }
    catch (e) { setError(e instanceof Error ? e.message : 'บันทึกไม่สำเร็จ ข้อมูลที่กรอกยังอยู่'); }
    finally { setBusy(false); }
  };
  const requireSavedDraft = () => {
    const unsaved = [
      ...(files.length ? [`ไฟล์แนบ ${files.length} ไฟล์`] : []),
      ...(completed !== previous.completed || remaining !== previous.remaining || blocker !== previous.blocker ? ['รายงานความคืบหน้า'] : []),
      ...(note.trim() ? ['บันทึกเพิ่มเติม'] : []),
    ];
    if (unsaved.length) throw new Error(`ยังไม่ได้บันทึก: ${unsaved.join(' / ')} · บันทึกก่อนทำรายการต่อ`);
  };
  const transition = (action: 'handoff' | 'accept' | 'reject') => perform(async () => {
    requireSavedDraft();
    if (action === 'handoff') {
      if (ready.length) throw new Error(`ก่อนส่งยังขาด: ${ready.join(' · ')}`);
      if (!targetReviewer || targetReviewer === user?.id) throw new Error('เลือกผู้ตรวจอีกคนก่อนส่ง');
      if (handoffNote.trim().length < TASK_HANDOFF_NOTE_MIN) throw new Error(`เขียนหมายเหตุถึงผู้ตรวจอย่างน้อย ${TASK_HANDOFF_NOTE_MIN} ตัวอักษร`);
      if (task.requiresAttachment && !(task.attachments ?? []).length) throw new Error('งานนี้ต้องแนบไฟล์ผลงานก่อนส่งตรวจ');
    }
    const path = task.caseId ? `/cases/${task.caseId}/tasks/${task.id}/${action}` : `/todos/${task.id}/${action}`;
    await api(path, { method: action === 'handoff' ? 'PATCH' : 'POST', body: action === 'reject' ? { reason: reason.trim() }
      : action === 'handoff' ? (task.caseId ? { note: handoffNote.trim() } : { reviewerId: targetReviewer, note: handoffNote.trim() }) : {} });
    setReason(''); setHandoffNote('');
  });
  const openFile = (action: () => Promise<void>) => action().catch(e => Alert.alert('เปิดไฟล์ไม่ได้', e.message));
  const primary = !worker ? null : task.assignedAt && !task.acknowledgedAt ? { title: 'รับงานนี้', action: () => perform(() => api(`/tasks/${task.id}/acknowledge`, { method: 'POST' })) }
    : (task.requiresReview || routine || (task.caseId && targetReviewer !== user?.id)) ? { title: `ส่งให้ ${reviewerLabel}ตรวจ`, action: () => transition('handoff') }
      : { title: 'บันทึกว่างานเสร็จ', action: () => perform(async () => {
        requireSavedDraft();
        await api(task.caseId ? `/cases/${task.caseId}/tasks/${task.id}` : `/todos/${task.id}`, { method: 'PATCH', body: { status: 'DONE' } });
      }) };
  const canHold = !!task.caseId && !['DONE', 'PENDING_REVIEW'].includes(task.status)
    && (worker || legalCase.data?.leadLawyer?.id === user?.id || hasFirmCapability(user?.firmRole, 'runOperations'));
  const onHold = !!task.onHold && !task.onHold.endedAt;
  const needsHandoffNote = worker && !!(task.requiresReview || routine || task.caseId || reviewerId) && !(task.assignedAt && !task.acknowledgedAt);

  if (task.status === 'PENDING_REVIEW' && task.caseId && !task.reviewerId && legalCase.isLoading) return <LoadingState />;
  if (!draft.ready) return draft.error ? <View style={{ padding: spacing.lg }}><ErrorState message={draft.error} onRetry={draft.retry} /></View> : <LoadingState />;
  return <View style={{ flex: 1, backgroundColor: colors.bg }}>
    <Stack.Screen options={{ title: reviewer ? 'ตรวจงาน' : 'ทำงาน' }} />
    <FormPage>
      {!!draft.message && dirty && <Text style={{ color: colors.faint, fontSize: 12 }}>{draft.message}</Text>}
      {!!draft.warning && <InlineError message={draft.warning} />}
      {!!draft.error && <InlineError message={draft.error} onRetry={draft.retry} />}
      <Card style={{ gap: spacing.sm }}>
      <Tag tone={taskStatusTone(task.status)}>{TASK_STATUS_LABEL[task.status] ?? task.status}</Tag>
      <Text accessibilityRole="header" style={{ ...typeScale.title, color: colors.ink }}>{task.title}</Text>
      {task.dueDate && <Text style={{ color: colors.muted }}>กำหนดส่ง {thDate(task.dueDate)}</Text>}
      {!!task.recurrenceDays && <Text style={{ color: colors.muted, fontSize: 13 }}>ทำซ้ำอีก {task.recurrenceDays} วันหลังปิดรอบนี้</Text>}
      {task.case && <ActionRow title={`${task.case.ownRef} · ${task.case.title}`} detail="เปิดแฟ้มคดี" onPress={() => router.push(`/case/${task.caseId}`)} />}
      {worker && !!task.acknowledgedAt && <Button title="ทำงานนี้วันนี้" variant="secondary" inline disabled={busy}
        onPress={() => perform(() => api(`/tasks/${task.id}/confirm-plan`, { method: 'POST', body: { date: bangkokDay(new Date().toISOString()) } }))} />}
      </Card>
      {!!rejectReason && <Card flat style={{ gap: spacing.xs, borderColor: colors.warnEdge, backgroundColor: colors.warnSoft }}>
        <Text style={{ color: colors.warn, fontWeight: '600' }}>เหตุผลส่งกลับ: {rejectReason}</Text>
        <Text style={{ color: colors.text }}>ตรวจผลงานใหม่ก่อนส่งซ้ำ</Text>
      </Card>}
      {task.workflow?.workflowRun && <Card style={{ gap: spacing.xs }}>
        <Text style={{ color: colors.ink, fontWeight: '700' }}>สายงาน: {task.workflow.workflowRun.name} · ขั้น {task.workflow.workflowStep != null && task.workflow.stepsTotal ? `${task.workflow.workflowStep + 1}/${task.workflow.stepsTotal}` : '?'}</Text>
        {task.workflow.previousStepHolder && <Text style={{ color: colors.muted }}>ต่อจาก: {task.workflow.previousStepHolder}</Text>}
        {task.workflow.previousStepAttachments && task.workflow.previousStepAttachments.length > 0 && <>
          <Text style={{ color: colors.text, fontWeight: '600', marginTop: spacing.sm }}>ไฟล์จากขั้นก่อน</Text>
          {task.workflow.previousStepAttachments.map(file => <ActionRow key={file.id} title={file.filename} onPress={() => openFile(() => openTaskAttachment(file.taskId, file.id, file.filename))} />)}
        </>}
      </Card>}
      {task.followUps?.map(follow => <Card key={follow.id} style={{ gap: spacing.sm }}>
        <Text style={{ fontWeight: '700', color: colors.ink }}>{follow.title}</Text>
        <Text>คนรับแก้ {follow.assignee ? `${follow.assignee.firstName} ${follow.assignee.lastName}` : 'ยังไม่มอบหมาย'}</Text>
        <Tag tone={follow.status === 'DONE' ? 'ok' : 'due'}>{follow.status === 'DONE' ? 'คนแก้ปิดเรื่องแล้ว' : follow.status === 'PENDING_REVIEW' ? 'คนแก้ส่งตรวจแล้ว' : 'ยังรอคนแก้'}</Tag>
        <Button title="เปิดติดตามเรื่องนี้" variant="link" onPress={() => router.push({ pathname: '/task/new', params: { id: follow.id } })} />
        {worker && follow.status === 'DONE' && task.blockedById === follow.id && !!previous.blocker && <Button title="ฉันตรวจแล้ว จุดติดขัดนี้แก้แล้ว" variant="secondary" disabled={busy} onPress={() => perform(async () => {
          requireSavedDraft();
          await api(`/tasks/${task.id}/daily-update`, { method: 'POST', body: { completed, remaining, blocker: '' } });
          setBlocker('');
        })} />}
      </Card>)}
      {(worker || user?.firmRole === 'OWNER') && task.status !== 'DONE' && !!previous.blocker && <Button title="ส่งจุดติดขัดให้คนแก้" variant="secondary" disabled={busy} onPress={() => {
        try { requireSavedDraft(); router.push({ pathname: '/task/blocker', params: { id: task.id } }); }
        catch (e) { setError(e instanceof Error ? e.message : 'บันทึกรายงานก่อนส่ง'); }
      }} />}
      {routine ? <Card style={{ gap: spacing.sm }}>
        <SectionLabel>ทำงานนี้ให้เสร็จ</SectionLabel>
        <Text style={{ color: colors.faint, fontSize: 12 }}>{routine.releaseName} · รุ่น {routine.version}</Text>
        <Text style={{ color: colors.text, fontWeight: '700' }}>ต้องส่ง: {routine.expectedOutput}</Text>
        <Text style={{ color: colors.muted }}>ส่งให้ {reviewerLabel}ตรวจ</Text>
        {!!task.description && <Text style={{ color: colors.text }}>{task.description}</Text>}
        {!!routine.sourceHint && <Text style={{ color: colors.text }}>ต้นฉบับ: {routine.sourceHint}</Text>}
        {!!routine.exampleFilename && <Text style={{ color: colors.muted }}>ตัวอย่างชื่อไฟล์: {routine.exampleFilename}</Text>}
        {task.caseId && <Disclosure variant="plain" title="เอกสารต้นทางในคดี" summary="เปิดไฟล์ในแฟ้มคดีเพื่อใช้ทำงานนี้" open={sourcesOpen} onToggle={setSourcesOpen}>
          {documents.isError && <InlineError message="โหลดเอกสารต้นทางไม่ได้" onRetry={() => documents.refetch()} />}
          {documents.isLoading && <LoadingState inline label="กำลังโหลดเอกสาร…" />}
          {documents.data?.map(doc => <ActionRow key={doc.id} title={doc.filename} onPress={() => openFile(() => openCaseDocument(task.caseId!, doc.id, doc.filename))} />)}
          {documents.data?.length === 0 && <Text style={{ color: colors.warn }}>ยังไม่มีเอกสารในแฟ้ม · แจ้งเอกสารขาดด้านล่าง</Text>}
        </Disclosure>}
        {(routine.sourceTemplate || routine.exampleOutput) && <Disclosure variant="plain" title="แบบบันทึกและตัวอย่างผลงาน" open={exampleOpen} onToggle={setExampleOpen}>
          {!!routine.sourceTemplate && <><SectionLabel style={{ marginTop: 0 }}>แบบบันทึก · เติมข้อมูลจริงจากต้นฉบับ</SectionLabel><Text selectable>{routine.sourceTemplate}</Text></>}
          {!!routine.exampleOutput && <><SectionLabel>ตัวอย่างผลงาน · ห้ามใช้แทนข้อมูลจริง</SectionLabel><Text selectable>{routine.exampleOutput}</Text></>}
        </Disclosure>}
        {!!routine.missingDocuments && <>
          <SectionLabel>เมื่อเอกสารขาดหรือข้อมูลไม่ตรง</SectionLabel>
          <Text style={{ color: colors.warn }}>{routine.missingDocuments}</Text>
          {worker && !!task.acknowledgedAt && <Button title="แจ้งเอกสารขาด / จุดติดขัด" variant="link" onPress={() => { setReporting(true); if (!blocker.trim()) setBlocker('เอกสารหรือข้อมูลที่ขาด: '); }} />}
        </>}
        <SectionLabel>รายการตรวจก่อนส่ง</SectionLabel>
        {routine.checks.map((check, index) => <CheckRow key={index} label={`${index + 1}. ${check}`}
          checked={task.routineCompletedChecks?.includes(index) ?? false} disabled={!worker || !task.acknowledgedAt || busy}
          onChange={() => perform(() => api(`/tasks/${task.id}/routine-progress`, { method: 'POST', body: {
            expectedUpdatedAt: task.updatedAt, completedChecks: task.routineCompletedChecks?.includes(index)
              ? task.routineCompletedChecks.filter(i => i !== index) : [...(task.routineCompletedChecks ?? []), index],
          } }))} />)}
        {worker && !task.acknowledgedAt && <Text style={{ color: colors.muted }}>กดรับงานก่อนเริ่มตรวจรายการ</Text>}
        {worker && <Text style={{ color: ready.length ? colors.warn : colors.good }}>{ready.length ? `ก่อนส่งยังขาด ${ready.length} รายการ · ${ready[0]}` : 'ครบรายการแล้ว · เปิดผลงานตรวจอีกครั้งก่อนส่ง'}</Text>}
      </Card> : task.description ? <Text style={{ color: colors.text }}>{task.description}</Text> : null}
      <SectionLabel>ผลงานและไฟล์แนบ</SectionLabel>
      {!!task.attachments?.length && <Card style={{ paddingVertical: 0 }}>
        {task.attachments.map(file => <ActionRow key={file.id} title={file.filename} detail="เปิดไฟล์" onPress={() => openFile(() => openTaskAttachment(task.id, file.id, file.filename))} />)}
      </Card>}
      {!task.attachments?.length && !worker && <Card flat style={{ paddingVertical: 0 }}><EmptyState compact>ยังไม่มีไฟล์แนบ</EmptyState></Card>}
      {worker && (!routine || !!task.acknowledgedAt) && <>
        <Attachments files={files} onChange={setFiles} disabled={busy} />
        {files.length > 0 && <Button title={`บันทึกไฟล์ ${files.length} ไฟล์กับงานนี้`} variant="secondary" busy={busy} onPress={() => perform(async () => {
          let remainingFiles = files;
          for (const file of files) {
            await uploadTaskAttachment(task.id, file);
            remainingFiles = remainingFiles.filter(item => item.uri !== file.uri);
            await draft.persist({ ...draftValue, files: remainingFiles });
            setFiles(remainingFiles);
          }
        })} />}
        <Disclosure icon={ListChecks} title="รายงานความคืบหน้า · เอกสารขาด · ไม่แน่ใจ" summary={latest ? 'แก้รายงานล่าสุดให้ผู้ดูแลงานเห็น' : 'บอกผู้ดูแลงานว่าทำถึงไหนแล้ว'}
          open={reporting} onToggle={setReporting}>
          <View style={{ gap: spacing.sm }}>
            <TextArea label="ทำแล้ว" required value={completed} onChange={setCompleted} disabled={busy} />
            <TextArea label="เหลืออะไร" required value={remaining} onChange={setRemaining} disabled={busy} />
            <TextArea label="ติดอะไร · ถ้ามี" hint="ล้างช่องนี้เมื่อแก้แล้ว" value={blocker} onChange={setBlocker} disabled={busy} />
            <Button title="บันทึกรายงานให้ผู้ดูแลงานเห็น" variant="secondary" busy={busy} onPress={() => perform(async () => {
              if (!completed.trim() || !remaining.trim()) throw new Error('ระบุว่าทำแล้วอะไรและเหลืออะไร ข้อมูลที่กรอกยังอยู่');
              await api(`/tasks/${task.id}/daily-update`, { method: 'POST', body: { completed, remaining, blocker } });
              setCompleted(completed.trim()); setRemaining(remaining.trim()); setBlocker(blocker.trim()); setReporting(false);
            })} />
          </View>
        </Disclosure>
      </>}
      {latest && <Card style={{ gap: spacing.xs }}>
        <Text style={{ ...typeScale.overline, color: colors.muted }}>รายงานล่าสุด</Text>
        <Text style={{ color: colors.text }}>{latest.body}</Text>
        <Text style={{ color: colors.muted, fontSize: 12 }}>อัปเดต {latest.createdAt ? `${thDate(latest.createdAt)} ${thTime(latest.createdAt)}` : 'ไม่ทราบเวลา'} · {latest.author?.firstName}</Text>
      </Card>}
      {canHold && <Disclosure icon={CirclePause} title={onHold ? 'พักงานอยู่' : 'พักงาน · ถ้าต้องรอ'} summary={onHold ? task.onHold!.reason : 'รอลูกความ ศาล เอกสาร หรือคนภายนอก'} defaultOpen={onHold}>
        {onHold ? <View style={{ gap: spacing.sm }}>
          <View style={{ flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' }}>
            <CirclePause size={18} color={colors.muted} />
            <Text style={{ flex: 1, color: colors.text }}>{task.onHold!.reason}</Text>
          </View>
          {task.onHold!.nextFollowUpAt && <Text style={{ color: colors.muted }}>ติดตามครั้งถัดไป {thDate(task.onHold!.nextFollowUpAt)}</Text>}
          <Button title="กลับมาทำต่อ" variant="secondary" disabled={busy} onPress={() => perform(() => api(`/cases/${task.caseId}/tasks/${task.id}/hold/resume`, { method: 'POST' }))} />
        </View> : <View style={{ gap: spacing.sm }}>
          <TextArea label="เหตุผลที่พัก" required value={holdReason} onChange={setHoldReason} disabled={busy} />
          <SelectField sheetTitle="เลือกประเภทการพัก" label="ประเภทการพัก" value={holdCategory} onChange={setHoldCategory} options={[
            { value: 'WAITING_CLIENT', label: 'รอลูกความ' }, { value: 'WAITING_COURT', label: 'รอศาล' }, { value: 'WAITING_DOCUMENT', label: 'รอเอกสาร' },
            { value: 'WAITING_INTERNAL_REVIEW', label: 'รอรีวิวภายใน' }, { value: 'WAITING_EXTERNAL', label: 'รอบุคคลภายนอก' }, { value: 'OTHER', label: 'อื่น ๆ' },
          ]} disabled={busy} />
          <DateField label="วันติดตามครั้งถัดไป · ถ้ามี" placeholder="ไม่กำหนด" value={holdFollowUp} onChange={setHoldFollowUp}
            onClear={() => setHoldFollowUp('')} minDate={bangkokDay(new Date().toISOString())} disabled={busy} />
          <Button title="พักงาน" variant="secondary" disabled={busy || !holdReason.trim()} onPress={() => perform(async () => {
            await api(`/cases/${task.caseId}/tasks/${task.id}/hold`, { method: 'PATCH', body: { reason: holdReason.trim(), category: holdCategory, nextFollowUpAt: holdFollowUp || undefined } });
            setHoldReason(''); setHoldFollowUp('');
          })} />
        </View>}
      </Disclosure>}
      {reviewer && <>
        <SectionLabel>ส่งกลับให้แก้ · ถ้าไม่ผ่าน</SectionLabel>
        <TextArea label="เหตุผลส่งกลับแก้ไข" value={reason} onChange={setReason} disabled={busy} />
        <Button title="ส่งกลับแก้ไข" variant="danger" disabled={busy || !reason.trim()} onPress={() => transition('reject')} />
      </>}
      <Disclosure icon={FileText} title="บันทึกเพิ่มเติม · ถ้ามี" summary="ข้อความถึงทีมในงานนี้" open={showNote || !!note.trim()} onToggle={setShowNote}>
        <View style={{ gap: spacing.sm }}>
          <TextArea label="บันทึกเพิ่มเติม" value={note} onChange={setNote} disabled={busy} />
          <Button title="บันทึกข้อความ" variant="secondary" busy={busy} disabled={!note.trim()} onPress={() => perform(async () => { await api(`/tasks/${task.id}/comments`, { method: 'POST', body: { body: note.trim() } }); setNote(''); })} />
        </View>
      </Disclosure>
      <Button title="แก้ไขรายละเอียดงาน" variant="link" disabled={busy} onPress={() => {
        try { requireSavedDraft(); onEdit(); } catch (e) { setError((e as Error).message); }
      }} />
      {/* Handoff inputs sit at the end of the page, right above the pinned primary that sends them. */}
      {worker && !task.caseId && !task.reviewerId && <SelectField sheetTitle="เลือกผู้ตรวจงาน" label="ผู้ตรวจงาน · ถ้าจะส่งตรวจ" value={reviewerId} onChange={setReviewerId}
        options={(members.data ?? []).filter(p => isEligibleReviewer({ role: p.firmRole, userId: p.id, assigneeId: task.assigneeId })).map(p => ({ value: p.id, label: `${p.firstName} ${p.lastName}` }))} disabled={busy || members.isError} />}
      {needsHandoffNote && <TextArea label="หมายเหตุถึงผู้ตรวจ" required hint={`อย่างน้อย ${TASK_HANDOFF_NOTE_MIN} ตัวอักษร${handoffNote.trim() && handoffNote.trim().length < TASK_HANDOFF_NOTE_MIN ? ` · อีก ${TASK_HANDOFF_NOTE_MIN - handoffNote.trim().length} ตัวอักษร` : ''}`}
        value={handoffNote} onChange={setHandoffNote} disabled={busy} />}
      {worker && !routine && !task.requiresReview && !task.caseId && reviewerId && <Button title="ส่งตรวจงาน" variant="secondary" disabled={busy} onPress={() => transition('handoff')} />}
    </FormPage>
    {(primary || reviewer || !!error) && <StickyBar bottomInset={bottom}>
      <View style={{ width: '100%', maxWidth: 728, alignSelf: 'center', gap: spacing.sm }}>
      <InlineError message={error} />
      {primary && <Button title={primary.title} busy={busy} onPress={primary.action} />}
      {reviewer && <Button title="ผ่านการตรวจ / ปิดงาน" busy={busy} onPress={() => Alert.alert('ยืนยันผลตรวจ', `ตรวจผลงานของ “${task.title}” ครบแล้ว?`, [
        { text: 'ยกเลิก', style: 'cancel' }, { text: 'ผ่านการตรวจ', onPress: () => transition('accept') },
      ])} />}
      </View>
    </StickyBar>}
  </View>;
}

import React, { useState } from 'react';
import { Alert, Pressable, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { dailyUpdateParts, routineMissing } from '@lawfirm/shared';
import { useAuth } from '@/api/auth';
import { api } from '@/api/client';
import { taskDraftScope } from '@/api/drafts';
import { useTaskDraft } from '@/hooks/useTaskDraft';
import { useCase, useLawyers } from '@/api/hooks';
import type { TaskItem } from '@/api/types';
import { openCaseDocument, openTaskAttachment, uploadTaskAttachment } from '@/api/files';
import { bangkokDay, thDate, thTime } from '@/format';
import { canReviewTask } from '@/workflow';
import { colors, spacing } from '@/theme';
import { Text } from './AppText';
import { AttachmentFile, Attachments } from './Attachments';
import { FormField, FormPage } from './Form';
import { Dropdown } from './Dropdown';
import { Button, Card, ErrorNote, Loading, SectionLabel, Tag } from './ui';

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
  const reviewer = !!user && canReviewTask(task, user, legalCase.data?.leadLawyer?.id);
  const targetReviewer = task.reviewerId ?? (task.caseId ? legalCase.data?.leadLawyer?.id : reviewerId);
  const reviewerName = members.data?.find(p => p.id === targetReviewer);
  const reviewerLabel = reviewerName ? `${reviewerName.firstName} ${reviewerName.lastName}` : 'ผู้ตรวจที่กำหนด';
  const routine = task.routine;
  const ready = routineMissing(routine, task.routineCompletedChecks ?? [], task.attachments ?? [], previous.blocker);
  const rejectReason = task.status === 'NEEDS_REVISION' ? task.assignmentLogs?.filter(log => log.action === 'REJECTED').at(-1)?.note : null;
  const documents = useQuery({ queryKey: ['case-documents', task.caseId], enabled: sourcesOpen && !!task.caseId,
    queryFn: () => api<Array<{ id: string; filename: string }>>(`/cases/${task.caseId}/documents`) });
  const draftValue = { files, reason, note, completed, remaining, blocker, reviewerId, reporting, showNote };
  const dirty = !!(files.length || reason.trim() || note.trim() || completed !== previous.completed || remaining !== previous.remaining || blocker !== previous.blocker || reviewerId !== (task.reviewerId ?? ''));
  const draft = useTaskDraft(user ? `${taskDraftScope(user)}work:${task.id}` : null, draftValue, value => {
    setFiles(value.files);
    for (const [text, set] of [[value.reason, setReason], [value.note, setNote], [value.completed, setCompleted], [value.remaining, setRemaining], [value.blocker, setBlocker], [value.reviewerId, setReviewerId]] as const) if (typeof text === 'string') set(text);
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
    if (files.length || note.trim() || completed !== previous.completed || remaining !== previous.remaining || blocker !== previous.blocker) {
      throw new Error('บันทึกไฟล์ ข้อความ และรายงานที่กำลังกรอกก่อนทำรายการต่อ');
    }
  };
  const transition = (action: 'handoff' | 'accept' | 'reject') => perform(async () => {
    requireSavedDraft();
    if (action === 'handoff') {
      if (ready.length) throw new Error(`ก่อนส่งยังขาด: ${ready.join(' · ')}`);
      if (!targetReviewer || targetReviewer === user?.id) throw new Error('เลือกผู้ตรวจอีกคนก่อนส่ง');
    }
    const path = task.caseId ? `/cases/${task.caseId}/tasks/${task.id}/${action}` : `/todos/${task.id}/${action}`;
    await api(path, { method: action === 'handoff' ? 'PATCH' : 'POST', body: action === 'reject' ? { reason: reason.trim() }
      : action === 'handoff' && !task.caseId ? { reviewerId: targetReviewer } : {} });
    setReason('');
  });
  const openFile = (action: () => Promise<void>) => action().catch(e => Alert.alert('เปิดไฟล์ไม่ได้', e.message));
  const primary = !worker ? null : task.assignedAt && !task.acknowledgedAt ? { title: 'รับงานนี้', action: () => perform(() => api(`/tasks/${task.id}/acknowledge`, { method: 'POST' })) }
    : (task.requiresReview || routine || (task.caseId && targetReviewer !== user?.id)) ? { title: `ส่งให้ ${reviewerLabel}ตรวจ`, action: () => transition('handoff') }
      : { title: 'บันทึกว่างานเสร็จ', action: () => perform(async () => {
        requireSavedDraft();
        await api(task.caseId ? `/cases/${task.caseId}/tasks/${task.id}` : `/todos/${task.id}`, { method: 'PATCH', body: { status: 'DONE' } });
      }) };

  if (!draft.ready) return draft.error ? <ErrorNote message={draft.error} onRetry={draft.retry} /> : <Loading />;
  return <View style={{ flex: 1, backgroundColor: colors.bg }}>
    <Stack.Screen options={{ title: reviewer ? 'ตรวจงาน' : 'ทำงาน' }} />
    <FormPage>
      {!!draft.message && dirty && <Text style={{ color: colors.faint, fontSize: 12 }}>{draft.message}</Text>}
      {!!draft.warning && <Text style={{ color: colors.warn }}>{draft.warning}</Text>}
      {!!draft.error && <ErrorNote message={draft.error} onRetry={draft.retry} />}
      {task.case && <Button title={`${task.case.ownRef} · ${task.case.title}`} ghost onPress={() => router.push(`/case/${task.caseId}`)} />}
      <Tag tone={task.status === 'NEEDS_REVISION' ? 'due' : task.status === 'DONE' ? 'ok' : 'plain'}>{({ TODO: 'ต้องทำ', IN_PROGRESS: 'กำลังทำ', PENDING_REVIEW: 'รอตรวจ', NEEDS_REVISION: 'ส่งกลับแก้ไข', DONE: 'เสร็จแล้ว' } as Record<string, string>)[task.status] ?? task.status}</Tag>
      <Text style={{ color: colors.ink, fontSize: 20, fontWeight: '700' }}>{task.title}</Text>
      {task.dueDate && <Text style={{ color: colors.muted }}>กำหนดส่ง {thDate(task.dueDate)}</Text>}
      {!!task.recurrenceDays && <Text style={{ color: colors.faint }}>ทำซ้ำอีก {task.recurrenceDays} วันหลังปิดรอบนี้</Text>}
      {(worker || user?.firmRole === 'OWNER') && task.status !== 'DONE' && !!previous.blocker && <Button title="ส่งจุดติดขัดให้คนแก้" ghost disabled={busy} onPress={() => {
        try { requireSavedDraft(); router.push({ pathname: '/task/blocker', params: { id: task.id } }); }
        catch (e) { setError(e instanceof Error ? e.message : 'บันทึกรายงานก่อนส่ง'); }
      }} />}
      {task.followUps?.map(follow => <Card key={follow.id} style={{ gap: spacing.sm }}>
        <Text style={{ fontWeight: '700', color: colors.ink }}>{follow.title}</Text>
        <Text>คนรับแก้ {follow.assignee ? `${follow.assignee.firstName} ${follow.assignee.lastName}` : 'ยังไม่มอบหมาย'}</Text>
        <Tag tone={follow.status === 'DONE' ? 'ok' : 'due'}>{follow.status === 'DONE' ? 'คนแก้ปิดเรื่องแล้ว' : follow.status === 'PENDING_REVIEW' ? 'คนแก้ส่งตรวจแล้ว' : 'ยังรอคนแก้'}</Tag>
        <Button title="เปิดติดตามเรื่องนี้" ghost onPress={() => router.push({ pathname: '/task/new', params: { id: follow.id } })} />
        {worker && follow.status === 'DONE' && task.blockedById === follow.id && !!previous.blocker && <Button title="ฉันตรวจแล้ว จุดติดขัดนี้แก้แล้ว" disabled={busy} onPress={() => perform(async () => {
          requireSavedDraft();
          await api(`/tasks/${task.id}/daily-update`, { method: 'POST', body: { completed, remaining, blocker: '' } });
          setBlocker('');
        })} />}
      </Card>)}
      {!!rejectReason && <Card><Text style={{ color: colors.warn }}>เหตุผลส่งกลับ: {rejectReason}</Text><Text>ตรวจผลงานใหม่ก่อนส่งซ้ำ</Text></Card>}
      {!!error && <ErrorNote message={error} onRetry={() => perform(async () => {})} />}
      {routine ? <Card style={{ gap: spacing.sm }}>
        <SectionLabel>ทำงานนี้ให้เสร็จ</SectionLabel>
        <Text style={{ color: colors.faint, fontSize: 12 }}>{routine.releaseName} · รุ่น {routine.version}</Text>
        <Text style={{ color: colors.text, fontWeight: '700' }}>ต้องส่ง: {routine.expectedOutput}</Text>
        <Text style={{ color: colors.muted }}>ส่งให้ {reviewerLabel}ตรวจ</Text>
        {!!task.description && <Text style={{ color: colors.text }}>{task.description}</Text>}
        {!!routine.sourceHint && <Text style={{ color: colors.text }}>ต้นฉบับ: {routine.sourceHint}</Text>}
        {task.caseId && <Button title={sourcesOpen ? 'ซ่อนเอกสารต้นทางในคดี' : 'เปิดเอกสารต้นทางในคดี'} ghost onPress={() => setSourcesOpen(!sourcesOpen)} />}
        {sourcesOpen && documents.isError && <ErrorNote message="โหลดเอกสารต้นทางไม่ได้" onRetry={() => documents.refetch()} />}
        {sourcesOpen && documents.isLoading && <Text>กำลังโหลดเอกสาร…</Text>}
        {sourcesOpen && documents.data?.map(doc => <Button key={doc.id} title={doc.filename} ghost onPress={() => openFile(() => openCaseDocument(task.caseId!, doc.id, doc.filename))} />)}
        {sourcesOpen && documents.data?.length === 0 && <Text style={{ color: colors.warn }}>ยังไม่มีเอกสารในแฟ้ม · แจ้งผู้ดูแลงานด้านล่าง</Text>}
        {!!routine.exampleFilename && <Text style={{ color: colors.muted }}>ตัวอย่างชื่อไฟล์: {routine.exampleFilename}</Text>}
        {(routine.sourceTemplate || routine.exampleOutput) && <>
          <Button title={exampleOpen ? 'ย่อแบบบันทึกและตัวอย่าง' : 'ดูแบบบันทึกและตัวอย่างผลงาน'} ghost onPress={() => setExampleOpen(!exampleOpen)} />
          {exampleOpen && <>
            {!!routine.sourceTemplate && <><SectionLabel>แบบบันทึก · เติมข้อมูลจริงจากต้นฉบับ</SectionLabel><Text selectable>{routine.sourceTemplate}</Text></>}
            {!!routine.exampleOutput && <><SectionLabel>ตัวอย่างผลงาน · ห้ามใช้แทนข้อมูลจริง</SectionLabel><Text selectable>{routine.exampleOutput}</Text></>}
          </>}
        </>}
        {!!routine.missingDocuments && <>
          <SectionLabel>เมื่อเอกสารขาดหรือข้อมูลไม่ตรง</SectionLabel>
          <Text style={{ color: colors.warn }}>{routine.missingDocuments}</Text>
          {worker && !!task.acknowledgedAt && <Button title="แจ้งเอกสารขาด / จุดติดขัด" ghost onPress={() => { setReporting(true); if (!blocker.trim()) setBlocker('เอกสารหรือข้อมูลที่ขาด: '); }} />}
        </>}
        {routine.checks.map((check, index) => <Pressable key={index} accessibilityRole="checkbox" accessibilityLabel={check}
          accessibilityState={{ checked: task.routineCompletedChecks?.includes(index) ?? false, disabled: !worker || !task.acknowledgedAt || busy }}
          disabled={!worker || !task.acknowledgedAt || busy} style={{ minHeight: 44, flexDirection: 'row', gap: spacing.sm, alignItems: 'center' }}
          onPress={() => perform(() => api(`/tasks/${task.id}/routine-progress`, { method: 'POST', body: {
            expectedUpdatedAt: task.updatedAt, completedChecks: task.routineCompletedChecks?.includes(index)
              ? task.routineCompletedChecks.filter(i => i !== index) : [...(task.routineCompletedChecks ?? []), index],
          } }))}>
          <Text style={{ color: colors.info, fontSize: 22 }}>{task.routineCompletedChecks?.includes(index) ? '☑' : '☐'}</Text>
          <Text style={{ flex: 1, color: colors.text }}>{index + 1}. {check}</Text>
        </Pressable>)}
        {worker && !task.acknowledgedAt && <Text style={{ color: colors.muted }}>กดรับงานก่อนเริ่มตรวจรายการ</Text>}
        {worker && <Text style={{ color: ready.length ? colors.warn : colors.good }}>{ready.length ? `ก่อนส่งยังขาด ${ready.length} รายการ · ${ready[0]}` : 'ครบรายการแล้ว · เปิดผลงานตรวจอีกครั้งก่อนส่ง'}</Text>}
      </Card> : task.description ? <Text style={{ color: colors.text }}>{task.description}</Text> : null}
      <SectionLabel>ผลงานและไฟล์แนบ</SectionLabel>
      {task.attachments?.map(file => <Button key={file.id} title={`เปิด ${file.filename}`} ghost onPress={() => openFile(() => openTaskAttachment(task.id, file.id, file.filename))} />)}
      {!task.attachments?.length && <Text style={{ color: colors.faint }}>ยังไม่มีไฟล์แนบ</Text>}
      {worker && (!routine || !!task.acknowledgedAt) && <>
        <Attachments files={files} onChange={setFiles} disabled={busy} />
        {files.length > 0 && <Button title="บันทึกไฟล์กับงานนี้" busy={busy} onPress={() => perform(async () => {
          let remainingFiles = files;
          for (const file of files) {
            await uploadTaskAttachment(task.id, file);
            remainingFiles = remainingFiles.filter(item => item.uri !== file.uri);
            await draft.persist({ ...draftValue, files: remainingFiles });
            setFiles(remainingFiles);
          }
        })} />}
        <Button title={reporting ? 'ซ่อนรายงานที่กรอกอยู่' : 'แจ้งความคืบหน้า / เอกสารขาด / ไม่แน่ใจ'} ghost onPress={() => setReporting(!reporting)} />
        {reporting && <>
          <FormField label="ทำแล้ว" value={completed} onChange={setCompleted} disabled={busy} multiline />
          <FormField label="เหลืออะไร" value={remaining} onChange={setRemaining} disabled={busy} multiline />
          <FormField label="ติดอะไร · ล้างช่องนี้เมื่อแก้แล้ว" value={blocker} onChange={setBlocker} disabled={busy} multiline />
          <Button title="บันทึกรายงานให้ผู้ดูแลงานเห็น" busy={busy} onPress={() => perform(async () => {
            if (!completed.trim() || !remaining.trim()) throw new Error('ระบุว่าทำแล้วอะไรและเหลืออะไร ข้อมูลที่กรอกยังอยู่');
            await api(`/tasks/${task.id}/daily-update`, { method: 'POST', body: { completed, remaining, blocker } });
            setCompleted(completed.trim()); setRemaining(remaining.trim()); setBlocker(blocker.trim()); setReporting(false);
          })} />
        </>}
      </>}
      {latest && <Card><Text style={{ color: colors.text }}>{latest.body}</Text><Text style={{ color: colors.faint, fontSize: 12 }}>อัปเดต {latest.createdAt ? `${thDate(latest.createdAt)} ${thTime(latest.createdAt)}` : 'ไม่ทราบเวลา'} · {latest.author?.firstName}</Text></Card>}
      {worker && !task.caseId && !task.reviewerId && <Dropdown label="ผู้ตรวจงาน (ถ้าจะส่งตรวจ)" value={reviewerId} onChange={setReviewerId}
        options={(members.data ?? []).filter(p => p.id !== user?.id).map(p => ({ value: p.id, label: `${p.firstName} ${p.lastName}` }))} disabled={busy || members.isError} />}
      {reviewer && <>
        <FormField label="เหตุผลส่งกลับแก้ไข" value={reason} onChange={setReason} disabled={busy} multiline />
        <Button title="ส่งกลับแก้ไข" ghost disabled={busy || !reason.trim()} onPress={() => transition('reject')} />
      </>}
      <Button title="รายละเอียดงาน / ความคิดเห็นเพิ่มเติม" ghost onPress={() => {
        try { requireSavedDraft(); onEdit(); } catch (e) { setError((e as Error).message); }
      }} disabled={busy} />
      <Button title={showNote ? 'ซ่อนบันทึกเพิ่มเติม' : 'บันทึกเพิ่มเติม (ถ้ามี)'} ghost onPress={() => setShowNote(!showNote)} />
      {showNote && <FormField label="บันทึกเพิ่มเติม" value={note} onChange={setNote} disabled={busy} multiline />}
      {!!note.trim() && <Button title="บันทึกข้อความ" busy={busy} onPress={() => perform(async () => { await api(`/tasks/${task.id}/comments`, { method: 'POST', body: { body: note.trim() } }); setNote(''); })} />}
    </FormPage>
    <View style={{ padding: spacing.md, paddingBottom: spacing.md + bottom, borderTopWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, gap: spacing.sm }}>
      <View style={{ width: '100%', maxWidth: 728, alignSelf: 'center', gap: spacing.sm }}>
      {!!error && <Text accessibilityRole="alert" style={{ color: colors.warn }}>{error}</Text>}
      {worker && !!task.acknowledgedAt && <Button title="ทำงานนี้วันนี้" ghost disabled={busy} onPress={() => perform(() => api(`/tasks/${task.id}/confirm-plan`, { method: 'POST', body: { date: bangkokDay(new Date().toISOString()) } }))} />}
      {primary && <Button title={primary.title} busy={busy} onPress={primary.action} />}
      {worker && !routine && !task.requiresReview && !task.caseId && reviewerId && <Button title="ส่งตรวจงาน" ghost disabled={busy} onPress={() => transition('handoff')} />}
      {reviewer && <Button title="ผ่านการตรวจ / ปิดงาน" busy={busy} onPress={() => Alert.alert('ยืนยันผลตรวจ', `ตรวจผลงานของ “${task.title}” ครบแล้ว?`, [
        { text: 'ยกเลิก', style: 'cancel' }, { text: 'ผ่านการตรวจ', onPress: () => transition('accept') },
      ])} />}
      </View>
    </View>
  </View>;
}

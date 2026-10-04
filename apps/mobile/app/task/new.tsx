import React, { useEffect, useRef, useState } from 'react';
import { Alert, Pressable, Switch, View } from 'react-native';
import { Text } from '@/components/AppText';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { canAssignFirmRole, FirmRole, assignmentCandidates, assignmentWarnings, TaskWorkType, TaskRoutineDefinition } from '@lawfirm/shared';
import { useAuth } from '@/api/auth';
import { api, ApiError } from '@/api/client';
import { taskDraftScope } from '@/api/drafts';
import { useTaskDraft } from '@/hooks/useTaskDraft';
import { useCase, useLawyers, useLeaves, useDailyWorkboard } from '@/api/hooks';
import type { TaskItem } from '@/api/types';
import { uploadTaskAttachment, openTaskAttachment } from '@/api/files';
import { Attachments, AttachmentFile } from '@/components/Attachments';
import { FormField, FormPage, FormSection } from '@/components/Form';
import { Dropdown } from '@/components/Dropdown';
import { DatePicker } from '@/components/DatePicker';
import { CasePicker, CaseRef } from '@/components/CasePicker';
import { ReassignSheet } from '@/components/ReassignSheet';
import { Button, Card, ErrorNote, Loading, SectionLabel } from '@/components/ui';
import { TaskWorkView } from '@/components/TaskWorkView';
import { WorkloadSummary } from '@/components/WorkloadSummary';
import { canReviewTask } from '@/workflow';
import { bangkokDay } from '@/format';
import { leaveFlagsForDate } from '@/lib/leave-flags';
import { colors, formLabelSpacing, spacing } from '@/theme';

export default function TaskFormScreen() {
  const { id, caseId: requestedCaseId, assigneeId: requestedAssignee, edit } = useLocalSearchParams<{ id?: string; caseId?: string; assigneeId?: string; edit?: string }>();
  const router = useRouter();
  const client = useQueryClient();
  const { user } = useAuth();
  const members = useLawyers();
  const task = useQuery({ queryKey: ['task', id], queryFn: () => api<TaskItem>(`/tasks/${id}`), enabled: !!id });
  const [selectedCase, setSelectedCase] = useState<CaseRef | null>(requestedCaseId ? { id: requestedCaseId, label: 'คดีที่เปิดอยู่' } : null);
  const caseId = task.data?.caseId ?? selectedCase?.id;
  const legalCase = useCase(caseId ?? '');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [assigneeId, setAssigneeId] = useState(requestedAssignee ?? user?.id ?? '');
  const [dueDate, setDueDate] = useState(bangkokDay(new Date().toISOString()));
  const [hasDue, setHasDue] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [editing, setEditing] = useState(edit === '1');
  const [comparing, setComparing] = useState(!!requestedAssignee);
  const [risksConfirmed, setRisksConfirmed] = useState(false);
  const [requiresReview, setRequiresReview] = useState(false);
  const [recurrenceDays, setRecurrenceDays] = useState('');
  const [routineChoice, setRoutineChoice] = useState('');
  const [status, setStatus] = useState('TODO');
  const [files, setFiles] = useState<AttachmentFile[]>([]);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [reassigning, setReassigning] = useState(false);
  const [reviewerId, setReviewerId] = useState('');
  const [reason, setReason] = useState('');
  const [comment, setComment] = useState('');
  const assignmentDate = hasDue ? dueDate : bangkokDay(new Date().toISOString());
  const owner = user?.firmRole === 'OWNER';
  const board = useDailyWorkboard(assignmentDate, owner && !id);
  const people = board.data && !board.isError ? assignmentCandidates(board.data.members, board.data.tasks, TaskWorkType.GENERAL, assignmentDate) : [];
  const warnings = owner && assigneeId !== user?.id && !id ? assignmentWarnings(people.find(p => p.member.userId === assigneeId)) : [];
  const playbooks = useQuery({ queryKey: ['playbooks'], enabled: !id && ['OWNER', 'SENIOR_LAWYER'].includes(user?.firmRole ?? ''),
    queryFn: () => api<Array<{ id: string; name: string; version: number; steps: { title: string; routine?: TaskRoutineDefinition }[] }>>('/practice-setup/playbooks') });
  const routines = (playbooks.data ?? []).flatMap(release => release.steps.flatMap((step, index) => step.routine ? [{ value: `${release.id}:${index}`, label: `${step.title} · ${release.name} รุ่น ${release.version}`, releaseId: release.id, stepIndex: index, title: step.title }] : []));
  useEffect(() => { setRisksConfirmed(false); }, [assigneeId, assignmentDate, warnings.join('\n')]);
  const seeded = useRef<string | null>(null);
  const requestSnapshot = useRef<Record<string, unknown> | null>(null);
  const [checkingPreviousSave, setCheckingPreviousSave] = useState(false);
  const leaves = useLeaves(dueDate, dueDate);
  const flags = leaveFlagsForDate(leaves.data ?? [], dueDate);
  const canAssign = !id || (caseId ? user?.firmRole === 'OWNER' || legalCase.data?.leadLawyer?.id === user?.id
    : user?.firmRole === 'OWNER' || task.data?.assigneeId === user?.id || task.data?.createdById === user?.id);
  const canStatus = task.data?.status !== 'PENDING_REVIEW' && (!id || task.data?.assigneeId === user?.id || (!!caseId &&
    (user?.firmRole === 'OWNER' || legalCase.data?.leadLawyer?.id === user?.id)));
  const canReview = !!task.data && !!user && canReviewTask(task.data, user, legalCase.data?.leadLawyer?.id);
  const reviewers = (members.data ?? []).filter(person => person.id !== assigneeId && ['OWNER', 'SENIOR_LAWYER'].includes(person.firmRole ?? ''));
  const candidates = (members.data ?? []).filter(person => !!caseId || person.id === user?.id ||
    (!!user?.firmRole && !!person.firmRole && canAssignFirmRole(user.firmRole as FirmRole, person.firmRole)));
  const options = candidates.map(person => ({ value: person.id,
    label: `${person.firstName} ${person.lastName}${flags.get(person.id) ? ` · ${flags.get(person.id)!.label}` : ''}` }));
  if (task.data?.assignee && !options.some(person => person.value === task.data!.assigneeId)) options.push({
    value: task.data.assignee.id, label: `${task.data.assignee.firstName} ${task.data.assignee.lastName} (ผู้รับผิดชอบปัจจุบัน)`,
  });
  useEffect(() => {
    if (!task.data || seeded.current === task.data.id) return;
    seeded.current = task.data.id;
    setShowDetails(true);
    setTitle(task.data.title); setDescription(task.data.description ?? '');
    setRecurrenceDays(task.data.recurrenceDays ? String(task.data.recurrenceDays) : '');
    setAssigneeId(task.data.assigneeId ?? ''); setStatus(task.data.status);
    setHasDue(!!task.data.dueDate); if (task.data.dueDate) setDueDate(bangkokDay(task.data.dueDate));
  }, [task.data]);
  const draftValue = { files, title, description, assigneeId, dueDate, hasDue, selectedCase, requiresReview, recurrenceDays, routineChoice, reviewerId, status, savedId, requestSnapshot: requestSnapshot.current, reason, comment, showDetails };
  const draftRoute = id ? `/task/new?id=${id}&edit=1` : `/task/new?${new URLSearchParams({ ...(requestedCaseId ? { caseId: requestedCaseId } : {}), ...(requestedAssignee ? { assigneeId: requestedAssignee } : {}) })}`;
  const dirty = id ? !!(files.length || reason.trim() || comment.trim() || (task.data && (title !== task.data.title || description !== (task.data.description ?? '') || (Number(recurrenceDays) || null) !== (task.data.recurrenceDays ?? null) || assigneeId !== (task.data.assigneeId ?? '') || status !== task.data.status || hasDue !== !!task.data.dueDate || (hasDue && task.data.dueDate && dueDate !== bangkokDay(task.data.dueDate)))))
    : !!(title.trim() || description.trim() || recurrenceDays || files.length || savedId || requestSnapshot.current);
  const draft = useTaskDraft(user && (!id || (!!task.data && editing)) ? `${taskDraftScope(user)}form:${id ?? `new:${requestedCaseId ?? ''}:${requestedAssignee ?? ''}`}` : null, draftValue, value => {
    setFiles(value.files);
    if (typeof value.recurrenceDays === 'string') setRecurrenceDays(value.recurrenceDays);
    for (const [text, set] of [[value.title, setTitle], [value.description, setDescription], [value.assigneeId, setAssigneeId], [value.reviewerId, setReviewerId], [value.routineChoice, setRoutineChoice], [value.reason, setReason], [value.comment, setComment]] as const) if (typeof text === 'string') set(text);
    if (typeof value.dueDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value.dueDate)) setDueDate(value.dueDate);
    if (['TODO', 'IN_PROGRESS', 'NEEDS_REVISION', 'PENDING_REVIEW', 'DONE'].includes(value.status)) setStatus(value.status);
    setHasDue(!!value.hasDue); setRequiresReview(!!value.requiresReview); setShowDetails(!!value.showDetails || value.files.length > 0);
    if (value.selectedCase && typeof value.selectedCase.id === 'string' && typeof value.selectedCase.label === 'string') setSelectedCase(value.selectedCase);
    else setSelectedCase(null);
    if (typeof value.savedId === 'string') setSavedId(value.savedId);
    if (value.requestSnapshot && typeof value.requestSnapshot === 'object' && typeof value.requestSnapshot.createRequestId === 'string') {
      requestSnapshot.current = value.requestSnapshot; setCheckingPreviousSave(true);
    }
  }, dirty, { name: title.trim() || 'งานที่ยังไม่ได้บันทึก', route: draftRoute });
  const save = async () => {
    if (!title.trim() || !assigneeId) return Alert.alert('กรอกไม่ครบ', 'ใส่ชื่องานและเลือกผู้รับผิดชอบ');
    if (recurrenceDays && (!/^\d+$/.test(recurrenceDays) || Number(recurrenceDays) < 1 || Number(recurrenceDays) > 365)) return Alert.alert('รอบงานซ้ำ', 'ใส่จำนวนวันตั้งแต่ 1 ถึง 365');
    setBusy(true); setError('');
    try {
      if (!id && !savedId && !requestSnapshot.current && owner && assigneeId !== user?.id) {
        const fresh = await board.refetch();
        const candidate = fresh.data && !fresh.isError ? assignmentCandidates(fresh.data.members, fresh.data.tasks, TaskWorkType.GENERAL, assignmentDate).find(p => p.member.userId === assigneeId) : undefined;
        const currentWarnings = assignmentWarnings(candidate);
        if (currentWarnings.join('\n') !== warnings.join('\n') || (currentWarnings.length && !risksConfirmed)) {
          setRisksConfirmed(false); throw new Error('ตรวจคำเตือนและยืนยันเงื่อนไขก่อนมอบหมาย ข้อมูลที่กรอกยังอยู่');
        }
      }
      if (!id && !savedId && !requestSnapshot.current && !candidates.some(person => person.id === assigneeId)) throw new Error('เลือกผู้รับผิดชอบในสำนักงานตามสิทธิ์ของคุณ');
      if (!id && !savedId && !requestSnapshot.current && (requiresReview || routineChoice) && !reviewers.some(person => person.id === reviewerId)) throw new Error('เลือก Owner หรือทนายอาวุโสอีกคนเป็นผู้ตรวจ');
      let target = savedId;
      if (!target) {
        const path = id ? caseId ? `/cases/${caseId}/tasks/${id}` : `/todos/${id}`
          : caseId ? `/cases/${caseId}/tasks` : '/todos';
        const body = requestSnapshot.current ?? {
          title: title.trim(), description, ...(hasDue ? { dueDate: `${dueDate}T23:59:59+07:00` } : {}),
          ...(!id || ((owner || task.data?.assigneeId === user?.id) && (Number(recurrenceDays) || null) !== task.data?.recurrenceDays) ? { recurrenceDays: recurrenceDays ? Number(recurrenceDays) : null } : {}),
          ...(!id || (canAssign && assigneeId !== task.data?.assigneeId) ? { assigneeId } : {}),
          ...(canStatus && (!id || status !== task.data?.status) ? { status } : {}),
          ...(!id ? { requiresReview: requiresReview || !!routineChoice, ...((requiresReview || routineChoice) ? { reviewerId } : {}) } : {}),
          ...(!id && routineChoice ? { routineSource: (() => { const choice = routines.find(r => r.value === routineChoice); if (!choice) throw new Error('โหลดวิธีทำงานประจำใหม่ก่อนบันทึก'); return { releaseId: choice.releaseId, stepIndex: choice.stepIndex }; })() } : {}),
        };
        if (!id && !requestSnapshot.current) {
          requestSnapshot.current = { ...body, createRequestId: `mobile-${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}` };
          setCheckingPreviousSave(true);
        }
        await draft.persist({ ...draftValue, requestSnapshot: requestSnapshot.current });
        const result = await api<TaskItem>(path, { method: id ? 'PATCH' : 'POST', body: id ? body : requestSnapshot.current! });
        requestSnapshot.current = null; setCheckingPreviousSave(false);
        target = result.id; setSavedId(target);
        await draft.persist({ ...draftValue, savedId: target, requestSnapshot: null });
      }
      let remainingFiles = files;
      for (const file of files) {
        await uploadTaskAttachment(target, file);
        remainingFiles = remainingFiles.filter(item => item.uri !== file.uri);
        await draft.persist({ ...draftValue, savedId: target, requestSnapshot: null, files: remainingFiles });
        setFiles(remainingFiles);
      }
      for (const key of [['todos'], ['my-day'], ['workload'], ['case-tasks', caseId], ['task', target], ['daily-workboard'], ['actions']])
        await client.invalidateQueries({ queryKey: key });
      await draft.clear();
      router.replace(`/task/new?id=${target}`);
      setEditing(false);
      setSavedId(null);
      if (!id) Alert.alert('เพิ่มงานแล้ว', 'บันทึกผู้รับผิดชอบและไฟล์เรียบร้อย');
    } catch (e) {
      if (e instanceof ApiError && e.status >= 400 && e.status < 500) { requestSnapshot.current = null; setCheckingPreviousSave(false); }
      setError(e instanceof Error ? e.message : 'บันทึกไม่สำเร็จ');
    }
    finally { setBusy(false); }
  };
  const handoff = async (action: 'handoff' | 'accept' | 'reject', body = {}) => {
    if (!id) return;
    setBusy(true); setError('');
    try {
      const updated = await api<TaskItem>(caseId ? `/cases/${caseId}/tasks/${id}/${action}` : `/todos/${id}/${action}`,
        { method: action === 'handoff' ? 'PATCH' : 'POST', body });
      setStatus(updated.status); setAssigneeId(updated.assigneeId ?? '');
      for (const key of [['task', id], ['todos'], ['my-day'], ['case-tasks', caseId], ['daily-workboard'], ['actions']]) await client.invalidateQueries({ queryKey: key });
      if (!caseId || action !== 'handoff') {
        router.replace({ pathname: '/(tabs)/tasks', params: { view: action === 'handoff' ? 'mine' : 'review' } });
        Alert.alert(action === 'handoff' ? 'ส่งตรวจงานแล้ว' : action === 'reject' ? 'ส่งกลับแก้ไขแล้ว' : 'ปิดงานแล้ว');
      }
    } catch (e) { setError(e instanceof Error ? e.message : 'ทำรายการไม่สำเร็จ'); } finally { setBusy(false); }
  };
  if (id && task.isLoading) return <Loading />;
  if (id && (task.isError || !task.data)) return <ErrorNote message="โหลดงานไม่สำเร็จ" onRetry={() => task.refetch()} />;
  if (id && task.data && !editing) return <TaskWorkView key={id} task={task.data} onEdit={() => {
    setTitle(task.data!.title); setDescription(task.data!.description ?? ''); setAssigneeId(task.data!.assigneeId ?? ''); setStatus(task.data!.status); setEditing(true);
  }} />;
  if (!draft.ready) return draft.error ? <ErrorNote message={draft.error} onRetry={draft.retry} /> : <Loading />;
  return <FormPage>
    <Stack.Screen options={{ title: id ? 'แก้ไขงาน' : 'เพิ่มงาน' }} />
    <FormSection title={id ? 'รายละเอียดงาน' : 'ชื่องานและคนรับผิดชอบ'} detail="ระบุงานให้ชัด แล้วเลือกคนที่รับงานนี้">
    {!!draft.message && dirty && <Text style={{ color: colors.faint, fontSize: 12 }}>{draft.message}</Text>}
    {!!draft.warning && <Text style={{ color: colors.warn }}>{draft.warning}</Text>}
    {!!draft.error && <ErrorNote message={draft.error} onRetry={draft.retry} />}
    {id && <Button title="กลับไปทำงาน" ghost onPress={() => setEditing(false)} />}
    <FormField label="ชื่องาน" value={title} onChange={setTitle} disabled={busy || !!savedId || checkingPreviousSave} />
    <SectionLabel style={formLabelSpacing}>ผู้รับผิดชอบ</SectionLabel>
    <Dropdown label="เลือกผู้รับผิดชอบงาน" value={assigneeId} options={options} onChange={setAssigneeId}
      disabled={busy || !!savedId || checkingPreviousSave || !canAssign || members.isLoading || members.isError} />
    {members.isError && <ErrorNote message="โหลดรายชื่อไม่ได้" onRetry={() => members.refetch()} />}
    {leaves.isError && <ErrorNote message="ยังตรวจสอบวันลาไม่ได้" onRetry={() => leaves.refetch()} />}
    {!id && owner && <>
      <Button title="ดูภาระงานทีมล่วงหน้า 7 วัน" ghost onPress={() => router.push({ pathname: '/team-week', params: { date: assignmentDate } })} />
      <Button title={comparing ? 'ย่อหน้าเทียบคน' : 'เทียบคนจากงานวันที่เลือก'} ghost onPress={() => setComparing(!comparing)} />
      {comparing && <>
        <SectionLabel>เทียบงานวันที่ {assignmentDate}</SectionLabel>
        <Text style={{ color: colors.faint }}>โหลดล่าสุด {board.data?.fetchedAt ? new Date(board.data.fetchedAt).toLocaleTimeString('th-TH', { timeZone: 'Asia/Bangkok' }) : 'ยังไม่ทราบ'} · ข้อมูลไม่ครบยังสรุปว่าว่างไม่ได้</Text>
        {board.isError && <ErrorNote message="ยังตรวจภาระงานล่าสุดไม่ได้" onRetry={() => board.refetch()} />}
        {board.isLoading && <Loading />}
        {people.filter(p => candidates.some(person => person.id === p.member.userId)).map(person => <Card key={person.member.userId} style={{ gap: spacing.sm }}>
          <Text style={{ color: colors.ink, fontWeight: '700' }}>{person.member.firstName} {person.member.lastName}</Text>
          <WorkloadSummary candidate={person} />
          <Button title={`เลือก ${person.member.firstName}`} ghost disabled={busy || checkingPreviousSave} onPress={() => { setAssigneeId(person.member.userId); setComparing(false); }} />
        </Card>)}
      </>}
      {!!warnings.length && <Card style={{ gap: spacing.sm }}>
        {warnings.map((message, index) => <Text key={index} style={{ color: colors.warn }}>{message}</Text>)}
        <Pressable accessibilityRole="checkbox" accessibilityLabel="ตรวจเงื่อนไขแล้ว ยืนยันมอบหมายคนนี้" accessibilityState={{ checked: risksConfirmed }}
          onPress={() => setRisksConfirmed(!risksConfirmed)} disabled={busy} style={{ minHeight: 44, justifyContent: 'center' }}>
          <Text style={{ color: colors.ink }}>{risksConfirmed ? '☑' : '☐'} ตรวจเงื่อนไขแล้ว ยืนยันมอบหมายคนนี้</Text>
        </Pressable>
      </Card>}
    </>}
    {!id && ['OWNER', 'SENIOR_LAWYER'].includes(user?.firmRole ?? '') && <>
      <Dropdown label="วิธีทำงานประจำ (ถ้ามี)" value={routineChoice} options={[{ value: '', label: 'งานทั่วไป · ไม่บังคับรายการตรวจ' }, ...routines]} disabled={busy || checkingPreviousSave || playbooks.isLoading || playbooks.isError}
        onChange={value => { setRoutineChoice(value); if (value) { const selected = routines.find(r => r.value === value); if (!title.trim() && selected) setTitle(selected.title); setRequiresReview(true); setReviewerId(reviewers.find(p => p.id === legalCase.data?.leadLawyer?.id)?.id ?? reviewers[0]?.id ?? ''); } }} />
      {playbooks.isError && <ErrorNote message="โหลดวิธีทำงานประจำไม่ได้" onRetry={() => playbooks.refetch()} />}
      {!!routineChoice && <Dropdown label="ผู้ตรวจงานประจำ" value={reviewerId} options={reviewers.map(p => ({ value: p.id, label: `${p.firstName} ${p.lastName}` }))} onChange={setReviewerId} disabled={busy || checkingPreviousSave} />}
    </>}
    {id && canAssign && <Button title="มอบหมาย / เปลี่ยนผู้รับผิดชอบ" ghost disabled={busy} onPress={() => setReassigning(true)} />}
    </FormSection>
    {!id && <Button title={showDetails ? 'ซ่อนข้อมูลเพิ่มเติม' : 'เพิ่มกำหนดส่ง / รายละเอียด / ไฟล์'} ghost onPress={() => setShowDetails(!showDetails)} />}
    {showDetails && <FormSection title="กำหนดส่งและข้อมูลเพิ่มเติม">
    {!id && <><SectionLabel>แฟ้มคดี (ถ้ามี)</SectionLabel>{checkingPreviousSave ? <Text>{selectedCase?.label ?? 'ไม่ผูกคดี'}</Text> : <CasePicker value={selectedCase} onChange={setSelectedCase} allowNone />}</>}
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
      <Text style={{ flex: 1, color: colors.text }}>กำหนดวันที่ครบกำหนด</Text>
      <Switch accessibilityLabel="กำหนดวันที่ครบกำหนด" trackColor={{ false: colors.line, true: colors.ink }} thumbColor={colors.surface}
        value={hasDue} onValueChange={setHasDue} disabled={busy || checkingPreviousSave || !!savedId || (!!id && !!task.data?.dueDate)} />
    </View>
    {hasDue && (checkingPreviousSave ? <Text>{dueDate}</Text> : <DatePicker value={dueDate} onChange={setDueDate} />)}
    {id && <Dropdown label="สถานะงาน" value={status} onChange={setStatus} disabled={busy || !!savedId || !canStatus || task.data?.status === 'PENDING_REVIEW'}
      options={[{ value: 'TODO', label: 'ต้องทำ' }, { value: 'IN_PROGRESS', label: 'กำลังทำ' }, ...(!task.data?.requiresReview && !task.data?.routine ? [{ value: 'DONE', label: 'เสร็จแล้ว' }] : []),
        ...(status === 'PENDING_REVIEW' || status === 'NEEDS_REVISION' ? [{ value: status, label: status === 'PENDING_REVIEW' ? 'รอตรวจ' : 'ส่งกลับแก้ไข' }] : [])]} />
    }
    {!id && !routineChoice && <>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}><Text style={{ flex: 1 }}>ต้องตรวจผลงานก่อนปิด</Text><Switch accessibilityLabel="ต้องตรวจผลงานก่อนปิด" trackColor={{ false: colors.line, true: colors.ink }} thumbColor={colors.surface} value={requiresReview} onValueChange={setRequiresReview} disabled={busy || checkingPreviousSave} /></View>
      {requiresReview && <Dropdown label="ผู้ตรวจผลงาน" value={reviewerId} onChange={setReviewerId} options={reviewers.map(p => ({ value: p.id, label: `${p.firstName} ${p.lastName}` }))} disabled={busy || checkingPreviousSave} />}
    </>}
    <FormField label="รายละเอียด · เติมทีหลังได้" value={description} onChange={setDescription} multiline disabled={busy || checkingPreviousSave || !!savedId || !!routineChoice || !!task.data?.routine} />
    {(!id || owner || task.data?.assigneeId === user?.id) && <>
      <SectionLabel>ทำซ้ำหลังปิดรอบนี้</SectionLabel>
      <Dropdown label="ตั้งรอบงานทำซ้ำ" value={['', '1', '7', '30'].includes(recurrenceDays) ? recurrenceDays : 'custom'}
        onChange={value => setRecurrenceDays(value === 'custom' ? '14' : value)} disabled={busy || checkingPreviousSave || !!savedId}
        options={[{ value: '', label: 'ไม่ทำซ้ำ' }, { value: '1', label: 'อีก 1 วัน' }, { value: '7', label: 'อีก 7 วัน' }, { value: '30', label: 'อีก 30 วัน' }, { value: 'custom', label: 'กำหนดจำนวนวันเอง' }]} />
      {!!recurrenceDays && <><FormField label="อีกรอบในกี่วัน · 1–365" value={recurrenceDays} onChange={setRecurrenceDays} disabled={busy || checkingPreviousSave || !!savedId} />
        <Text style={{ color: colors.faint }}>สร้างรอบถัดไปเมื่อปิดงานหรือผ่านตรวจ นับจากวันครบกำหนดเดิมหรือวันที่ปิดงานถ้าช้ากว่า</Text></>}
    </>}
    <SectionLabel style={formLabelSpacing}>ไฟล์แนบงาน</SectionLabel>
    {task.data?.attachments?.map(file => <Button key={file.id} title={`เปิด ${file.filename}`} ghost onPress={() =>
      openTaskAttachment(id!, file.id, file.filename).catch(e => Alert.alert('เปิดไฟล์ไม่ได้', e.message))} />)}
    <Attachments files={files} onChange={setFiles} disabled={busy} />
    </FormSection>}
    {!!savedId && <Text style={{ color: colors.info }}>งานบันทึกแล้ว · ส่งไฟล์ที่เหลือต่อโดยไม่สร้างงานซ้ำ</Text>}
    {checkingPreviousSave && <Text style={{ color: colors.info }}>ยังตรวจผลบันทึกครั้งก่อน · กดบันทึกซ้ำใช้คำขอเดิมและไม่เพิ่มงานซ้ำ</Text>}
    {!!error && <Text style={{ color: colors.warn }}>{error}</Text>}
    <Button title={savedId ? 'ส่งไฟล์ที่เหลือ' : id ? 'บันทึกงาน' : 'เพิ่มงาน'} busy={busy} onPress={save} />
    {id && !!task.data && task.data.assigneeId === user?.id &&
      (caseId ? ['TODO', 'IN_PROGRESS', 'NEEDS_REVISION', 'DONE'] : ['TODO', 'IN_PROGRESS', 'NEEDS_REVISION']).includes(task.data.status) &&
      (!caseId || legalCase.data?.leadLawyer?.id !== user?.id) && <>
      <SectionLabel>ส่งให้ตรวจงาน</SectionLabel>
      {!caseId && <Dropdown label="เลือกผู้ตรวจงาน" value={reviewerId} onChange={setReviewerId} disabled={busy}
        options={reviewers.map(person => ({ value: person.id, label: `${person.firstName} ${person.lastName}` }))} />}
      <Button title="ส่งตรวจงาน" ghost disabled={busy || (!caseId && !reviewerId)}
        onPress={() => handoff('handoff', caseId ? {} : { reviewerId })} />
    </>}
    {task.data?.status === 'PENDING_REVIEW' && canReview && <>
      <Text style={{ color: colors.text, fontWeight: '700', fontSize: 18 }}>{task.data.title}</Text>
      {task.data.case && <Text style={{ color: colors.faint }}>{task.data.case.ownRef} · {task.data.case.title}</Text>}
      {task.data.description && <Text style={{ color: colors.text }}>{task.data.description}</Text>}
      <SectionLabel>ผลงานและไฟล์ที่ส่งตรวจ</SectionLabel>
      {task.data.attachments?.map(file => <Button key={file.id} title={`เปิด ${file.filename}`} ghost onPress={() =>
        openTaskAttachment(id!, file.id, file.filename).catch(e => Alert.alert('เปิดไฟล์ไม่ได้', e.message))} />)}
      {task.data.comments?.map(item => <Text key={item.id} style={{ color: colors.text }}>
        {item.author ? `${item.author.firstName} ${item.author.lastName}: ` : ''}{item.body}
      </Text>)}
      {!task.data.attachments?.length && !task.data.comments?.length && <Text style={{ color: colors.faint }}>ยังไม่มีไฟล์หรือข้อความส่งงานให้ตรวจ</Text>}
      {!!error && <Text style={{ color: colors.warn }}>{error}</Text>}
      <Button title="ผ่านการตรวจ / ปิดงาน" disabled={busy} onPress={() => Alert.alert('ยืนยันผลตรวจ', `ผ่านการตรวจและปิดงาน “${task.data!.title}”?`, [
        { text: 'ยกเลิก', style: 'cancel' }, { text: 'ผ่านการตรวจ', onPress: () => handoff('accept') },
      ])} />
      <FormField label="เหตุผลส่งกลับแก้ไข" value={reason} onChange={setReason} disabled={busy} />
      <Button title="ส่งกลับแก้ไข" ghost disabled={busy || !reason.trim()} onPress={() => handoff('reject', { reason: reason.trim() })} />
    </>}
    {id && <>
      <SectionLabel>ความคิดเห็นในงาน</SectionLabel>
      {!canReview && task.data?.comments?.map(item => <Text key={item.id} style={{ color: colors.text }}>
        {item.author ? `${item.author.firstName} ${item.author.lastName}: ` : ''}{item.body}
      </Text>)}
      <FormField label="เพิ่มความคิดเห็น" value={comment} onChange={setComment} multiline disabled={busy} />
      <Button title="ส่งความคิดเห็น" ghost disabled={busy || !comment.trim()} onPress={async () => {
        setBusy(true); setError('');
        try { await api(`/tasks/${id}/comments`, { method: 'POST', body: { body: comment.trim() } });
          setComment('');
          await Promise.all([['task', id], ['todos'], ['daily-workboard']].map(queryKey => client.invalidateQueries({ queryKey })));
        } catch (e) { setError(e instanceof Error ? e.message : 'ส่งความคิดเห็นไม่ได้'); }
        finally { setBusy(false); }
      }} />
    </>}
    <ReassignSheet caseId={caseId} task={reassigning ? task.data ?? null : null} onClose={() => {
      setReassigning(false); task.refetch().then(result => { if (result.data) setAssigneeId(result.data.assigneeId ?? ''); });
    }} />
  </FormPage>;
}

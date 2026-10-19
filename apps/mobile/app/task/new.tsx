import React, { useEffect, useRef, useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';
import { Check, ChevronRight, ClipboardCheck, FolderOpen, ListChecks, Plus } from 'lucide-react-native';
import { Text, TextInput } from '@/components/AppText';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { canDelegateTask, isEligibleReviewer, TASK_HANDOFF_NOTE_MIN, FirmRole, hasFirmCapability, assignmentCandidates, assignmentWarnings, TaskWorkType, TaskRoutineDefinition } from '@lawfirm/shared';
import { useAuth } from '@/api/auth';
import { api, ApiError } from '@/api/client';
import { taskDraftScope } from '@/api/drafts';
import { useTaskDraft } from '@/hooks/useTaskDraft';
import { useCase, useLawyers, useLeaves, useDailyWorkboard } from '@/api/hooks';
import type { TaskItem } from '@/api/types';
import { uploadTaskAttachment, openTaskAttachment } from '@/api/files';
import { Attachments, AttachmentFile } from '@/components/Attachments';
import { CheckRow, FieldLabel, FormPage, FormSection, MissingSummary, SwitchRow } from '@/components/Form';
import { fieldFrame, TextArea, TextField } from '@/components/Input';
import { Disclosure } from '@/components/Disclosure';
import { Dropdown } from '@/components/Dropdown';
import { DatePicker } from '@/components/DatePicker';
import { CasePicker, CaseRef } from '@/components/CasePicker';
import { ReassignSheet } from '@/components/ReassignSheet';
import { ActionRow, Button, Card, ErrorState, InlineError, LoadingState, SectionLabel } from '@/components/ui';
import { TaskWorkView } from '@/components/TaskWorkView';
import { WorkloadSummary } from '@/components/WorkloadSummary';
import { canReviewTask } from '@/workflow';
import { bangkokDay, thDate } from '@/format';
import { leaveFlagsForDate } from '@/lib/leave-flags';
import { colors, radius, spacing, typeScale } from '@/theme';

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
  const [triedSave, setTriedSave] = useState(false);
  const [reassigning, setReassigning] = useState(false);
  const [reviewerId, setReviewerId] = useState('');
  const [priority, setPriority] = useState<'HIGH' | 'MEDIUM' | 'LOW'>('MEDIUM');
  const [observerIds, setObserverIds] = useState<string[]>([]);
  const [requiresAttachment, setRequiresAttachment] = useState(false);
  const [handoffNote, setHandoffNote] = useState('');
  const [reason, setReason] = useState('');
  const [comment, setComment] = useState('');
  const [customDue, setCustomDue] = useState(false);
  const [trackOpen, setTrackOpen] = useState(false);
  const [observerSearch, setObserverSearch] = useState('');
  const [observerFocused, setObserverFocused] = useState(false);
  const todayKey = bangkokDay(new Date().toISOString());
  const tomorrowKey = bangkokDay(new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString());
  const assignmentDate = hasDue ? dueDate : bangkokDay(new Date().toISOString());
  const owner = hasFirmCapability(user?.firmRole, 'runOperations');
  const isOwner = user?.firmRole === FirmRole.OWNER; // recurrence edits stay owner-only on the API
  const board = useDailyWorkboard(assignmentDate, owner && !id);
  const people = board.data && !board.isError ? assignmentCandidates(board.data.members, board.data.tasks, TaskWorkType.GENERAL, assignmentDate) : [];
  const warnings = owner && assigneeId !== user?.id && !id ? assignmentWarnings(people.find(p => p.member.userId === assigneeId)) : [];
  const playbooks = useQuery({ queryKey: ['playbooks'], enabled: !id && ['OWNER', 'SENIOR_LAWYER', 'OFFICE_MANAGER'].includes(user?.firmRole ?? ''),
    queryFn: () => api<Array<{ id: string; name: string; version: number; steps: { title: string; routine?: TaskRoutineDefinition }[] }>>('/practice-setup/playbooks') });
  const routines = (playbooks.data ?? []).flatMap(release => release.steps.flatMap((step, index) => step.routine ? [{ value: `${release.id}:${index}`, label: `${step.title} · ${release.name} รุ่น ${release.version}`, releaseId: release.id, stepIndex: index, title: step.title }] : []));
  useEffect(() => { setRisksConfirmed(false); }, [assigneeId, assignmentDate, warnings.join('\n')]);
  const seeded = useRef<string | null>(null);
  const requestSnapshot = useRef<Record<string, unknown> | null>(null);
  const [checkingPreviousSave, setCheckingPreviousSave] = useState(false);
  const leaves = useLeaves(dueDate, dueDate);
  const flags = leaveFlagsForDate(leaves.data ?? [], dueDate);
  const canAssign = !id || (caseId ? owner || legalCase.data?.leadLawyer?.id === user?.id
    : owner || task.data?.assigneeId === user?.id || task.data?.createdById === user?.id);
  const canStatus = task.data?.status !== 'PENDING_REVIEW' && (!id || task.data?.assigneeId === user?.id || (!!caseId &&
    (owner || legalCase.data?.leadLawyer?.id === user?.id)));
  const canReview = !!task.data && !!user && canReviewTask(task.data, user, task.data.case?.leadLawyerId ?? legalCase.data?.leadLawyer?.id);
  const reviewers = (members.data ?? []).filter(person => isEligibleReviewer({ role: person.firmRole, userId: person.id,
    caseLeadId: legalCase.data?.leadLawyer?.id, assigneeId: assigneeId || user?.id }));
  useEffect(() => {
    const lead = legalCase.data?.leadLawyer?.id;
    if (!id && !reviewerId && lead && (requiresReview || routineChoice) && reviewers.some(p => p.id === lead)) setReviewerId(lead);
  }, [id, reviewerId, requiresReview, routineChoice, legalCase.data, reviewers.length]);
  const candidates = (members.data ?? []).filter(person => person.id === user?.id ||
    (!!user?.firmRole && !!person.firmRole && canDelegateTask(user.firmRole as FirmRole, person.firmRole as FirmRole)));
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
  const draftValue = { files, title, description, assigneeId, dueDate, hasDue, selectedCase, requiresReview, recurrenceDays, routineChoice, reviewerId, priority, observerIds, requiresAttachment, handoffNote, status, savedId, requestSnapshot: requestSnapshot.current, reason, comment, showDetails };
  const draftRoute = id ? `/task/new?id=${id}&edit=1` : `/task/new?${new URLSearchParams({ ...(requestedCaseId ? { caseId: requestedCaseId } : {}), ...(requestedAssignee ? { assigneeId: requestedAssignee } : {}) })}`;
  const dirty = id ? !!(files.length || reason.trim() || comment.trim() || (task.data && (title !== task.data.title || description !== (task.data.description ?? '') || (Number(recurrenceDays) || null) !== (task.data.recurrenceDays ?? null) || assigneeId !== (task.data.assigneeId ?? '') || status !== task.data.status || hasDue !== !!task.data.dueDate || (hasDue && task.data.dueDate && dueDate !== bangkokDay(task.data.dueDate)))))
    : !!(title.trim() || description.trim() || recurrenceDays || files.length || savedId || requestSnapshot.current);
  const draft = useTaskDraft(user && (!id || (!!task.data && editing)) ? `${taskDraftScope(user)}form:${id ?? `new:${requestedCaseId ?? ''}:${requestedAssignee ?? ''}`}` : null, draftValue, value => {
    setFiles(value.files);
    if (typeof value.recurrenceDays === 'string') setRecurrenceDays(value.recurrenceDays);
    for (const [text, set] of [[value.title, setTitle], [value.description, setDescription], [value.assigneeId, setAssigneeId], [value.reviewerId, setReviewerId], [value.handoffNote, setHandoffNote], [value.routineChoice, setRoutineChoice], [value.reason, setReason], [value.comment, setComment]] as const) if (typeof text === 'string') set(text);
    if (typeof value.dueDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value.dueDate)) setDueDate(value.dueDate);
    if (['TODO', 'IN_PROGRESS', 'NEEDS_REVISION', 'PENDING_REVIEW', 'DONE'].includes(value.status)) setStatus(value.status);
    if (['HIGH', 'MEDIUM', 'LOW'].includes(value.priority)) setPriority(value.priority);
    if (Array.isArray(value.observerIds)) setObserverIds(value.observerIds.filter((x: unknown) => typeof x === 'string'));
    if (typeof value.requiresAttachment === 'boolean') setRequiresAttachment(value.requiresAttachment);
    setHasDue(!!value.hasDue); setRequiresReview(!!value.requiresReview); setShowDetails(!!value.showDetails || value.files.length > 0);
    if (value.selectedCase && typeof value.selectedCase.id === 'string' && typeof value.selectedCase.label === 'string') setSelectedCase(value.selectedCase);
    else setSelectedCase(null);
    if (typeof value.savedId === 'string') setSavedId(value.savedId);
    if (value.requestSnapshot && typeof value.requestSnapshot === 'object' && typeof value.requestSnapshot.createRequestId === 'string') {
      requestSnapshot.current = value.requestSnapshot; setCheckingPreviousSave(true);
    }
  }, dirty, { name: title.trim() || 'งานที่ยังไม่ได้บันทึก', route: draftRoute });
  const recurrenceInvalid = !!recurrenceDays && (!/^\d+$/.test(recurrenceDays) || Number(recurrenceDays) < 1 || Number(recurrenceDays) > 365);
  const reviewerMissing = !id && !savedId && !checkingPreviousSave && (requiresReview || !!routineChoice) && !reviewers.some(person => person.id === reviewerId);
  const missing = [...(!title.trim() ? ['ชื่องาน'] : []), ...(!assigneeId ? ['ผู้รับผิดชอบ'] : []),
    ...(reviewerMissing ? ['ผู้ตรวจงาน'] : []), ...(recurrenceInvalid ? ['รอบงานซ้ำ (1–365 วัน)'] : [])];
  const save = async () => {
    if (missing.length) {
      setTriedSave(true);
      if (recurrenceInvalid || (reviewerMissing && !routineChoice)) setTrackOpen(true);
      return;
    }
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
      if (!id && !savedId && !requestSnapshot.current && (requiresReview || routineChoice) && !reviewers.some(person => person.id === reviewerId)) throw new Error('เลือก Owner ทนายอาวุโส หรือทนายหลักของคดีเป็นผู้ตรวจ');
      let target = savedId;
      if (!target) {
        const path = id ? caseId ? `/cases/${caseId}/tasks/${id}` : `/todos/${id}`
          : caseId ? `/cases/${caseId}/tasks` : '/todos';
        const body = requestSnapshot.current ?? {
          title: title.trim(), description, ...(hasDue ? { dueDate: `${dueDate}T23:59:59+07:00` } : {}),
          ...(!id || ((isOwner || task.data?.assigneeId === user?.id) && (Number(recurrenceDays) || null) !== task.data?.recurrenceDays) ? { recurrenceDays: recurrenceDays ? Number(recurrenceDays) : null } : {}),
          ...(!id || (canAssign && assigneeId !== task.data?.assigneeId) ? { assigneeId } : {}),
          ...(canStatus && (!id || status !== task.data?.status) ? { status } : {}),
          ...(!id ? { requiresReview: requiresReview || !!routineChoice, ...((requiresReview || routineChoice) ? { reviewerId } : {}),
            priority, ...(observerIds.length ? { observerIds } : {}), ...(requiresAttachment ? { requiresAttachment: true } : {}) } : {}),
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
  if (id && task.isLoading) return <LoadingState />;
  if (id && (task.isError || !task.data)) return <View style={styles.statePage}><ErrorState message="โหลดงานไม่สำเร็จ" onRetry={() => task.refetch()} /></View>;
  if (id && task.data && !editing) return <TaskWorkView key={id} task={task.data} onEdit={() => {
    setTitle(task.data!.title); setDescription(task.data!.description ?? ''); setAssigneeId(task.data!.assigneeId ?? ''); setStatus(task.data!.status); setEditing(true);
  }} />;
  if (!draft.ready) return draft.error ? <View style={styles.statePage}><ErrorState message={draft.error} onRetry={draft.retry} /></View> : <LoadingState />;
  const routineLocked = !!routineChoice || !!task.data?.routine;
  const details = <>
    {!id && (checkingPreviousSave ? <><FieldLabel>แฟ้มคดี · ถ้ามี</FieldLabel><Text>{selectedCase?.label ?? 'ไม่ผูกคดี'}</Text></>
      : <CasePicker label="แฟ้มคดี · ถ้ามี" value={selectedCase} onChange={setSelectedCase} allowNone />)}
    <TextArea label="รายละเอียด · ถ้ามี" value={description} onChange={setDescription}
      hint={routineLocked ? 'ใช้รายละเอียดจากวิธีทำงานประจำ' : undefined}
      disabled={busy || checkingPreviousSave || !!savedId || routineLocked} />
    <FieldLabel>ไฟล์แนบงาน · ถ้ามี</FieldLabel>
    {task.data?.attachments?.map(file => <ActionRow key={file.id} title={file.filename} detail="เปิดไฟล์" onPress={() =>
      openTaskAttachment(id!, file.id, file.filename).catch(e => Alert.alert('เปิดไฟล์ไม่ได้', e.message))} />)}
    <Attachments files={files} onChange={setFiles} disabled={busy} />
  </>;
  const recurrence = (!id || isOwner || task.data?.assigneeId === user?.id) && <>
    <Dropdown label="ตั้งรอบงานทำซ้ำ" fieldLabel="ทำซ้ำหลังปิดรอบนี้ · ถ้ามี" value={['', '1', '7', '30'].includes(recurrenceDays) ? recurrenceDays : 'custom'}
      onChange={value => setRecurrenceDays(value === 'custom' ? '14' : value)} disabled={busy || checkingPreviousSave || !!savedId}
      options={[{ value: '', label: 'ไม่ทำซ้ำ' }, { value: '1', label: 'อีก 1 วัน' }, { value: '7', label: 'อีก 7 วัน' }, { value: '30', label: 'อีก 30 วัน' }, { value: 'custom', label: 'กำหนดจำนวนวันเอง' }]} />
    {!!recurrenceDays && <TextField label="อีกรอบในกี่วัน" hint="1–365 วัน · สร้างรอบถัดไปเมื่อปิดงานหรือผ่านตรวจ นับจากวันครบกำหนดเดิมหรือวันที่ปิดงานถ้าช้ากว่า"
      keyboardType="number-pad" maxLength={3} value={recurrenceDays} onChange={setRecurrenceDays} disabled={busy || checkingPreviousSave || !!savedId}
      error={(triedSave || recurrenceDays.length >= 3) && recurrenceInvalid ? 'ใส่จำนวนวัน 1–365' : undefined} />}
  </>;
  const observerPool = (members.data ?? []).filter(p => p.id !== user?.id && p.firmRole !== 'EXTERNAL');
  const observerMatches = observerPool.filter(p => observerIds.includes(p.id) || `${p.firstName} ${p.lastName}`.includes(observerSearch.trim()));
  const priorityLabel: Record<string, string> = { HIGH: 'สำคัญมาก', MEDIUM: 'ปกติ', LOW: 'ไม่เร่ง' };
  const tracking = <>
    {!routineChoice && <>
      <SwitchRow label="ต้องตรวจผลงานก่อนปิด" value={requiresReview} onValueChange={setRequiresReview} disabled={busy || checkingPreviousSave} />
      {requiresReview && <Dropdown label="เลือกผู้ตรวจผลงาน" fieldLabel="ผู้ตรวจงาน" required value={reviewerId} onChange={setReviewerId}
        error={triedSave && reviewerMissing ? 'เลือก Owner ทนายอาวุโส หรือทนายหลักของคดีเป็นผู้ตรวจ' : undefined}
        options={reviewers.map(p => ({ value: p.id, label: `${p.firstName} ${p.lastName}` }))} disabled={busy || checkingPreviousSave} />}
    </>}
    <Dropdown label="ความสำคัญ" fieldLabel="ความสำคัญ" inline value={priority} onChange={value => setPriority(value as typeof priority)} disabled={busy || checkingPreviousSave}
      options={[{ value: 'HIGH', label: 'สำคัญมาก' }, { value: 'MEDIUM', label: 'ปกติ' }, { value: 'LOW', label: 'ไม่เร่ง' }]} />
    <FieldLabel hint="เห็นความคืบหน้าของงานนี้ แต่ไม่ต้องทำ">ผู้ติดตาม · ถ้ามี</FieldLabel>
    {observerPool.length > 8 && <TextInput value={observerSearch} onChangeText={setObserverSearch} placeholder="ค้นหาชื่อในทีม" placeholderTextColor={colors.faint}
      accessibilityLabel="ค้นหาผู้ติดตาม" onFocus={() => setObserverFocused(true)} onBlur={() => setObserverFocused(false)}
      style={fieldFrame({ focused: observerFocused })} />}
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
      {(observerSearch.trim() ? observerMatches : observerMatches.slice(0, Math.max(8, observerIds.length))).map(p => {
        const on = observerIds.includes(p.id);
        return <Pressable key={p.id} accessibilityRole="checkbox" accessibilityLabel={`ติดตามงานโดย ${p.firstName} ${p.lastName}`}
          accessibilityState={{ checked: on, disabled: busy || checkingPreviousSave }} disabled={busy || checkingPreviousSave}
          onPress={() => setObserverIds(ids => on ? ids.filter(x => x !== p.id) : [...ids, p.id])}
          style={({ pressed }) => [{ minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: spacing.xs, paddingHorizontal: spacing.md, borderWidth: 1,
            borderRadius: radius.button, borderColor: on ? colors.ink : colors.lineStrong, backgroundColor: on ? colors.infoSoft : colors.raised }, pressed && { opacity: 0.7 }]}>
          {on ? <Check size={16} color={colors.ink} /> : null}
          <Text style={{ color: colors.ink, fontWeight: on ? '600' : '400' }}>{p.firstName} {p.lastName}</Text>
        </Pressable>;
      })}
    </View>
    {!observerSearch.trim() && observerPool.length > Math.max(8, observerIds.length) && <Text style={{ color: colors.muted, fontSize: 14 }}>{`อีก ${observerPool.length - observerMatches.slice(0, Math.max(8, observerIds.length)).length} คน · พิมพ์ชื่อเพื่อค้นหา`}</Text>}
    <SwitchRow label="ต้องแนบไฟล์ก่อนส่งตรวจ" value={requiresAttachment} onValueChange={setRequiresAttachment} disabled={busy || checkingPreviousSave} />
    {recurrence}
  </>;
  const detailsSummary = [selectedCase?.label, description.trim() ? 'มีรายละเอียด' : '', files.length ? `ไฟล์ ${files.length} ไฟล์` : '']
    .filter(Boolean).join(' · ') || 'แฟ้มคดี รายละเอียดงาน และไฟล์แนบ';
  const trackSummary = [requiresReview || routineChoice ? 'ต้องตรวจก่อนปิด' : '', priority !== 'MEDIUM' ? priorityLabel[priority] : '',
    observerIds.length ? `ผู้ติดตาม ${observerIds.length} คน` : '', requiresAttachment ? 'ต้องแนบไฟล์' : '', recurrenceDays ? `ทำซ้ำอีก ${recurrenceDays} วัน` : '']
    .filter(Boolean).join(' · ') || 'ผู้ตรวจ ความสำคัญ ผู้ติดตาม และรอบงานซ้ำ';
  const saveBlock = <>
    {!!savedId && <Text style={styles.infoNote}>งานบันทึกแล้ว · ส่งไฟล์ที่เหลือต่อโดยไม่สร้างงานซ้ำ</Text>}
    {checkingPreviousSave && <Text style={styles.infoNote}>ยังตรวจผลบันทึกครั้งก่อน · กดบันทึกซ้ำใช้คำขอเดิมและไม่เพิ่มงานซ้ำ</Text>}
    <InlineError message={error || undefined} />
    {triedSave && !savedId && <MissingSummary items={missing} />}
    <Button title={savedId ? 'ส่งไฟล์ที่เหลือ' : id ? 'บันทึกงาน' : 'เพิ่มงาน'} icon={savedId || id ? Check : Plus} busy={busy} onPress={save} />
    {!!draft.message && dirty && <Text style={{ color: colors.muted, fontSize: 12, textAlign: 'center' }}>{draft.message}</Text>}
  </>;
  // A new task pins its save action; editing keeps it inline because review and comments follow it.
  return <FormPage footer={id ? undefined : saveBlock}>
    <Stack.Screen options={{ title: id ? 'แก้ไขงาน' : 'เพิ่มงาน' }} />
    <FormSection title={id ? 'รายละเอียดงาน' : 'งานอะไร ใครทำ'} icon={ListChecks}>
    <InlineError message={draft.warning || undefined} />
    {!!draft.error && <InlineError message={draft.error} onRetry={draft.retry} />}
    {id && <Button title="กลับไปทำงาน" variant="link" onPress={() => setEditing(false)} />}
    <TextField label="ชื่องาน" required value={title} onChange={setTitle} disabled={busy || !!savedId || checkingPreviousSave}
      placeholder="เช่น ร่างคำให้การ" error={triedSave && !title.trim() ? 'ใส่ชื่องาน' : undefined} />
    <Dropdown label="เลือกผู้รับผิดชอบงาน" fieldLabel="ผู้รับผิดชอบ" required value={assigneeId} options={options} onChange={setAssigneeId} person
      placeholder={members.isLoading ? 'กำลังโหลดรายชื่อ…' : 'เลือกผู้รับผิดชอบงาน'}
      error={triedSave && !assigneeId ? 'เลือกผู้รับผิดชอบ 1 คน' : undefined}
      disabled={busy || !!savedId || checkingPreviousSave || !canAssign || members.isLoading || members.isError} />
    {id && canAssign && <Button title="มอบหมาย / เปลี่ยนผู้รับผิดชอบ" variant="link" disabled={busy} onPress={() => setReassigning(true)} />}
    {members.isError && <InlineError message="โหลดรายชื่อไม่ได้" onRetry={() => members.refetch()} />}
    {leaves.isError && <InlineError message="ยังตรวจสอบวันลาไม่ได้" onRetry={() => leaves.refetch()} />}
    {/* Due date sits right under the assignee: it also sets the day the workload helper compares. */}
    {checkingPreviousSave ? <>
      <FieldLabel>กำหนดส่ง</FieldLabel>
      <Text style={{ color: colors.text }}>{hasDue ? thDate(dueDate) : 'ไม่กำหนด'}</Text>
    </> : <>
      <Dropdown label="กำหนดส่ง" fieldLabel="กำหนดส่ง" inline value={!hasDue ? 'none' : customDue ? 'pick' : dueDate === todayKey ? 'today' : dueDate === tomorrowKey ? 'tomorrow' : 'pick'}
        disabled={busy || !!savedId}
        options={[...(id && task.data?.dueDate ? [] : [{ value: 'none', label: 'ไม่กำหนด' }]),
          { value: 'today', label: 'วันนี้' }, { value: 'tomorrow', label: 'พรุ่งนี้' }, { value: 'pick', label: 'เลือกวัน' }]}
        onChange={choice => {
          setCustomDue(choice === 'pick');
          setHasDue(choice !== 'none');
          if (choice === 'today') setDueDate(todayKey);
          if (choice === 'tomorrow') setDueDate(tomorrowKey);
        }} />
      {hasDue && (customDue || (dueDate !== todayKey && dueDate !== tomorrowKey)) &&
        <DatePicker value={dueDate} onChange={setDueDate} disabled={busy || !!savedId} />}
    </>}
    {!id && owner && <>
      {/* Workload helpers fold away; open them only when choosing who has room. */}
      <Disclosure variant="plain" title="ช่วยเลือกคน · ดูภาระงานทีม" summary={`เทียบงานของแต่ละคน${hasDue ? `วันที่ ${thDate(assignmentDate)}` : 'วันนี้'}`} open={comparing} onToggle={setComparing}>
        <Button title="ดูภาระงานทีมล่วงหน้า 7 วัน" variant="link" onPress={() => router.push({ pathname: '/team-week', params: { date: assignmentDate } })} />
        {board.isError && <InlineError message={`ยังตรวจภาระงานล่าสุดไม่ได้ · โหลดล่าสุด ${board.data?.fetchedAt ? new Date(board.data.fetchedAt).toLocaleTimeString('th-TH', { timeZone: 'Asia/Bangkok' }) : 'ยังไม่ทราบ'}`} onRetry={() => board.refetch()} />}
        {board.isLoading && <LoadingState inline label="กำลังโหลดภาระงานทีม…" />}
        {people.filter(p => candidates.some(person => person.id === p.member.userId)).map(person => {
          const chosen = assigneeId === person.member.userId;
          return <Pressable key={person.member.userId} accessibilityRole="button" accessibilityLabel={`เลือก ${person.member.firstName} ${person.member.lastName} เป็นผู้รับผิดชอบ`}
            accessibilityState={{ selected: chosen, disabled: busy || checkingPreviousSave }} disabled={busy || checkingPreviousSave}
            onPress={() => { setAssigneeId(person.member.userId); setComparing(false); }}
            style={({ pressed }) => [{ gap: spacing.sm, paddingVertical: spacing.md, borderTopWidth: 1, borderTopColor: colors.divider }, pressed && { backgroundColor: colors.soft }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
              <Text style={{ flex: 1, color: colors.ink, fontWeight: '700' }}>{person.member.firstName} {person.member.lastName}</Text>
              {chosen ? <Text style={{ color: colors.ink, fontSize: 13, fontWeight: '600' }}>เลือกอยู่</Text> : <ChevronRight size={18} color={colors.muted} />}
            </View>
            <WorkloadSummary candidate={person} />
          </Pressable>;
        })}
      </Disclosure>
      {!!warnings.length && <Card flat style={styles.warnBox}>
        {warnings.map((message, index) => <Text key={index} style={{ color: colors.warn }}>{message}</Text>)}
        <CheckRow label="ตรวจเงื่อนไขแล้ว ยืนยันมอบหมายคนนี้" checked={risksConfirmed} onChange={setRisksConfirmed} disabled={busy} />
      </Card>}
    </>}
    {!id && ['OWNER', 'SENIOR_LAWYER', 'OFFICE_MANAGER'].includes(user?.firmRole ?? '') && <>
      <Dropdown label="เลือกวิธีทำงานประจำ" fieldLabel="วิธีทำงานประจำ · ถ้ามี" value={routineChoice} options={[{ value: '', label: 'งานทั่วไป · ไม่บังคับรายการตรวจ' }, ...routines]} disabled={busy || checkingPreviousSave || playbooks.isLoading || playbooks.isError || (!!caseId && legalCase.isLoading)}
        placeholder={playbooks.isLoading ? 'กำลังโหลดวิธีทำงานประจำ…' : 'งานทั่วไป · ไม่บังคับรายการตรวจ'}
        onChange={value => { setRoutineChoice(value); if (value) { const selected = routines.find(r => r.value === value); if (!title.trim() && selected) setTitle(selected.title); setRequiresReview(true); setReviewerId(reviewers.find(p => p.id === legalCase.data?.leadLawyer?.id)?.id ?? ''); } }} />
      {playbooks.isError && <InlineError message="โหลดวิธีทำงานประจำไม่ได้" onRetry={() => playbooks.refetch()} />}
      {!!routineChoice && <Dropdown label="เลือกผู้ตรวจงานประจำ" fieldLabel="ผู้ตรวจงาน" required value={reviewerId}
        error={triedSave && reviewerMissing ? 'เลือก Owner ทนายอาวุโส หรือทนายหลักของคดีเป็นผู้ตรวจ' : undefined}
        options={reviewers.map(p => ({ value: p.id, label: `${p.firstName} ${p.lastName}` }))} onChange={setReviewerId} disabled={busy || checkingPreviousSave || (!!caseId && legalCase.isLoading)} />}
    </>}
    </FormSection>
    {!id ? <>
      <Disclosure icon={FolderOpen} title="รายละเอียด แฟ้มคดี และไฟล์ · ถ้ามี" summary={detailsSummary} open={showDetails} onToggle={setShowDetails}>
        <View style={{ gap: spacing.sm }}>{details}</View>
      </Disclosure>
      <Disclosure icon={ClipboardCheck} title="การตรวจและติดตาม · ถ้ามี" summary={trackSummary} open={trackOpen} onToggle={setTrackOpen}>
        <View style={{ gap: spacing.sm }}>{tracking}</View>
      </Disclosure>
    </> : showDetails && <FormSection title="กำหนดส่งและข้อมูลเพิ่มเติม">
      <Dropdown label="เลือกสถานะงาน" fieldLabel="สถานะงาน" value={status} onChange={setStatus} disabled={busy || !!savedId || !canStatus || task.data?.status === 'PENDING_REVIEW'}
        options={[{ value: 'TODO', label: 'ต้องทำ' }, { value: 'IN_PROGRESS', label: 'กำลังทำ' }, ...(!task.data?.requiresReview && !task.data?.routine ? [{ value: 'DONE', label: 'เสร็จแล้ว' }] : []),
          ...(status === 'PENDING_REVIEW' || status === 'NEEDS_REVISION' ? [{ value: status, label: status === 'PENDING_REVIEW' ? 'รอตรวจ' : 'ส่งกลับแก้ไข' }] : [])]} />
      {details}
      {recurrence}
    </FormSection>}
    {id ? saveBlock : null}
    {id && !!task.data && task.data.assigneeId === user?.id &&
      (caseId ? ['TODO', 'IN_PROGRESS', 'NEEDS_REVISION', 'DONE'] : ['TODO', 'IN_PROGRESS', 'NEEDS_REVISION']).includes(task.data.status) &&
      (!caseId || legalCase.data?.leadLawyer?.id !== user?.id) && <>
      <SectionLabel>ส่งให้ตรวจงาน</SectionLabel>
      {!caseId && <Dropdown label="เลือกผู้ตรวจงาน" fieldLabel="ผู้ตรวจงาน" required value={reviewerId} onChange={setReviewerId} disabled={busy}
        options={reviewers.map(person => ({ value: person.id, label: `${person.firstName} ${person.lastName}` }))} />}
      <TextArea label="หมายเหตุถึงผู้ตรวจ" required hint={`อย่างน้อย ${TASK_HANDOFF_NOTE_MIN} ตัวอักษร`} value={handoffNote} onChange={setHandoffNote} disabled={busy} />
      <Button title="ส่งตรวจงาน" variant="secondary" disabled={busy || (!caseId && !reviewerId) || handoffNote.trim().length < TASK_HANDOFF_NOTE_MIN}
        onPress={() => handoff('handoff', caseId ? { note: handoffNote.trim() } : { reviewerId, note: handoffNote.trim() })} />
    </>}
    {task.data?.status === 'PENDING_REVIEW' && canReview && <>
      <Card style={{ gap: spacing.xs, marginTop: spacing.md }}>
        <Text accessibilityRole="header" style={styles.reviewTitle}>{task.data.title}</Text>
        {task.data.case && <Text style={{ color: colors.muted }}>{task.data.case.ownRef} · {task.data.case.title}</Text>}
        {task.data.description && <Text style={{ color: colors.text, marginTop: spacing.xs }}>{task.data.description}</Text>}
      </Card>
      <SectionLabel>ผลงานและไฟล์ที่ส่งตรวจ</SectionLabel>
      {!!(task.data.attachments?.length || task.data.comments?.length) && <Card style={styles.listCard}>
        {[...(task.data.attachments ?? []).map(file => <ActionRow key={file.id} title={file.filename} detail="เปิดไฟล์" onPress={() =>
          openTaskAttachment(id!, file.id, file.filename).catch(e => Alert.alert('เปิดไฟล์ไม่ได้', e.message))} />),
          ...(task.data.comments ?? []).map(item => <Text key={item.id} style={styles.comment}>
            {item.author ? `${item.author.firstName} ${item.author.lastName}: ` : ''}{item.body}
          </Text>)].map((row, index) => <View key={row.key} style={index > 0 && styles.listDivider}>{row}</View>)}
      </Card>}
      {!task.data.attachments?.length && !task.data.comments?.length && <Text style={{ color: colors.muted }}>ยังไม่มีไฟล์หรือข้อความส่งงานให้ตรวจ</Text>}
      <InlineError message={error || undefined} />
      <Button title="ผ่านการตรวจ / ปิดงาน" disabled={busy} onPress={() => Alert.alert('ยืนยันผลตรวจ', `ผ่านการตรวจและปิดงาน “${task.data!.title}”?`, [
        { text: 'ยกเลิก', style: 'cancel' }, { text: 'ผ่านการตรวจ', onPress: () => handoff('accept') },
      ])} />
      <TextField label="เหตุผลส่งกลับแก้ไข" value={reason} onChange={setReason} disabled={busy} />
      <Button title="ส่งกลับแก้ไข" variant="danger" disabled={busy || !reason.trim()} onPress={() => handoff('reject', { reason: reason.trim() })} />
    </>}
    {id && <>
      <SectionLabel>ความคิดเห็นในงาน</SectionLabel>
      {!canReview && !!task.data?.comments?.length && <Card style={styles.listCard}>
        {task.data.comments.map((item, index) => <Text key={item.id} style={[styles.comment, index > 0 && styles.listDivider]}>
          {item.author ? `${item.author.firstName} ${item.author.lastName}: ` : ''}{item.body}
        </Text>)}
      </Card>}
      <TextArea label="เพิ่มความคิดเห็น" value={comment} onChange={setComment} disabled={busy} />
      <Button title="ส่งความคิดเห็น" variant="secondary" disabled={busy || !comment.trim()} onPress={async () => {
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

const styles = StyleSheet.create({
  statePage: { flex: 1, backgroundColor: colors.bg, padding: spacing.lg },
  warnBox: { gap: spacing.sm, backgroundColor: colors.warnSoft, borderColor: colors.warnEdge, padding: spacing.md },
  infoNote: { color: colors.info, backgroundColor: colors.infoSoft, borderWidth: 1, borderColor: colors.infoEdge, borderRadius: radius.md,
    paddingVertical: spacing.sm, paddingHorizontal: spacing.md },
  reviewTitle: { ...typeScale.title, color: colors.ink },
  listCard: { paddingVertical: spacing.xs },
  listDivider: { borderTopWidth: 1, borderTopColor: colors.divider },
  comment: { color: colors.text, paddingVertical: spacing.md },
});

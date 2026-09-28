import React, { useEffect, useRef, useState } from 'react';
import { Alert, Switch, View } from 'react-native';
import { Text } from '@/components/AppText';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { canAssignFirmRole, FirmRole } from '@lawfirm/shared';
import { useAuth } from '@/api/auth';
import { api } from '@/api/client';
import { useCase, useLawyers, useLeaves } from '@/api/hooks';
import type { TaskItem } from '@/api/types';
import { uploadTaskAttachment, openTaskAttachment } from '@/api/files';
import { Attachments, AttachmentFile } from '@/components/Attachments';
import { FormField, FormPage } from '@/components/Form';
import { Dropdown } from '@/components/Dropdown';
import { DatePicker } from '@/components/DatePicker';
import { ReassignSheet } from '@/components/ReassignSheet';
import { Button, ErrorNote, Loading, SectionLabel } from '@/components/ui';
import { bangkokDay } from '@/format';
import { leaveFlagsForDate } from '@/lib/leave-flags';
import { colors, formLabelSpacing, spacing } from '@/theme';

export default function TaskFormScreen() {
  const { id, caseId: requestedCaseId } = useLocalSearchParams<{ id?: string; caseId?: string }>();
  const router = useRouter();
  const client = useQueryClient();
  const { user } = useAuth();
  const members = useLawyers();
  const task = useQuery({ queryKey: ['task', id], queryFn: () => api<TaskItem>(`/tasks/${id}`), enabled: !!id });
  const caseId = task.data?.caseId ?? requestedCaseId;
  const legalCase = useCase(caseId ?? '');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [assigneeId, setAssigneeId] = useState(user?.id ?? '');
  const [dueDate, setDueDate] = useState(bangkokDay(new Date().toISOString()));
  const [hasDue, setHasDue] = useState(true);
  const [status, setStatus] = useState('TODO');
  const [files, setFiles] = useState<AttachmentFile[]>([]);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [reassigning, setReassigning] = useState(false);
  const [reviewerId, setReviewerId] = useState('');
  const [reason, setReason] = useState('');
  const [comment, setComment] = useState('');
  const seeded = useRef<string | null>(null);
  const leaves = useLeaves(dueDate, dueDate);
  const flags = leaveFlagsForDate(leaves.data ?? [], dueDate);
  const canAssign = !id || (caseId ? user?.firmRole === 'OWNER' || legalCase.data?.leadLawyer?.id === user?.id
    : task.data?.assigneeId === user?.id || task.data?.createdById === user?.id);
  const canStatus = !id || task.data?.assigneeId === user?.id || (!!caseId &&
    (user?.firmRole === 'OWNER' || legalCase.data?.leadLawyer?.id === user?.id));
  const canReview = !!id && (caseId ? user?.firmRole === 'OWNER' || legalCase.data?.leadLawyer?.id === user?.id : task.data?.assigneeId === user?.id);
  const reviewers = (members.data ?? []).filter(person => person.id !== user?.id);
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
    setTitle(task.data.title); setDescription(task.data.description ?? '');
    setAssigneeId(task.data.assigneeId ?? ''); setStatus(task.data.status);
    setHasDue(!!task.data.dueDate); if (task.data.dueDate) setDueDate(bangkokDay(task.data.dueDate));
  }, [task.data]);
  const save = async () => {
    if (!title.trim() || !assigneeId) return Alert.alert('กรอกไม่ครบ', 'ใส่ชื่องานและเลือกผู้รับผิดชอบ');
    setBusy(true); setError('');
    try {
      let target = savedId;
      if (!target) {
        const path = id ? caseId ? `/cases/${caseId}/tasks/${id}` : `/todos/${id}`
          : caseId ? `/cases/${caseId}/tasks` : '/todos';
        const result = await api<TaskItem>(path, { method: id ? 'PATCH' : 'POST', body: {
          title: title.trim(), description, ...(hasDue ? { dueDate: `${dueDate}T23:59:59+07:00` } : {}),
          ...(!id || (canAssign && assigneeId !== task.data?.assigneeId) ? { assigneeId } : {}),
          ...(canStatus && (!id || status !== task.data?.status) ? { status } : {}),
        } });
        target = result.id; setSavedId(target);
      }
      for (const file of files) {
        await uploadTaskAttachment(target, file);
        setFiles(previous => previous.filter(item => item.uri !== file.uri));
      }
      for (const key of [['todos'], ['my-day'], ['workload'], ['case-tasks', caseId], ['task', target]])
        await client.invalidateQueries({ queryKey: key });
      router.replace(`/task/new?id=${target}`);
      setSavedId(null);
      if (!id) Alert.alert('เพิ่มงานแล้ว', 'บันทึกผู้รับผิดชอบและไฟล์เรียบร้อย');
    } catch (e) { setError(e instanceof Error ? e.message : 'บันทึกไม่สำเร็จ'); }
    finally { setBusy(false); }
  };
  const handoff = async (action: 'handoff' | 'accept' | 'reject', body = {}) => {
    if (!id) return;
    setBusy(true); setError('');
    try {
      const updated = await api<TaskItem>(caseId ? `/cases/${caseId}/tasks/${id}/${action}` : `/todos/${id}/${action}`,
        { method: action === 'handoff' ? 'PATCH' : 'POST', body });
      setStatus(updated.status); setAssigneeId(updated.assigneeId ?? '');
      for (const key of [['task', id], ['todos'], ['my-day'], ['case-tasks', caseId]]) await client.invalidateQueries({ queryKey: key });
      if (!caseId) {
        router.replace('/(tabs)/tasks');
        Alert.alert(action === 'handoff' ? 'ส่งตรวจงานแล้ว' : action === 'reject' ? 'ส่งกลับแก้ไขแล้ว' : 'ปิดงานแล้ว');
      }
    } catch (e) { setError(e instanceof Error ? e.message : 'ทำรายการไม่สำเร็จ'); } finally { setBusy(false); }
  };
  if (id && task.isLoading) return <Loading />;
  if (id && (task.isError || !task.data)) return <ErrorNote message="โหลดงานไม่สำเร็จ" onRetry={() => task.refetch()} />;
  return <FormPage>
    <Stack.Screen options={{ title: id ? 'แก้ไขงาน' : 'เพิ่มงาน' }} />
    <FormField label="ชื่องาน" value={title} onChange={setTitle} disabled={busy || !!savedId} />
    <SectionLabel style={formLabelSpacing}>ผู้รับผิดชอบ</SectionLabel>
    <Dropdown label="เลือกผู้รับผิดชอบงาน" value={assigneeId} options={options} onChange={setAssigneeId}
      disabled={busy || !!savedId || !canAssign || members.isLoading || members.isError} />
    {members.isError && <ErrorNote message="โหลดรายชื่อไม่ได้" onRetry={() => members.refetch()} />}
    {leaves.isError && <ErrorNote message="ยังตรวจสอบวันลาไม่ได้" onRetry={() => leaves.refetch()} />}
    {id && canAssign && <Button title="มอบหมาย / เปลี่ยนผู้รับผิดชอบ" ghost disabled={busy} onPress={() => setReassigning(true)} />}
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
      <Text style={{ flex: 1, color: colors.text }}>กำหนดวันที่ครบกำหนด</Text>
      <Switch value={hasDue} onValueChange={setHasDue} disabled={busy || !!savedId || (!!id && !!task.data?.dueDate)} />
    </View>
    {hasDue && <DatePicker value={dueDate} onChange={setDueDate} />}
    <Dropdown label="สถานะงาน" value={status} onChange={setStatus} disabled={busy || !!savedId || !canStatus}
      options={[{ value: 'TODO', label: 'ต้องทำ' }, { value: 'IN_PROGRESS', label: 'กำลังทำ' }, { value: 'DONE', label: 'เสร็จแล้ว' },
        ...(status === 'PENDING_REVIEW' || status === 'NEEDS_REVISION' ? [{ value: status, label: status === 'PENDING_REVIEW' ? 'รอตรวจ' : 'ส่งกลับแก้ไข' }] : [])]} />
    <FormField label="รายละเอียด · เติมทีหลังได้" value={description} onChange={setDescription} multiline disabled={busy || !!savedId} />
    <SectionLabel style={formLabelSpacing}>ไฟล์แนบงาน</SectionLabel>
    {task.data?.attachments?.map(file => <Button key={file.id} title={`เปิด ${file.filename}`} ghost onPress={() =>
      openTaskAttachment(id!, file.id, file.filename).catch(e => Alert.alert('เปิดไฟล์ไม่ได้', e.message))} />)}
    <Attachments files={files} onChange={setFiles} disabled={busy} />
    {!!savedId && <Text style={{ color: colors.info }}>งานบันทึกแล้ว · ส่งไฟล์ที่เหลือต่อโดยไม่สร้างงานซ้ำ</Text>}
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
      <Button title="ผ่านการตรวจ / ปิดงาน" disabled={busy} onPress={() => handoff('accept')} />
      <FormField label="เหตุผลส่งกลับแก้ไข" value={reason} onChange={setReason} disabled={busy} />
      <Button title="ส่งกลับแก้ไข" ghost disabled={busy || !reason.trim()} onPress={() => handoff('reject', { reason: reason.trim() })} />
    </>}
    {id && <>
      <SectionLabel>ความคิดเห็นในงาน</SectionLabel>
      {task.data?.comments?.map(item => <Text key={item.id} style={{ color: colors.text }}>
        {item.author ? `${item.author.firstName} ${item.author.lastName}: ` : ''}{item.body}
      </Text>)}
      <FormField label="เพิ่มความคิดเห็น" value={comment} onChange={setComment} multiline disabled={busy} />
      <Button title="ส่งความคิดเห็น" ghost disabled={busy || !comment.trim()} onPress={async () => {
        setBusy(true); setError('');
        try { await api(`/tasks/${id}/comments`, { method: 'POST', body: { body: comment.trim() } });
          setComment(''); await client.invalidateQueries({ queryKey: ['task', id] });
        } catch (e) { setError(e instanceof Error ? e.message : 'ส่งความคิดเห็นไม่ได้'); }
        finally { setBusy(false); }
      }} />
    </>}
    <ReassignSheet caseId={caseId} task={reassigning ? task.data ?? null : null} onClose={() => {
      setReassigning(false); task.refetch().then(result => { if (result.data) setAssigneeId(result.data.assigneeId ?? ''); });
    }} />
  </FormPage>;
}

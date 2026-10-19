import React, { useState } from 'react';
import { View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { canAssignFirmRole, dailyUpdateParts, FirmRole } from '@lawfirm/shared';
import { api } from '@/api/client';
import { useAuth } from '@/api/auth';
import { useLawyers } from '@/api/hooks';
import { taskDraftScope } from '@/api/drafts';
import type { TaskItem } from '@/api/types';
import { useTaskDraft } from '@/hooks/useTaskDraft';
import { Text } from '@/components/AppText';
import { FormPage, FormSection, MissingSummary } from '@/components/Form';
import { TextArea, TextField } from '@/components/Input';
import { DatePicker } from '@/components/DatePicker';
import { Dropdown } from '@/components/Dropdown';
import { Button, Card, EmptyState, ErrorState, InlineError, LoadingState } from '@/components/ui';
import { bangkokDay } from '@/format';
import { colors, spacing, typeScale } from '@/theme';

export default function BlockerRequest() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { user } = useAuth();
  const router = useRouter();
  const client = useQueryClient();
  const task = useQuery({ queryKey: ['task', id], enabled: !!id, queryFn: () => api<TaskItem>(`/tasks/${id}`) });
  const members = useLawyers();
  const source = task.data?.comments?.filter(c => c.kind === 'DAILY_UPDATE').at(-1);
  const quote = source ? dailyUpdateParts(source.body).blocker : '';
  const [assigneeId, setAssigneeId] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [date, setDate] = useState(bangkokDay(new Date().toISOString()));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [triedSave, setTriedSave] = useState(false);
  const [files] = useState<never[]>([]);
  const value = { files, assigneeId, title, description, date, sourceCommentId: source?.id };
  const draft = useTaskDraft(user && id ? `${taskDraftScope(user)}blocker:${id}` : null, value, saved => {
    for (const [v, set] of [[saved.assigneeId, setAssigneeId], [saved.title, setTitle], [saved.description, setDescription], [saved.date, setDate]] as const) if (typeof v === 'string') set(v);
  }, !!(title.trim() || description.trim() || assigneeId), { name: title || 'เรื่องที่ต้องการคนช่วยแก้', route: `/task/blocker?id=${id}` });
  const candidates = (members.data ?? []).filter(p => p.firmRole === 'OWNER' || p.id === user?.id ||
    (!!user?.firmRole && !!p.firmRole && canAssignFirmRole(user.firmRole as FirmRole, p.firmRole)));
  if (!id) return <View style={statePage}><EmptyState>เปิดจากงานที่มีจุดติดขัด</EmptyState></View>;
  if (task.isLoading || !draft.ready) return draft.error
    ? <View style={statePage}><ErrorState message={draft.error} onRetry={draft.retry} /></View>
    : <LoadingState label="กำลังโหลดงาน…" />;
  if (task.isError || !task.data) return <View style={statePage}><ErrorState message="โหลดงานไม่ได้" onRetry={() => task.refetch()} /></View>;
  if (task.data.assigneeId !== user?.id && user?.firmRole !== 'OWNER') return <View style={statePage}><EmptyState>ผู้รับงานหรือ Owner เท่านั้นที่ส่งจุดติดขัดได้</EmptyState></View>;
  const existing = task.data.followUps?.find(f => f.followUpSourceCommentId === source?.id);
  const assigneeError = triedSave && (!assigneeId || !candidates.some(p => p.id === assigneeId)) ? 'เลือกคนรับแก้หรือ Owner' : undefined;
  return <FormPage>
    <Stack.Screen options={{ title: 'ส่งจุดติดขัดให้คนแก้' }} />
    <Card style={{ gap: spacing.sm }}>
      <Text accessibilityRole="header" style={{ ...typeScale.section, color: colors.ink }}>{task.data.title}</Text>
      {quote
        ? <Text style={{ color: colors.text, borderLeftWidth: 3, borderLeftColor: colors.lineStrong, paddingLeft: spacing.md }}>{quote}</Text>
        : <Text style={{ color: colors.muted }}>ยังไม่มีรายงาน “ติดอะไร” ของงานนี้</Text>}
    </Card>
    {/* No blocker recorded yet: point back to the report instead of leaving an empty page. */}
    {!existing && !quote && <EmptyState compact action={{ title: 'กลับไปบันทึกรายงาน', onPress: () => router.back() }}>บันทึกรายงาน “ติดอะไร” ที่หน้างานก่อน แล้วค่อยส่งเรื่องนี้</EmptyState>}
    {existing ? <Button title={`เปิดเรื่องที่ส่งแล้ว · ${existing.title}`} onPress={() => router.replace({ pathname: '/task/new', params: { id: existing.id } })} /> : !!quote && <FormSection title="คนรับแก้และสิ่งที่ต้องการ"
      detail="เลือก Owner ให้ช่วยจัดคนแก้ หรือคนที่คุณมีสิทธิ์มอบหมาย งานต้นทางจะรอเรื่องนี้จนคนแก้ปิดงาน">
      {members.isError && <InlineError message="โหลดคนรับแก้ไม่ได้" onRetry={() => members.refetch()} />}
      <Dropdown label="เลือกคนรับแก้ / Owner" fieldLabel="คนรับแก้" required error={assigneeError}
        placeholder={members.isLoading ? 'กำลังโหลดรายชื่อ…' : 'เลือกคนรับแก้ / Owner'}
        value={assigneeId} onChange={setAssigneeId} disabled={busy || members.isError || members.isLoading}
        options={candidates.map(p => ({ value: p.id, label: `${p.firstName} ${p.lastName}${p.firmRole === 'OWNER' ? ' · Owner' : ''}` }))} />
      <TextField label="เรื่องที่ต้องการให้ช่วยแก้ · ถ้ามี" hint="ว่างไว้ระบบตั้งชื่อให้อัตโนมัติ" value={title} onChange={setTitle} placeholder={`แก้จุดติดขัด: ${task.data.title}`} disabled={busy} />
      <TextArea label="สิ่งที่อยากให้คนรับแก้ทำ · ถ้ามี" value={description} onChange={setDescription} disabled={busy} />
      <DatePicker label="วันติดตาม" value={date} onChange={setDate} disabled={busy} />
      <MissingSummary items={assigneeError ? ['คนรับแก้'] : []} />
      <InlineError message={error || undefined} />
      <Button title="ส่งเรื่องและติดตามจากงานนี้" busy={busy} onPress={async () => {
        setTriedSave(true);
        if (!assigneeId || !candidates.some(p => p.id === assigneeId)) return;
        setBusy(true); setError('');
        try {
          await draft.persist();
          await api(`/tasks/${id}/blocker-follow-up`, { method: 'POST', body: {
            sourceCommentId: source!.id, latestCommentId: task.data!.comments!.at(-1)!.id, taskUpdatedAt: task.data!.updatedAt,
            quote, title: title.trim() || `แก้จุดติดขัด: ${task.data!.title}`.slice(0, 200), description: description.trim() || quote,
            assigneeId, followUpDate: date,
          } });
          await draft.clear();
          for (const key of [['task', id], ['todos'], ['daily-workboard'], ['my-day']]) await client.invalidateQueries({ queryKey: key });
          router.back();
        } catch (e) { setError(e instanceof Error ? e.message : 'ส่งเรื่องไม่สำเร็จ ร่างยังอยู่'); }
        finally { setBusy(false); }
      }} />
    </FormSection>}
    {!!draft.error && <InlineError message={draft.error} onRetry={draft.retry} />}
    {!!draft.message && <Text style={{ color: colors.muted, fontSize: 13 }}>{draft.message}</Text>}
  </FormPage>;
}

const statePage = { flex: 1, backgroundColor: colors.bg, padding: spacing.lg } as const;

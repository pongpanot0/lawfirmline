import React, { useEffect, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { Text } from '@/components/AppText';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useAuth } from '@/api/auth';
import { useEvent, useMembers, useLeaves, useUpdateEventTeam } from '@/api/hooks';
import { TeamFields } from '@/components/TeamFields';
import { CheckRow, FieldError, FormSection } from '@/components/Form';
import { Button, Card, ErrorNote, Loading, Tag } from '@/components/ui';
import { bangkokDay, thDate, thTime } from '@/format';
import { leaveFlagsForDate, leaveWarning } from '@/lib/leave-flags';
import { colors, radius, spacing, pageContent } from '@/theme';

const MAX_TEAM = 10;

export default function EventTeamScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const router = useRouter();
  const event = useEvent(id);
  const members = useMembers();
  const update = useUpdateEventTeam(id);
  const [ids, setIds] = useState<string[] | null>(null);
  const [triedSave, setTriedSave] = useState(false);
  const [leaveAck, setLeaveAck] = useState(false);
  const date = event.data ? bangkokDay(event.data.startAt) : bangkokDay(new Date().toISOString());
  const leaves = useLeaves(date, date, !!event.data);
  const flags = leaveFlagsForDate(leaves.data ?? [], date);
  // Match existing case-scoped CalendarService.update authorization, including senior lawyers.
  const editable = ['OWNER', 'SENIOR_LAWYER', 'OFFICE_MANAGER', 'LAWYER'].includes(user?.firmRole ?? '');
  useEffect(() => {
    if (!event.data || ids) return;
    const primary = event.data.assigneeId;
    const all = event.data.assignees?.map((person) => person.userId) ?? [];
    setIds([...new Set([...(primary ? [primary] : []), ...all])]);
  }, [event.data, ids]);
  const conflictKey = (ids ?? []).filter(personId => flags.has(personId)).join('|');
  useEffect(() => { setLeaveAck(false); }, [conflictKey]);
  // Still seeding the team from a loaded event is a wait, not a failure.
  if (event.isLoading || members.isLoading || (event.data && members.data && !ids)) return <Loading label="กำลังโหลดทีม…" />;
  if (!event.data || !members.data || !ids) return <View style={{ padding: spacing.lg }}>
    <ErrorNote message="โหลดทีมไม่สำเร็จ" onRetry={() => { event.refetch(); members.refetch(); }} />
  </View>;
  const data = event.data;
  const names = new Map(members.data.map((member) => [member.id, `${member.firstName} ${member.lastName}`]));
  for (const person of data.assignees ?? []) names.set(person.userId, `${person.user.firstName} ${person.user.lastName}`);
  if (data.assignee) names.set(data.assignee.id, `${data.assignee.firstName} ${data.assignee.lastName}`);
  // People on the event who are no longer in the member list cannot appear as chips; list them so they can still be removed.
  const former = ids.filter(personId => !members.data!.some(member => member.id === personId));
  const warnings = ids.flatMap((personId) => {
    const flag = flags.get(personId);
    return flag ? [leaveWarning(names.get(personId) ?? 'สมาชิก', date, flag.kind)] : [];
  });
  const teamError = triedSave && !ids.length ? 'ต้องมีผู้รับผิดชอบหลักหนึ่งคน' : undefined;
  const ackError = triedSave && warnings.length && !leaveAck ? 'ยืนยันว่าตรวจวันลาแล้วก่อนบันทึก' : undefined;
  const waitReason = leaves.isLoading ? 'รอตรวจวันลา…' : leaves.isError ? 'ตรวจวันลาไม่ได้ · ลองใหม่ก่อนบันทึก'
    : event.isError || members.isError ? 'ข้อมูลทีมยังไม่ล่าสุด · ลองโหลดใหม่ก่อนบันทึก' : '';
  // A plain save goes straight through; only a leave conflict asks for the tick above.
  const save = () => {
    setTriedSave(true);
    if (!ids.length || (warnings.length && !leaveAck)) return;
    update.mutate(ids, { onSuccess: () => router.back() });
  };
  const when = data.type === 'DEADLINE' ? `${thDate(data.startAt)} · ทั้งวัน` : `${thDate(data.startAt)} ${thTime(data.startAt)}`;
  return <ScrollView style={{ backgroundColor: colors.bg }} contentContainerStyle={{ ...pageContent, gap: spacing.sm }} keyboardShouldPersistTaps="handled">
    <Card style={{ gap: spacing.xs }}>
      <Text style={{ color: colors.ink, fontWeight: '700' }}>{data.title}</Text>
      <Text style={{ color: colors.muted }}>{[data.case?.ownRef, data.courtName].filter(Boolean).join(' · ') || '—'}</Text>
      <Text style={{ color: colors.muted }}>{when}</Text>
      {editable && <Button variant="link" title="แก้ไขนัดหมาย ›" onPress={() => router.push(`/event/new?id=${id}`)} />}
    </Card>
    {(event.isError || members.isError) && <ErrorNote message="ข้อมูลทีมอาจยังไม่ล่าสุด" onRetry={() => { event.refetch(); members.refetch(); }} />}
    {leaves.isError && <ErrorNote message="ยังตรวจสอบวันลาไม่ได้" onRetry={() => leaves.refetch()} />}
    <FormSection title="ทีมของนัดนี้" detail={editable ? `คนหลัก 1 คนและผู้ร่วมไป รวมไม่เกิน ${MAX_TEAM} คน · เปลี่ยนเฉพาะนัดนี้` : 'ให้ทนายหรือเจ้าของสำนักงานจัดทีมสำหรับนัดนี้'}>
      <TeamFields ids={ids} onChange={setIds} primaryLabel="ผู้รับผิดชอบหลัก" secondaryLabel="ผู้ร่วมไป" max={MAX_TEAM}
        disabled={!editable || update.isPending} required error={teamError} />
      {former.map(personId => <View key={personId} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
        <Text style={{ flex: 1, color: colors.text }}>{names.get(personId) ?? 'สมาชิกเดิม'} · ไม่อยู่ในรายชื่อทีมแล้ว</Text>
        {editable && <Button variant="link" title="เอาออก" disabled={update.isPending} onPress={() => setIds(ids.filter(item => item !== personId))} />}
      </View>)}
      {warnings.length > 0 && <View accessibilityRole="alert" style={{ gap: spacing.xs, padding: spacing.md, borderRadius: radius.card,
        borderWidth: 1, borderColor: colors.warn, backgroundColor: colors.warnSoft }}>
        <Tag tone="due">มีวันลาตรงกับนัด</Tag>
        {warnings.map(line => <Text key={line} style={{ color: colors.warn }}>{line}</Text>)}
        {editable && <CheckRow label="ตรวจแล้ว · ยืนยันบันทึกทีมนี้" checked={leaveAck} onChange={setLeaveAck} disabled={update.isPending} />}
        <FieldError message={ackError} />
      </View>}
    </FormSection>
    {editable && <View style={{ gap: spacing.sm, marginTop: spacing.sm }}>
      <FieldError message={update.isError ? `บันทึกไม่สำเร็จ · ${update.error.message}` : undefined} />
      {!!waitReason && <Text style={{ color: colors.muted, fontSize: 13 }}>{waitReason}</Text>}
      <Button title="บันทึกทีมที่ไปด้วย" onPress={save} busy={update.isPending}
        disabled={event.isError || members.isError || leaves.isError || leaves.isLoading} />
    </View>}
  </ScrollView>;
}

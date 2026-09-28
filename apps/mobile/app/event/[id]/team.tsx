import React, { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, View } from 'react-native';
import { Text } from '@/components/AppText';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useAuth } from '@/api/auth';
import { useEvent, useMembers, useLeaves, useUpdateEventTeam } from '@/api/hooks';
import { Dropdown } from '@/components/Dropdown';
import { Button, Card, ErrorNote, Loading, SectionLabel, Tag } from '@/components/ui';
import { bangkokDay, thDate, thTime } from '@/format';
import { leaveFlagsForDate, leaveWarning } from '@/lib/leave-flags';
import { colors, spacing, formLabelSpacing, pageContent } from '@/theme';

export default function EventTeamScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const router = useRouter();
  const event = useEvent(id);
  const members = useMembers();
  const update = useUpdateEventTeam(id);
  const [ids, setIds] = useState<string[] | null>(null);
  const [search, setSearch] = useState('');
  const date = event.data ? bangkokDay(event.data.startAt) : bangkokDay(new Date().toISOString());
  const leaves = useLeaves(date, date, !!event.data);
  const flags = leaveFlagsForDate(leaves.data ?? [], date);
  // Match existing case-scoped CalendarService.update authorization, including senior lawyers.
  const editable = ['OWNER', 'SENIOR_LAWYER', 'LAWYER'].includes(user?.firmRole ?? '');
  useEffect(() => {
    if (!event.data || ids) return;
    const primary = event.data.assigneeId;
    const all = event.data.assignees?.map((person) => person.userId) ?? [];
    setIds([...new Set([...(primary ? [primary] : []), ...all])]);
  }, [event.data, ids]);
  if (event.isLoading || members.isLoading) return <Loading />;
  if (!event.data || !members.data || !ids) return <View style={{ padding: spacing.lg }}>
    <ErrorNote message="โหลดทีมไม่สำเร็จ" onRetry={() => { event.refetch(); members.refetch(); }} />
  </View>;
  const data = event.data;
  const names = new Map(members.data.map((member) => [member.id, `${member.firstName} ${member.lastName}`]));
  for (const person of data.assignees ?? []) names.set(person.userId, `${person.user.firstName} ${person.user.lastName}`);
  if (data.assignee) names.set(data.assignee.id, `${data.assignee.firstName} ${data.assignee.lastName}`);
  const save = () => {
    if (!ids.length) return Alert.alert('เลือกผู้รับผิดชอบ', 'ต้องมีผู้รับผิดชอบหลักหนึ่งคน');
    const warning = ids.flatMap((personId) => {
      const flag = flags.get(personId);
      return flag ? [leaveWarning(names.get(personId) ?? '', date, flag.kind)] : [];
    }).join('\n');
    Alert.alert('ยืนยันทีมที่ไปด้วย', `${ids.map((personId, index) => `${index === 0 ? 'หลัก' : 'ร่วม'}: ${names.get(personId) ?? personId}`).join('\n')}${warning ? `\n\n${warning}` : ''}`, [
      { text: 'ยกเลิก', style: 'cancel' },
      { text: 'บันทึกทีม', onPress: () => update.mutate(ids, {
        onSuccess: () => router.back(), onError: (error) => Alert.alert('บันทึกไม่สำเร็จ', error.message),
      }) },
    ]);
  };
  return <ScrollView style={{ backgroundColor: colors.bg }} contentContainerStyle={{ ...pageContent, gap: spacing.sm }}>
    <Card><Text style={{ color: colors.ink, fontWeight: '700' }}>{data.title}</Text>
      <Text style={{ color: colors.muted }}>{data.case?.ownRef} · {data.courtName}</Text>
      <Text style={{ color: colors.muted }}>{thDate(data.startAt)} {thTime(data.startAt)}</Text></Card>
    {editable && <Button title="แก้ไขนัดหมาย" ghost onPress={() => router.push(`/event/new?id=${id}`)} />}
    {(event.isError || members.isError) && <ErrorNote message="ข้อมูลทีมอาจยังไม่ล่าสุด" onRetry={() => { event.refetch(); members.refetch(); }} />}
    {leaves.isError && <ErrorNote message="ยังตรวจสอบวันลาไม่ได้" onRetry={() => leaves.refetch()} />}
    <SectionLabel style={formLabelSpacing}>ผู้รับผิดชอบหลัก · 1 คน</SectionLabel>
    <Dropdown label="เลือกผู้รับผิดชอบหลัก" value={ids[0] ?? ''}
      options={[...names].map(([value, label]) => ({ value, label }))}
      disabled={!editable || update.isPending} onChange={(personId) => {
        const next = [personId, ...ids.slice(1).filter((item) => item !== personId)];
        if (next.length > 10) return Alert.alert('ทีมเต็มแล้ว', 'เอาผู้ร่วมไปออกหนึ่งคนก่อนเปลี่ยนผู้รับผิดชอบหลัก');
        setIds(next);
      }} />
    <SectionLabel style={formLabelSpacing}>ผู้ร่วมไป · เพิ่ม / เอาออกเฉพาะนัดนี้</SectionLabel>
    {ids.slice(1).map((personId) => <Card key={personId}>
      <Text style={{ color: colors.ink }}>{names.get(personId) ?? 'สมาชิกเดิม'}</Text>
      {!!flags.get(personId) && <Tag tone="due">{flags.get(personId)!.label}</Tag>}
      {editable && <Button title="เอาออกจากนัดนี้" ghost disabled={update.isPending} onPress={() => setIds(ids.filter((item) => item !== personId))} />}
    </Card>)}
    {editable && <>
      <SectionLabel style={formLabelSpacing}>เพิ่มผู้ร่วมไป · รวมได้ไม่เกิน 10 คน</SectionLabel>
      <Dropdown label="เพิ่มคนไปด้วย" value={search} onChange={(personId) => {
        if (ids.length >= 10) return Alert.alert('ทีมเต็มแล้ว', 'เลือกได้รวมไม่เกิน 10 คน');
        setIds([...ids, personId]); setSearch('');
      }} options={members.data.filter((member) => !ids.includes(member.id)).map((member) => ({
        value: member.id, label: `${names.get(member.id)}${flags.has(member.id) ? ' · มีการลาในวันนี้' : ''}`,
      }))} disabled={update.isPending} />
      <Button title="บันทึกทีมที่ไปด้วย" onPress={save} busy={update.isPending}
        disabled={!ids.length || event.isError || members.isError || leaves.isError || leaves.isLoading} />
    </>}
    {!editable && <Text style={{ color: colors.muted }}>ให้ทนายหรือเจ้าของสำนักงานจัดทีมสำหรับนัดนี้</Text>}
  </ScrollView>;
}

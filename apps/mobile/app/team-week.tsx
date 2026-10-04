import React, { useCallback, useState } from 'react';
import { Alert, RefreshControl, ScrollView, View } from 'react-native';
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { HEAVY_DAY_POINTS, type PersonWorkload, type TeamRadar } from '@lawfirm/shared';
import { useAuth } from '@/api/auth';
import { api } from '@/api/client';
import { Text } from '@/components/AppText';
import { Button, Card, EmptyNote, ErrorNote, Loading, PageIntro, SectionLabel, Tag } from '@/components/ui';
import { DatePicker } from '@/components/DatePicker';
import { ReassignSheet } from '@/components/ReassignSheet';
import type { TaskItem } from '@/api/types';
import { bangkokDay } from '@/format';
import { colors, pageContent, spacing } from '@/theme';

export default function TeamWeek() {
  const { date } = useLocalSearchParams<{ date?: string }>();
  const { user } = useAuth();
  const router = useRouter();
  const [start, setStart] = useState(date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : bangkokDay(new Date().toISOString()));
  const [person, setPerson] = useState('');
  const owner = user?.firmRole === 'OWNER';
  const canView = owner || user?.firmRole === 'SENIOR_LAWYER';
  const [lightFirst, setLightFirst] = useState(false);
  const [moving, setMoving] = useState<TaskItem | null>(null), [opening, setOpening] = useState('');
  const radar = useQuery({ queryKey: ['team-radar', start], enabled: canView, queryFn: () => api<TeamRadar>(`/operations/radar?date=${start}`) });
  const detail = useQuery({ queryKey: ['person-workload', person, start], enabled: canView && !!person,
    queryFn: () => api<PersonWorkload>(`/operations/people/${person}?from=${start}`) });
  useFocusEffect(useCallback(() => {
    if (canView) { void radar.refetch(); if (person) void detail.refetch(); }
  }, [canView, start, person, radar.refetch, detail.refetch]));
  if (!canView) return <EmptyNote>หน้านี้สำหรับ Owner และ Senior</EmptyNote>;
  const members = [...(radar.data?.members ?? [])].sort((a, b) => (lightFirst ? 1 : -1) * (a.openPoints - b.openPoints || a.reviewCount - b.reviewCount));
  return <><ScrollView style={{ backgroundColor: colors.bg }} contentContainerStyle={pageContent}
    refreshControl={<RefreshControl refreshing={radar.isFetching} onRefresh={() => { void radar.refetch(); if (person) void detail.refetch(); }} />}>
    <Stack.Screen options={{ title: 'ภาระงานทีม 7 วัน' }} />
    <PageIntro title="เทียบภาระงาน 7 วัน" detail="ดูงาน นัด และวันลาก่อนเลือกคนรับงาน" />
    <SectionLabel>เริ่มดูตั้งแต่วันที่</SectionLabel>
    <DatePicker value={start} onChange={value => { setStart(value); setPerson(''); }} />
    <Text style={{ color: colors.faint }}>เลื่อนแถววันที่ซ้ายขวาเพื่อดูครบ 7 วัน · เทียบวันลา นัดหมาย และงานที่ลงวันไว้ · คะแนนงานไม่ได้บอกชั่วโมงว่าง</Text>
    <Button title={lightFirst ? 'เรียงภาระมากก่อน เพื่อดูงานที่ควรช่วย' : 'เรียงภาระน้อยก่อน เพื่อเทียบผู้รับงาน'} ghost onPress={() => setLightFirst(!lightFirst)} />
    {radar.isLoading && <Loading />}
    {radar.isError && <ErrorNote message="ตรวจภาระงานล่าสุดไม่ได้ ลองโหลดใหม่ก่อนมอบหมาย" onRetry={() => radar.refetch()} />}
    {members.map(member => <Card key={member.userId} style={{ gap: spacing.sm, marginTop: spacing.md }}>
      <Button title={`${member.firstName} ${member.lastName} ›`} ghost onPress={() => router.push({ pathname: '/person/[id]', params: { id: member.userId, from: start } })} />
      <Text>งานเปิด {member.openCount} · ภาระคิว {member.openPoints} คะแนน · เกินกำหนด {member.overdueCount} · รอตรวจ {member.reviewCount} · ยังไม่ลงวัน {member.unscheduledCount}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator>
        <View style={{ flexDirection: 'row', gap: spacing.sm }}>
          {member.days.map(day => <View key={day.date} style={{ width: 112, padding: spacing.sm, borderRadius: 8, backgroundColor: day.onLeave ? colors.warnSoft : colors.soft, gap: 4 }}>
            <Text style={{ fontWeight: '700' }}>{new Date(`${day.date}T12:00:00+07:00`).toLocaleDateString('th-TH', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Asia/Bangkok' })}</Text>
            {day.onLeave && <Tag tone="due">ลา</Tag>}
            {day.points >= HEAVY_DAY_POINTS && <Tag tone="due">งานแน่น</Tag>}
            <Text>งาน {day.taskCount}</Text><Text>ศาล {day.courtCount ?? '—'}</Text><Text>นัดรวม {day.eventCount}</Text><Text>ภาระ {day.points} คะแนน</Text>
          </View>)}
        </View>
      </ScrollView>
      <Button title={person === member.userId ? 'ย่อรายละเอียดรายคน' : `ดูงานและนัดของ ${member.firstName}`} ghost onPress={() => setPerson(person === member.userId ? '' : member.userId)} />
      {person === member.userId && <>
        {detail.isLoading && <Loading />}
        {detail.isError && <ErrorNote message="โหลดรายละเอียดไม่ได้" onRetry={() => detail.refetch()} />}
        {detail.data?.events.map(event => <Text key={event.id}>{bangkokDay(event.startAt)} · {event.title}{event.courtName ? ` · ${event.courtName}` : ''}</Text>)}
        {detail.data?.tasks.map(task => <View key={task.id} style={{ gap: spacing.sm }}>
          {(owner || !!task.case || person === user?.id) ? <Button title={`${task.scheduledFor ? task.scheduledFor : task.dueDate ? bangkokDay(task.dueDate) : 'ยังไม่ลงวัน'} · ${task.title}`} ghost onPress={() => router.push({ pathname: '/task/new', params: { id: task.id } })} /> : <Text>{task.title}</Text>}
          {!!task.holdReason && <Text style={{ color: colors.warn }}>ติด: {task.holdReason}</Text>}
          {task.overdue && <Tag tone="due">เกินกำหนด · พิจารณาช่วยหรือย้ายงาน</Tag>}
          {owner && <Button title={`เทียบคน / ย้ายงาน ${task.title}`} ghost busy={opening === task.id} disabled={!!opening || detail.isError || detail.isFetching} onPress={async () => {
            setOpening(task.id);
            try { setMoving(await api<TaskItem>(`/tasks/${task.id}`)); }
            catch (error) { Alert.alert('เปิดงานเพื่อย้ายไม่ได้', error instanceof Error ? error.message : 'ลองโหลดล่าสุด'); }
            finally { setOpening(''); }
          }} />}
        </View>)}
        {owner && (member.role !== 'OWNER' || member.userId === user?.id) && <Button title={`มอบหมายงานให้ ${member.firstName}`} onPress={() => router.push({ pathname: '/task/new', params: { assigneeId: member.userId } })} />}
      </>}
    </Card>)}
    {radar.data?.members.length === 0 && <EmptyNote>ยังไม่มีสมาชิกทีม</EmptyNote>}
  </ScrollView><ReassignSheet task={moving} caseId={moving?.caseId} onClose={() => { setMoving(null); void radar.refetch(); void detail.refetch(); }} /></>;
}

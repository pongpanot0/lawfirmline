import React, { useCallback, useState } from 'react';
import { Alert, RefreshControl, ScrollView, View } from 'react-native';
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { ownerDecisionTasks } from '@lawfirm/shared';
import { useAuth } from '@/api/auth';
import { useDailyWorkboard, useDecideLeave, useExpenseClaims, usePendingLeaves, useTodos } from '@/api/hooks';
import { Text } from '@/components/AppText';
import { Button, Card, EmptyNote, ErrorNote, SectionLabel, Tag } from '@/components/ui';
import { bangkokDay, formatMoney, thDate, thTime } from '@/format';
import { colors, pageContent, spacing } from '@/theme';

const LEAVE_TYPES = { SICK: 'ลาป่วย', PERSONAL: 'ลากิจ', VACATION: 'ลาพักร้อน' };
const FILTERS = [{ value: 'all', label: 'ทั้งหมด' }, { value: 'review', label: 'งานรอตรวจ' }, { value: 'leave', label: 'ลารออนุมัติ' }, { value: 'claim', label: 'เบิกรออนุมัติ' }, { value: 'risk', label: 'ต้องตัดสินใจ' }];

export default function OwnerDecisions() {
  const { view } = useLocalSearchParams<{ view?: string }>();
  const [filter, setFilter] = useState(FILTERS.some(item => item.value === view) ? view! : 'all');
  const [expandedLeave, setExpandedLeave] = useState('');
  const { user } = useAuth();
  const owner = user?.firmRole === 'OWNER';
  const router = useRouter();
  const today = bangkokDay(new Date().toISOString());
  const reviews = useTodos('review', owner), leaves = usePendingLeaves(owner), claims = useExpenseClaims(owner), daily = useDailyWorkboard(today, owner);
  const decision = useDecideLeave();
  const refresh = useCallback(() => { if (owner) { void reviews.refetch(); void leaves.refetch(); void claims.refetch(); void daily.refetch(); } }, [owner, reviews.refetch, leaves.refetch, claims.refetch, daily.refetch]);
  useFocusEffect(refresh);
  const risks = daily.data ? ownerDecisionTasks(daily.data.tasks, today).filter(item => item.task.status !== 'PENDING_REVIEW') : [];
  const pendingClaims = claims.data?.filter(item => item.status === 'PENDING');
  const show = (value: string) => filter === 'all' || filter === value;
  if (!owner) return <EmptyNote>คิวนี้สำหรับ Owner</EmptyNote>;
  return <ScrollView style={{ backgroundColor: colors.bg }} contentContainerStyle={{ ...pageContent, gap: spacing.sm }}
    refreshControl={<RefreshControl refreshing={reviews.isRefetching || leaves.isRefetching || claims.isRefetching || daily.isRefetching} onRefresh={refresh} />}>
    <Stack.Screen options={{ title: 'คิวตัดสินใจวันนี้' }} />
    <Text style={{ color: colors.muted }}>รวมรายการที่ยังรอ รวมถึงรายการจากวันก่อน · เปิดผลงานหรือหลักฐานก่อนตัดสินใจ</Text>
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>{FILTERS.map(item => <View key={item.value} style={{ minWidth: 100, flexGrow: 1 }}><Button title={item.label} ghost={filter !== item.value} onPress={() => setFilter(item.value)} /></View>)}</View>
    {show('review') && <>
      <SectionLabel>รอ Owner ตรวจ · {reviews.data?.length ?? '—'} งาน</SectionLabel>
      {reviews.isError && <ErrorNote message="โหลดงานรอตรวจไม่ได้" onRetry={() => reviews.refetch()} />}
      {!reviews.isError && !reviews.data?.length && <EmptyNote>{reviews.isLoading ? 'กำลังโหลด…' : 'ไม่มีงานรอคุณตรวจ'}</EmptyNote>}
      {reviews.data?.map(task => <Card key={task.id} style={{ gap: spacing.sm }}>
        <Text style={{ fontWeight: '700' }}>{task.title}</Text><Text style={{ color: colors.muted }}>{task.case?.ownRef ?? 'งานสำนักงาน'}{task.dueDate ? ` · ส่งภายใน ${thDate(task.dueDate)}` : ''}</Text>
        <Button title="เปิดผลงาน / ตรวจรับหรือส่งกลับ" ghost onPress={() => router.push(`/task/new?id=${task.id}`)} />
      </Card>)}
    </>}
    {show('leave') && <>
      <SectionLabel>ลารออนุมัติ · {leaves.data?.length ?? '—'} รายการ</SectionLabel>
      {leaves.isError && <ErrorNote message="โหลดคำขอลาไม่ได้" onRetry={() => leaves.refetch()} />}
      {!leaves.isError && !leaves.data?.length && <EmptyNote>{leaves.isLoading ? 'กำลังโหลด…' : 'ไม่มีคำขอลารออนุมัติ'}</EmptyNote>}
      {leaves.data?.map(leave => <Card key={leave.id} style={{ gap: spacing.sm }}>
        <Text style={{ fontWeight: '700' }}>{leave.user?.firstName} {leave.user?.lastName} · {LEAVE_TYPES[leave.type]}</Text>
        <Text>{thDate(leave.startDate)} – {thDate(leave.endDate)}</Text>
        {!!leave.courtConflicts?.length && <Tag tone="due">ทับนัดศาล {leave.courtConflicts.length} นัด</Tag>}
        <Button title={expandedLeave === leave.id ? 'ย่อคำขอลา' : 'เปิดคำขอและตรวจนัดที่ทับ'} ghost onPress={() => setExpandedLeave(expandedLeave === leave.id ? '' : leave.id)} />
        {expandedLeave === leave.id && <>
          {leave.courtConflicts?.length ? leave.courtConflicts.map(event => <Button key={event.eventId} title={`${event.caseRef} · ${thDate(event.startAt)} ${thTime(event.startAt)} · ${event.title}`} ghost onPress={() => router.push(`/event/${event.eventId}/team`)} />)
            : <Text style={{ color: colors.muted }}>ไม่พบนัดศาลที่ทับในปฏิทินที่บันทึกไว้</Text>}
          <Button title="เทียบกำลังคนช่วงวันลา" ghost onPress={() => router.push(`/team-week?date=${leave.startDate.slice(0, 10)}`)} />
          {(['APPROVED', 'REJECTED'] as const).map(result => <Button key={result} title={result === 'APPROVED' ? 'อนุมัติคำขอลา' : 'ไม่อนุมัติคำขอลา'} ghost={result === 'REJECTED'} busy={decision.isPending} disabled={leaves.isFetching || leaves.isError}
            onPress={() => Alert.alert(result === 'APPROVED' ? 'ยืนยันอนุมัติลา' : 'ยืนยันไม่อนุมัติลา', `${leave.user?.firstName} · ${thDate(leave.startDate)} – ${thDate(leave.endDate)}${leave.courtConflicts?.length ? '\nมีนัดศาลทับ ตรวจผู้รับช่วงให้เรียบร้อย' : ''}`, [
              { text: 'ยกเลิก', style: 'cancel' }, { text: 'ยืนยัน', onPress: () => decision.mutate({ id: leave.id, decision: result }, { onError: error => Alert.alert('ตัดสินใจไม่สำเร็จ', error.message) }) },
            ])} />)}
        </>}
      </Card>)}
    </>}
    {show('claim') && <>
      <SectionLabel>เบิกรออนุมัติ · {pendingClaims?.length ?? '—'} ชุด</SectionLabel>
      {claims.isError && <ErrorNote message="โหลดชุดเบิกไม่ได้" onRetry={() => claims.refetch()} />}
      {!claims.isError && !pendingClaims?.length && <EmptyNote>{claims.isLoading ? 'กำลังโหลด…' : 'ไม่มีชุดเบิกรออนุมัติ'}</EmptyNote>}
      {pendingClaims?.map(claim => <Card key={claim.id} style={{ gap: spacing.sm }}>
        <Text style={{ fontWeight: '700' }}>{claim.submittedBy.firstName} {claim.submittedBy.lastName} · {formatMoney(claim.totalAmount)} ฿</Text>
        <Text>{claim.itemCount} รายการ · {claim.receiptCount} ใบเสร็จ · ส่ง {thDate(claim.submittedAt)}</Text>
        <Button title="เปิดใบเสร็จ / อนุมัติชุดเบิก" ghost onPress={() => router.push(`/expenses/claim/${claim.id}`)} />
      </Card>)}
    </>}
    {show('risk') && <>
      <SectionLabel>งานที่ต้องเข้าไปช่วย · {daily.data ? risks.length : '—'} เรื่อง</SectionLabel>
      {daily.isError && <ErrorNote message="โหลดงานที่ต้องตัดสินใจไม่ได้" onRetry={() => daily.refetch()} />}
      {!daily.isError && !risks.length && <EmptyNote>{daily.isLoading ? 'กำลังโหลด…' : 'ไม่มีเรื่องต้องตามจากงานที่บันทึกไว้'}</EmptyNote>}
      {risks.map(({ task, reason }) => <Card key={task.id} style={{ gap: spacing.sm }}><Text style={{ fontWeight: '700' }}>{task.title}</Text>
        <Text style={{ color: colors.warn }}>{reason}</Text><Text>{task.case?.ownRef ?? 'งานสำนักงาน'}</Text>
        <Button title="เปิดงาน / จัดการจุดติดขัด" ghost onPress={() => router.push(`/task/new?id=${task.id}`)} />
      </Card>)}
    </>}
  </ScrollView>;
}

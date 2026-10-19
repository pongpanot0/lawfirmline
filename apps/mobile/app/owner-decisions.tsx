import React, { useCallback, useState } from 'react';
import { Alert, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { ChevronRight } from 'lucide-react-native';
import { hasFirmCapability, ownerDecisionTasks } from '@lawfirm/shared';
import { useAuth } from '@/api/auth';
import { useDailyWorkboard, useDecideLeave, useExpenseClaims, usePendingLeaves, useTodos } from '@/api/hooks';
import { Text } from '@/components/AppText';
import { Button, Card, EmptyState, FilterTabs, InlineError, LoadingState, PageIntro, SectionLabel, Tag } from '@/components/ui';
import { bangkokDay, formatMoney, thDate, thTime } from '@/format';
import { colors, pageContent, radius, shadow, spacing, TOUCH } from '@/theme';

const LEAVE_TYPES = { SICK: 'ลาป่วย', PERSONAL: 'ลากิจ', VACATION: 'ลาพักร้อน' };
const FILTERS = [{ value: 'all', label: 'ทั้งหมด' }, { value: 'review', label: 'งานรอตรวจ' }, { value: 'leave', label: 'ลารออนุมัติ' }, { value: 'claim', label: 'เบิกรออนุมัติ' }, { value: 'risk', label: 'ต้องตัดสินใจ' }];

function leaveRange(start: string, end: string) {
  return start.slice(0, 10) === end.slice(0, 10) ? thDate(start) : `${thDate(start)} – ${thDate(end)}`;
}

/** The whole card opens the item; the chevron says so. */
function RowCard({ label, onPress, children }: { label: string; onPress: () => void; children: React.ReactNode }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress}
    style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.soft }]}>
    <View style={styles.rowBody}>{children}</View>
    <ChevronRight size={18} color={colors.muted} />
  </Pressable>;
}

export default function OwnerDecisions() {
  const { view } = useLocalSearchParams<{ view?: string }>();
  const [filter, setFilter] = useState(FILTERS.some(item => item.value === view) ? view! : 'all');
  const [decideError, setDecideError] = useState<{ id: string; message: string } | null>(null);
  const { user } = useAuth();
  // Each queue follows the capability of the endpoint behind it; review stays with the owner (reviewer eligibility).
  const canReview = user?.firmRole === 'OWNER', canLeave = hasFirmCapability(user?.firmRole, 'approveLeave');
  const canClaim = hasFirmCapability(user?.firmRole, 'approveExpenses'), canRisk = hasFirmCapability(user?.firmRole, 'runOperations');
  const anyQueue = canReview || canLeave || canClaim || canRisk;
  const router = useRouter();
  const today = bangkokDay(new Date().toISOString());
  const reviews = useTodos('review', canReview), leaves = usePendingLeaves(canLeave), claims = useExpenseClaims(canClaim), daily = useDailyWorkboard(today, canRisk);
  const decision = useDecideLeave();
  const refresh = useCallback(() => { if (canReview) void reviews.refetch(); if (canLeave) void leaves.refetch(); if (canClaim) void claims.refetch(); if (canRisk) void daily.refetch(); }, [canReview, canLeave, canClaim, canRisk, reviews.refetch, leaves.refetch, claims.refetch, daily.refetch]);
  useFocusEffect(refresh);
  const risks = daily.data ? ownerDecisionTasks(daily.data.tasks, today).filter(item => item.task.status !== 'PENDING_REVIEW') : [];
  const pendingClaims = claims.data?.filter(item => item.status === 'PENDING');
  const queues = {
    review: { allowed: canReview, count: reviews.data?.length, loading: reviews.isLoading, error: reviews.isError },
    leave: { allowed: canLeave, count: leaves.data?.length, loading: leaves.isLoading, error: leaves.isError },
    claim: { allowed: canClaim, count: pendingClaims?.length, loading: claims.isLoading, error: claims.isError },
    risk: { allowed: canRisk, count: daily.data ? risks.length : undefined, loading: daily.isLoading, error: daily.isError },
  } as const;
  type Queue = keyof typeof queues;
  const filters = FILTERS.filter(item => item.value === 'all' || queues[item.value as Queue].allowed)
    .map(item => { const count = item.value === 'all' ? undefined : queues[item.value as Queue].count; return count ? { ...item, label: `${item.label} (${count})` } : item; });
  const allowed = (Object.keys(queues) as Queue[]).filter(key => queues[key].allowed);
  // In "ทั้งหมด" an empty queue is hidden; one combined note replaces four "ไม่มี…" lines.
  const show = (value: Queue) => queues[value].allowed && (filter === value || (filter === 'all' && (!!queues[value].count || queues[value].error)));
  const anyLoading = allowed.some(key => queues[key].loading);
  const allClear = filter === 'all' && !anyLoading && allowed.every(key => !queues[key].error && !queues[key].count);
  const decide = (leave: NonNullable<typeof leaves.data>[number], result: 'APPROVED' | 'REJECTED') => Alert.alert(
    result === 'APPROVED' ? 'ยืนยันอนุมัติลา' : 'ยืนยันไม่อนุมัติลา',
    `${leave.user?.firstName} · ${leaveRange(leave.startDate, leave.endDate)}${leave.courtConflicts?.length ? '\nมีนัดศาลทับ ตรวจผู้รับช่วงให้เรียบร้อย' : ''}`, [
      { text: 'ยกเลิก', style: 'cancel' },
      { text: 'ยืนยัน', style: result === 'REJECTED' ? 'destructive' : 'default', onPress: () => { setDecideError(null); decision.mutate({ id: leave.id, decision: result }, {
        onError: error => setDecideError({ id: leave.id, message: `ตัดสินใจไม่สำเร็จ · ${error.message}` }) }); } },
    ]);
  if (!anyQueue) return <View style={{ flex: 1, backgroundColor: colors.bg }}><EmptyState>คิวนี้สำหรับเจ้าของและผู้จัดการสำนักงาน</EmptyState></View>;
  return <ScrollView style={{ backgroundColor: colors.bg }} contentContainerStyle={{ ...pageContent, gap: spacing.md }}
    refreshControl={<RefreshControl refreshing={reviews.isRefetching || leaves.isRefetching || claims.isRefetching || daily.isRefetching} onRefresh={refresh} />}>
    <Stack.Screen options={{ title: 'คิวตัดสินใจวันนี้' }} />
    <PageIntro title="คิวตัดสินใจวันนี้" detailOnly detail="เปิดผลงานหรือหลักฐานก่อนตัดสินใจ" />
    <FilterTabs items={filters} value={filter} onChange={setFilter} />
    {filter === 'all' && anyLoading && <LoadingState label="กำลังโหลดคิว…" />}
    {allClear && <EmptyState>ไม่มีเรื่องรอตัดสินใจ</EmptyState>}
    {show('review') && <>
      <SectionLabel>รอ Owner ตรวจ · {reviews.data?.length ?? '—'} งาน</SectionLabel>
      {reviews.isError && <InlineError message="โหลดงานรอตรวจไม่ได้" onRetry={() => reviews.refetch()} />}
      {reviews.isLoading && filter !== 'all' && <LoadingState inline />}
      {reviews.data && !reviews.data.length && <EmptyState compact>ไม่มีงานรอคุณตรวจ</EmptyState>}
      {reviews.data?.map(task => <RowCard key={task.id} label={`${task.title} · เปิดผลงานเพื่อตรวจรับหรือส่งกลับ`} onPress={() => router.push(`/task/new?id=${task.id}`)}>
        <Text style={styles.rowTitle}>{task.title}</Text>
        <Text style={styles.rowMeta}>{task.case?.ownRef ?? 'งานสำนักงาน'}{task.dueDate ? ` · ส่งภายใน ${thDate(task.dueDate)}` : ''}</Text>
      </RowCard>)}
    </>}
    {show('leave') && <>
      <SectionLabel>ลารออนุมัติ · {leaves.data?.length ?? '—'} รายการ</SectionLabel>
      {leaves.isError && <InlineError message="โหลดคำขอลาไม่ได้" onRetry={() => leaves.refetch()} />}
      {leaves.isLoading && filter !== 'all' && <LoadingState inline />}
      {leaves.data && !leaves.data.length && <EmptyState compact>ไม่มีคำขอลารออนุมัติ</EmptyState>}
      {leaves.data?.map(leave => {
        const busy = decision.isPending && decision.variables?.id === leave.id;
        const result = busy ? decision.variables?.decision : undefined;
        return <Card key={leave.id} style={{ gap: spacing.sm }}>
          <Text style={styles.rowTitle}>{leave.user?.firstName} {leave.user?.lastName} · {LEAVE_TYPES[leave.type]}</Text>
          <Text style={styles.rowMeta}>{leaveRange(leave.startDate, leave.endDate)}</Text>
          {leave.courtConflicts?.length ? <>
            <Tag tone="due">ทับนัดศาล {leave.courtConflicts.length} นัด</Tag>
            {leave.courtConflicts.map(event => <Pressable key={event.eventId} accessibilityRole="button"
              accessibilityLabel={`นัดที่ทับ ${event.caseRef} ${thDate(event.startAt)} ${thTime(event.startAt)} ${event.title} · เปิดทีมที่ไป`}
              onPress={() => router.push(`/event/${event.eventId}/team`)} style={({ pressed }) => [styles.conflict, pressed && { backgroundColor: colors.soft }]}>
              <Text style={[styles.rowMeta, { flex: 1, color: colors.text }]}>{event.caseRef} · {thDate(event.startAt)} {thTime(event.startAt)} · {event.title}</Text>
              <ChevronRight size={16} color={colors.muted} />
            </Pressable>)}
          </> : null}
          <Button title="เทียบกำลังคนช่วงวันลา" variant="link" onPress={() => router.push(`/team-week?date=${leave.startDate.slice(0, 10)}`)} />
          {decideError?.id === leave.id && <InlineError message={decideError.message} />}
          <View style={styles.decide}>
            <Button title="ไม่อนุมัติ" variant="danger" inline busy={result === 'REJECTED'} disabled={leaves.isFetching || leaves.isError || (decision.isPending && !busy) || result === 'APPROVED'}
              onPress={() => decide(leave, 'REJECTED')} />
            <Button title="อนุมัติคำขอลา" variant="secondary" inline busy={result === 'APPROVED'} disabled={leaves.isFetching || leaves.isError || (decision.isPending && !busy) || result === 'REJECTED'}
              onPress={() => decide(leave, 'APPROVED')} />
          </View>
        </Card>;
      })}
    </>}
    {show('claim') && <>
      <SectionLabel>เบิกรออนุมัติ · {pendingClaims?.length ?? '—'} ชุด</SectionLabel>
      {claims.isError && <InlineError message="โหลดชุดเบิกไม่ได้" onRetry={() => claims.refetch()} />}
      {claims.isLoading && filter !== 'all' && <LoadingState inline />}
      {pendingClaims && !pendingClaims.length && <EmptyState compact>ไม่มีชุดเบิกรออนุมัติ</EmptyState>}
      {pendingClaims?.map(claim => <RowCard key={claim.id} label={`${claim.submittedBy.firstName} ${claim.submittedBy.lastName} เบิก ${formatMoney(claim.totalAmount)} บาท · เปิดใบเสร็จเพื่ออนุมัติ`}
        onPress={() => router.push(`/expenses/claim/${claim.id}`)}>
        <Text style={styles.rowTitle}>{claim.submittedBy.firstName} {claim.submittedBy.lastName} · {formatMoney(claim.totalAmount)} ฿</Text>
        <Text style={styles.rowMeta}>{claim.itemCount} รายการ · {claim.receiptCount} ใบเสร็จ · ส่ง {thDate(claim.submittedAt)}</Text>
      </RowCard>)}
    </>}
    {show('risk') && <>
      <SectionLabel>งานที่ต้องเข้าไปช่วย · {daily.data ? risks.length : '—'} เรื่อง</SectionLabel>
      {daily.isError && <InlineError message="โหลดงานที่ต้องตัดสินใจไม่ได้" onRetry={() => daily.refetch()} />}
      {daily.isLoading && filter !== 'all' && <LoadingState inline />}
      {daily.data && !risks.length && <EmptyState compact>ไม่มีเรื่องต้องตามจากงานที่บันทึกไว้</EmptyState>}
      {risks.map(({ task, reason }) => <RowCard key={task.id} label={`${task.title} · ${reason} · เปิดงาน`} onPress={() => router.push(`/task/new?id=${task.id}`)}>
        <Text style={styles.rowTitle}>{task.title}</Text>
        <Tag tone="due">{reason}</Tag>
        <Text style={styles.rowMeta}>{task.case?.ownRef ?? 'งานสำนักงาน'}</Text>
      </RowCard>)}
    </>}
  </ScrollView>;
}

const styles = StyleSheet.create({
  // Matches Card (raised surface, 12 radius, sm shadow) so pressable rows and decision cards read as one list.
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: TOUCH, paddingVertical: spacing.md, paddingHorizontal: spacing.lg,
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: radius.card, ...shadow.sm },
  rowBody: { flex: 1, minWidth: 0, gap: spacing.xs },
  rowTitle: { fontWeight: '700', fontSize: 16, lineHeight: 24, color: colors.ink },
  rowMeta: { color: colors.muted, fontSize: 14, lineHeight: 22 },
  conflict: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: TOUCH, borderTopWidth: 1, borderTopColor: colors.divider },
  decide: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: spacing.md, marginTop: spacing.xs },
});

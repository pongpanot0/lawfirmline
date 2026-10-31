import React, { useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { ChevronRight } from 'lucide-react-native';
import { hasFirmCapability, CASE_STAGE_LABELS_TH, type CaseStage } from '@lawfirm/shared';
import { useAuth } from '@/api/auth';
import { useDailyBrief, useDailyBriefDates } from '@/api/hooks';
import { Text } from '@/components/AppText';
import { Card, EmptyState, ErrorState, FilterTabs, InlineError, LoadingState, SectionLabel, Tag, TASK_STATUS_LABEL } from '@/components/ui';
import { bangkokDay, thDate, thTime } from '@/format';
import { colors, pageContent, spacing, TOUCH, typeScale } from '@/theme';

export default function DailyBriefScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const allowed = hasFirmCapability(user?.firmRole, 'viewAllCases');
  const today = bangkokDay(new Date().toISOString());
  const [date, setDate] = useState(today);
  const dates = useDailyBriefDates(allowed);
  const query = useDailyBrief(date, allowed);
  const days = [today, ...(dates.data ?? []).filter(day => day !== today).slice(0, 30)];
  const brief = query.data;

  return <ScrollView style={styles.screen} contentContainerStyle={[pageContent, { gap: spacing.md }]}
    refreshControl={allowed ? <RefreshControl refreshing={query.isRefetching || dates.isRefetching}
      onRefresh={() => { query.refetch(); dates.refetch(); }} /> : undefined}>
    <Stack.Screen options={{ title: 'สรุปประจำวัน' }} />
    {!allowed ? <EmptyState>สรุปประจำวันสำหรับเจ้าของสำนักงานและผู้จัดการสำนักงาน</EmptyState> : <>
      <FilterTabs value={date} onChange={setDate} items={days.map(day => ({ value: day, label: day === today ? 'วันนี้' : thDate(day) }))} />
      {dates.isError ? <InlineError message="โหลดวันที่ย้อนหลังไม่สำเร็จ" onRetry={() => dates.refetch()} /> : null}
      {query.isLoading ? <LoadingState label="กำลังโหลดสรุปประจำวัน…" />
        : query.isError ? <ErrorState message={query.error.message || 'โหลดสรุปประจำวันไม่สำเร็จ'} onRetry={() => query.refetch()} />
        : !brief ? <EmptyState>{date === today ? 'ยังไม่มีสรุปประจำวันของวันนี้' : 'ไม่มีสรุปของวันที่เลือก'} · ลองเลือกวันอื่นหรือดึงลงเพื่อโหลดใหม่</EmptyState>
        : <>
          <Text accessibilityRole="header" style={styles.title}>{thDate(brief.date)}</Text>
          <Text style={styles.meta}>จัดทำเมื่อ {thDate(brief.createdAt)} · {thTime(brief.createdAt)}</Text>
          {brief.summary ? <Card><Text selectable style={styles.body}>{brief.summary}</Text></Card> : null}
          <View style={styles.tags}>
            <Tag tone="due">{`งานค้าง ${brief.data.totals.stuckTasks}`}</Tag>
            <Tag tone="due">{`เลยกำหนด ${brief.data.totals.overdueTasks}`}</Tag>
            <Tag>{`ผู้รับผิดชอบ ${brief.data.totals.people} คน`}</Tag>
          </View>
          {brief.data.groups.length ? brief.data.groups.map(group => <Card key={group.assigneeId ?? 'unassigned'}>
            <Text accessibilityRole="header" style={styles.groupTitle}>{group.assigneeName}</Text>
            {group.items.map(task => <Pressable key={task.id} accessibilityRole="button" accessibilityLabel={`เปิดงาน ${task.title}`}
              onPress={() => router.push(`/task/${task.id}`)} style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.soft }]}>
              <View style={styles.rowBody}>
                <Text style={styles.rowTitle}>{task.title}</Text>
                <Text style={styles.meta}>{task.matterTitle}</Text>
                <Text style={styles.meta}>{TASK_STATUS_LABEL[task.status] ?? task.status}{task.dueDate ? ` · กำหนด ${thDate(task.dueDate)}` : ''}</Text>
                <View style={styles.tags}>
                  <Tag tone={task.daysStuck >= brief.data.stuckTaskDays ? 'due' : 'plain'}>{`ค้าง ${task.daysStuck} วัน`}</Tag>
                  {task.daysOverdue > 0 ? <Tag tone="due">{`เลยกำหนด ${task.daysOverdue} วัน`}</Tag> : null}
                  {task.hearingWithin7Days ? <Tag tone="court">มีนัด / กำหนดใน 7 วัน</Tag> : null}
                </View>
                {task.holdReason ? <Text style={styles.meta}>พักไว้: {task.holdReason}</Text> : null}
              </View><ChevronRight size={18} color={colors.muted} />
            </Pressable>)}
          </Card>) : <EmptyState compact>ไม่มีงานที่ต้องตามในสรุปนี้</EmptyState>}
          {brief.data.stuckCases.length ? <>
            <SectionLabel>คดีที่ขั้นตอนยังไม่เดิน</SectionLabel>
            <Card>{brief.data.stuckCases.map(item => <Pressable key={item.caseId} accessibilityRole="button"
              accessibilityLabel={`เปิดคดี ${item.title}`} onPress={() => router.push(`/case/${item.caseId}`)}
              style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.soft }]}>
              <View style={styles.rowBody}>
                <Text style={styles.rowTitle}>{item.title}</Text>
                <Text style={styles.meta}>{item.stage ? `${CASE_STAGE_LABELS_TH[item.stage as CaseStage] ?? item.stage} · ` : ''}ไม่เปลี่ยนขั้นตอน {item.daysSinceStageChange} วัน</Text>
              </View><ChevronRight size={18} color={colors.muted} />
            </Pressable>)}</Card>
          </> : null}
        </>}
    </>}
  </ScrollView>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  title: { ...typeScale.title, color: colors.ink },
  groupTitle: { ...typeScale.section, color: colors.ink, marginBottom: spacing.sm },
  body: { ...typeScale.body, color: colors.text },
  meta: { ...typeScale.meta, color: colors.muted },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  row: { minHeight: TOUCH, flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    paddingVertical: spacing.md, borderTopWidth: 1, borderTopColor: colors.divider },
  rowBody: { flex: 1, minWidth: 0, gap: spacing.xs },
  rowTitle: { ...typeScale.body, color: colors.ink, fontWeight: '600' },
});

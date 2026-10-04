import React, { useState } from 'react';
import { FlatList, Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '@/components/AppText';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Check } from 'lucide-react-native';
import { followUpReason } from '@lawfirm/shared';
import { useAuth } from '@/api/auth';
import { api } from '@/api/client';
import { useQueryClient } from '@tanstack/react-query';
import { useTodos, useToggleTask, useWorkload, useDailyWorkboard } from '@/api/hooks';
import type { TaskItem } from '@/api/types';
import { Button, Card, EmptyNote, ErrorNote, Loading, PageIntro, Tag } from '@/components/ui';
import { ReassignSheet } from '@/components/ReassignSheet';
import { bangkokDay, thDate } from '@/format';
import { canToggleTask } from '@/workflow';
import { colors, spacing, TOUCH, pageContent } from '@/theme';

const VIEWS = [
  { value: 'mine', label: 'งานของฉัน' },
  { value: 'created', label: 'งานที่ฉันสร้าง' },
  { value: 'review', label: 'รอตรวจ' },
  { value: 'follow-up', label: 'ต้องตาม', owner: true },
  { value: 'unassigned', label: 'ยังไม่มีคนรับ', owner: true },
] as const;
const STATUS_LABEL: Record<string, string> = {
  TODO: 'ต้องทำ', IN_PROGRESS: 'กำลังทำ', PENDING_REVIEW: 'รอตรวจ', NEEDS_REVISION: 'ส่งกลับแก้ไข', DONE: 'เสร็จ',
};

export default function TasksScreen() {
  const router = useRouter();
  const client = useQueryClient();
  const { memberId, view: requestedView } = useLocalSearchParams<{ memberId?: string; view?: string }>();
  const { user } = useAuth();
  const owner = user?.firmRole === 'OWNER';
  const views = VIEWS.filter(item => !('owner' in item) || owner);
  const view = views.find(item => item.value === requestedView)?.value ?? 'mine';
  const officeQueue = !memberId && (view === 'follow-up' || view === 'unassigned');
  const todos = useTodos(memberId ? 'all' : view === 'created' || view === 'review' ? view : 'mine', !officeQueue);
  const today = bangkokDay(new Date().toISOString());
  const board = useDailyWorkboard(today, owner && officeQueue);
  const workload = useWorkload(!!memberId);
  const toggle = useToggleTask();
  const [reassigning, setReassigning] = useState<TaskItem | null>(null);
  const [following, setFollowing] = useState<string | null>(null);
  const query = officeQueue ? board : todos;
  const queue = (board.data?.tasks ?? []).filter(task => view === 'unassigned'
    ? !task.assigneeId && task.status !== 'DONE'
    : !!task.assigneeId && followUpReason(task, today) !== null);
  const rows: TaskItem[] = officeQueue ? queue.map(task => {
    const member = board.data?.members.find(person => person.userId === task.assigneeId);
    return { ...task, assignee: member ? { id: member.userId, firstName: member.firstName, lastName: member.lastName } : null };
  }) : (todos.data ?? []).filter(task => !memberId || task.assigneeId === memberId);
  const queueById = new Map(queue.map(task => [task.id, task]));
  rows.sort((a, b) => Number(a.status === 'DONE') - Number(b.status === 'DONE') ||
    (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999') || a.id.localeCompare(b.id));

  const followUp = (task: TaskItem) => Alert.alert('ตามงาน', `ขอความคืบหน้างาน “${task.title}” จาก ${task.assignee ? `${task.assignee.firstName} ${task.assignee.lastName}` : 'ผู้รับผิดชอบปัจจุบัน'}?`, [
    { text: 'ยกเลิก', style: 'cancel' },
    { text: 'ส่งคำขอติดตาม', onPress: async () => {
      setFollowing(task.id);
      try {
        const result = await api<{ alreadySent: boolean }>(`/operations/tasks/${task.id}/follow-up`, { method: 'POST' });
        await Promise.all([['daily-workboard'], ['todos'], ['task', task.id], ['actions']].map(queryKey => client.invalidateQueries({ queryKey })));
        Alert.alert(result.alreadySent ? 'วันนี้ตามงานนี้แล้ว' : 'บันทึกคำขอติดตามแล้ว');
      } catch (error) { Alert.alert('ตามงานไม่สำเร็จ', error instanceof Error ? error.message : 'ลองใหม่อีกครั้ง'); }
      finally { setFollowing(null); }
    } },
  ]);

  return <View style={styles.screen}>
    <FlatList
      data={query.isError ? [] : rows}
      keyExtractor={task => task.id}
      contentContainerStyle={pageContent}
      refreshing={query.isRefetching}
      onRefresh={() => query.refetch()}
      ListHeaderComponent={<View style={{ marginBottom: spacing.md, gap: spacing.sm }}>
        <PageIntro title={memberId ? 'งานของสมาชิก' : views.find(item => item.value === view)?.label ?? 'งานของฉัน'} detail="แตะงานเพื่อดูรายละเอียด ส่งงาน หรืออัปเดตความคืบหน้า" />
        {memberId ? <Pressable accessibilityRole="button" style={styles.filter} onPress={() => router.replace('/(tabs)/tasks')}>
          <Text style={styles.filterText}>งานของ {workload.data?.members.find(member => member.id === memberId)?.name ?? 'สมาชิกทีม'} · กลับงานของฉัน ×</Text>
        </Pressable> : <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm }}>
          {views.map(item => <Pressable key={item.value} accessibilityRole="button" accessibilityState={{ selected: view === item.value }}
            onPress={() => router.setParams({ view: item.value })} style={[styles.chip, view === item.value && styles.chipActive]}>
            <Text style={{ color: view === item.value ? colors.info : colors.muted, fontWeight: '600' }}>{item.label}</Text>
          </Pressable>)}
        </ScrollView>}
        <Button title="เพิ่มงาน" onPress={() => router.push('/task/new')} />
        <Text style={styles.meta}>{query.isLoading ? 'กำลังโหลด…' : query.isError ? 'ยังโหลดรายการไม่ได้' : `${rows.length} งาน`}</Text>
        {toggle.isError && <ErrorNote message="เปลี่ยนสถานะไม่สำเร็จ กรุณาเปิดงานแล้วลองใหม่" />}
      </View>}
      renderItem={({ item }) => {
        const dailyTask = officeQueue ? queueById.get(item.id) : undefined;
        const reason = dailyTask && followUpReason(dailyTask, today);
        const done = item.status === 'DONE';
        const late = !done && item.status !== 'PENDING_REVIEW' && item.dueDate && bangkokDay(item.dueDate) < today;
        return <Card style={{ marginBottom: spacing.md }}>
          <View style={styles.row}>
            {!officeQueue && user && canToggleTask(item, user) && <Pressable accessibilityRole="checkbox"
              accessibilityLabel={`ทำงาน ${item.title} เสร็จแล้ว`} accessibilityState={{ checked: done, disabled: toggle.isPending }}
              disabled={toggle.isPending} onPress={() => toggle.mutate({ task: item, done: !done })}
              hitSlop={11} style={[styles.checkbox, done && styles.checkboxDone]}>
              {done && <Check size={13} color={colors.surface} strokeWidth={3} />}
            </Pressable>}
            <Pressable accessibilityRole="button" accessibilityLabel={`เปิดงาน ${item.title}`} style={{ flex: 1, gap: spacing.xs, minHeight: TOUCH }}
              onPress={() => router.push(`/task/new?id=${item.id}`)}>
              <Text style={[styles.title, done && styles.titleDone]}>{item.title}</Text>
              <Tag tone={done ? 'ok' : item.status === 'PENDING_REVIEW' ? 'info' : 'plain'}>{STATUS_LABEL[item.status] ?? item.status}</Tag>
              {item.case && <Text style={styles.meta} numberOfLines={1}>{item.case.ownRef} · {item.case.title}</Text>}
              <Text style={styles.meta}>ผู้รับผิดชอบ: {item.assignee ? `${item.assignee.firstName} ${item.assignee.lastName}` : item.assigneeId ? 'สมาชิกเดิม / โหลดชื่อไม่ได้' : 'ยังไม่ระบุ'}</Text>
              {reason && <Text style={{ color: colors.warn }}>{reason}</Text>}
              {!!(dailyTask?.latestUpdate?.body || item.comments?.[0]?.body) && <Text style={styles.meta} numberOfLines={2}>
                ล่าสุด: {dailyTask?.latestUpdate?.body ?? item.comments?.[0]?.body}
              </Text>}
              {item.dueDate && <Text style={[styles.meta, late && { color: colors.warn }]}>
                {late ? 'เลยกำหนด' : 'กำหนดส่ง'} {thDate(item.dueDate)}
              </Text>}
              {dailyTask?.followedUpAt && <Text style={styles.meta}>ตามล่าสุด {thDate(dailyTask.followedUpAt)}</Text>}
            </Pressable>
          </View>
          <View style={styles.assignmentRow}>
            {!['DONE', 'PENDING_REVIEW'].includes(item.status) && (item.caseId
              ? ['OWNER', 'SENIOR_LAWYER', 'LAWYER'].includes(user?.firmRole ?? '')
              : owner || item.assigneeId === user?.id || item.createdById === user?.id) &&
              <Pressable accessibilityRole="button" accessibilityLabel={`มอบหมายงาน ${item.title}`} style={styles.assignButton} onPress={() => setReassigning(item)}>
                <Text style={styles.filterText}>มอบหมาย</Text>
              </Pressable>}
            {owner && item.assigneeId && !['DONE', 'PENDING_REVIEW'].includes(item.status) &&
              <Button title="ตามงาน" ghost busy={following === item.id} disabled={!!following} onPress={() => followUp(item)} />}
          </View>
        </Card>;
      }}
      ListEmptyComponent={query.isLoading ? <Loading /> : query.isError
        ? <ErrorNote message="โหลดงานไม่สำเร็จ" onRetry={() => query.refetch()} />
        : <EmptyNote>{view === 'created' ? 'ยังไม่มีงานที่คุณสร้าง' : view === 'review' ? 'ไม่มีงานรอคุณตรวจ' : view === 'follow-up' ? 'ไม่มีงานที่ต้องตาม' : view === 'unassigned' ? 'ไม่มีงานที่ยังขาดผู้รับผิดชอบ' : 'ไม่มีงานในรายการนี้'}</EmptyNote>}
    />
    <ReassignSheet caseId={reassigning?.caseId} task={reassigning} onClose={() => setReassigning(null)} />
  </View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  assignmentRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.sm, marginTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.line, paddingTop: spacing.xs },
  assignButton: { minHeight: TOUCH, justifyContent: 'center', paddingHorizontal: spacing.sm },
  checkbox: { width: 22, height: 22, minWidth: 22, borderRadius: 6, borderWidth: 1.5, borderColor: colors.muted, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  checkboxDone: { backgroundColor: colors.good, borderColor: colors.good },
  title: { color: colors.text, fontWeight: '600', fontSize: 14 },
  titleDone: { color: colors.faint, textDecorationLine: 'line-through' },
  meta: { color: colors.faint, fontSize: 12 },
  filter: { minHeight: TOUCH, justifyContent: 'center' },
  filterText: { color: colors.info, fontWeight: '600' },
  chip: { minHeight: TOUCH, justifyContent: 'center', paddingHorizontal: spacing.md, borderRadius: 8, backgroundColor: colors.soft },
  chipActive: { backgroundColor: colors.infoSoft, borderWidth: 1, borderColor: colors.ink },
});

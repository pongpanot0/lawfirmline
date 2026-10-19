import React, { useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/components/AppText';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Check, ChevronRight, X } from 'lucide-react-native';
import { followUpReason, hasFirmCapability, taskStageChip } from '@lawfirm/shared';
import { useAuth } from '@/api/auth';
import { api } from '@/api/client';
import { useQueryClient } from '@tanstack/react-query';
import { useTodos, useToggleTask, useWorkload, useDailyWorkboard } from '@/api/hooks';
import type { TaskItem } from '@/api/types';
import { Button, Card, EmptyNote, ErrorNote, FilterTabs, Loading, Tag, TASK_STATUS_LABEL, taskStatusTone } from '@/components/ui';
import { FieldError } from '@/components/Form';
import { ReassignSheet } from '@/components/ReassignSheet';
import { bangkokDay, thDate } from '@/format';
import { canToggleTask } from '@/workflow';
import { colors, spacing, TOUCH, pageContent } from '@/theme';

const VIEWS = [
  { value: 'mine', label: 'งานของฉัน' },
  { value: 'created', label: 'งานที่ฉันสร้าง' },
  { value: 'review', label: 'รอฉันตรวจ' },
  { value: 'follow-up', label: 'ต้องตาม', owner: true },
  { value: 'unassigned', label: 'ยังไม่มีคนรับ', owner: true },
] as const;

/** Result of a follow-up request, shown on the row instead of two alerts. */
type FollowState = { ok: true; text: string } | { ok: false; text: string };

export default function TasksScreen() {
  const router = useRouter();
  const client = useQueryClient();
  const { memberId, view: requestedView } = useLocalSearchParams<{ memberId?: string; view?: string }>();
  const { user } = useAuth();
  const owner = hasFirmCapability(user?.firmRole, 'runOperations');
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
  const [followed, setFollowed] = useState<Record<string, FollowState>>({});
  const query = officeQueue ? board : todos;
  const queue = (board.data?.tasks ?? []).filter(task => view === 'unassigned'
    ? !task.assigneeId && task.status !== 'DONE'
    : !!task.assigneeId && followUpReason(task, today) !== null);
  const rows: TaskItem[] = officeQueue ? queue.map(task => {
    const member = board.data?.members.find(person => person.userId === task.assigneeId);
    return { ...task, assignee: member ? { id: member.userId, firstName: member.firstName, lastName: member.lastName } : null };
  }) : (todos.data ?? []).filter(task => !memberId || task.assigneeId === memberId);
  const queueById = new Map(queue.map(task => [task.id, task]));
  const submitted = (t: TaskItem) => view === 'mine' && t.status === 'PENDING_REVIEW' && t.assigneeId === user?.id;
  rows.sort((a, b) => Number(a.status === 'DONE') - Number(b.status === 'DONE') || Number(submitted(a)) - Number(submitted(b)) ||
    (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999') || a.id.localeCompare(b.id));
  // In "งานของฉัน" every row is the user's own, so the assignee line would repeat their name on every card.
  const ownList = !memberId && view === 'mine';

  // Sends straight away (the server de-duplicates per day) and reports on the row.
  // Following up notifies the assignee, so it keeps its confirm; the result then shows inline on the row.
  const followUp = (task: TaskItem) => Alert.alert('ตามงาน', `ขอความคืบหน้างาน “${task.title}” จาก ${task.assignee ? `${task.assignee.firstName} ${task.assignee.lastName}` : 'ผู้รับผิดชอบปัจจุบัน'}?`, [
    { text: 'ยกเลิก', style: 'cancel' },
    { text: 'ส่งคำขอติดตาม', onPress: () => { void sendFollowUp(task); } },
  ]);
  const sendFollowUp = async (task: TaskItem) => {
    setFollowing(task.id);
    try {
      const result = await api<{ alreadySent: boolean }>(`/operations/tasks/${task.id}/follow-up`, { method: 'POST' });
      await Promise.all([['daily-workboard'], ['todos'], ['task', task.id], ['actions']].map(queryKey => client.invalidateQueries({ queryKey })));
      setFollowed(current => ({ ...current, [task.id]: { ok: true, text: result.alreadySent ? 'วันนี้ตามงานนี้แล้ว' : 'ตามแล้ววันนี้' } }));
    } catch (error) {
      setFollowed(current => ({ ...current, [task.id]: { ok: false, text: `ตามงานไม่สำเร็จ · ${error instanceof Error ? error.message : 'ลองใหม่อีกครั้ง'}` } }));
    } finally { setFollowing(null); }
  };

  return <View style={styles.screen}>
    <FlatList
      data={rows}
      keyExtractor={task => task.id}
      contentContainerStyle={pageContent}
      refreshing={query.isRefetching}
      onRefresh={() => query.refetch()}
      ListHeaderComponent={<View style={{ marginBottom: spacing.md, gap: spacing.sm }}>
        {memberId ? <Pressable accessibilityRole="button" accessibilityLabel="เลิกกรองงานของสมาชิก · กลับงานของฉัน"
          style={({ pressed }) => [styles.filter, pressed && { opacity: 0.6 }]} onPress={() => router.replace('/(tabs)/tasks')}>
          <Text style={styles.filterText}>งานของ {workload.data?.members.find(member => member.id === memberId)?.name ?? 'สมาชิกทีม'} · กลับงานของฉัน</Text>
          <X size={16} color={colors.info} />
        </Pressable> : <FilterTabs items={views} value={view} onChange={value => router.setParams({ view: value })} />}
        <Button title="เพิ่มงาน" onPress={() => router.push('/task/new')} />
        {query.data && !query.isError ? <Text style={styles.meta}>{`${rows.length} งาน`}</Text> : null}
        {/* A failed refresh keeps the rows already on screen and says so above them. */}
        {query.isError && rows.length > 0 && <ErrorNote message="รายการอาจยังไม่ล่าสุด · โหลดใหม่ไม่สำเร็จ" onRetry={() => query.refetch()} />}
      </View>}
      renderItem={({ item, index }) => {
        const dailyTask = officeQueue ? queueById.get(item.id) : undefined;
        const reason = dailyTask && followUpReason(dailyTask, today);
        const done = item.status === 'DONE';
        const late = !done && item.status !== 'PENDING_REVIEW' && item.dueDate && bangkokDay(item.dueDate) < today;
        const header = submitted(item) && (index === 0 || !submitted(rows[index - 1]))
          ? <Text style={[styles.meta, { fontWeight: '700', marginBottom: spacing.xs }]}>ส่งตรวจแล้ว</Text> : null;
        const canAssign = !['DONE', 'PENDING_REVIEW'].includes(item.status) && (item.caseId
          ? ['OWNER', 'SENIOR_LAWYER', 'OFFICE_MANAGER', 'LAWYER'].includes(user?.firmRole ?? '')
          : owner || item.assigneeId === user?.id || item.createdById === user?.id);
        const canFollow = owner && !!item.assigneeId && !['DONE', 'PENDING_REVIEW'].includes(item.status);
        const followState = followed[item.id];
        const toggleFailed = toggle.isError && toggle.variables?.task.id === item.id;
        const showAssignee = !ownList || item.assigneeId !== user?.id;
        return <>{header}<Card style={{ marginBottom: spacing.md }}>
          <View style={styles.row}>
            {!officeQueue && user && canToggleTask(item, user) && <Pressable accessibilityRole="checkbox"
              accessibilityLabel={`ทำงาน ${item.title} เสร็จแล้ว`} accessibilityState={{ checked: done, disabled: toggle.isPending }}
              disabled={toggle.isPending} onPress={() => toggle.mutate({ task: item, done: !done })}
              style={({ pressed }) => [styles.checkTarget, pressed && { opacity: 0.6 }]}>
              <View style={[styles.checkbox, done && styles.checkboxDone]}>
                {done && <Check size={14} color={colors.surface} strokeWidth={3} />}
              </View>
            </Pressable>}
            <Pressable accessibilityRole="button" accessibilityLabel={`เปิดงาน ${item.title}`}
              style={({ pressed }) => [styles.rowBody, pressed && { opacity: 0.7 }]}
              onPress={() => router.push(`/task/new?id=${item.id}`)}>
              <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm }}>
                <Text style={[styles.title, { flex: 1 }, done && styles.titleDone]}>{item.title}</Text>
                <ChevronRight size={18} color={colors.faint} />
              </View>
              {/* "ต้องทำ" is the default state of every open task, so only other states get a tag. */}
              {(item.status !== 'TODO' || taskStageChip(item.labels) || (item.onHold && !item.onHold.endedAt)) && <View style={{ flexDirection: 'row', gap: spacing.xs, flexWrap: 'wrap' }}>
                {item.status !== 'TODO' && <Tag tone={taskStatusTone(item.status)}>{TASK_STATUS_LABEL[item.status] ?? item.status}</Tag>}
                {taskStageChip(item.labels) && <Tag tone="plain">{taskStageChip(item.labels)!}</Tag>}
                {item.onHold && !item.onHold.endedAt && <Tag tone="due">พักอยู่</Tag>}
              </View>}
              {item.status === 'PENDING_REVIEW' && item.reviewer && <Text style={styles.meta}>ผู้ตรวจ: {item.reviewer.firstName} {item.reviewer.lastName}</Text>}
              {item.case && <Text style={styles.meta} numberOfLines={1}>{item.case.ownRef} · {item.case.title}</Text>}
              {showAssignee && <Text style={styles.meta}>ผู้รับผิดชอบ: {item.assignee ? `${item.assignee.firstName} ${item.assignee.lastName}` : item.assigneeId ? 'สมาชิกเดิม / โหลดชื่อไม่ได้' : 'ยังไม่ระบุ'}</Text>}
              {reason && <Text style={{ color: colors.warn }}>{reason}</Text>}
              {!!(dailyTask?.latestUpdate?.body || item.comments?.[0]?.body) && <Text style={styles.meta} numberOfLines={2}>
                ล่าสุด: {dailyTask?.latestUpdate?.body ?? item.comments?.[0]?.body}
              </Text>}
              {item.dueDate && <Text style={[styles.meta, late && { color: colors.warn }]}>
                {late ? 'เลยกำหนด' : 'กำหนดส่ง'} {thDate(item.dueDate)}
              </Text>}
              {dailyTask?.followedUpAt && !followState && <Text style={styles.meta}>ตามล่าสุด {thDate(dailyTask.followedUpAt)}</Text>}
            </Pressable>
          </View>
          <FieldError message={toggleFailed ? `เปลี่ยนสถานะ “${item.title}” ไม่สำเร็จ · ลองใหม่` : undefined} />
          {(canAssign || canFollow) && <View style={styles.assignmentRow}>
            {canAssign && <Button variant="link" title="มอบหมาย" onPress={() => setReassigning(item)} />}
            {canFollow && (followState?.ok
              ? <Text accessibilityLiveRegion="polite" style={[styles.meta, styles.followed]}>{followState.text}</Text>
              : <Button variant="link" title={following === item.id ? 'กำลังส่ง…' : 'ตามงาน'} disabled={!!following}
                accessibilityHint="ส่งคำขอความคืบหน้าถึงผู้รับผิดชอบทันที" onPress={() => void followUp(item)} />)}
          </View>}
          {followState && !followState.ok ? <FieldError message={followState.text} /> : null}
        </Card></>;
      }}
      ListEmptyComponent={query.isLoading ? <Loading label="กำลังโหลดงาน…" /> : query.isError
        ? <ErrorNote message="โหลดงานไม่สำเร็จ" onRetry={() => query.refetch()} />
        : <EmptyNote>{view === 'created' ? 'ยังไม่มีงานที่คุณสร้าง' : view === 'review' ? 'ไม่มีงานรอคุณตรวจ' : view === 'follow-up' ? 'ไม่มีงานที่ต้องตาม' : view === 'unassigned' ? 'ไม่มีงานที่ยังขาดผู้รับผิดชอบ' : 'ไม่มีงานในรายการนี้'}</EmptyNote>}
    />
    <ReassignSheet caseId={reassigning?.caseId} task={reassigning} onClose={() => setReassigning(null)} />
  </View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.xs },
  rowBody: { flex: 1, minWidth: 0, gap: spacing.xs, minHeight: TOUCH, justifyContent: 'center' },
  assignmentRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.lg, marginTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.line },
  // A 44pt target around a 24pt box, so the tap area never overlaps the row beside it.
  checkTarget: { width: TOUCH, height: TOUCH, marginLeft: -spacing.sm, marginTop: -spacing.sm, alignItems: 'center', justifyContent: 'center' },
  checkbox: { width: 24, height: 24, borderRadius: 6, borderWidth: 1.5, borderColor: colors.muted, alignItems: 'center', justifyContent: 'center' },
  checkboxDone: { backgroundColor: colors.good, borderColor: colors.good },
  title: { color: colors.text, fontWeight: '600', fontSize: 14 },
  titleDone: { color: colors.faint, textDecorationLine: 'line-through' },
  meta: { color: colors.faint, fontSize: 12 },
  followed: { minHeight: TOUCH, textAlignVertical: 'center', paddingTop: 14, color: colors.good, fontWeight: '600' },
  filter: { minHeight: TOUCH, flexDirection: 'row', alignItems: 'center', gap: spacing.xs, alignSelf: 'flex-start' },
  filterText: { color: colors.info, fontWeight: '600', flexShrink: 1 },
});

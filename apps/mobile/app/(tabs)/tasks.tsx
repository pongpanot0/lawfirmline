import React, { useState } from 'react';
import { FlatList, Alert, Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/components/AppText';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Check } from 'lucide-react-native';
import { useAuth } from '@/api/auth';
import { useTodos, useToggleTask, useWorkload } from '@/api/hooks';
import type { TaskItem } from '@/api/types';
import { Button, Card, EmptyNote, ErrorNote, Loading, Tag } from '@/components/ui';
import { ReassignSheet } from '@/components/ReassignSheet';
import { thDate } from '@/format';
import { colors, spacing, TOUCH, pageContent } from '@/theme';

function dueTone(task: TaskItem): 'due' | 'plain' | null {
  if (!task.dueDate || task.status === 'DONE') return null;
  return new Date(task.dueDate) < new Date() ? 'due' : 'plain';
}

function TaskRow({
  task,
  onToggle,
  onOpenCase,
}: {
  task: TaskItem;
  onToggle: (done: boolean) => void;
  onOpenCase: () => void;
}) {
  const done = task.status === 'DONE';
  const tone = dueTone(task);
  return (
    <View style={styles.row}>
      <Pressable
        accessibilityRole="checkbox"
        accessibilityLabel={`ทำงาน ${task.title} เสร็จแล้ว`}
        accessibilityState={{ checked: done }}
        onPress={() => onToggle(!done)}
        hitSlop={11}
        style={[styles.checkbox, done && styles.checkboxDone]}
      >
        {done ? <Check size={13} color="#fff" strokeWidth={3} /> : null}
      </Pressable>
      <Pressable style={{ flex: 1, gap: 2 }} onPress={onOpenCase}>
        <Text
          style={[styles.title, done && styles.titleDone]}
          numberOfLines={2}
        >
          {task.title}
        </Text>
        {task.case ? (
          <Text style={styles.meta} numberOfLines={1}>
            {task.case.ownRef} · {task.case.title}
          </Text>
        ) : null}
      </Pressable>
      {task.dueDate && tone ? (
        <Tag tone={tone}>{tone === 'due' ? `เกิน ${thDate(task.dueDate)}` : thDate(task.dueDate)}</Tag>
      ) : done ? (
        <Tag tone="ok">เสร็จ</Tag>
      ) : null}
    </View>
  );
}

export default function TasksScreen() {
  const router = useRouter();
  const { memberId } = useLocalSearchParams<{ memberId?: string }>();
  const { user } = useAuth();
  const todos = useTodos();
  const workload = useWorkload(!!memberId);
  const toggle = useToggleTask();
  const [reassigning, setReassigning] = useState<TaskItem | null>(null);

  if (todos.isLoading) return <Loading />;

  const rows = (todos.data ?? []).filter((task) => !memberId || task.assigneeId === memberId).sort((a, b) => {
    // Undone first, then nearest due date; done sinks to the bottom.
    if ((a.status === 'DONE') !== (b.status === 'DONE'))
      return a.status === 'DONE' ? 1 : -1;
    return (a.dueDate ?? '9999') < (b.dueDate ?? '9999') ? -1 : 1;
  });

  return (
    <View style={styles.screen}>
      {todos.isError ? (
        <View style={{ padding: spacing.lg }}>
          <ErrorNote message="โหลดงานไม่สำเร็จ" onRetry={() => todos.refetch()} />
        </View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(task) => task.id}
          contentContainerStyle={pageContent}
          refreshing={todos.isRefetching}
          onRefresh={() => todos.refetch()}
          ListHeaderComponent={
            <View style={{ marginBottom: spacing.md, gap: spacing.sm }}>
              {memberId && <Pressable accessibilityRole="button" style={styles.filter} onPress={() => router.replace('/(tabs)/tasks')}>
                <Text style={styles.filterText}>งานของ {workload.data?.members.find((member) => member.id === memberId)?.name ?? 'สมาชิกทีม'} · ดูทั้งหมด ×</Text>
              </Pressable>}
              <Button title="เพิ่มงาน · เลือกผู้รับผิดชอบและแนบไฟล์" onPress={() => router.push('/task/new')} />
            </View>
          }
          renderItem={({ item }) => (
            <Card style={{ marginBottom: spacing.md }}>
              <TaskRow
                task={item}
                onToggle={(done) => toggle.mutate({ task: item, done })}
                onOpenCase={() => router.push(`/task/new?id=${item.id}`)}
              />
              <View style={styles.assignmentRow}>
                <Text style={[styles.meta, { flex: 1 }]}>
                  ผู้รับผิดชอบ: {item.assignee ? `${item.assignee.firstName} ${item.assignee.lastName}` : 'ยังไม่ระบุ'}
                </Text>
                {item.status !== 'DONE' && (item.caseId
                  ? ['OWNER', 'SENIOR_LAWYER', 'LAWYER'].includes(user?.firmRole ?? '')
                  : item.assigneeId === user?.id || item.createdById === user?.id) ? (
                  <Pressable accessibilityRole="button" accessibilityLabel={`มอบหมายงาน ${item.title}`}
                    style={styles.assignButton} onPress={() => setReassigning(item)}>
                    <Text style={{ color: colors.info, fontWeight: '600' }}>มอบหมาย</Text>
                  </Pressable>
                ) : null}
              </View>
            </Card>
          )}
          ListEmptyComponent={<EmptyNote>ไม่มีงานค้าง 🎉</EmptyNote>}
        />
      )}
      <ReassignSheet caseId={reassigning?.caseId} task={reassigning} onClose={() => setReassigning(null)} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  assignmentRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.xs, paddingLeft: 34 },
  assignButton: { minHeight: TOUCH, justifyContent: 'center', paddingHorizontal: spacing.sm },
  checkbox: {
    width: 22,
    height: 22,
    minWidth: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: '#B9C1CC',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  checkboxDone: { backgroundColor: colors.good, borderColor: colors.good },
  title: { color: colors.text, fontWeight: '600', fontSize: 14 },
  titleDone: { color: colors.faint, textDecorationLine: 'line-through' },
  meta: { color: colors.faint, fontSize: 12 },
  filter: { minHeight: TOUCH, justifyContent: 'center' },
  filterText: { color: colors.info, fontWeight: '600' },
});

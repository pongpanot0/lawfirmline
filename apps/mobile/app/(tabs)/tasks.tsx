import React from 'react';
import {
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Check } from 'lucide-react-native';
import { useTodos, useToggleTask } from '@/api/hooks';
import type { TaskItem } from '@/api/types';
import { Card, EmptyNote, ErrorNote, Loading, Tag } from '@/components/ui';
import { thDate } from '@/format';
import { colors, spacing, TOUCH } from '@/theme';

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
        onPress={() => onToggle(!done)}
        hitSlop={10}
        style={[styles.checkbox, done && styles.checkboxDone]}
      >
        {done ? <Check size={13} color="#fff" strokeWidth={3} /> : null}
      </Pressable>
      <Pressable style={{ flex: 1, gap: 2 }} onPress={onOpenCase} disabled={!task.case}>
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
  const todos = useTodos();
  const toggle = useToggleTask();

  if (todos.isLoading) return <Loading />;

  const rows = [...(todos.data ?? [])].sort((a, b) => {
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
          contentContainerStyle={{ padding: spacing.lg }}
          refreshing={todos.isRefetching}
          onRefresh={() => todos.refetch()}
          renderItem={({ item }) => (
            <Card style={{ marginBottom: spacing.sm }}>
              <TaskRow
                task={item}
                onToggle={(done) => toggle.mutate({ task: item, done })}
                onOpenCase={() => item.case && router.push(`/case/${item.case.id}`)}
              />
            </Card>
          )}
          ListEmptyComponent={<EmptyNote>ไม่มีงานค้าง 🎉</EmptyNote>}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
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
});

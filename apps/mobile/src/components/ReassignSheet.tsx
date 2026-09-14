import React from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useLawyers, useReassignTask } from '@/api/hooks';
import type { TaskItem } from '@/api/types';
import { initials } from '@/format';
import { colors, fonts, radius, spacing } from '@/theme';

/**
 * Bottom sheet for handing a case task to another lawyer — long-press a task
 * row to open. One tap on a name reassigns and closes.
 */
export function ReassignSheet({
  caseId,
  task,
  onClose,
}: {
  caseId: string;
  task: TaskItem | null;
  onClose: () => void;
}) {
  const lawyers = useLawyers();
  const reassign = useReassignTask();

  return (
    <Modal visible={!!task} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={() => undefined}>
          <View style={styles.handle} />
          <Text style={styles.title}>มอบหมายงานให้…</Text>
          <Text style={styles.subtitle} numberOfLines={2}>
            {task?.title}
          </Text>
          {(lawyers.data ?? [])
            .filter((lawyer) => lawyer.id !== task?.assigneeId)
            .map((lawyer) => {
              const name = `${lawyer.firstName} ${lawyer.lastName}`;
              return (
                <Pressable
                  key={lawyer.id}
                  style={({ pressed }) => [styles.row, pressed && { opacity: 0.7 }]}
                  disabled={reassign.isPending}
                  onPress={() => {
                    if (!task) return;
                    reassign.mutate(
                      { caseId, taskId: task.id, assigneeId: lawyer.id },
                      { onSettled: onClose },
                    );
                  }}
                >
                  <View style={styles.avatar}>
                    <Text style={styles.avatarText}>{initials(name)}</Text>
                  </View>
                  <Text style={styles.name}>{name}</Text>
                </Pressable>
              );
            })}
          {reassign.isError ? (
            <Text style={styles.error}>มอบหมายไม่สำเร็จ ลองใหม่อีกครั้ง</Text>
          ) : null}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(14,20,32,0.45)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    padding: spacing.lg,
    paddingBottom: 34,
  },
  handle: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.line,
    marginBottom: spacing.md,
  },
  title: { fontFamily: fonts.bold, fontSize: 17, color: colors.ink },
  subtitle: { color: colors.muted, fontSize: 13, marginTop: 2, marginBottom: spacing.md },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: 11,
    borderRadius: radius.button,
  },
  avatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: colors.accentSoft, fontWeight: '700', fontSize: 12 },
  name: { fontSize: 15, color: colors.text, fontWeight: '600' },
  error: { color: colors.warn, fontSize: 13, marginTop: spacing.sm, textAlign: 'center' },
});

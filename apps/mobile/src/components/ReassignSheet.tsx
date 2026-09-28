import React, { useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from '@/components/AppText';
import { canAssignFirmRole, FirmRole } from '@lawfirm/shared';
import { useAuth } from '@/api/auth';
import { useCase, useLawyers, useLeaves, useReassignTask } from '@/api/hooks';
import type { TaskItem } from '@/api/types';
import { bangkokDay, initials } from '@/format';
import { leaveFlagsForDate, leaveWarning } from '@/lib/leave-flags';
import { colors, fonts, radius, spacing } from '@/theme';
import { Button, ErrorNote, Loading, Tag } from '@/components/ui';

/** Assignment sheet shared by case tasks and standalone todos. */
export function ReassignSheet({
  caseId,
  task,
  onClose,
}: {
  caseId?: string | null;
  task: TaskItem | null;
  onClose: () => void;
}) {
  const lawyers = useLawyers();
  const { user } = useAuth();
  const { bottom } = useSafeAreaInsets();
  const legalCase = useCase(task && caseId ? caseId : '');
  const reassign = useReassignTask();
  const date = task?.dueDate ? bangkokDay(task.dueDate) : bangkokDay(new Date().toISOString());
  const leaves = useLeaves(date, date, !!task);
  const flags = useMemo(() => leaveFlagsForDate(leaves.data ?? [], date), [leaves.data, date]);
  const [pending, setPending] = useState<{ id: string; name: string } | null>(null);

  useEffect(() => {
    setPending(null);
    reassign.reset();
  }, [task?.id]);

  const editable = !!user && (caseId
    ? user?.firmRole === FirmRole.OWNER || legalCase.data?.leadLawyer?.id === user?.id
    : task?.assigneeId === user.id || task?.createdById === user.id);
  const candidates = (lawyers.data ?? []).filter((person) => person.id !== task?.assigneeId && (
    !!caseId || person.id === user?.id || (!!user?.firmRole && !!person.firmRole &&
      canAssignFirmRole(user.firmRole as FirmRole, person.firmRole))
  ));

  return (
    <Modal visible={!!task} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={[styles.sheet, { paddingBottom: spacing.lg + bottom }]} onPress={() => undefined}>
          <View style={styles.handle} />
          <Text style={styles.title}>มอบหมายงานให้…</Text>
          <Text style={styles.subtitle} numberOfLines={2}>
            {task?.title}
          </Text>
          {lawyers.isLoading || (caseId && legalCase.isLoading) ? <Loading /> : null}
          {lawyers.isError ? <ErrorNote message="โหลดรายชื่อไม่สำเร็จ" onRetry={() => lawyers.refetch()} /> : null}
          {caseId && legalCase.isError ? <ErrorNote message="ตรวจสอบสิทธิ์คดีไม่สำเร็จ" onRetry={() => legalCase.refetch()} /> : null}
          {!editable && !legalCase.isLoading ? <Text style={styles.error}>{caseId
            ? 'งานคดีให้เจ้าของสำนักงานหรือทนายหลักเป็นผู้มอบหมาย'
            : 'มอบหมายได้เฉพาะงานที่คุณสร้างหรือรับผิดชอบ'}</Text> : null}
          {leaves.isError ? <ErrorNote message="ยังตรวจสอบวันลาไม่ได้" onRetry={() => leaves.refetch()} /> : null}
          <ScrollView style={{ maxHeight: 320, flexShrink: 1 }}>
          {editable && candidates.map((lawyer) => {
              const name = `${lawyer.firstName} ${lawyer.lastName}`;
              const flag = flags.get(lawyer.id);
              return (
                <Pressable
                  key={lawyer.id}
                  style={({ pressed }) => [styles.row, pressed && { opacity: 0.7 }]}
                  accessibilityRole="button"
                  accessibilityLabel={`มอบหมายให้ ${name}`}
                  disabled={reassign.isPending || lawyers.isError || legalCase.isError}
                  onPress={() => {
                    if (!task) return;
                    if (flag) {
                      setPending({ id: lawyer.id, name });
                      return;
                    }
                    reassign.mutate(
                      { caseId, taskId: task.id, assigneeId: lawyer.id },
                      { onSuccess: onClose },
                    );
                  }}
                >
                  <View style={styles.avatar}>
                    <Text style={styles.avatarText}>{initials(name)}</Text>
                  </View>
                  <Text style={styles.name}>{name}</Text>
                  {flag ? <Tag tone="due">{flag.label}</Tag> : null}
                </Pressable>
              );
            })}
          </ScrollView>
          {editable && !lawyers.isLoading && !lawyers.isError && !candidates.length ? <Text style={styles.subtitle}>ไม่มีผู้รับมอบหมายตามสิทธิ์ของคุณ</Text> : null}
          {pending ? (
            <View style={styles.confirmBox}>
              <Text style={styles.warning}>{leaveWarning(pending.name, date, flags.get(pending.id)?.kind)}</Text>
              <View style={styles.confirmRow}>
                <Pressable
                  style={({ pressed }) => [styles.cancelBtn, pressed && { opacity: 0.7 }]}
                  onPress={() => setPending(null)}
                >
                  <Text style={styles.cancelText}>ยกเลิก</Text>
                </Pressable>
                <Pressable
                  style={({ pressed }) => [styles.confirmBtn, pressed && { opacity: 0.7 }]}
                  disabled={reassign.isPending || !editable}
                  onPress={() => {
                    if (!task) return;
                    reassign.mutate(
                      { caseId, taskId: task.id, assigneeId: pending.id },
                      { onSuccess: onClose },
                    );
                  }}
                >
                  <Text style={styles.confirmText}>ยืนยัน</Text>
                </Pressable>
              </View>
            </View>
          ) : null}
          {reassign.isError ? (
            <Text style={styles.error}>{reassign.error.message || 'มอบหมายไม่สำเร็จ ลองใหม่อีกครั้ง'}</Text>
          ) : null}
          <Button title="ปิด" ghost disabled={reassign.isPending} onPress={onClose} />
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
    maxHeight: '90%',
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
  name: { fontSize: 15, color: colors.text, fontWeight: '600', flex: 1 },
  error: { color: colors.warn, fontSize: 13, marginTop: spacing.sm, textAlign: 'center' },
  confirmBox: {
    marginTop: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.card,
    backgroundColor: colors.warnSoft,
  },
  warning: { color: colors.warn, fontSize: 13 },
  confirmRow: { flexDirection: 'row', justifyContent: 'flex-end', gap: spacing.md, marginTop: spacing.sm },
  cancelBtn: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: radius.button },
  cancelText: { color: colors.muted, fontWeight: '600', fontSize: 14 },
  confirmBtn: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: radius.button,
    backgroundColor: colors.ink,
  },
  confirmText: { color: colors.accentSoft, fontWeight: '700', fontSize: 14 },
});

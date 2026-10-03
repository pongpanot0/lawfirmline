import React, { useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from '@/components/AppText';
import { canAssignFirmRole, FirmRole, assignmentCandidates, assignmentWarnings, TaskWorkType } from '@lawfirm/shared';
import { useAuth } from '@/api/auth';
import { useCase, useLawyers, useLeaves, useReassignTask, useDailyWorkboard } from '@/api/hooks';
import { WorkloadSummary } from './WorkloadSummary';
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
  const date = task?.scheduledFor?.slice(0, 10) ?? (task?.dueDate ? bangkokDay(task.dueDate) : bangkokDay(new Date().toISOString()));
  const owner = user?.firmRole === FirmRole.OWNER;
  const board = useDailyWorkboard(date, owner && !!task);
  const workType = task?.workType ?? TaskWorkType.GENERAL;
  const people = board.data && !board.isError ? assignmentCandidates(board.data.members, board.data.tasks, workType, date) : [];
  const leaves = useLeaves(date, date, !!task);
  const flags = useMemo(() => leaveFlagsForDate(leaves.data ?? [], date), [leaves.data, date]);
  const [pending, setPending] = useState<{ id: string; name: string; warnings: string[] } | null>(null);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    setPending(null);
    reassign.reset();
  }, [task?.id]);

  const editable = !!user && (caseId
    ? user?.firmRole === FirmRole.OWNER || legalCase.data?.leadLawyer?.id === user?.id
    : owner || task?.assigneeId === user.id || task?.createdById === user.id);
  const candidates = (lawyers.data ?? []).filter((person) => person.id !== task?.assigneeId && (
    !!caseId || person.id === user?.id || (!!user?.firmRole && !!person.firmRole &&
      canAssignFirmRole(user.firmRole as FirmRole, person.firmRole))
  ));

  return (
    <Modal visible={!!task} transparent animationType="slide" supportedOrientations={['portrait', 'portrait-upside-down', 'landscape-left', 'landscape-right']} onRequestClose={onClose}>
      <Pressable accessible={false} style={styles.backdrop} onPress={onClose}>
        <Pressable accessible={false} style={[styles.sheet, { paddingBottom: spacing.lg + bottom }]} onPress={() => undefined}>
          <View style={styles.handle} />
          <ScrollView style={{ flexShrink: 1 }} keyboardShouldPersistTaps="handled">
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
          {owner && board.isError && <ErrorNote message="ยังตรวจภาระงานล่าสุดไม่ได้" onRetry={() => board.refetch()} />}
          {editable && candidates.map((lawyer) => {
              const name = `${lawyer.firstName} ${lawyer.lastName}`;
              const flag = flags.get(lawyer.id);
              return (
                <Pressable
                  key={lawyer.id}
                  style={({ pressed }) => [styles.row, pressed && { opacity: 0.7 }]}
                  accessibilityRole="button"
                  accessibilityLabel={`มอบหมายให้ ${name}`}
                  disabled={checking || reassign.isPending || lawyers.isError || (!!caseId && legalCase.isError)}
                  onPress={() => {
                    if (!task) return;
                    const warnings = owner ? assignmentWarnings(people.find(p => p.member.userId === lawyer.id)) : flag ? [leaveWarning(name, date, flag.kind)] : [];
                    if (warnings.length || owner) {
                      setPending({ id: lawyer.id, name, warnings });
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
          {editable && !lawyers.isLoading && !lawyers.isError && !candidates.length ? <Text style={styles.subtitle}>ไม่มีผู้รับมอบหมายตามสิทธิ์ของคุณ</Text> : null}
          {owner && pending && <WorkloadSummary candidate={people.find(p => p.member.userId === pending.id)} />}
          {pending ? (
            <View style={styles.confirmBox}>
              <Text style={styles.warning}>มอบหมายให้ {pending.name} · {date}{pending.warnings.length ? `\n${pending.warnings.join('\n')}` : '\nตรวจภาระงานข้างต้นก่อนยืนยัน'}</Text>
              <View style={styles.confirmRow}>
                <Pressable
                  accessibilityRole="button"
                  style={({ pressed }) => [styles.cancelBtn, pressed && { opacity: 0.7 }]}
                  onPress={() => setPending(null)}
                >
                  <Text style={styles.cancelText}>ยกเลิก</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  style={({ pressed }) => [styles.confirmBtn, pressed && { opacity: 0.7 }]}
                  disabled={checking || reassign.isPending || !editable}
                  onPress={async () => {
                    if (!task) return;
                    if (owner) {
                      setChecking(true);
                      const fresh = await board.refetch();
                      setChecking(false);
                      const person = fresh.data && !fresh.isError ? assignmentCandidates(fresh.data.members, fresh.data.tasks, workType, date).find(p => p.member.userId === pending.id) : undefined;
                      const warnings = assignmentWarnings(person);
                      if (warnings.join('\n') !== pending.warnings.join('\n')) { setPending({ ...pending, warnings }); return; }
                    }
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
          </ScrollView>
          <Button title="ปิด" ghost disabled={reassign.isPending} onPress={onClose} />
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(14,20,32,0.45)', justifyContent: 'flex-end' },
  sheet: {
    width: '100%',
    maxWidth: 760,
    alignSelf: 'center',
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
  confirmRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end', gap: spacing.md, marginTop: spacing.sm },
  cancelBtn: { minHeight: 44, paddingVertical: 8, paddingHorizontal: 14, borderRadius: radius.button, justifyContent: 'center' },
  cancelText: { color: colors.muted, fontWeight: '600', fontSize: 14 },
  confirmBtn: {
    minHeight: 44,
    justifyContent: 'center',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: radius.button,
    backgroundColor: colors.ink,
  },
  confirmText: { color: colors.accentSoft, fontWeight: '700', fontSize: 14 },
});

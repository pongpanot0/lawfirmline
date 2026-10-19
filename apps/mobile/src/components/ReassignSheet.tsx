import React, { useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from '@/components/AppText';
import { canAssignFirmRole, FirmRole, hasFirmCapability, assignmentCandidates, assignmentWarnings, TaskWorkType } from '@lawfirm/shared';
import { useAuth } from '@/api/auth';
import { useCase, useLawyers, useLeaves, useReassignTask, useDailyWorkboard } from '@/api/hooks';
import { WorkloadSummary } from './WorkloadSummary';
import type { TaskItem } from '@/api/types';
import { bangkokDay, initials, thDate } from '@/format';
import { leaveFlagsForDate, leaveWarning } from '@/lib/leave-flags';
import { colors, radius, shadow, spacing, typeScale } from '@/theme';
import { Button, InlineError, LoadingState, Tag } from '@/components/ui';

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
  const owner = hasFirmCapability(user?.firmRole, 'runOperations');
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
    ? owner || legalCase.data?.leadLawyer?.id === user?.id
    : owner || task?.assigneeId === user.id || task?.createdById === user.id);
  const candidates = (lawyers.data ?? []).filter((person) => person.id !== task?.assigneeId && (
    !!caseId || person.id === user?.id || (!!user?.firmRole && !!person.firmRole &&
      canAssignFirmRole(user.firmRole as FirmRole, person.firmRole))
  ));

  const confirm = async () => {
    if (!task || !pending) return;
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
  };
  const current = task?.assignee ? `${task.assignee.firstName} ${task.assignee.lastName}` : null;
  const working = checking || reassign.isPending;

  return (
    <Modal visible={!!task} transparent animationType="slide" supportedOrientations={['portrait', 'portrait-upside-down', 'landscape-left', 'landscape-right']} onRequestClose={onClose}>
      <Pressable accessible={false} style={styles.backdrop} onPress={onClose}>
        <Pressable accessible={false} style={[styles.sheet, { paddingBottom: spacing.lg + bottom }]} onPress={() => undefined}>
          <View style={styles.handle} />
          <ScrollView style={{ flexShrink: 1 }} keyboardShouldPersistTaps="handled">
          <Text accessibilityRole="header" style={styles.title}>มอบหมายงานให้…</Text>
          <Text style={[styles.subtitle, current ? { marginBottom: 0 } : null]} numberOfLines={2}>
            {task?.title}
          </Text>
          {current ? <Text style={styles.subtitle}>ตอนนี้: {current}</Text> : null}
          <View style={styles.notices}>
          {lawyers.isLoading || (caseId && legalCase.isLoading) ? <LoadingState inline label="กำลังโหลดรายชื่อ…" /> : null}
          {lawyers.isError ? <InlineError message="โหลดรายชื่อไม่สำเร็จ" onRetry={() => lawyers.refetch()} /> : null}
          {caseId && legalCase.isError ? <InlineError message="ตรวจสอบสิทธิ์คดีไม่สำเร็จ" onRetry={() => legalCase.refetch()} /> : null}
          {!editable && !legalCase.isLoading ? <Text style={styles.notice}>{caseId
            ? 'งานคดีให้เจ้าของสำนักงาน ผู้จัดการสำนักงาน หรือทนายหลักเป็นผู้มอบหมาย'
            : 'มอบหมายได้เฉพาะงานที่คุณสร้างหรือรับผิดชอบ'}</Text> : null}
          {leaves.isError ? <InlineError message="ยังตรวจสอบวันลาไม่ได้" onRetry={() => leaves.refetch()} /> : null}
          {owner && board.isError && <InlineError message="ยังตรวจภาระงานล่าสุดไม่ได้" onRetry={() => board.refetch()} />}
          </View>
          {editable && candidates.map((lawyer) => {
              const name = `${lawyer.firstName} ${lawyer.lastName}`;
              const flag = flags.get(lawyer.id);
              const picked = pending?.id === lawyer.id;
              return (
                <React.Fragment key={lawyer.id}>
                <Pressable
                  style={({ pressed }) => [styles.row, picked && styles.rowPicked, pressed && { opacity: 0.7 }]}
                  accessibilityRole="button"
                  accessibilityLabel={`มอบหมายให้ ${name}${flag ? ` · ${flag.label}` : ''}`}
                  accessibilityState={{ selected: picked, disabled: working || lawyers.isError || (!!caseId && legalCase.isError) }}
                  disabled={working || lawyers.isError || (!!caseId && legalCase.isError)}
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
                {picked && owner ? <View style={styles.summary}><WorkloadSummary candidate={people.find(p => p.member.userId === lawyer.id)} /></View> : null}
                </React.Fragment>
              );
            })}
          {editable && !lawyers.isLoading && !lawyers.isError && !candidates.length ? <Text style={styles.subtitle}>ไม่มีผู้รับมอบหมายตามสิทธิ์ของคุณ</Text> : null}
          </ScrollView>
          {/* The confirmation stays pinned under the list, so it is visible however long the team is. */}
          <View style={styles.footer}>
            {pending ? <>
              <Text accessibilityLiveRegion="polite" style={styles.confirmTitle}>มอบหมายให้ {pending.name} · {thDate(date)}</Text>
              {pending.warnings.length
                ? <View style={styles.warnings}>{pending.warnings.map((warning, index) => <Text key={index} style={styles.warning}>{warning}</Text>)}</View>
                : <Text style={styles.confirmHint}>ตรวจภาระงานข้างต้นก่อนยืนยัน</Text>}
            </> : null}
            {reassign.isError ? (
              <InlineError message={reassign.error.message || 'มอบหมายไม่สำเร็จ ลองใหม่อีกครั้ง'} />
            ) : null}
            {pending ? <View style={styles.confirmRow}>
              <View style={{ flex: 1 }}><Button title="ยกเลิก" variant="secondary" disabled={working} onPress={() => setPending(null)} /></View>
              <View style={{ flex: 1 }}><Button title={checking ? 'กำลังตรวจภาระงาน…' : 'ยืนยัน'} busy={reassign.isPending} disabled={checking || !editable} onPress={confirm} /></View>
            </View> : <Button title="ปิด" variant="secondary" disabled={reassign.isPending} onPress={onClose} />}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: colors.scrim, justifyContent: 'flex-end' },
  sheet: {
    width: '100%',
    maxWidth: 760,
    alignSelf: 'center',
    backgroundColor: colors.raised,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    padding: spacing.lg,
    maxHeight: '90%',
    ...shadow.lg,
  },
  handle: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.line,
    marginBottom: spacing.md,
  },
  title: { ...typeScale.title, color: colors.ink },
  subtitle: { color: colors.muted, fontSize: 14, lineHeight: 22, marginTop: 2, marginBottom: spacing.md },
  notices: { gap: spacing.sm, marginBottom: spacing.sm },
  notice: { color: colors.info, backgroundColor: colors.infoSoft, borderRadius: radius.md, padding: spacing.md, fontSize: 14, lineHeight: 22 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 56,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: 'transparent',
    marginBottom: spacing.xs,
  },
  rowPicked: { borderColor: colors.ink, backgroundColor: colors.surface, ...shadow.sm },
  summary: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, marginBottom: spacing.sm },
  footer: { gap: spacing.sm, paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.divider },
  confirmTitle: { color: colors.ink, fontWeight: '700', fontSize: 15 },
  confirmHint: { color: colors.muted, fontSize: 13 },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: radius.full,
    backgroundColor: colors.infoSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: colors.info, fontWeight: '700', fontSize: 14 },
  name: { fontSize: 15, color: colors.text, fontWeight: '600', flex: 1 },
  warnings: { gap: spacing.xs, padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.warnSoft, borderWidth: 1,
    borderColor: colors.warnEdge },
  warning: { color: colors.warn, fontSize: 13, lineHeight: 20 },
  confirmRow: { flexDirection: 'row', gap: spacing.sm },
});

import React from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '@/components/AppText';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ChevronRight } from 'lucide-react-native';
import { hasFirmCapability } from '@lawfirm/shared';
import { useCalendarRange, useLeaves, useWorkload } from '@/api/hooks';
import type { WorkloadMember } from '@/api/types';
import {
  Card,
  EmptyNote,
  ErrorNote,
  Loading,
  SectionLabel,
  StatCard,
  Tag,
  TagTone,
} from '@/components/ui';
import { bangkokDay, initials } from '@/format';
import { leaveFlagsForDate, LeaveFlag } from '@/lib/leave-flags';
import { colors, spacing, pageContent } from '@/theme';
import { useAuth } from '@/api/auth';
import { Button, PageIntro } from '@/components/ui';

/**
 * Compare counts without treating fewer tasks as confirmed availability.
 */
function loadTone(member: WorkloadMember): { label: string; tone: TagTone; color: string } {
  if (member.overdueTasks > 0)
    return { label: 'มีงานเกินกำหนด', tone: 'due', color: colors.warn };
  if (member.openTasks === 0) return { label: 'ไม่มีงานเปิด', tone: 'plain', color: colors.good };
  return { label: 'มีงานเปิด', tone: 'court', color: colors.accent };
}

function MemberCard({ member, max, leave, todayEvents, onDetail, onTasks, onCalendar, onCases }: { member: WorkloadMember; max: number; leave?: LeaveFlag; todayEvents: number | string; onDetail: () => void; onTasks: () => void; onCalendar: () => void; onCases: () => void }) {
  const load = loadTone(member);
  const width = max === 0 ? 0 : Math.max(4, (member.openTasks / max) * 100);
  // Only facts that need attention become chips; zero counts stay out of the way.
  const chips: Array<{ tone: TagTone; text: string }> = [
    ...(member.overdueTasks > 0 ? [{ tone: 'due' as TagTone, text: `เกินกำหนด ${member.overdueTasks}` }] : []),
    ...(typeof todayEvents === 'number' && todayEvents > 0 ? [{ tone: 'info' as TagTone, text: `นัดวันนี้ ${todayEvents}` }] : []),
    ...(member.hearingsThisWeek > 0 ? [{ tone: 'court' as TagTone, text: `นัดศาล 7 วัน ${member.hearingsThisWeek}` }] : []),
    ...(leave ? [{ tone: (leave.kind === 'ON_LEAVE' ? 'due' : 'court') as TagTone, text: leave.label }] : []),
  ];
  return (
    <Card style={{ marginBottom: spacing.md }}>
      <Pressable accessibilityRole="button"
        accessibilityLabel={`ดูรายละเอียด ${member.name} งานเปิด ${member.openTasks} เกินกำหนด ${member.overdueTasks} คดีหลัก ${member.openCases}`}
        onPress={onDetail} style={({ pressed }) => [styles.row, { minHeight: 48 }, pressed && { opacity: 0.7 }]}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initials(member.name)}</Text>
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.name}>{member.name}</Text>
          <Text style={styles.detail}>คดีหลัก {member.openCases}</Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={styles.count}>{member.openTasks}</Text>
          <Text style={styles.countLabel}>งานเปิด</Text>
        </View>
        <ChevronRight size={18} color={colors.muted} />
      </Pressable>
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${width}%`, backgroundColor: load.color }]} />
      </View>
      {(chips.length > 0 || member.openTasks === 0) && <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.sm }}>
        {chips.length ? chips.map(chip => <Tag key={chip.text} tone={chip.tone}>{chip.text}</Tag>) : <Tag tone={load.tone}>{load.label}</Tag>}
      </View>}
      <View style={styles.actions}>
        <Pressable accessibilityRole="button" accessibilityLabel={`ดูงานของ ${member.name}`} style={styles.action} onPress={onTasks}>
          <Text style={styles.actionText}>งาน</Text>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel={`ดูคดีของ ${member.name}`} style={styles.action} onPress={onCases}>
          <Text style={styles.actionText}>คดี</Text>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel={`ดูนัดหมายของ ${member.name}`} style={styles.action} onPress={onCalendar}>
          <Text style={styles.actionText}>นัดหมาย</Text>
        </Pressable>
      </View>
    </Card>
  );
}

export default function TeamScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { memberId } = useLocalSearchParams<{ memberId?: string }>();
  const workload = useWorkload();
  const today = bangkokDay(new Date().toISOString());
  const leaves = useLeaves(today, today);
  const events = useCalendarRange(today, today);
  const flags = leaveFlagsForDate(leaves.data ?? [], today);

  if (workload.isLoading) return <Loading />;

  const data = workload.data;
  const max = Math.max(...(data?.members.map((m) => m.openTasks) ?? [0]), 1);
  const overloaded = data?.members.filter((m) => m.overdueTasks > 0).length ?? 0;
  const members = memberId ? data?.members.filter((member) => member.id === memberId) ?? [] : data?.members ?? [];

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={pageContent}
      refreshControl={
        <RefreshControl
          refreshing={workload.isRefetching}
          onRefresh={() => { workload.refetch(); leaves.refetch(); events.refetch(); }}
        />
      }
    >
      <PageIntro title="ภาระงานรายคน" detail="แตะชื่อเพื่อดูงาน คดี นัดหมาย และจุดติดขัด" />
      {workload.isError ? (
        <ErrorNote message="โหลดภาระงานทีมไม่สำเร็จ" onRetry={() => workload.refetch()} />
      ) : null}
      {leaves.isError && <ErrorNote message="โหลดข้อมูลวันลาไม่สำเร็จ" onRetry={() => leaves.refetch()} />}
      {events.isError && <ErrorNote message="โหลดนัดวันนี้ไม่สำเร็จ" onRetry={() => events.refetch()} />}

      {data ? (
        <>
          <View style={styles.statRow}>
            <StatCard label="งานทั้งทีม" value={data.totals.openTasks} />
            <StatCard label="เกินกำหนด" value={data.totals.overdueTasks} tone="warn" />
            <StatCard label="นัดใน 7 วัน" value={data.totals.hearingsThisWeek} tone="court" />
          </View>

          {(hasFirmCapability(user?.firmRole, 'runOperations') || user?.firmRole === 'SENIOR_LAWYER') && <View style={{ marginTop: spacing.sm }}>
            <Button title="ดูภาระงานทีมล่วงหน้า 7 วัน" ghost onPress={() => router.push('/team-week')} />
          </View>}
          {overloaded > 0 ? (
            <View style={{ marginTop: spacing.sm }}>
              <Tag tone="due">{overloaded} คนมีงานเกินกำหนด — พิจารณาเกลี่ยงาน</Tag>
            </View>
          ) : null}

          <SectionLabel>{memberId ? members[0]?.name ?? 'สมาชิกทีม' : 'รายคน · เรียงตามภาระงาน'}</SectionLabel>
          {memberId && <Pressable accessibilityRole="button" style={styles.action} onPress={() => router.replace('/(tabs)/team')}>
            <Text style={styles.actionText}>ดูทั้งทีม</Text>
          </Pressable>}
          {members.length === 0 ? (
            <EmptyNote>{memberId ? 'ไม่พบสมาชิกคนนี้ในทีม' : 'ยังไม่มีสมาชิกทีม'}</EmptyNote>
          ) : (
            members.map((member) => (
              <MemberCard key={member.id} member={member} max={max} leave={flags.get(member.id)}
                onDetail={() => router.push({ pathname: '/person/[id]', params: { id: member.id } })}
                todayEvents={events.data ? events.data.filter((event) => event.assigneeId === member.id || event.assignees?.some((person) => person.userId === member.id)).length : '—'}
                onTasks={() => router.push({ pathname: '/(tabs)/tasks', params: { memberId: member.id } })}
                onCases={() => router.push({ pathname: '/(tabs)/cases', params: { memberId: member.id } })}
                onCalendar={() => router.push({ pathname: '/(tabs)/calendar', params: { memberId: member.id } })} />
            ))
          )}
        </>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  statRow: { flexDirection: 'row', gap: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  avatar: {
    backgroundColor: colors.soft,
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: colors.ink, fontWeight: '700', fontSize: 12 },
  name: { flex: 1, fontWeight: '600', color: colors.text, fontSize: 15 },
  count: {
    fontWeight: '700',
    color: colors.ink,
    fontSize: 17,
    fontVariant: ['tabular-nums'],
  },
  progressTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.soft,
    marginTop: spacing.sm,
    overflow: 'hidden',
  },
  progressFill: { height: '100%', borderRadius: 3 },
  detail: { color: colors.faint, fontSize: 12, marginTop: 2 },
  countLabel: { color: colors.faint, fontSize: 11 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.sm },
  action: { alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center', paddingHorizontal: spacing.md, borderWidth: 1, borderColor: colors.line, borderRadius: 999 },
  actionText: { color: colors.info, fontWeight: '600' },
});

import React from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '@/components/AppText';
import { useLocalSearchParams, useRouter } from 'expo-router';
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
import { Button } from '@/components/ui';

/**
 * Compare counts without treating fewer tasks as confirmed availability.
 */
function loadTone(member: WorkloadMember): { label: string; tone: TagTone; color: string } {
  if (member.overdueTasks > 0)
    return { label: 'มีงานเกินกำหนด', tone: 'due', color: colors.warn };
  if (member.openTasks === 0) return { label: 'ไม่มีงานเปิด', tone: 'plain', color: colors.good };
  return { label: 'มีงานเปิด', tone: 'court', color: colors.accent };
}

function MemberCard({ member, max, leave, todayEvents, onTasks, onCalendar, onCases }: { member: WorkloadMember; max: number; leave?: LeaveFlag; todayEvents: number | string; onTasks: () => void; onCalendar: () => void; onCases: () => void }) {
  const load = loadTone(member);
  const width = max === 0 ? 0 : Math.max(4, (member.openTasks / max) * 100);
  return (
    <Card style={{ marginBottom: spacing.md }}>
      <View style={styles.row}>
        <View style={[styles.avatar, { backgroundColor: load.color }]}>
          <Text style={styles.avatarText}>{initials(member.name)}</Text>
        </View>
        <Text style={styles.name} numberOfLines={1}>
          {member.name}
        </Text>
        <Text style={styles.count}>{member.openTasks}</Text>
        <Tag tone={load.tone}>{load.label}</Tag>
      </View>
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${width}%`, backgroundColor: load.color }]} />
      </View>
      <Text style={styles.detail}>
        งาน {member.openTasks} · เกินกำหนด {member.overdueTasks} · คดีหลัก {member.openCases} · นัดศาล 7 วันถัดไป{' '}
        {member.hearingsThisWeek}
      </Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.sm }}>
        <Tag tone="info">นัดวันนี้ {todayEvents}</Tag>
        {leave && <Tag tone={leave.kind === 'ON_LEAVE' ? 'due' : 'court'}>{leave.label}</Tag>}
      </View>
      <View style={styles.actions}>
        <Pressable accessibilityRole="button" style={styles.action} onPress={onCases}>
          <Text style={styles.actionText}>ดูคดี ›</Text>
        </Pressable>
        <Pressable accessibilityRole="button" style={styles.action} onPress={onTasks}>
          <Text style={styles.actionText}>ดูงาน ›</Text>
        </Pressable>
        <Pressable accessibilityRole="button" style={styles.action} onPress={onCalendar}>
          <Text style={styles.actionText}>ดูนัดหมาย ›</Text>
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
      {(user?.firmRole === 'OWNER' || user?.firmRole === 'SENIOR_LAWYER') && <Button title="ดูวันลา นัดหมาย และภาระงาน 7 วัน" ghost onPress={() => router.push('/team-week')} />}
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
            <StatCard label="คน × นัด 7 วันถัดไป" value={data.totals.hearingsThisWeek} />
          </View>

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
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: '#fff', fontWeight: '700', fontSize: 12 },
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
  detail: { color: colors.faint, fontSize: 12, marginTop: 6 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.sm },
  action: { minHeight: 44, justifyContent: 'center', paddingHorizontal: spacing.sm },
  actionText: { color: colors.info, fontWeight: '600' },
});

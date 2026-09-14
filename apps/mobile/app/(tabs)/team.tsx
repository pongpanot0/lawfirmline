import React from 'react';
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useWorkload } from '@/api/hooks';
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
import { initials } from '@/format';
import { colors, spacing } from '@/theme';

/**
 * Load labels are relative to the busiest person, so the screen answers
 * "who is drowning, who can take more" at a glance without a magic number.
 */
function loadTone(member: WorkloadMember, max: number): { label: string; tone: TagTone; color: string } {
  const ratio = max === 0 ? 0 : member.openTasks / max;
  if (member.overdueTasks >= 3 || ratio >= 0.85)
    return { label: 'ล้นมือ', tone: 'due', color: colors.warn };
  if (ratio <= 0.4) return { label: 'รับเพิ่มได้', tone: 'ok', color: colors.good };
  return { label: 'พอดีมือ', tone: 'court', color: colors.accent };
}

function MemberCard({ member, max }: { member: WorkloadMember; max: number }) {
  const load = loadTone(member, max);
  const width = max === 0 ? 0 : Math.max(4, (member.openTasks / max) * 100);
  return (
    <Card style={{ marginBottom: spacing.sm }}>
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
        งาน {member.openTasks} · เกินกำหนด {member.overdueTasks} · คดี {member.openCases} · นัดศาล{' '}
        {member.hearingsThisWeek}
      </Text>
    </Card>
  );
}

export default function TeamScreen() {
  const workload = useWorkload();

  if (workload.isLoading) return <Loading />;

  const data = workload.data;
  const max = Math.max(...(data?.members.map((m) => m.openTasks) ?? [0]), 1);
  const overloaded = data?.members.filter((m) => loadTone(m, max).label === 'ล้นมือ').length ?? 0;

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={{ padding: spacing.lg, paddingBottom: 40 }}
      refreshControl={
        <RefreshControl
          refreshing={workload.isRefetching}
          onRefresh={() => workload.refetch()}
        />
      }
    >
      {workload.isError ? (
        <ErrorNote message="โหลดภาระงานทีมไม่สำเร็จ" onRetry={() => workload.refetch()} />
      ) : null}

      {data ? (
        <>
          <View style={styles.statRow}>
            <StatCard label="งานทั้งทีม" value={data.totals.openTasks} />
            <StatCard label="เกินกำหนด" value={data.totals.overdueTasks} tone="warn" />
            <StatCard label="นัดสัปดาห์นี้" value={data.totals.hearingsThisWeek} />
          </View>

          {overloaded > 0 ? (
            <View style={{ marginTop: spacing.sm }}>
              <Tag tone="due">{overloaded} คนล้นมือ — พิจารณาเกลี่ยงาน</Tag>
            </View>
          ) : null}

          <SectionLabel>รายคน · เรียงตามภาระงาน</SectionLabel>
          {data.members.length === 0 ? (
            <EmptyNote>ยังไม่มีสมาชิกทีม</EmptyNote>
          ) : (
            data.members.map((member) => (
              <MemberCard key={member.id} member={member} max={max} />
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
});

import React from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '@/components/AppText';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ChevronRight, X } from 'lucide-react-native';
import { hasFirmCapability } from '@lawfirm/shared';
import { useCalendarRange, useLeaves, useWorkload } from '@/api/hooks';
import type { WorkloadMember } from '@/api/types';
import {
  Button,
  Card,
  EmptyNote,
  ErrorNote,
  Loading,
  SectionLabel,
  Tag,
  TagTone,
} from '@/components/ui';
import { bangkokDay, initials } from '@/format';
import { leaveFlagsForDate, LeaveFlag } from '@/lib/leave-flags';
import { CHROME_MAX_SCALE, colors, radius, spacing, pageContent } from '@/theme';
import { useAuth } from '@/api/auth';

/**
 * Compare counts without treating fewer tasks as confirmed availability.
 * Bar colors stay ink/red/muted: brass is reserved for court dates.
 */
function loadTone(member: WorkloadMember): { label: string; tone: TagTone; color: string } {
  if (member.overdueTasks > 0)
    return { label: 'มีงานเกินกำหนด', tone: 'due', color: colors.warn };
  if (member.openTasks === 0) return { label: 'ไม่มีงานเปิด', tone: 'plain', color: colors.muted };
  return { label: 'มีงานเปิด', tone: 'plain', color: colors.ink };
}

function MemberCard({ member, max, leave, todayEvents, onDetail, onTasks, onCalendar, onCases }: { member: WorkloadMember; max: number; leave?: LeaveFlag; todayEvents: number | string; onDetail: () => void; onTasks: () => void; onCalendar: () => void; onCases: () => void }) {
  const load = loadTone(member);
  const width = max === 0 ? 0 : Math.max(4, (member.openTasks / max) * 100);
  // Only facts that need attention become chips; zero counts stay out of the way.
  const chips: Array<{ tone: TagTone; text: string }> = [
    ...(member.overdueTasks > 0 ? [{ tone: 'due' as TagTone, text: `เกินกำหนด ${member.overdueTasks}` }] : []),
    ...(typeof todayEvents === 'number' && todayEvents > 0 ? [{ tone: 'info' as TagTone, text: `นัดวันนี้ ${todayEvents}` }] : []),
    ...(member.hearingsThisWeek > 0 ? [{ tone: 'court' as TagTone, text: `นัดศาล 7 วัน ${member.hearingsThisWeek}` }] : []),
    ...(leave ? [{ tone: (leave.kind === 'ON_LEAVE' ? 'due' : 'plain') as TagTone, text: leave.label }] : []),
  ];
  const links = [
    { label: 'งาน', a11y: `ดูงานของ ${member.name}`, onPress: onTasks },
    { label: 'คดี', a11y: `ดูคดีของ ${member.name}`, onPress: onCases },
    { label: 'นัดหมาย', a11y: `ดูนัดหมายของ ${member.name}`, onPress: onCalendar },
  ];
  return (
    <Card style={{ marginBottom: spacing.md }}>
      <Pressable accessibilityRole="button"
        accessibilityLabel={`ดูรายละเอียด ${member.name} งานเปิด ${member.openTasks}${member.overdueTasks ? ` เกินกำหนด ${member.overdueTasks}` : ''}${member.openCases ? ` คดีหลัก ${member.openCases}` : ''}`}
        onPress={onDetail} style={({ pressed }) => [styles.row, { minHeight: 48 }, pressed && { opacity: 0.7 }]}>
        <View style={styles.avatar}>
          <Text maxFontSizeMultiplier={CHROME_MAX_SCALE} style={styles.avatarText}>{initials(member.name)}</Text>
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.name}>{member.name}</Text>
          {member.openCases > 0 && <Text style={styles.detail}>คดีหลัก {member.openCases}</Text>}
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
        {links.map(link => <Pressable key={link.label} accessibilityRole="link" accessibilityLabel={link.a11y}
          style={({ pressed }) => [styles.action, pressed && { backgroundColor: colors.soft }]} onPress={link.onPress}>
          <Text maxFontSizeMultiplier={CHROME_MAX_SCALE} style={styles.actionText}>{link.label}</Text>
        </Pressable>)}
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

  if (workload.isLoading) return <Loading label="กำลังโหลดภาระงานทีม…" />;

  const data = workload.data;
  const max = Math.max(...(data?.members.map((m) => m.openTasks) ?? [0]), 1);
  const overloaded = data?.members.filter((m) => m.overdueTasks > 0).length ?? 0;
  const members = memberId ? data?.members.filter((member) => member.id === memberId) ?? [] : data?.members ?? [];
  // One note for partial failures; the full error only when the team list itself is missing.
  const failed = [workload, leaves, events].filter(query => query.isError);
  const teamSummary = data ? [
    data.totals.openTasks > 0 ? `งานเปิดทั้งทีม ${data.totals.openTasks}` : 'ทีมไม่มีงานเปิด',
    ...(data.totals.hearingsThisWeek > 0 ? [`นัดศาล 7 วัน ${data.totals.hearingsThisWeek}`] : []),
  ].join(' · ') : '';

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
      {!data && workload.isError ? (
        <ErrorNote message="โหลดภาระงานทีมไม่สำเร็จ" onRetry={() => workload.refetch()} />
      ) : failed.length > 0 ? (
        <ErrorNote message="บางข้อมูลยังโหลดไม่ได้" onRetry={() => failed.forEach(query => void query.refetch())} />
      ) : null}

      {data ? (
        <>
          {!memberId && <View style={{ gap: spacing.xs }}>
            <Text style={styles.summary}>{teamSummary}</Text>
            {overloaded > 0 && <Text style={styles.overloaded}>{overloaded} คนมีงานเกินกำหนด · พิจารณาเกลี่ยงาน</Text>}
          </View>}

          {!memberId && (hasFirmCapability(user?.firmRole, 'runOperations') || user?.firmRole === 'SENIOR_LAWYER') && <View style={{ marginTop: spacing.sm }}>
            <Button title="ดูภาระงานทีมล่วงหน้า 7 วัน" variant="secondary" onPress={() => router.push('/team-week')} />
          </View>}

          <SectionLabel>{memberId ? members[0]?.name ?? 'สมาชิกทีม' : 'รายคน · เรียงตามภาระงาน'}</SectionLabel>
          {memberId && <Pressable accessibilityRole="button" accessibilityLabel="เลิกกรอง · ดูทั้งทีม"
            style={({ pressed }) => [styles.filter, pressed && { opacity: 0.6 }]} onPress={() => router.replace('/(tabs)/team')}>
            <Text style={styles.filterText}>ดูทั้งทีม</Text>
            <X size={16} color={colors.info} />
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
  summary: { color: colors.muted, fontSize: 14, lineHeight: 22 },
  overloaded: { color: colors.warn, fontSize: 14, lineHeight: 22, fontWeight: '600' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.sm },
  action: { alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center', paddingHorizontal: spacing.md, borderWidth: 1, borderColor: colors.line, borderRadius: radius.button },
  actionText: { color: colors.info, fontWeight: '600' },
  filter: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: spacing.xs, alignSelf: 'flex-start' },
  filterText: { color: colors.info, fontWeight: '600' },
});

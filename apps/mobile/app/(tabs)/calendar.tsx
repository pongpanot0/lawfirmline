import React, { useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '@/components/AppText';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react-native';
import { useCalendarRange, useWorkload } from '@/api/hooks';
import type { CalendarEventItem } from '@/api/types';
import { Card, EmptyNote, ErrorNote, PageIntro, SectionLabel, Tag } from '@/components/ui';
import { isoDay, thDate, thTime } from '@/format';
import { colors, spacing, TOUCH, pageContent } from '@/theme';

const TH_MONTHS_FULL = [
  'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม',
];
const TH_DOW = ['จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส', 'อา'];

function monthGrid(year: number, month: number): Array<Date | null> {
  const first = new Date(year, month, 1);
  // Monday-first grid, like the Thai court week.
  const lead = (first.getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: Array<Date | null> = Array(lead).fill(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

export default function CalendarScreen() {
  const router = useRouter();
  const { memberId } = useLocalSearchParams<{ memberId?: string }>();
  const today = new Date();
  const [cursor, setCursor] = useState({ y: today.getFullYear(), m: today.getMonth() });
  const [selected, setSelected] = useState(isoDay(today));

  const from = isoDay(new Date(cursor.y, cursor.m, 1));
  const to = isoDay(new Date(cursor.y, cursor.m + 1, 0));
  const events = useCalendarRange(from, to);
  const workload = useWorkload(!!memberId);

  const byDay = useMemo(() => {
    const map = new Map<string, CalendarEventItem[]>();
    for (const event of events.data ?? []) {
      if (memberId && event.assigneeId !== memberId && !event.assignees?.some((person) => person.userId === memberId)) continue;
      const key = isoDay(new Date(event.startAt));
      map.set(key, [...(map.get(key) ?? []), event]);
    }
    for (const list of map.values())
      list.sort((a, b) => a.startAt.localeCompare(b.startAt));
    return map;
  }, [events.data, memberId]);

  const cells = monthGrid(cursor.y, cursor.m);
  const selectedEvents = byDay.get(selected) ?? [];

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={pageContent}
      refreshControl={
        <RefreshControl refreshing={events.isRefetching} onRefresh={() => events.refetch()} />
      }
    >
      <PageIntro title="นัดหมายสำนักงาน" detail="เลือกวันเพื่อดูนัดศาล งาน และทีมที่ไปด้วย" />
      {memberId && <Pressable accessibilityRole="button" style={styles.filter} onPress={() => router.replace('/(tabs)/calendar')}>
        <Text style={styles.filterText}>นัดของ {workload.data?.members.find((member) => member.id === memberId)?.name ?? 'สมาชิกทีม'} · ดูทั้งหมด ×</Text>
      </Pressable>}
      <Card>
        <View style={styles.monthHead}>
          <Pressable
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="เดือนก่อนหน้า"
            style={styles.navButton}
            onPress={() =>
              setCursor(({ y, m }) => (m === 0 ? { y: y - 1, m: 11 } : { y, m: m - 1 }))
            }
          >
            <ChevronLeft size={20} color={colors.ink} />
          </Pressable>
          <Text style={styles.monthTitle}>
            {TH_MONTHS_FULL[cursor.m]} {cursor.y + 543}
          </Text>
          <Pressable
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="เดือนถัดไป"
            style={styles.navButton}
            onPress={() =>
              setCursor(({ y, m }) => (m === 11 ? { y: y + 1, m: 0 } : { y, m: m + 1 }))
            }
          >
            <ChevronRight size={20} color={colors.ink} />
          </Pressable>
        </View>

        <View style={styles.grid}>
          <View style={styles.week}>
            {TH_DOW.map((d) => (
              <Text key={d} style={styles.dow}>
                {d}
              </Text>
            ))}
          </View>
          {Array.from({ length: cells.length / 7 }, (_, week) => (
            <View key={week} style={styles.week}>
              {cells.slice(week * 7, week * 7 + 7).map((date, index) => {
                if (!date) return <View key={`x${index}`} style={styles.cell} />;
                const key = isoDay(date);
                const isToday = key === isoDay(today);
                const isSelected = key === selected;
                const hasEvents = byDay.has(key);
                return (
                  <Pressable
                    key={key}
                    accessibilityRole="button" accessibilityLabel={`${date.getDate()} ${TH_MONTHS_FULL[cursor.m]} ${cursor.y + 543}${hasEvents ? ' มีนัดหมาย' : ''}`}
                    accessibilityState={{ selected: isSelected }}
                    style={[styles.cell, isSelected && styles.cellSelected, isToday && styles.cellToday]}
                    onPress={() => setSelected(key)}
                  >
                    <Text
                      style={[
                        styles.cellText,
                        isToday && { color: colors.ink, fontWeight: '700' },
                        isSelected && !isToday && { color: colors.ink, fontWeight: '700' },
                      ]}
                    >
                      {date.getDate()}
                    </Text>
                    {hasEvents ? <View style={styles.dot} /> : null}
                  </Pressable>
                );
              })}
            </View>
          ))}
        </View>
      </Card>

      {events.isError ? (
        <View style={{ marginTop: spacing.md }}>
          <ErrorNote message="โหลดปฏิทินไม่สำเร็จ" onRetry={() => events.refetch()} />
        </View>
      ) : null}

      <View style={styles.dayHead}>
        <SectionLabel style={{ marginTop: 0, marginBottom: 0 }}>{thDate(new Date(selected))}</SectionLabel>
        <Pressable
          style={styles.addButton}
          accessibilityRole="button"
          accessibilityLabel="เพิ่มนัดหมาย"
          hitSlop={8}
          onPress={() => router.push(`/event/new?date=${selected}`)}
        >
          <Plus size={16} color={colors.bg} />
          <Text style={styles.addText}>เพิ่มนัด</Text>
        </Pressable>
      </View>
      <Card>
        {selectedEvents.length === 0 ? (
          <EmptyNote>ไม่มีนัดหมายวันนี้</EmptyNote>
        ) : (
          selectedEvents.map((event, index) => (
            <View key={event.id}>
              {index > 0 && <View style={styles.divider} />}
              <Pressable
                style={({ pressed }) => [styles.eventRow, pressed && { opacity: 0.7 }]}
                onPress={() =>
                  event.type === 'COURT_DATE'
                    ? router.push(`/court-day/${event.id}`)
                    : router.push(`/case/${event.caseId}`)
                }
              >
                <Text style={styles.eventTime}>{thTime(event.startAt)}</Text>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={styles.eventTitle}>
                    {event.title}
                  </Text>
                  {event.type === 'COURT_DATE' ? <Tag tone="court">ศาล</Tag> : null}
                  <Text style={styles.eventMeta} numberOfLines={1}>
                    {[event.case?.ownRef, event.courtName].filter(Boolean).join(' · ') || '—'}
                  </Text>
                  <Text style={styles.eventMeta}>หลัก: {event.assignee ? `${event.assignee.firstName} ${event.assignee.lastName}` : 'ยังไม่ระบุ'}</Text>
                  <Text style={styles.eventMeta}>ร่วม: {event.assignees?.filter((person) => person.userId !== event.assigneeId).map((person) => `${person.user.firstName} ${person.user.lastName}`).join(', ') || 'ไม่มี'}</Text>
                </View>
              </Pressable>
              <Pressable accessibilityRole="button" style={{ minHeight: 44, justifyContent: 'center', paddingLeft: 60 }} onPress={() => router.push(`/event/${event.id}/team`)}>
                <Text style={{ color: colors.info }}>ดู / จัดทีมที่ไปด้วย</Text>
              </Pressable>
            </View>
          ))
        )}
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  monthHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  navButton: {
    width: TOUCH,
    height: TOUCH,
    alignItems: 'center',
    justifyContent: 'center',
  },
  monthTitle: { flex: 1, textAlign: 'center', fontSize: 16, fontWeight: '700', color: colors.ink },
  grid: { gap: spacing.xs },
  week: { flexDirection: 'row', alignItems: 'center' },
  dow: {
    flex: 1,
    textAlign: 'center',
    fontSize: 11,
    fontWeight: '600',
    color: colors.faint,
    paddingBottom: 4,
  },
  cell: {
    flex: 1,
    height: TOUCH,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
  },
  cellSelected: { backgroundColor: colors.soft },
  cellToday: { borderWidth: 1, borderColor: colors.ink },
  cellText: { fontSize: 13, color: colors.text, fontVariant: ['tabular-nums'] },
  dot: {
    position: 'absolute',
    bottom: 4,
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.accent,
  },
  dayHead: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.ink,
    borderRadius: 999,
    paddingHorizontal: 12,
    minHeight: TOUCH,
    justifyContent: 'center',
  },
  addText: { color: colors.bg, fontSize: 13, fontWeight: '600' },
  divider: { height: 1, backgroundColor: colors.soft },
  filter: { minHeight: TOUCH, justifyContent: 'center' },
  filterText: { color: colors.info, fontWeight: '600' },
  eventRow: {
    flexDirection: 'row',
    gap: spacing.md,
    alignItems: 'flex-start',
    paddingVertical: spacing.sm,
  },
  eventTime: {
    fontWeight: '700',
    color: colors.ink,
    width: 46,
    fontSize: 14,
    fontVariant: ['tabular-nums'],
  },
  eventTitle: { color: colors.text, fontWeight: '600', fontSize: 14 },
  eventMeta: { color: colors.faint, fontSize: 12 },
});

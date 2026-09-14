import React, { useMemo, useState } from 'react';
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react-native';
import { useCalendarRange } from '@/api/hooks';
import type { CalendarEventItem } from '@/api/types';
import { Card, EmptyNote, ErrorNote, SectionLabel, Tag } from '@/components/ui';
import { isoDay, thDate, thTime } from '@/format';
import { colors, spacing, TOUCH } from '@/theme';

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
  const today = new Date();
  const [cursor, setCursor] = useState({ y: today.getFullYear(), m: today.getMonth() });
  const [selected, setSelected] = useState(isoDay(today));

  const from = isoDay(new Date(cursor.y, cursor.m, 1));
  const to = isoDay(new Date(cursor.y, cursor.m + 1, 0));
  const events = useCalendarRange(from, to);

  const byDay = useMemo(() => {
    const map = new Map<string, CalendarEventItem[]>();
    for (const event of events.data ?? []) {
      const key = isoDay(new Date(event.startAt));
      map.set(key, [...(map.get(key) ?? []), event]);
    }
    for (const list of map.values())
      list.sort((a, b) => a.startAt.localeCompare(b.startAt));
    return map;
  }, [events.data]);

  const cells = monthGrid(cursor.y, cursor.m);
  const selectedEvents = byDay.get(selected) ?? [];

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={{ padding: spacing.lg, paddingBottom: 40 }}
      refreshControl={
        <RefreshControl refreshing={events.isRefetching} onRefresh={() => events.refetch()} />
      }
    >
      <Card>
        <View style={styles.monthHead}>
          <Pressable
            hitSlop={8}
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
            style={styles.navButton}
            onPress={() =>
              setCursor(({ y, m }) => (m === 11 ? { y: y + 1, m: 0 } : { y, m: m + 1 }))
            }
          >
            <ChevronRight size={20} color={colors.ink} />
          </Pressable>
        </View>

        <View style={styles.grid}>
          {TH_DOW.map((d) => (
            <Text key={d} style={styles.dow}>
              {d}
            </Text>
          ))}
          {cells.map((date, index) => {
            if (!date) return <View key={`x${index}`} style={styles.cell} />;
            const key = isoDay(date);
            const isToday = key === isoDay(today);
            const isSelected = key === selected;
            const hasEvents = byDay.has(key);
            return (
              <Pressable
                key={key}
                style={[styles.cell, isSelected && styles.cellSelected, isToday && styles.cellToday]}
                onPress={() => setSelected(key)}
              >
                <Text
                  style={[
                    styles.cellText,
                    isToday && { color: colors.bg, fontWeight: '700' },
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
      </Card>

      {events.isError ? (
        <View style={{ marginTop: spacing.md }}>
          <ErrorNote message="โหลดปฏิทินไม่สำเร็จ" onRetry={() => events.refetch()} />
        </View>
      ) : null}

      <View style={styles.dayHead}>
        <SectionLabel>{thDate(new Date(selected))}</SectionLabel>
        <Pressable
          style={styles.addButton}
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
                  <Text style={styles.eventTitle} numberOfLines={2}>
                    {event.title}
                  </Text>
                  <Text style={styles.eventMeta} numberOfLines={1}>
                    {[event.case?.ownRef, event.courtName].filter(Boolean).join(' · ') || '—'}
                  </Text>
                </View>
                {event.type === 'COURT_DATE' ? <Tag tone="court">ศาล</Tag> : null}
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
  monthTitle: { fontSize: 16, fontWeight: '700', color: colors.ink },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  dow: {
    width: `${100 / 7}%`,
    textAlign: 'center',
    fontSize: 11,
    fontWeight: '600',
    color: colors.faint,
    paddingBottom: 4,
  },
  cell: {
    width: `${100 / 7}%`,
    aspectRatio: 1.1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
  },
  cellSelected: { backgroundColor: colors.soft },
  cellToday: { backgroundColor: colors.ink },
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
    alignItems: 'flex-end',
    justifyContent: 'space-between',
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.ink,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
    marginBottom: 6,
  },
  addText: { color: colors.bg, fontSize: 13, fontWeight: '600' },
  divider: { height: 1, backgroundColor: colors.soft },
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

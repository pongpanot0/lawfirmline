import React, { useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '@/components/AppText';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ChevronLeft, ChevronRight, Plus, X } from 'lucide-react-native';
import { useCalendarRange, useWorkload } from '@/api/hooks';
import type { CalendarEventItem } from '@/api/types';
import { Button, Card, EmptyState, ErrorState, EVENT_KIND_LABEL, InlineError, LoadingState, SectionLabel, Tag } from '@/components/ui';
import { bangkokDay, isoDay, thDate, thTime } from '@/format';
import { colors, radius, shadow, spacing, TOUCH, typeScale, pageContent } from '@/theme';

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

const personName = (person: { firstName: string; lastName: string }) => `${person.firstName} ${person.lastName}`;

export default function CalendarScreen() {
  const router = useRouter();
  const { memberId } = useLocalSearchParams<{ memberId?: string }>();
  // Day keys follow the office's Bangkok wall clock, the same as วันนี้, whatever the phone's time zone.
  const todayKey = bangkokDay(new Date().toISOString());
  const [todayY, todayM] = todayKey.split('-').map(Number);
  const [cursor, setCursor] = useState({ y: todayY, m: todayM - 1 });
  const [selected, setSelected] = useState(todayKey);

  const from = isoDay(new Date(cursor.y, cursor.m, 1));
  const to = isoDay(new Date(cursor.y, cursor.m + 1, 0));
  const events = useCalendarRange(from, to);
  const workload = useWorkload(!!memberId);
  const memberName = workload.data?.members.find((member) => member.id === memberId)?.name ?? 'สมาชิกทีม';

  const byDay = useMemo(() => {
    const map = new Map<string, CalendarEventItem[]>();
    for (const event of events.data ?? []) {
      if (memberId && event.assigneeId !== memberId && !event.assignees?.some((person) => person.userId === memberId)) continue;
      const key = bangkokDay(event.startAt);
      map.set(key, [...(map.get(key) ?? []), event]);
    }
    for (const list of map.values())
      list.sort((a, b) => a.startAt.localeCompare(b.startAt));
    return map;
  }, [events.data, memberId]);

  const onCurrentMonth = cursor.y === todayY && cursor.m === todayM - 1;
  // Changing month moves the selection into that month (today when it is the current month),
  // so the list below never shows an empty day from a month that is no longer loaded.
  const goMonth = (step: number) => {
    const next = new Date(cursor.y, cursor.m + step, 1);
    setCursor({ y: next.getFullYear(), m: next.getMonth() });
    setSelected(next.getFullYear() === todayY && next.getMonth() === todayM - 1 ? todayKey : isoDay(next));
  };
  const goToday = () => { setCursor({ y: todayY, m: todayM - 1 }); setSelected(todayKey); };
  const cells = monthGrid(cursor.y, cursor.m);
  const selectedEvents = byDay.get(selected) ?? [];
  // One target everywhere (same as วันนี้): court dates open วันขึ้นศาล, everything else opens its team.
  const openEvent = (event: CalendarEventItem) => event.type === 'COURT_DATE'
    ? router.push(`/court-day/${event.id}`)
    : router.push(`/event/${event.id}/team`);

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={pageContent}
      refreshControl={
        <RefreshControl refreshing={events.isRefetching} onRefresh={() => events.refetch()} />
      }
    >
      {memberId && <Pressable accessibilityRole="button" accessibilityLabel={`เลิกกรองนัดของ ${memberName} · ดูนัดทั้งหมด`}
        style={({ pressed }) => [styles.filter, pressed && { opacity: 0.6 }]} onPress={() => router.replace('/(tabs)/calendar')}>
        <Text style={styles.filterText}>นัดของ {memberName} · ดูทั้งหมด</Text>
        <X size={16} color={colors.info} />
      </Pressable>}
      <Card>
        <View style={styles.monthHead}>
          <Pressable
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="เดือนก่อนหน้า"
            style={({ pressed }) => [styles.navButton, pressed && { backgroundColor: colors.soft }]}
            onPress={() => goMonth(-1)}
          >
            <ChevronLeft size={20} color={colors.ink} />
          </Pressable>
          <View style={{ flex: 1, alignItems: 'center' }}>
            <Text accessibilityRole="header" style={styles.monthTitle}>
              {TH_MONTHS_FULL[cursor.m]} {cursor.y + 543}
            </Text>
            {!onCurrentMonth && <Pressable accessibilityRole="button" accessibilityLabel="กลับไปเดือนนี้และวันนี้" onPress={goToday}
              style={({ pressed }) => [styles.filter, { alignSelf: 'center' }, pressed && { opacity: 0.6 }]}>
              <Text style={styles.filterText}>กลับวันนี้</Text>
            </Pressable>}
          </View>
          <Pressable
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="เดือนถัดไป"
            style={({ pressed }) => [styles.navButton, pressed && { backgroundColor: colors.soft }]}
            onPress={() => goMonth(1)}
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
                const isToday = key === todayKey;
                const isSelected = key === selected;
                const dayEvents = byDay.get(key);
                const hasCourt = !!dayEvents?.some(event => event.type === 'COURT_DATE');
                return (
                  <Pressable
                    key={key}
                    accessibilityRole="button"
                    accessibilityLabel={`${date.getDate()} ${TH_MONTHS_FULL[cursor.m]} ${cursor.y + 543}${isToday ? ' วันนี้' : ''}${dayEvents ? ` มีนัด ${dayEvents.length} รายการ${hasCourt ? ' รวมนัดศาล' : ''}` : ''}`}
                    accessibilityState={{ selected: isSelected }}
                    style={({ pressed }) => [styles.cell, isToday && styles.cellToday, isSelected && styles.cellSelected,
                      pressed && !isSelected && { backgroundColor: colors.soft }]}
                    onPress={() => setSelected(key)}
                  >
                    <Text
                      style={[
                        styles.cellText,
                        isToday && { color: colors.ink, fontWeight: '700' },
                        isSelected && styles.cellTextSelected,
                      ]}
                    >
                      {date.getDate()}
                    </Text>
                    {/* Brass marks a court date; other appointments get a muted dot (both lighten on the navy selection). */}
                    {dayEvents ? <View style={[styles.dot, { backgroundColor: isSelected
                      ? (hasCourt ? colors.accentSoft : colors.line)
                      : (hasCourt ? colors.accent : colors.muted) }]} /> : null}
                  </Pressable>
                );
              })}
            </View>
          ))}
        </View>
      </Card>

      <View style={styles.dayHead}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.sm, flexShrink: 1 }}>
          <SectionLabel style={{ marginTop: 0, marginBottom: 0 }}>
            {selected === todayKey ? 'วันนี้ · ' : ''}{thDate(new Date(selected))}{selectedEvents.length ? ` · ${selectedEvents.length} นัด` : ''}
          </SectionLabel>
          {onCurrentMonth && selected !== todayKey && <Pressable accessibilityRole="button" accessibilityLabel="กลับไปวันนี้" hitSlop={8} onPress={goToday} style={styles.filter}>
            <Text style={styles.filterText}>กลับวันนี้</Text>
          </Pressable>}
        </View>
        <Pressable
          style={({ pressed }) => [styles.addButton, pressed && { backgroundColor: colors.inkPressed, ...shadow.none }]}
          accessibilityRole="button"
          accessibilityLabel={`เพิ่มนัดหมาย ${thDate(new Date(selected))}`}
          hitSlop={8}
          onPress={() => router.push(`/event/new?date=${selected}`)}
        >
          <Plus size={16} color={colors.bg} />
          <Text style={styles.addText}>เพิ่มนัด</Text>
        </Pressable>
      </View>
      {events.isError && (events.data
        ? <InlineError style={{ marginBottom: spacing.sm }} message="นัดหมายอาจยังไม่ล่าสุด" onRetry={() => events.refetch()} />
        : <ErrorState message="โหลดนัดหมายไม่สำเร็จ" onRetry={() => events.refetch()} />)}
      {!(events.isError && !events.data) && <Card style={{ paddingVertical: spacing.xs }}>
        {events.isLoading ? (
          <LoadingState inline label="กำลังโหลดนัดหมาย…" />
        ) : selectedEvents.length === 0 ? (
          <EmptyState compact>{selected === todayKey ? 'ไม่มีนัดหมายวันนี้' : 'ไม่มีนัดหมายในวันที่เลือก'}</EmptyState>
        ) : (
          selectedEvents.map((event, index) => {
            const kind = EVENT_KIND_LABEL[event.type] ?? EVENT_KIND_LABEL.OTHER;
            const when = event.type === 'DEADLINE' ? 'ทั้งวัน' : thTime(event.startAt);
            const lead = event.assignee ? personName(event.assignee) : 'ยังไม่ระบุ';
            const companions = event.assignees?.filter((person) => person.userId !== event.assigneeId).map((person) => personName(person.user)) ?? [];
            const people = `หลัก: ${lead}${companions.length ? ` · ร่วม: ${companions.join(', ')}` : ''}`;
            return <View key={event.id}>
              {index > 0 && <View style={styles.divider} />}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${kind.label} ${when} ${event.title} · ${people}`}
                accessibilityHint={event.type === 'COURT_DATE' ? 'เปิดวันขึ้นศาล' : 'เปิดทีมที่ไปด้วย'}
                style={({ pressed }) => [styles.eventRow, pressed && { backgroundColor: colors.soft }]}
                onPress={() => openEvent(event)}
              >
                <Text style={styles.eventTime}>{when}</Text>
                <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                  <Text style={styles.eventTitle}>{event.title}</Text>
                  {event.courtName ? <Text style={styles.eventMeta} numberOfLines={1}>{event.courtName}</Text> : null}
                  <Text style={styles.eventMeta}>{people}</Text>
                </View>
                <View style={{ alignItems: 'flex-end', gap: spacing.xs }}>
                  <Tag tone={kind.tone}>{kind.label}</Tag>
                  <ChevronRight size={18} color={colors.faint} />
                </View>
              </Pressable>
              {event.caseId && event.case?.ownRef ? <View style={{ paddingLeft: 58 }}>
                <Button variant="link" title={`คดี ${event.case.ownRef} ›`} onPress={() => router.push(`/case/${event.caseId}`)} />
              </View> : null}
            </View>;
          })
        )}
      </Card>}
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
    borderRadius: radius.button,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.raised,
  },
  monthTitle: { textAlign: 'center', ...typeScale.section, color: colors.ink },
  grid: { gap: spacing.xs },
  week: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  dow: {
    flex: 1,
    textAlign: 'center',
    ...typeScale.overline,
    color: colors.muted,
    paddingBottom: 4,
  },
  cell: {
    flex: 1,
    height: TOUCH,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.button,
  },
  // Selected day is the filled navy cell (like the selected filter); today keeps a navy outline.
  cellSelected: { backgroundColor: colors.ink, ...shadow.sm },
  cellToday: { borderWidth: 1.5, borderColor: colors.ink },
  cellText: { fontSize: 14, color: colors.text, fontVariant: ['tabular-nums'] },
  cellTextSelected: { color: colors.bg, fontWeight: '700' },
  dot: {
    position: 'absolute',
    bottom: 4,
    width: 5,
    height: 5,
    borderRadius: 3,
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
    borderRadius: radius.button,
    paddingHorizontal: spacing.md,
    minHeight: TOUCH,
    justifyContent: 'center',
    ...shadow.sm,
  },
  addText: { color: colors.bg, fontSize: 14, fontWeight: '600' },
  divider: { height: 1, backgroundColor: colors.divider },
  filter: { minHeight: TOUCH, flexDirection: 'row', alignItems: 'center', gap: spacing.xs, alignSelf: 'flex-start' },
  filterText: { color: colors.info, fontWeight: '600', flexShrink: 1 },
  eventRow: {
    flexDirection: 'row',
    gap: spacing.md,
    alignItems: 'flex-start',
    paddingVertical: spacing.md,
    minHeight: 56,
  },
  eventTime: {
    fontWeight: '700',
    color: colors.ink,
    width: 46,
    fontSize: 14,
    fontVariant: ['tabular-nums'],
  },
  eventTitle: { color: colors.ink, fontWeight: '600', fontSize: 15, lineHeight: 22 },
  eventMeta: { ...typeScale.meta, color: colors.muted },
});

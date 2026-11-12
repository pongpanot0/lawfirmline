import React, { useEffect, useMemo, useState } from 'react';
import { Linking, Modal, Pressable, RefreshControl, ScrollView, StyleSheet, Switch, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { OutlookCalendarItemDto } from '@lawfirm/shared';
import { useAuth } from '@/api/auth';
import { Text } from '@/components/AppText';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ChevronLeft, ChevronRight, MapPin, Plus, X } from 'lucide-react-native';
import { useCalendarRange, useWorkload, useOutlookCalendar } from '@/api/hooks';
import type { CalendarEventItem } from '@/api/types';
import { Button, Card, EmptyState, ErrorState, EVENT_KIND_LABEL, InlineError, LoadingState, SectionLabel, Tag } from '@/components/ui';
import { bangkokDay, initials, isoDay, thDate, thTime } from '@/format';
import { CHROME_MAX_SCALE, colors, fonts, radius, shadow, spacing, TOUCH, typeScale, pageContent } from '@/theme';

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
  const { user } = useAuth();
  const [showOutlook, setShowOutlook] = useState(true);
  const [chosenOutlook, setChosenOutlook] = useState<OutlookCalendarItemDto | null>(null);
  useEffect(() => { if (!user?.id) return; let active = true; setShowOutlook(true); AsyncStorage.getItem(`outlook-calendar:${user.id}`).then(value => { if (active) setShowOutlook(value !== 'false'); }).catch(() => {}); return () => { active = false; }; }, [user?.id]);
  const { memberId } = useLocalSearchParams<{ memberId?: string }>();
  // Day keys follow the office's Bangkok wall clock, the same as วันนี้, whatever the phone's time zone.
  const todayKey = bangkokDay(new Date().toISOString());
  const [todayY, todayM] = todayKey.split('-').map(Number);
  const [cursor, setCursor] = useState({ y: todayY, m: todayM - 1 });
  const [selected, setSelected] = useState(todayKey);

  const from = isoDay(new Date(cursor.y, cursor.m, 1));
  const to = isoDay(new Date(cursor.y, cursor.m + 1, 0));
  const events = useCalendarRange(from, to);
  const outlook = useOutlookCalendar(`${from}T00:00:00+07:00`, `${isoDay(new Date(cursor.y, cursor.m + 1, 1))}T00:00:00+07:00`, user?.id, showOutlook && (!memberId || memberId === user?.id));
  const outlookItems = showOutlook && (!memberId || memberId === user?.id) ? outlook.data?.items ?? [] : [];
  // All-day Outlook events are UTC midnights with an exclusive end: show them on every UTC date they cover.
  const onDay = (item: OutlookCalendarItemDto, key: string) => item.isAllDay
    ? item.startAt.slice(0, 10) <= key && (key < item.endAt.slice(0, 10) || key === item.startAt.slice(0, 10))
    : bangkokDay(item.startAt) === key;
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
  const selectedOutlook = outlookItems.filter(item => onDay(item, selected)).sort((a, b) => Number(b.isAllDay) - Number(a.isAllDay) || a.startAt.localeCompare(b.startAt));
  // One target everywhere (same as วันนี้): court dates open วันขึ้นศาล, everything else opens its team.
  const openEvent = (event: CalendarEventItem) => event.type === 'COURT_DATE'
    ? router.push(`/court-day/${event.id}`)
    : router.push(`/event/${event.id}/team`);

  return (
    <> <ScrollView
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
                const outlookCount = outlookItems.filter(item => onDay(item, key)).length;
                return (
                  <Pressable
                    key={key}
                    accessibilityRole="button"
                    accessibilityLabel={`${date.getDate()} ${TH_MONTHS_FULL[cursor.m]} ${cursor.y + 543}${isToday ? ' วันนี้' : ''}${dayEvents ? ` มีนัด ${dayEvents.length} รายการ${hasCourt ? ' รวมนัดศาล' : ''}` : ''}${outlookCount ? ` จาก Outlook ${outlookCount}` : ''}`}
                    accessibilityState={{ selected: isSelected }}
                    style={styles.cell}
                    onPress={() => setSelected(key)}
                  >
                    {({ pressed }) => <>
                      <View style={[styles.dayMark, isToday && !isSelected && styles.cellToday, isSelected && styles.cellSelected,
                        pressed && !isSelected && { backgroundColor: colors.soft }]}>
                        <Text
                          maxFontSizeMultiplier={CHROME_MAX_SCALE}
                          style={[
                            styles.cellText,
                            isToday && { color: colors.ink, fontWeight: '700' },
                            isSelected && styles.cellTextSelected,
                          ]}
                        >
                          {date.getDate()}
                        </Text>
                      </View>
                      {/* Brass marks a court date; other appointments get a muted dot. */}
                      {dayEvents || outlookCount ? <View style={[styles.dot, { backgroundColor: hasCourt ? colors.accent : colors.muted }]} /> : null}
                    </>}
                  </Pressable>
                );
              })}
            </View>
          ))}
        </View>
      </Card>

      <View style={{ minHeight: TOUCH, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.md }}><View><Text style={{ color: colors.ink, fontWeight: '700' }}>นัดจาก Outlook</Text><Text style={styles.eventMeta}>เห็นเฉพาะคุณ</Text></View><Switch accessibilityLabel="นัดจาก Outlook" value={showOutlook} onValueChange={value => { setShowOutlook(value); setChosenOutlook(null); if (user?.id) AsyncStorage.setItem(`outlook-calendar:${user.id}`, String(value)).catch(() => {}); }} /></View>
      {outlook.isError && showOutlook && <InlineError message="โหลดนัดจาก Outlook ไม่สำเร็จ" onRetry={() => outlook.refetch()} />}
      <View style={styles.dayHead}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.sm, flexShrink: 1 }}>
          <SectionLabel style={{ marginTop: 0, marginBottom: 0 }}>
            {selected === todayKey ? 'นัดวันนี้' : thDate(new Date(selected))} {selectedEvents.length} · จาก Outlook {selectedOutlook.length}
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
      {!(events.isError && !events.data) && (events.isLoading || selectedEvents.length === 0 && selectedOutlook.length === 0 ? <Card style={{ paddingVertical: spacing.xs }}>
        {events.isLoading ? (
          <LoadingState inline label="กำลังโหลดนัดหมาย…" />
        ) : (
          <EmptyState compact>{selected === todayKey ? 'ไม่มีนัดหมายวันนี้' : 'ไม่มีนัดหมายในวันที่เลือก'}</EmptyState>
        )}
      </Card> : <View style={{ gap: spacing.md }}>
        {selectedOutlook.filter(item => item.isAllDay).map(item => <OutlookCard key={item.id} item={item} onPress={() => setChosenOutlook(item)} />)}
        {selectedEvents.map((event, index) => {
          const kind = EVENT_KIND_LABEL[event.type] ?? EVENT_KIND_LABEL.OTHER;
          const when = event.type === 'DEADLINE' ? 'ทั้งวัน' : thTime(event.startAt);
          const lead = event.assignee ? personName(event.assignee) : 'ยังไม่ระบุ';
          const companions = event.assignees?.filter((person) => person.userId !== event.assigneeId).map((person) => personName(person.user)) ?? [];
          const people = `หลัก: ${lead}${companions.length ? ` · ร่วม: ${companions.join(', ')}` : ''}`;
          // One card per appointment: time and kind on the header row, then what, where and who.
          return <React.Fragment key={event.id}>{selectedOutlook.filter(item => !item.isAllDay && new Date(item.startAt).getTime() < new Date(event.startAt).getTime() && (index === 0 || new Date(item.startAt).getTime() >= new Date(selectedEvents[index - 1].startAt).getTime())).map(item => <OutlookCard key={item.id} item={item} onPress={() => setChosenOutlook(item)} />)}<Card style={styles.eventCard}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${kind.label} ${when} ${event.title} · ${people}`}
              accessibilityHint={event.type === 'COURT_DATE' ? 'เปิดวันขึ้นศาล' : 'เปิดทีมที่ไปด้วย'}
              style={({ pressed }) => [styles.eventPress, pressed && { backgroundColor: colors.soft }]}
              onPress={() => openEvent(event)}
            >
              <View style={styles.eventHead}>
                <Text style={styles.eventTime}>{when}</Text>
                <Tag tone={kind.tone}>{kind.label}</Tag>
              </View>
              <View style={styles.eventBody}>
                <View style={styles.eventTitleRow}>
                  <Text style={styles.eventTitle}>{event.title}</Text>
                  <ChevronRight size={18} color={colors.muted} style={{ marginTop: 3 }} />
                </View>
                {event.courtName ? <View style={styles.metaRow}>
                  <MapPin size={14} color={colors.muted} />
                  <Text style={styles.eventMeta} numberOfLines={1}>{event.courtName}</Text>
                </View> : null}
                <View style={styles.metaRow}>
                  {event.assignee ? <View style={styles.miniAvatar}>
                    <Text maxFontSizeMultiplier={CHROME_MAX_SCALE} style={styles.miniAvatarText}>{initials(lead)}</Text>
                  </View> : null}
                  <Text style={styles.eventMeta}>{people}</Text>
                </View>
              </View>
            </Pressable>
            {event.caseId && event.case?.ownRef ? <View style={styles.caseLink}>
              <Button variant="link" chevron title={`คดี ${event.case.ownRef}`} onPress={() => router.push(`/case/${event.caseId}`)} />
            </View> : null}
          </Card></React.Fragment>;
        })}
        {selectedOutlook.filter(item => !item.isAllDay && (!selectedEvents.length || new Date(item.startAt).getTime() >= new Date(selectedEvents[selectedEvents.length - 1].startAt).getTime())).map(item => <OutlookCard key={item.id} item={item} onPress={() => setChosenOutlook(item)} />)}
      </View>)}
      {outlook.data?.syncedAt && showOutlook && <Text style={[styles.eventMeta, { marginTop: spacing.md }]}>ดึงนัดจาก Outlook ล่าสุด {thTime(outlook.data.syncedAt)}</Text>}
    </ScrollView>
    <Modal transparent visible={!!chosenOutlook} animationType="slide" onRequestClose={() => setChosenOutlook(null)}><View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' }}><Pressable accessibilityLabel="ปิดรายละเอียด" accessibilityRole="button" style={StyleSheet.absoluteFill} onPress={() => setChosenOutlook(null)} />{chosenOutlook && <View style={{ backgroundColor: colors.surface, padding: spacing.lg, paddingBottom: spacing.xl, borderTopLeftRadius: radius.md, borderTopRightRadius: radius.md, gap: spacing.md }}><View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}><Tag tone="plain">นัดจาก Outlook</Tag><Pressable accessibilityRole="button" accessibilityLabel="ปิดรายละเอียด" onPress={() => setChosenOutlook(null)} style={{ minWidth: TOUCH, minHeight: TOUCH, alignItems: 'center', justifyContent: 'center' }}><X size={22} color={colors.muted} /></Pressable></View><Text style={styles.eventTitle}>{chosenOutlook.subject || 'ไม่มีชื่อ'}</Text><Text style={styles.eventMeta}>{chosenOutlook.isAllDay ? 'ทั้งวัน' : `${thTime(chosenOutlook.startAt)}–${thTime(chosenOutlook.endAt)}`}{chosenOutlook.location ? ` · ${chosenOutlook.location}` : ''}</Text><Text style={styles.eventMeta}>จากบัญชี {chosenOutlook.mailboxAddress}</Text><Text style={{ color: colors.text, backgroundColor: colors.warnSoft, padding: spacing.md }}>นัดนี้มาจาก Outlook แก้ไขหรือลบได้ใน Outlook เท่านั้น</Text>{chosenOutlook.webLink && <><Button variant="secondary" title="เปิดใน Outlook" onPress={() => { void Linking.openURL(chosenOutlook.webLink!); }} /><Text style={[styles.eventMeta, { textAlign: 'center' }]}>กดเพื่อเปิดนัดนี้ใน Outlook บนเว็บ</Text></>}</View>}</View></Modal></>
  );
}

function OutlookCard({ item, onPress }: { item: OutlookCalendarItemDto; onPress: () => void }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={`Outlook ${item.subject || 'ไม่มีชื่อ'}`} onPress={onPress} style={{ minHeight: TOUCH, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.lineStrong, borderRadius: radius.md, backgroundColor: colors.sunken, padding: spacing.md, gap: spacing.xs }}><Text style={styles.eventMeta}>{item.isAllDay ? 'ทั้งวัน' : `${thTime(item.startAt)}–${thTime(item.endAt)}`} · Outlook · {item.mailboxAddress.split('@')[0]}</Text><Text style={styles.eventTitle}>{item.subject || 'ไม่มีชื่อ'}</Text>{item.location && <Text style={styles.eventMeta}>{item.location}</Text>}</Pressable>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  monthHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
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
  grid: { gap: 2 },
  week: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  dow: {
    flex: 1,
    textAlign: 'center',
    ...typeScale.overline,
    color: colors.muted,
    paddingBottom: 4,
  },
  // The whole 44pt cell is the target; the visible mark is a 36pt circle, with the event dot just under it.
  cell: {
    flex: 1,
    height: TOUCH + 6,
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingTop: 2,
  },
  dayMark: { width: 36, height: 36, borderRadius: radius.full, alignItems: 'center', justifyContent: 'center' },
  // Selected day is a filled navy circle with a white numeral; today (when not selected) is a navy ring.
  cellSelected: { backgroundColor: colors.ink, ...shadow.sm },
  cellToday: { borderWidth: 1.5, borderColor: colors.ink },
  cellText: { fontSize: 15, color: colors.text, fontVariant: ['tabular-nums'] },
  cellTextSelected: { color: colors.bg, fontWeight: '700' },
  dot: {
    marginTop: 3,
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
    borderRadius: radius.action,
    paddingHorizontal: spacing.lg,
    minHeight: TOUCH,
    justifyContent: 'center',
    ...shadow.sm,
  },
  addText: { color: colors.bg, fontSize: 14, fontWeight: '600' },
  divider: { height: 1, backgroundColor: colors.divider },
  filter: { minHeight: TOUCH, flexDirection: 'row', alignItems: 'center', gap: spacing.xs, alignSelf: 'flex-start' },
  filterText: { color: colors.info, fontWeight: '600', flexShrink: 1 },
  eventCard: { padding: 0, overflow: 'hidden' },
  eventPress: { minHeight: 56 },
  eventHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  eventBody: { paddingHorizontal: spacing.lg, paddingVertical: spacing.md, gap: spacing.xs },
  eventTitleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  eventTime: {
    fontFamily: fonts.bold,
    fontSize: 20,
    lineHeight: 28,
    color: colors.ink,
    fontVariant: ['tabular-nums'],
  },
  eventTitle: { flex: 1, minWidth: 0, color: colors.ink, fontFamily: fonts.bold, fontSize: 17, lineHeight: 26 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  eventMeta: { ...typeScale.meta, color: colors.muted, flexShrink: 1 },
  miniAvatar: { width: 22, height: 22, borderRadius: radius.full, backgroundColor: colors.sunken, alignItems: 'center', justifyContent: 'center' },
  miniAvatarText: { fontFamily: fonts.bold, fontSize: 9, lineHeight: 12, color: colors.ink },
  caseLink: { paddingHorizontal: spacing.md, borderTopWidth: 1, borderTopColor: colors.divider },
});

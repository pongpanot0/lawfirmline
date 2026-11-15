import React, { useState } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/components/AppText';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { CalendarClock, ChevronRight, Gavel, Scale, Search, X } from 'lucide-react-native';
import { useCalendarRange, useCases, useWorkload } from '@/api/hooks';
import type { CalendarEventItem, CaseListItem } from '@/api/types';
import { Card, EmptyState, ErrorState, FilterTabs, LoadingState, SearchBox, Tag, TagTone } from '@/components/ui';
import { liftedCard, Masthead, MastheadPill } from '@/components/Masthead';
import { stageStep } from '@/case-stage';
import { bangkokDay, isoDay, thDate } from '@/format';
import { CHROME_MAX_SCALE, colors, fonts, radius, spacing, typeScale, pageContent } from '@/theme';

const STATUS_LABEL: Record<string, { label: string; tone: TagTone }> = {
  OPEN: { label: 'เปิด', tone: 'info' },
  DRAFTING: { label: 'ร่างเอกสาร', tone: 'info' },
  COURT_DATE: { label: 'รอนัดศาล', tone: 'court' },
  PENDING: { label: 'รอดำเนินการ', tone: 'plain' },
  ARCHIVED: { label: 'เก็บเข้าคลัง', tone: 'plain' },
  IN_PROGRESS: { label: 'ดำเนินการ', tone: 'info' },
  ON_HOLD: { label: 'พักไว้', tone: 'plain' },
  CLOSED: { label: 'ปิดแล้ว', tone: 'ok' },
};

const DONE_STATUSES = new Set(['CLOSED', 'ARCHIVED']);
const STATUS_FILTERS = [
  { value: 'all', label: 'ทั้งหมด' },
  { value: 'court', label: 'มีนัดใกล้' },
  { value: 'open', label: 'เปิดอยู่' },
  { value: 'closed', label: 'ปิดแล้ว' },
] as const;
/** "มีนัดใกล้" looks this many days ahead. */
const COURT_WINDOW_DAYS = 30;
type StatusFilter = typeof STATUS_FILTERS[number]['value'];

/** Case card: office ref and status (or the coming court date), title, client, then the stage bar; a court date adds one action. */
function CaseRow({ item, court, today, onPress, onPrepare }: {
  item: CaseListItem; court?: CalendarEventItem; today: string; onPress: () => void; onPrepare: (eventId: string) => void;
}) {
  // Statuses outside the map (e.g. ACTIVE, INTAKE) fall back to the raw value; see notes-B.md.
  const status = STATUS_LABEL[item.status] ?? { label: item.status, tone: 'plain' as TagTone };
  const stage = stageStep(item.stage);
  const days = court ? Math.round((Date.parse(bangkokDay(court.startAt)) - Date.parse(today)) / 86_400_000) : 0;
  const away = days <= 0 ? 'วันนี้' : days === 1 ? 'พรุ่งนี้' : `อีก ${days} วัน`;
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={{ marginBottom: spacing.md }}
      accessibilityLabel={`เปิดคดี ${item.ownRef} ${item.title} · ${court ? `นัดศาล ${thDate(court.startAt)}` : status.label}${stage ? ` · ขั้น ${stage.step} จาก ${stage.total} ${stage.label}` : ''}`}>
      {({ pressed }) => <Card style={[styles.card, court && styles.cardCourt, pressed && { opacity: 0.85 }]}>
        <View style={styles.head}>
          <Text style={styles.ownRef} numberOfLines={1}>{item.ownRef}</Text>
          {court ? <View style={styles.courtChip}>
            <Gavel size={14} color={colors.accentInk} />
            <Text maxFontSizeMultiplier={CHROME_MAX_SCALE} style={styles.courtChipText}>{`นัดศาล ${thDate(court.startAt)}`}</Text>
          </View> : <Tag tone={status.tone}>{status.label}</Tag>}
        </View>
        <View style={styles.titleRow}>
          <Text style={styles.title}>{item.title}</Text>
          <ChevronRight size={18} color={colors.muted} />
        </View>
        <Text style={styles.meta}>
          {[item.clientName ? `ลูกความ ${item.clientName}` : null, item.courtName, item.blackCaseNumber].filter(Boolean).join(' · ') || '—'}
        </Text>
        {stage ? <View style={{ gap: spacing.xs }}>
          <View style={styles.stageRow}>
            <Text style={styles.stageText}>{`ขั้น ${stage.step}/${stage.total} · ${stage.label}`}</Text>
            <Text style={styles.meta}>{`${Math.round(stage.step / stage.total * 100)}%`}</Text>
          </View>
          <View style={styles.bar}><View style={[styles.barFill, { width: `${stage.step / stage.total * 100}%` }]} /></View>
        </View> : null}
        {court ? <View style={styles.foot}>
          <View style={styles.away}>
            <CalendarClock size={18} color={colors.accentInk} />
            <Text style={styles.awayText}>{away}</Text>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel={`เตรียมนัด ${item.title} ${thDate(court.startAt)}`} onPress={() => onPrepare(court.id)}
            style={({ pressed }) => [styles.action, pressed && { backgroundColor: colors.inkPressed }]}>
            <Text maxFontSizeMultiplier={CHROME_MAX_SCALE} style={styles.actionText}>เตรียมนัด</Text>
          </Pressable>
        </View> : null}
      </Card>}
    </Pressable>
  );
}

export default function CasesScreen() {
  const router = useRouter();
  const { memberId } = useLocalSearchParams<{ memberId?: string }>();
  const [search, setSearch] = useState('');
  const [committed, setCommitted] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const cases = useCases(committed);
  const today = bangkokDay(new Date().toISOString());
  const until = isoDay(new Date(Date.now() + COURT_WINDOW_DAYS * 86_400_000));
  const calendar = useCalendarRange(today, until);
  // The next court date per case within the window; other appointment types do not mark a case.
  const nextCourt = new Map<string, CalendarEventItem>();
  for (const event of [...(calendar.data ?? [])].sort((a, b) => a.startAt.localeCompare(b.startAt))) {
    if (event.type === 'COURT_DATE' && event.caseId && bangkokDay(event.startAt) >= today && !nextCourt.has(event.caseId)) nextCourt.set(event.caseId, event);
  }
  const workload = useWorkload(!!memberId);
  const memberName = workload.data?.members.find((member) => member.id === memberId)?.name ?? 'สมาชิกทีม';
  // The person filter is the lead's open cases only (closed ones are left out on purpose), so the status tabs are hidden then.
  const matches = (item: CaseListItem, filter: StatusFilter) => filter === 'all' ? true
    : filter === 'court' ? nextCourt.has(item.id) && !DONE_STATUSES.has(item.status)
      : (filter === 'closed') === DONE_STATUSES.has(item.status);
  const rows = (cases.data ?? []).filter((item) => memberId
    ? item.leadLawyer?.id === memberId && item.status !== 'CLOSED'
    : matches(item, statusFilter))
    // Court-soon cases first, nearest date first; the rest keep the server order.
    .sort((a, b) => {
      const x = nextCourt.get(a.id)?.startAt, y = nextCourt.get(b.id)?.startAt;
      return x && y ? (x < y ? -1 : x > y ? 1 : 0) : x ? -1 : y ? 1 : 0;
    });
  const filterLabel = STATUS_FILTERS.find(item => item.value === statusFilter)?.label;
  const filterTabs = STATUS_FILTERS.map(item => ({ value: item.value,
    label: cases.data ? `${item.label} ${(cases.data ?? []).filter(row => matches(row, item.value)).length}` : item.label }));

  const header = <View style={{ gap: spacing.sm, marginBottom: spacing.md }}>
    <Masthead safeTop title="คดี" subtitle={cases.data && !cases.isError ? `${rows.length} คดี${!memberId && statusFilter !== 'all' ? ` · ${filterLabel}` : ''}${committed ? ` · “${committed}”` : ''}` : undefined}
      actions={<MastheadPill label="รับเคส" a11y="รับเคสใหม่" onPress={() => router.push('/case/new')} />} />
    <Card style={[liftedCard, { gap: spacing.sm, padding: spacing.md }]}>
      {memberId && <Pressable accessibilityRole="button" accessibilityLabel={`เลิกกรองคดีของ ${memberName} · ดูคดีทั้งหมด`}
        style={({ pressed }) => [styles.filter, pressed && { opacity: 0.6 }]} onPress={() => router.replace('/(tabs)/cases')}>
        <Text style={styles.filterText}>คดีหลักที่ยังเปิดของ {memberName} · ดูทั้งหมด</Text>
        <X size={16} color={colors.info} />
      </Pressable>}
      <SearchBox value={search} onChange={setSearch} onSearch={() => setCommitted(search.trim())} onClear={() => setCommitted('')} placeholder="ค้นหาเลขคดี ชื่อคดี หรือลูกความ" />
      {!memberId && <FilterTabs items={filterTabs} value={statusFilter} onChange={value => setStatusFilter(value as StatusFilter)} />}
    </Card>
  </View>;

  return (
    <View style={styles.screen}>
      <FlatList
        data={cases.isLoading || cases.isError ? [] : rows}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ ...pageContent, maxWidth: 760 }}
        refreshing={cases.isRefetching}
        onRefresh={() => { cases.refetch(); calendar.refetch(); }}
        ListHeaderComponent={header}
        renderItem={({ item }) => (
          <CaseRow item={item} court={nextCourt.get(item.id)} today={today} onPress={() => router.push(`/case/${item.id}`)}
            onPrepare={eventId => router.push(`/court-day/${eventId}`)} />
        )}
        ListEmptyComponent={
          cases.isLoading ? <LoadingState label="กำลังโหลดคดี…" />
            : cases.isError ? <ErrorState message="โหลดรายการคดีไม่สำเร็จ" onRetry={() => cases.refetch()} />
              : committed ? <EmptyState icon={Search}>{`ไม่พบคดีที่ตรงกับ "${committed}"`}</EmptyState>
                : memberId ? <EmptyState icon={Scale}>ไม่มีคดีหลักที่ยังเปิดของคนนี้</EmptyState>
                  : statusFilter !== 'all' ? <EmptyState icon={Scale} action={{ title: 'ดูคดีทั้งหมด', onPress: () => setStatusFilter('all') }}>{`ไม่มีคดี${filterLabel}`}</EmptyState>
                    : <EmptyState icon={Scale} action={{ title: 'รับเคสใหม่', onPress: () => router.push('/case/new') }}>ยังไม่มีคดี</EmptyState>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  filter: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: spacing.xs, alignSelf: 'flex-start' },
  filterText: { color: colors.info, fontWeight: '600', flexShrink: 1 },
  count: { ...typeScale.meta, color: colors.muted },
  card: { gap: spacing.sm },
  cardCourt: { backgroundColor: colors.accentWash, borderTopWidth: 4, borderTopColor: colors.accent },
  courtChip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: spacing.sm, paddingVertical: 2, borderRadius: radius.full,
    borderWidth: 1, borderColor: colors.accentEdge, backgroundColor: colors.accentSoft },
  courtChipText: { fontSize: 13, lineHeight: 20, fontWeight: '700', color: colors.accentInk },
  stageRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: spacing.sm, marginTop: spacing.xs },
  stageText: { ...typeScale.meta, color: colors.ink, fontWeight: '600', flexShrink: 1 },
  bar: { height: 8, borderRadius: 4, backgroundColor: colors.soft, overflow: 'hidden' },
  barFill: { height: 8, borderRadius: 4, backgroundColor: colors.ink },
  foot: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderTopWidth: 1, borderTopColor: colors.accentEdge, paddingTop: spacing.md, marginTop: spacing.xs },
  away: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  awayText: { ...typeScale.body, fontWeight: '700', color: colors.accentInk },
  action: { minHeight: 44, justifyContent: 'center', paddingHorizontal: spacing.lg, borderRadius: radius.action, backgroundColor: colors.ink },
  actionText: { color: colors.onInk, fontWeight: '700', fontSize: 15 },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  ownRef: { flex: 1, minWidth: 0, ...typeScale.overline, color: colors.muted, fontVariant: ['tabular-nums'] },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  title: { flex: 1, minWidth: 0, color: colors.ink, fontSize: 17, lineHeight: 26, fontFamily: fonts.bold },
  meta: { ...typeScale.meta, color: colors.muted },
});

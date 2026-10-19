import React, { useState } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/components/AppText';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ChevronRight, X } from 'lucide-react-native';
import { useCases, useWorkload } from '@/api/hooks';
import type { CaseListItem } from '@/api/types';
import { Card, EmptyNote, ErrorNote, FilterTabs, Loading, SearchBox, Tag, TagTone } from '@/components/ui';
import { colors, spacing, pageContent } from '@/theme';

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
  { value: 'open', label: 'เปิดอยู่' },
  { value: 'closed', label: 'ปิดแล้ว' },
] as const;
type StatusFilter = typeof STATUS_FILTERS[number]['value'];

function CaseRow({ item, onPress }: { item: CaseListItem; onPress: () => void }) {
  const status = STATUS_LABEL[item.status] ?? { label: item.status, tone: 'plain' as TagTone };
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`เปิดคดี ${item.ownRef} ${item.title} · ${status.label}`} onPress={onPress}
      style={({ pressed }) => pressed && { opacity: 0.7 }}>
      <Card style={{ marginBottom: spacing.md }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
          <Text style={styles.ownRef}>{item.ownRef}</Text>
          <View style={{ flex: 1 }} />
          <Tag tone={status.tone}>{status.label}</Tag>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}><Text style={[styles.title, { flex: 1 }]}>
          {item.title}
        </Text><ChevronRight size={18} color={colors.faint} /></View>
        <Text style={styles.meta}>
          {[item.clientName, item.courtName, item.blackCaseNumber]
            .filter(Boolean)
            .join(' · ') || '—'}
        </Text>
      </Card>
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
  const workload = useWorkload(!!memberId);
  const memberName = workload.data?.members.find((member) => member.id === memberId)?.name ?? 'สมาชิกทีม';
  // The person filter is the lead's open cases only (closed ones are left out on purpose), so the status tabs are hidden then.
  const rows = (cases.data ?? []).filter((item) => memberId
    ? item.leadLawyer?.id === memberId && item.status !== 'CLOSED'
    : statusFilter === 'all' || (statusFilter === 'closed') === DONE_STATUSES.has(item.status));
  const filterLabel = STATUS_FILTERS.find(item => item.value === statusFilter)?.label;

  return (
    <View style={styles.screen}>
      <View style={{ ...pageContent, maxWidth: 760, gap: spacing.sm, paddingBottom: 0 }}>
      {memberId && <Pressable accessibilityRole="button" accessibilityLabel={`เลิกกรองคดีของ ${memberName} · ดูคดีทั้งหมด`}
        style={({ pressed }) => [styles.filter, pressed && { opacity: 0.6 }]} onPress={() => router.replace('/(tabs)/cases')}>
        <Text style={styles.filterText}>คดีหลักที่ยังเปิดของ {memberName} · ดูทั้งหมด</Text>
        <X size={16} color={colors.info} />
      </Pressable>}
      <SearchBox value={search} onChange={setSearch} onSearch={() => setCommitted(search.trim())} onClear={() => setCommitted('')} placeholder="ค้นหาเลขคดี ชื่อคดี หรือลูกความ" />
      {!memberId && <FilterTabs items={STATUS_FILTERS} value={statusFilter} onChange={value => setStatusFilter(value as StatusFilter)} />}
      {cases.data && !cases.isError ? <Text style={{ color: colors.muted, fontSize: 12 }}>
        {`${rows.length} คดี${!memberId && statusFilter !== 'all' ? ` · ${filterLabel}` : ''}${committed ? ` · “${committed}”` : ''}`}
      </Text> : null}
      </View>

      {cases.isLoading ? (
        <Loading label="กำลังโหลดคดี…" />
      ) : cases.isError ? (
        <View style={{ padding: spacing.lg }}>
          <ErrorNote message="โหลดรายการคดีไม่สำเร็จ" onRetry={() => cases.refetch()} />
        </View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(item) => item.id}
          contentContainerStyle={pageContent}
          refreshing={cases.isRefetching}
          onRefresh={() => cases.refetch()}
          renderItem={({ item }) => (
            <CaseRow item={item} onPress={() => router.push(`/case/${item.id}`)} />
          )}
          ListEmptyComponent={
            committed ? <EmptyNote>{`ไม่พบคดีที่ตรงกับ "${committed}"`}</EmptyNote>
              : memberId ? <EmptyNote>ไม่มีคดีหลักที่ยังเปิดของคนนี้</EmptyNote>
                : statusFilter !== 'all' ? <EmptyNote action={{ title: 'ดูคดีทั้งหมด', onPress: () => setStatusFilter('all') }}>{`ไม่มีคดี${filterLabel}`}</EmptyNote>
                  : <EmptyNote action={{ title: 'รับเคสใหม่', onPress: () => router.push('/case/new') }}>ยังไม่มีคดี</EmptyNote>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  filter: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: spacing.xs, alignSelf: 'flex-start' },
  filterText: { color: colors.info, fontWeight: '600', flexShrink: 1 },
  ownRef: { fontWeight: '700', color: colors.ink, fontSize: 14 },
  title: { color: colors.text, marginTop: spacing.sm, fontSize: 16, lineHeight: 24, fontWeight: '600' },
  meta: { color: colors.faint, fontSize: 14, lineHeight: 22, marginTop: spacing.sm },
});

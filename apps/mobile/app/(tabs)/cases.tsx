import React, { useState } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/components/AppText';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ChevronRight } from 'lucide-react-native';
import { useCases, useWorkload } from '@/api/hooks';
import type { CaseListItem } from '@/api/types';
import { Button, Card, EmptyNote, ErrorNote, Loading, PageIntro, SearchBox, Tag, TagTone } from '@/components/ui';
import { colors, spacing, pageContent } from '@/theme';

const STATUS_LABEL: Record<string, { label: string; tone: TagTone }> = {
  OPEN: { label: 'เปิด', tone: 'info' },
  DRAFTING: { label: 'ร่างเอกสาร', tone: 'info' },
  COURT_DATE: { label: 'รอนัดศาล', tone: 'court' },
  PENDING: { label: 'รอดำเนินการ', tone: 'plain' },
  ARCHIVED: { label: 'เก็บเข้าคลัง', tone: 'plain' },
  IN_PROGRESS: { label: 'ดำเนินการ', tone: 'court' },
  ON_HOLD: { label: 'พักไว้', tone: 'plain' },
  CLOSED: { label: 'ปิดแล้ว', tone: 'ok' },
};

function CaseRow({ item, onPress }: { item: CaseListItem; onPress: () => void }) {
  const status = STATUS_LABEL[item.status] ?? { label: item.status, tone: 'plain' as TagTone };
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`เปิดคดี ${item.title}`} onPress={onPress} style={({ pressed }) => pressed && { opacity: 0.7 }}>
      <Card style={{ marginBottom: spacing.md }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
          <Text style={styles.ownRef}>{item.ownRef}</Text>
          <View style={{ flex: 1 }} />
          <Tag tone={status.tone}>{status.label}</Tag>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}><Text style={[styles.title, { flex: 1 }]}>
          {item.title}
        </Text><ChevronRight size={18} color={colors.faint} /></View>
        <Text style={styles.meta} numberOfLines={1}>
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
  const cases = useCases(committed);
  const workload = useWorkload(!!memberId);
  const rows = (cases.data ?? []).filter((item) => !memberId || (item.leadLawyer?.id === memberId && item.status !== 'CLOSED'));

  return (
    <View style={styles.screen}>
      <View style={{ ...pageContent, maxWidth: 760, gap: spacing.sm, paddingBottom: 0 }}>
      <PageIntro title="คดีในสำนักงาน" detail="ค้นหาคดี หรือแตะรายการเพื่อดูงานและเอกสาร" />
      {memberId && <Pressable accessibilityRole="button" style={styles.filter} onPress={() => router.replace('/(tabs)/cases')}>
        <Text style={styles.filterText}>คดีหลักของ {workload.data?.members.find((member) => member.id === memberId)?.name ?? 'สมาชิกทีม'} · ดูทั้งหมด ×</Text>
      </Pressable>}
      <SearchBox value={search} onChange={setSearch} onSearch={() => setCommitted(search.trim())} onClear={() => setCommitted('')} placeholder="ค้นหาเลขคดี ชื่อคดี หรือลูกความ" />
      <Button title="รับเคสใหม่" onPress={() => router.push('/case/new')} />
      <Text style={{ color: colors.muted, fontSize: 12 }}>{cases.isLoading || cases.isError ? '—' : `${rows.length} คดี${committed ? ` · “${committed}”` : ''}`}</Text>
      </View>

      {cases.isLoading ? (
        <Loading />
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
            <EmptyNote>
              {committed ? `ไม่พบคดีที่ตรงกับ "${committed}"` : memberId ? 'ไม่พบคดีของคนนี้' : 'ยังไม่มีคดี'}
            </EmptyNote>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  filter: { minHeight: 44, justifyContent: 'center', marginHorizontal: spacing.lg },
  filterText: { color: colors.info, fontWeight: '600' },
  ownRef: { fontWeight: '700', color: colors.ink, fontSize: 14 },
  title: { color: colors.text, marginTop: 4, fontSize: 14, fontWeight: '600' },
  meta: { color: colors.faint, fontSize: 12, marginTop: 4 },
});

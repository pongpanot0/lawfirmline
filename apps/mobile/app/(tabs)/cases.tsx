import React, { useState } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import { Text, TextInput } from '@/components/AppText';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Search } from 'lucide-react-native';
import { useCases, useWorkload } from '@/api/hooks';
import type { CaseListItem } from '@/api/types';
import { Button, Card, EmptyNote, ErrorNote, Loading, Tag, TagTone } from '@/components/ui';
import { colors, radius, spacing, pageContent } from '@/theme';

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
    <Pressable onPress={onPress} style={({ pressed }) => pressed && { opacity: 0.7 }}>
      <Card style={{ marginBottom: spacing.md }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
          <Text style={styles.ownRef}>{item.ownRef}</Text>
          <View style={{ flex: 1 }} />
          <Tag tone={status.tone}>{status.label}</Tag>
        </View>
        <Text style={styles.title} numberOfLines={2}>
          {item.title}
        </Text>
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
      {memberId && <Pressable accessibilityRole="button" style={styles.filter} onPress={() => router.replace('/(tabs)/cases')}>
        <Text style={styles.filterText}>คดีหลักของ {workload.data?.members.find((member) => member.id === memberId)?.name ?? 'สมาชิกทีม'} · ดูทั้งหมด ×</Text>
      </Pressable>}
      <View style={{ paddingHorizontal: spacing.lg, paddingTop: spacing.md }}><Button title="รับเคสใหม่" onPress={() => router.push('/case/new')} /></View>
      <View style={styles.searchBox}>
        <Search size={16} color={colors.faint} />
        <TextInput
          style={styles.searchInput}
          placeholder="ค้นหา Own Ref, ชื่อคดี, ลูกความ"
          placeholderTextColor={colors.faint}
          value={search}
          onChangeText={setSearch}
          onSubmitEditing={() => setCommitted(search.trim())}
          returnKeyType="search"
          autoCapitalize="none"
        />
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
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: radius.button,
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    paddingHorizontal: spacing.md,
  },
  searchInput: { flex: 1, paddingVertical: 12, fontSize: 15, color: colors.text },
  ownRef: { fontWeight: '700', color: colors.ink, fontSize: 14 },
  title: { color: colors.text, marginTop: 4, fontSize: 14, fontWeight: '600' },
  meta: { color: colors.faint, fontSize: 12, marginTop: 4 },
});

import React, { useState } from 'react';
import {
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Search } from 'lucide-react-native';
import { useKnowledge } from '@/api/hooks';
import { Card, EmptyNote, ErrorNote, Loading, Tag } from '@/components/ui';
import { thDate } from '@/format';
import { colors, radius, spacing } from '@/theme';

const CATEGORY_LABEL: Record<string, string> = {
  SUMMARY: 'สรุปคดี',
  PRECEDENT: 'แนวคำพิพากษา',
  STRATEGY: 'กลยุทธ์',
  LESSON: 'บทเรียน',
};

/** Read-only knowledge search — writing entries stays on web. */
export default function KnowledgeScreen() {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [committed, setCommitted] = useState('');
  const knowledge = useKnowledge(committed);

  return (
    <View style={styles.screen}>
      <View style={styles.searchBox}>
        <Search size={16} color={colors.faint} />
        <TextInput
          style={styles.searchInput}
          placeholder="ค้นหาความรู้ แนวทาง คำพิพากษา"
          placeholderTextColor={colors.faint}
          value={search}
          onChangeText={setSearch}
          onSubmitEditing={() => setCommitted(search.trim())}
          returnKeyType="search"
        />
      </View>
      {knowledge.isLoading ? (
        <Loading />
      ) : knowledge.isError ? (
        <View style={{ padding: spacing.lg }}>
          <ErrorNote message="โหลดคลังความรู้ไม่สำเร็จ" onRetry={() => knowledge.refetch()} />
        </View>
      ) : (
        <FlatList
          data={knowledge.data ?? []}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: spacing.lg, paddingTop: spacing.sm }}
          refreshing={knowledge.isRefetching}
          onRefresh={() => knowledge.refetch()}
          renderItem={({ item }) => (
            <Pressable
              onPress={() => item.caseId && router.push(`/case/${item.caseId}`)}
              style={({ pressed }) => pressed && { opacity: 0.7 }}
            >
              <Card style={{ marginBottom: spacing.sm }}>
                <View style={styles.row}>
                  <Text style={styles.title} numberOfLines={2}>
                    {item.title}
                  </Text>
                  <Tag tone="court">{CATEGORY_LABEL[item.category] ?? item.category}</Tag>
                </View>
                <Text style={styles.summary} numberOfLines={4}>
                  {item.summary}
                </Text>
                <Text style={styles.meta} numberOfLines={1}>
                  {[item.case?.ownRef, thDate(item.createdAt)].filter(Boolean).join(' · ')}
                </Text>
              </Card>
            </Pressable>
          )}
          ListEmptyComponent={
            <EmptyNote>
              {committed ? `ไม่พบความรู้ที่ตรงกับ "${committed}"` : 'ยังไม่มีรายการความรู้'}
            </EmptyNote>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: radius.button,
    marginHorizontal: spacing.lg,
    marginTop: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  searchInput: { flex: 1, paddingVertical: 12, fontSize: 15, color: colors.text },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  title: { flex: 1, fontSize: 14, fontWeight: '600', color: colors.text },
  summary: { fontSize: 13, color: colors.muted, marginTop: 6, lineHeight: 19 },
  meta: { fontSize: 12, color: colors.faint, marginTop: 8 },
});

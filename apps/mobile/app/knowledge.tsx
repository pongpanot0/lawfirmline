import React, { useState } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/components/AppText';
import { useRouter } from 'expo-router';
import { BookOpen, ChevronDown, ChevronRight } from 'lucide-react-native';
import { useKnowledge } from '@/api/hooks';
import { Button, Card, EmptyState, ErrorState, FilterTabs, LoadingState, PageIntro, SearchBox, Tag } from '@/components/ui';
import { thDate } from '@/format';
import { colors, spacing, pageContent } from '@/theme';

const CATEGORY_LABEL: Record<string, string> = {
  SUMMARY: 'สรุปคดี',
  PRECEDENT: 'แนวคำพิพากษา',
  STRATEGY: 'กลยุทธ์',
  LESSON: 'บทเรียน',
};
const CATEGORY_TABS = [{ value: '', label: 'ทั้งหมด' }, ...Object.entries(CATEGORY_LABEL).map(([value, label]) => ({ value, label }))];

/** Read-only knowledge search — writing entries stays on web. */
export default function KnowledgeScreen() {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [committed, setCommitted] = useState('');
  const [category, setCategory] = useState('');
  const [openId, setOpenId] = useState('');
  const knowledge = useKnowledge(committed);
  const rows = (knowledge.data ?? []).filter(item => !category || item.category === category);

  return (
    <View style={styles.screen}>
      <View style={{ ...pageContent, maxWidth: 760, gap: spacing.sm, paddingBottom: 0 }}>
        <PageIntro title="คลังความรู้" detailOnly detail="สรุปคดี แนวทาง และบทเรียนที่สำนักงานบันทึกไว้" />
        <SearchBox value={search} onChange={setSearch} onSearch={() => setCommitted(search.trim())} onClear={() => setCommitted('')} placeholder="ค้นหาความรู้ แนวทาง คำพิพากษา" />
        <FilterTabs items={CATEGORY_TABS} value={category} onChange={setCategory} />
      </View>
      {knowledge.isLoading ? (
        <LoadingState label="กำลังโหลดคลังความรู้…" />
      ) : knowledge.isError ? (
        <View style={{ ...pageContent, maxWidth: 760 }}>
          <ErrorState message="โหลดคลังความรู้ไม่สำเร็จ" onRetry={() => knowledge.refetch()} />
        </View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ ...pageContent, maxWidth: 760, paddingTop: spacing.md }}
          refreshing={knowledge.isRefetching}
          onRefresh={() => knowledge.refetch()}
          renderItem={({ item }) => {
            const open = openId === item.id;
            const categoryLabel = CATEGORY_LABEL[item.category] ?? item.category;
            // Tapping reads the entry in place; the case link appears once it is open.
            return (
              <Card style={{ marginBottom: spacing.md, paddingVertical: spacing.md }}>
                <Pressable
                  accessibilityRole="button" accessibilityState={{ expanded: open }}
                  accessibilityLabel={`${item.title} · ${categoryLabel}`} accessibilityHint={open ? 'แตะเพื่อย่อ' : 'แตะเพื่ออ่านต่อ'}
                  onPress={() => setOpenId(open ? '' : item.id)}
                  style={({ pressed }) => [styles.head, pressed && { opacity: 0.7 }]}
                >
                  <View style={{ flex: 1, minWidth: 0, gap: spacing.xs }}>
                    <Text style={styles.title}>{item.title}</Text>
                    <Tag tone="plain">{categoryLabel}</Tag>
                    <Text style={styles.summary} numberOfLines={open ? undefined : 4}>{item.summary}</Text>
                    <Text style={styles.meta}>
                      {[item.case?.ownRef, thDate(item.createdAt)].filter(Boolean).join(' · ')}
                    </Text>
                  </View>
                  {open ? <ChevronDown size={18} color={colors.muted} /> : <ChevronRight size={18} color={colors.muted} />}
                </Pressable>
                {open && item.caseId ? <Button title={`เปิดคดี ${item.case?.ownRef ?? ''}`.trim()} variant="link"
                  onPress={() => router.push(`/case/${item.caseId}`)} /> : null}
              </Card>
            );
          }}
          ListEmptyComponent={
            <EmptyState icon={BookOpen}>
              {committed ? `ไม่พบความรู้ที่ตรงกับ “${committed}”` : category ? `ยังไม่มีรายการ${CATEGORY_LABEL[category]}` : 'ยังไม่มีรายการความรู้ · บันทึกได้บนเว็บ'}
            </EmptyState>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, minHeight: 44, paddingVertical: spacing.xs },
  title: { fontSize: 16, lineHeight: 24, fontWeight: '600', color: colors.text },
  summary: { fontSize: 14, color: colors.text, lineHeight: 22 },
  meta: { fontSize: 13, lineHeight: 20, color: colors.muted },
});

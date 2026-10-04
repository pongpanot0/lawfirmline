import React, { useState } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/components/AppText';
import { useRouter } from 'expo-router';
import { useKnowledge } from '@/api/hooks';
import { Button, Card, EmptyNote, ErrorNote, Loading, PageIntro, SearchBox, Tag } from '@/components/ui';
import { thDate } from '@/format';
import { colors, spacing, pageContent } from '@/theme';

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
      <View style={{ ...pageContent, maxWidth: 760, gap: spacing.sm, paddingBottom: 0 }}>
        <PageIntro title="ความรู้จากคดี" detail="ค้นหาสรุปคดี แนวทาง และบทเรียนที่สำนักงานบันทึกไว้" />
        <SearchBox value={search} onChange={setSearch} onSearch={() => setCommitted(search.trim())} onClear={() => setCommitted('')} placeholder="ค้นหาความรู้ แนวทาง คำพิพากษา" />
        <Button title="ค้นหาไฟล์ในคดี" ghost onPress={() => router.push('/search')} />
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
          contentContainerStyle={pageContent}
          refreshing={knowledge.isRefetching}
          onRefresh={() => knowledge.refetch()}
          renderItem={({ item }) => (
            <Pressable
              accessibilityRole="button" disabled={!item.caseId}
              onPress={() => item.caseId && router.push(`/case/${item.caseId}`)}
              style={({ pressed }) => pressed && { opacity: 0.7 }}
            >
              <Card style={{ marginBottom: spacing.md }}>
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
  row: { alignItems: 'flex-start', gap: spacing.sm },
  title: { flex: 1, fontSize: 14, fontWeight: '600', color: colors.text },
  summary: { fontSize: 13, color: colors.muted, marginTop: 6, lineHeight: 19 },
  meta: { fontSize: 12, color: colors.faint, marginTop: 8 },
});

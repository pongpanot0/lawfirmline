import React from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/components/AppText';
import { useRouter } from 'expo-router';
import { ChevronRight, PauseCircle } from 'lucide-react-native';
import { ApiError } from '@/api/client';
import { useOnHoldTasks } from '@/api/hooks';
import { Card, EmptyNote, ErrorNote, Loading, PageIntro, Tag } from '@/components/ui';
import { bangkokDay, thDate } from '@/format';
import { colors, spacing, pageContent } from '@/theme';

/**
 * Firm Owner's on-hold queue: work parked waiting on someone else, sorted by
 * next follow-up. Resuming/closing a hold stays on web; this screen is for
 * spotting stalls from the road.
 */
export default function OperationsScreen() {
  const router = useRouter();
  const onhold = useOnHoldTasks();

  if (onhold.isLoading) return <Loading label="กำลังโหลดงานพักไว้…" />;

  if (onhold.isError) {
    const forbidden = onhold.error instanceof ApiError && onhold.error.status === 403;
    return (
      <View style={[styles.screen, { padding: spacing.lg }]}>
        <ErrorNote
          message={
            forbidden
              ? 'หน้านี้สำหรับเจ้าของและผู้จัดการสำนักงาน'
              : 'โหลดงานพักไว้ไม่สำเร็จ'
          }
          onRetry={forbidden ? undefined : () => onhold.refetch()}
        />
      </View>
    );
  }

  // Follow-ups are due by the Bangkok calendar day, not the device clock.
  const today = bangkokDay(new Date().toISOString());
  const isOverdue = (at?: string | null) => !!at && bangkokDay(at) < today;
  const overdueFollowUps = (onhold.data ?? []).filter(item => isOverdue(item.nextFollowUpAt)).length;

  return (
    <View style={styles.screen}>
      <FlatList
        data={onhold.data ?? []}
        keyExtractor={(item) => item.taskId}
        contentContainerStyle={pageContent}
        refreshing={onhold.isRefetching}
        onRefresh={() => onhold.refetch()}
        ListHeaderComponent={<>
          <PageIntro title="งานพักไว้" detailOnly detail="เรียงตามวันติดตาม · ปลดพักงานได้บนเว็บ" />
          {overdueFollowUps > 0 ? (
            <View style={{ marginBottom: spacing.sm }}>
              <Tag tone="due">{overdueFollowUps} รายการเลยกำหนดติดตาม</Tag>
            </View>
          ) : null}
        </>}
        renderItem={({ item }) => {
          const overdue = isOverdue(item.nextFollowUpAt);
          const meta = [
            item.caseOwnRef,
            item.assigneeName ? `ผู้รับผิดชอบ ${item.assigneeName}` : null,
            item.followerName ? `ผู้ติดตาม ${item.followerName}` : null,
          ].filter(Boolean).join(' · ');
          return (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`เปิดงาน ${item.taskTitle}${item.nextFollowUpAt ? ` · ติดตาม ${thDate(item.nextFollowUpAt)}${overdue ? ' เลยกำหนด' : ''}` : ''}`}
              onPress={() => router.push(`/task/new?id=${item.taskId}`)}
              style={({ pressed }) => pressed && { opacity: 0.7 }}
            >
              <Card style={{ marginBottom: spacing.sm }}>
                <View style={styles.row}>
                  <PauseCircle size={16} color={colors.muted} style={{ marginTop: 3 }} />
                  <View style={{ flex: 1, minWidth: 0, gap: spacing.xs }}>
                    <Text style={styles.title}>{item.taskTitle}</Text>
                    {item.nextFollowUpAt ? <Tag tone={overdue ? 'due' : 'plain'}>ติดตาม {thDate(item.nextFollowUpAt)}</Tag> : null}
                    {item.reason ? (
                      <Text style={styles.reason} numberOfLines={2}>รอ: {item.reason}</Text>
                    ) : null}
                    {meta ? <Text style={styles.meta}>{meta}</Text> : null}
                  </View>
                  <ChevronRight size={18} color={colors.muted} style={{ alignSelf: 'center' }} />
                </View>
              </Card>
            </Pressable>
          );
        }}
        ListEmptyComponent={<EmptyNote>ไม่มีงานพักไว้</EmptyNote>}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  title: { fontSize: 15, fontWeight: '600', color: colors.text },
  reason: { fontSize: 14, color: colors.text, lineHeight: 22 },
  meta: { fontSize: 13, color: colors.muted, lineHeight: 20 },
});

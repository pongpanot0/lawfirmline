import React from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { PauseCircle } from 'lucide-react-native';
import { ApiError } from '@/api/client';
import { useOnHoldTasks } from '@/api/hooks';
import { Card, EmptyNote, ErrorNote, Loading, Tag } from '@/components/ui';
import { thDate } from '@/format';
import { colors, spacing } from '@/theme';

/**
 * Firm Owner's on-hold queue: work parked waiting on someone else, sorted by
 * next follow-up. Resuming/closing a hold stays on web; this screen is for
 * spotting stalls from the road.
 */
export default function OperationsScreen() {
  const router = useRouter();
  const onhold = useOnHoldTasks();

  if (onhold.isLoading) return <Loading />;

  if (onhold.isError) {
    const forbidden = onhold.error instanceof ApiError && onhold.error.status === 403;
    return (
      <View style={{ padding: spacing.lg }}>
        <ErrorNote
          message={
            forbidden
              ? 'หน้านี้สำหรับ Firm Owner เท่านั้น'
              : 'โหลดงานพักไว้ไม่สำเร็จ'
          }
          onRetry={forbidden ? undefined : () => onhold.refetch()}
        />
      </View>
    );
  }

  const overdueFollowUps = (onhold.data ?? []).filter(
    (item) => item.nextFollowUpAt && new Date(item.nextFollowUpAt) < new Date(),
  ).length;

  return (
    <View style={styles.screen}>
      <FlatList
        data={onhold.data ?? []}
        keyExtractor={(item) => item.taskId}
        contentContainerStyle={{ padding: spacing.lg }}
        refreshing={onhold.isRefetching}
        onRefresh={() => onhold.refetch()}
        ListHeaderComponent={
          overdueFollowUps > 0 ? (
            <View style={{ marginBottom: spacing.sm }}>
              <Tag tone="due">{overdueFollowUps} รายการเลยกำหนดติดตาม</Tag>
            </View>
          ) : null
        }
        renderItem={({ item }) => {
          const overdue =
            item.nextFollowUpAt && new Date(item.nextFollowUpAt) < new Date();
          return (
            <Pressable
              disabled={!item.caseId}
              onPress={() => item.caseId && router.push(`/case/${item.caseId}`)}
              style={({ pressed }) => pressed && { opacity: 0.7 }}
            >
              <Card style={{ marginBottom: spacing.sm }}>
                <View style={styles.row}>
                  <PauseCircle size={16} color={colors.muted} />
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={styles.title} numberOfLines={2}>
                      {item.taskTitle}
                    </Text>
                    {item.reason ? (
                      <Text style={styles.reason} numberOfLines={2}>
                        รอ: {item.reason}
                      </Text>
                    ) : null}
                    <Text style={styles.meta} numberOfLines={1}>
                      {[item.caseOwnRef, item.assigneeName, item.followerName]
                        .filter(Boolean)
                        .join(' · ')}
                    </Text>
                  </View>
                  {item.nextFollowUpAt ? (
                    <Tag tone={overdue ? 'due' : 'plain'}>
                      ติดตาม {thDate(item.nextFollowUpAt)}
                    </Tag>
                  ) : null}
                </View>
              </Card>
            </Pressable>
          );
        }}
        ListEmptyComponent={<EmptyNote>ไม่มีงานพักไว้ 🎉</EmptyNote>}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  title: { fontSize: 14, fontWeight: '600', color: colors.text },
  reason: { fontSize: 12, color: colors.muted },
  meta: { fontSize: 12, color: colors.faint },
});

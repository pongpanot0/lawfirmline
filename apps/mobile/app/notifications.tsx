import React from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/components/AppText';
import { useRouter } from 'expo-router';
import {
  BellRing,
  CalendarClock,
  FileSearch,
  Inbox,
  PauseCircle,
  UserX,
} from 'lucide-react-native';
import { useActions, useTodos, type ActionItem } from '@/api/hooks';
import { actionAppRoute } from '@/workflow';
import { Card, EmptyNote, ErrorNote, Loading, Tag, TagTone } from '@/components/ui';
import { thDate } from '@/format';
import { colors, spacing, pageContent } from '@/theme';

const KIND_META: Record<
  string,
  { label: string; tone: TagTone; Icon: React.ComponentType<{ size?: number; color?: string }> }
> = {
  ACKNOWLEDGEMENT: { label: 'นัดเปลี่ยน — รอรับทราบ', tone: 'due', Icon: BellRing },
  UNASSIGNED: { label: 'ยังไม่มีผู้รับผิดชอบ', tone: 'due', Icon: UserX },
  WAITING: { label: 'งานพักไว้ — รอติดตาม', tone: 'plain', Icon: PauseCircle },
  DATE_REVIEW: { label: 'วันที่รอยืนยัน', tone: 'court', Icon: CalendarClock },
  DOCUMENT_REVIEW: { label: 'เอกสารรอรีวิว', tone: 'info', Icon: FileSearch },
  CLIENT_DRAFT: { label: 'ร่างอีเมลรอส่ง', tone: 'info', Icon: Inbox },
  TASK_REVIEW: { label: 'งานรอคุณตรวจ', tone: 'info', Icon: FileSearch },
};

export default function NotificationsScreen() {
  const router = useRouter();
  const actions = useActions();
  const reviews = useTodos('review');
  const reviewIds = new Set((reviews.data ?? []).map(task => `task:${task.id}`));
  const items: ActionItem[] = [
    ...(reviews.data ?? []).map(task => ({ id: `task:${task.id}`, kind: 'TASK_REVIEW', title: task.title,
      detail: task.comments?.[0]?.body ?? null, caseRef: task.case?.ownRef ?? null,
      owner: null, dueAt: task.dueDate, url: '' })),
    ...(actions.data?.items ?? []).filter(item => !reviewIds.has(item.id)),
  ];

  if (actions.isLoading) return <Loading />;

  return (
    <View style={styles.screen}>
      {actions.isError ? (
        <View style={{ padding: spacing.lg }}>
          <ErrorNote message="โหลดการแจ้งเตือนไม่สำเร็จ" onRetry={() => actions.refetch()} />
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          contentContainerStyle={pageContent}
          refreshing={actions.isRefetching || reviews.isRefetching}
          onRefresh={() => { actions.refetch(); reviews.refetch(); }}
          ListHeaderComponent={reviews.isError
            ? <ErrorNote message="โหลดงานรอตรวจไม่ได้" onRetry={() => reviews.refetch()} />
            : actions.data?.limited ? <Text style={styles.detail}>แสดงรายการบางส่วน · เปิดคดีเพื่อดูรายการทั้งหมด</Text> : null}
          renderItem={({ item }) => {
            const meta = KIND_META[item.kind] ?? {
              label: item.kind,
              tone: 'plain' as TagTone,
              Icon: Inbox,
            };
            const route = actionAppRoute(item);
            return (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`เปิด ${item.title}`}
                disabled={!route}
                onPress={() => route && router.push(route as never)}
                style={({ pressed }) => pressed && { opacity: 0.7 }}
              >
                <Card style={{ marginBottom: spacing.md }}>
                  <View style={styles.row}>
                    <meta.Icon size={17} color={colors.muted} />
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text style={styles.title} numberOfLines={2}>
                        {item.title}
                      </Text>
                      {item.detail ? (
                        <Text style={styles.detail} numberOfLines={2}>
                          {item.detail}
                        </Text>
                      ) : null}
                      <Text style={styles.meta} numberOfLines={1}>
                        {[item.caseRef, item.owner, item.dueAt ? thDate(item.dueAt) : null]
                          .filter(Boolean)
                          .join(' · ')}
                      </Text>
                    </View>
                    <Tag tone={meta.tone}>{meta.label}</Tag>
                  </View>
                </Card>
              </Pressable>
            );
          }}
          ListEmptyComponent={reviews.isLoading ? <Loading /> : !reviews.isError ? <EmptyNote>ไม่มีเรื่องรอจัดการ</EmptyNote> : null}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  row: { flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' },
  title: { color: colors.text, fontWeight: '600', fontSize: 14 },
  detail: { color: colors.muted, fontSize: 12 },
  meta: { color: colors.faint, fontSize: 12 },
});

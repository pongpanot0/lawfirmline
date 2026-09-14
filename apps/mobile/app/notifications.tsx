import React from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import {
  BellRing,
  CalendarClock,
  FileSearch,
  Inbox,
  PauseCircle,
  UserX,
} from 'lucide-react-native';
import { useActions, type ActionItem } from '@/api/hooks';
import { Card, EmptyNote, ErrorNote, Loading, Tag, TagTone } from '@/components/ui';
import { thDate } from '@/format';
import { colors, spacing } from '@/theme';

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
};

/** The web url in an action item maps onto the app's own case route. */
function appRoute(item: ActionItem): string | null {
  const match = item.url.match(/^\/cases\/([0-9a-f-]{36})/i);
  return match ? `/case/${match[1]}` : null;
}

export default function NotificationsScreen() {
  const router = useRouter();
  const actions = useActions();

  if (actions.isLoading) return <Loading />;

  return (
    <View style={styles.screen}>
      {actions.isError ? (
        <View style={{ padding: spacing.lg }}>
          <ErrorNote message="โหลดการแจ้งเตือนไม่สำเร็จ" onRetry={() => actions.refetch()} />
        </View>
      ) : (
        <FlatList
          data={actions.data?.items ?? []}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: spacing.lg }}
          refreshing={actions.isRefetching}
          onRefresh={() => actions.refetch()}
          renderItem={({ item }) => {
            const meta = KIND_META[item.kind] ?? {
              label: item.kind,
              tone: 'plain' as TagTone,
              Icon: Inbox,
            };
            const route = appRoute(item);
            return (
              <Pressable
                disabled={!route}
                onPress={() => route && router.push(route as never)}
                style={({ pressed }) => pressed && { opacity: 0.7 }}
              >
                <Card style={{ marginBottom: spacing.sm }}>
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
          ListEmptyComponent={<EmptyNote>ไม่มีเรื่องรอจัดการ 🎉</EmptyNote>}
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

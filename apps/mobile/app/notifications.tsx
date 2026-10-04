import React, { useState } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/components/AppText';
import { Stack, useRouter } from 'expo-router';
import {
  BellRing,
  CalendarClock,
  FileSearch,
  Inbox,
  PauseCircle,
  Settings2,
  UserX,
} from 'lucide-react-native';
import {
  useActions,
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useNotificationInbox,
  useTodos,
  useUnreadNotifications,
  type ActionItem,
} from '@/api/hooks';
import type { AppNotification } from '@/api/types';
import { actionAppRoute } from '@/workflow';
import { CATEGORY_META } from '@/notification-categories';
import { Card, EmptyNote, ErrorNote, Loading, PageIntro, Tag, TagTone } from '@/components/ui';
import { thDate, timeAgo } from '@/format';
import { colors, spacing, pageContent, TOUCH } from '@/theme';

type IconType = React.ComponentType<{ size?: number; color?: string }>;

const KIND_META: Record<string, { label: string; tone: TagTone; Icon: IconType }> = {
  ACKNOWLEDGEMENT: { label: 'นัดเปลี่ยน — รอรับทราบ', tone: 'due', Icon: BellRing },
  UNASSIGNED: { label: 'ยังไม่มีผู้รับผิดชอบ', tone: 'due', Icon: UserX },
  WAITING: { label: 'งานพักไว้ — รอติดตาม', tone: 'plain', Icon: PauseCircle },
  DATE_REVIEW: { label: 'วันที่รอยืนยัน', tone: 'court', Icon: CalendarClock },
  DOCUMENT_REVIEW: { label: 'เอกสารรอรีวิว', tone: 'info', Icon: FileSearch },
  CLIENT_DRAFT: { label: 'ร่างอีเมลรอส่ง', tone: 'info', Icon: Inbox },
  TASK_REVIEW: { label: 'งานรอคุณตรวจ', tone: 'info', Icon: FileSearch },
};

type Tab = 'inbox' | 'pending';

export default function NotificationsScreen() {
  const router = useRouter();
  const [view, setView] = useState<Tab>('inbox');
  const unread = useUnreadNotifications();
  const markAll = useMarkAllNotificationsRead();
  const actions = useActions();
  const reviews = useTodos('review');
  const pending = pendingItems(actions.data?.items ?? [], reviews.data ?? []);

  return (
    <View style={styles.screen}>
      <View style={{ ...pageContent, paddingBottom: 0 }}><PageIntro title="ข่าวล่าสุดและเรื่องรอจัดการ" detail="งาน นัดหมาย และข้อความที่ส่งถึงคุณ" /></View>
      <Stack.Screen options={{
        headerRight: () => <View style={styles.headerActions}>
          {view === 'inbox' && (unread.data ?? 0) > 0 ? <Pressable accessibilityRole="button" hitSlop={8}
            disabled={markAll.isPending} onPress={() => markAll.mutate()}>
            <Text style={{ color: colors.info, fontWeight: '600' }}>อ่านทั้งหมด</Text>
          </Pressable> : null}
          <Pressable accessibilityRole="button" accessibilityLabel="ตั้งค่าการแจ้งเตือน" hitSlop={8} onPress={() => router.push('/settings')}>
            <Settings2 size={20} color={colors.ink} />
          </Pressable>
        </View>,
      }} />
      <View style={styles.tabs}>
        {([['inbox', `ล่าสุด${unread.data ? ` (${unread.data})` : ''}`], ['pending', `รอจัดการ${pending.length ? ` (${pending.length})` : ''}`]] as const)
          .map(([value, label]) => <Pressable key={value} accessibilityRole="tab" accessibilityState={{ selected: view === value }}
            onPress={() => setView(value)} style={[styles.chip, view === value && styles.chipActive]}>
            <Text style={{ color: view === value ? colors.info : colors.muted, fontWeight: '600' }}>{label}</Text>
          </Pressable>)}
      </View>
      {view === 'inbox' ? <InboxList /> : <PendingList items={pending} />}
    </View>
  );
}

function InboxList() {
  const router = useRouter();
  const inbox = useNotificationInbox();
  const markRead = useMarkNotificationRead();
  const items = inbox.data?.pages.flatMap((page) => page.items) ?? [];

  if (inbox.isLoading) return <Loading />;
  if (inbox.isError && !items.length) {
    return <View style={{ padding: spacing.lg }}><ErrorNote message="โหลดการแจ้งเตือนไม่สำเร็จ" onRetry={() => inbox.refetch()} /></View>;
  }

  const open = (item: AppNotification) => {
    if (!item.readAt) markRead.mutate(item.id);
    if (item.appPath) router.push(item.appPath as never);
  };

  return (
    <FlatList
      data={items}
      keyExtractor={(item) => item.id}
      contentContainerStyle={pageContent}
      refreshing={inbox.isRefetching && !inbox.isFetchingNextPage}
      onRefresh={() => inbox.refetch()}
      onEndReachedThreshold={0.4}
      onEndReached={() => { if (inbox.hasNextPage && !inbox.isFetchingNextPage) inbox.fetchNextPage(); }}
      ListFooterComponent={inbox.isFetchingNextPage ? <Loading /> : null}
      ListEmptyComponent={<EmptyNote>ยังไม่มีการแจ้งเตือน · งานที่ได้รับมอบหมาย นัดหมาย และข้อความจากลูกความจะมาอยู่ที่นี่</EmptyNote>}
      renderItem={({ item }) => {
        const meta = CATEGORY_META[item.category] ?? { label: '', Icon: Inbox };
        const unreadRow = !item.readAt;
        return (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${unreadRow ? 'ยังไม่อ่าน ' : ''}${item.title}`}
            onPress={() => open(item)}
            style={({ pressed }) => pressed && { opacity: 0.7 }}
          >
            <Card style={unreadRow ? [styles.inboxCard, styles.unreadCard] : styles.inboxCard}>
              <View style={styles.row}>
                <meta.Icon size={17} color={unreadRow ? colors.info : colors.muted} />
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={[styles.title, !unreadRow && { fontWeight: '400', color: colors.muted }]} numberOfLines={2}>
                    {item.title}
                  </Text>
                  {item.body ? <Text style={styles.detail} numberOfLines={3}>{item.body}</Text> : null}
                  <Text style={styles.meta} numberOfLines={1}>{meta.label} · {timeAgo(item.createdAt)}</Text>
                </View>
                {unreadRow ? <View style={styles.dot} accessibilityElementsHidden /> : null}
              </View>
            </Card>
          </Pressable>
        );
      }}
    />
  );
}

/** Live "waiting on someone" queue: actions plus tasks awaiting my review, without duplicates. */
function pendingItems(actions: ActionItem[], reviews: NonNullable<ReturnType<typeof useTodos>['data']>): ActionItem[] {
  const reviewIds = new Set(reviews.map(task => `task:${task.id}`));
  return [
    ...reviews.map(task => ({ id: `task:${task.id}`, kind: 'TASK_REVIEW', title: task.title,
      detail: task.comments?.[0]?.body ?? null, caseRef: task.case?.ownRef ?? null,
      owner: null, dueAt: task.dueDate, url: '' })),
    ...actions.filter(item => !reviewIds.has(item.id)),
  ];
}

function PendingList({ items }: { items: ActionItem[] }) {
  const router = useRouter();
  const actions = useActions();
  const reviews = useTodos('review');

  if (actions.isLoading) return <Loading />;

  return actions.isError ? (
    <View style={{ padding: spacing.lg }}>
      <ErrorNote message="โหลดรายการรอจัดการไม่สำเร็จ" onRetry={() => actions.refetch()} />
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
        const meta = KIND_META[item.kind] ?? { label: item.kind, tone: 'plain' as TagTone, Icon: Inbox };
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
                  <Text style={styles.title} numberOfLines={2}>{item.title}</Text>
                  <Tag tone={meta.tone}>{meta.label}</Tag>
                  {item.detail ? <Text style={styles.detail} numberOfLines={2}>{item.detail}</Text> : null}
                  <Text style={styles.meta} numberOfLines={1}>
                    {[item.caseRef, item.owner, item.dueAt ? thDate(item.dueAt) : null].filter(Boolean).join(' · ')}
                  </Text>
                </View>
              </View>
            </Card>
          </Pressable>
        );
      }}
      ListEmptyComponent={reviews.isLoading ? <Loading /> : !reviews.isError ? <EmptyNote>ไม่มีเรื่องรอจัดการ</EmptyNote> : null}
    />
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg },
  tabs: { flexDirection: 'row', gap: spacing.sm, paddingHorizontal: spacing.lg, paddingTop: spacing.md },
  chip: { minHeight: TOUCH, justifyContent: 'center', paddingHorizontal: spacing.md, borderRadius: 8, backgroundColor: colors.soft },
  chipActive: { backgroundColor: colors.infoSoft, borderWidth: 1, borderColor: colors.ink },
  row: { flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' },
  inboxCard: { marginBottom: spacing.sm },
  unreadCard: { borderColor: colors.info, backgroundColor: colors.surface },
  dot: { width: 9, height: 9, borderRadius: 5, backgroundColor: colors.info, marginTop: 5 },
  title: { color: colors.text, fontWeight: '600', fontSize: 14 },
  detail: { color: colors.muted, fontSize: 12 },
  meta: { color: colors.faint, fontSize: 12 },
});

import React, { useState } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/components/AppText';
import { Stack, useRouter } from 'expo-router';
import {
  BellRing,
  CalendarClock,
  ChevronRight,
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
import { Card, EmptyState, ErrorState, FilterTabs, InlineError, LoadingState, Tag, TagTone } from '@/components/ui';
import { thDate, timeAgo } from '@/format';
import { CHROME_MAX_SCALE, colors, radius, spacing, pageContent, TOUCH } from '@/theme';

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
      <Stack.Screen options={{
        headerRight: () => <View style={styles.headerActions}>
          {view === 'inbox' && (unread.data ?? 0) > 0 ? <Pressable accessibilityRole="button" accessibilityLabel="ทำเครื่องหมายอ่านทั้งหมด"
            accessibilityState={{ disabled: markAll.isPending }} disabled={markAll.isPending} onPress={() => markAll.mutate()}
            style={({ pressed }) => [styles.headerAction, pressed && { opacity: 0.6 }]}>
            <Text maxFontSizeMultiplier={CHROME_MAX_SCALE} style={{ color: colors.info, fontWeight: '600' }}>อ่านทั้งหมด</Text>
          </Pressable> : null}
          <Pressable accessibilityRole="button" accessibilityLabel="ตั้งค่าการแจ้งเตือน" onPress={() => router.push('/settings')}
            style={({ pressed }) => [styles.headerAction, pressed && { opacity: 0.6 }]}>
            <Settings2 size={20} color={colors.ink} />
          </Pressable>
        </View>,
      }} />
      {/* The native header already names the screen; the tabs sit directly under it. */}
      <View style={styles.tabs}>
        <FilterTabs value={view} onChange={value => setView(value as Tab)} items={[
          { value: 'inbox', label: `ล่าสุด${unread.data ? ` (${unread.data})` : ''}` },
          { value: 'pending', label: `รอจัดการ${pending.length ? ` (${pending.length})` : ''}` },
        ]} />
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

  if (inbox.isLoading) return <LoadingState label="กำลังโหลดการแจ้งเตือน…" />;
  if (inbox.isError && !items.length) {
    return <View style={{ padding: spacing.lg }}><ErrorState message="โหลดการแจ้งเตือนไม่สำเร็จ" onRetry={() => inbox.refetch()} /></View>;
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
      ListFooterComponent={inbox.isFetchingNextPage ? <LoadingState inline label="กำลังโหลดเพิ่ม…" /> : null}
      ListHeaderComponent={inbox.isError ? <InlineError style={{ marginBottom: spacing.md }} message="รายการอาจยังไม่ล่าสุด" onRetry={() => inbox.refetch()} /> : null}
      ListEmptyComponent={<EmptyState icon={BellRing}>ยังไม่มีการแจ้งเตือน · งานที่ได้รับมอบหมาย นัดหมาย และข้อความจากลูกความจะมาอยู่ที่นี่</EmptyState>}
      renderItem={({ item }) => {
        const meta = CATEGORY_META[item.category] ?? { label: '', Icon: Inbox };
        const unreadRow = !item.readAt;
        // Only a notification with somewhere to go gets a chevron; others just mark themselves read.
        const linked = !!item.appPath;
        const body = <Card flat={!unreadRow} style={unreadRow ? [styles.inboxCard, styles.unreadCard] : styles.inboxCard}>
          <View style={styles.row}>
            <View style={[styles.iconTile, unreadRow && { backgroundColor: colors.infoSoft }]}>
              <meta.Icon size={18} color={unreadRow ? colors.info : colors.muted} />
            </View>
            <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
              <Text style={[styles.title, !unreadRow && { fontWeight: '400', color: colors.muted }]} numberOfLines={2}>
                {item.title}
              </Text>
              {item.body ? <Text style={styles.detail} numberOfLines={3}>{item.body}</Text> : null}
              <Text style={styles.meta} numberOfLines={1}>{[meta.label, timeAgo(item.createdAt)].filter(Boolean).join(' · ')}</Text>
            </View>
            {unreadRow ? <View style={styles.dot} accessibilityElementsHidden /> : null}
            {linked ? <ChevronRight size={18} color={colors.faint} /> : null}
          </View>
        </Card>;
        if (!linked && !unreadRow) return <View accessible accessibilityLabel={item.title}>{body}</View>;
        return (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${unreadRow ? 'ยังไม่อ่าน ' : ''}${item.title}`}
            accessibilityHint={linked ? 'เปิดรายละเอียด' : 'ทำเครื่องหมายว่าอ่านแล้ว'}
            onPress={() => open(item)}
            style={({ pressed }) => pressed && { opacity: 0.7 }}
          >
            {body}
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

  if (actions.isLoading) return <LoadingState label="กำลังโหลดเรื่องรอจัดการ…" />;

  return actions.isError ? (
    <View style={{ padding: spacing.lg }}>
      <ErrorState message="โหลดรายการรอจัดการไม่สำเร็จ" onRetry={() => actions.refetch()} />
    </View>
  ) : (
    <FlatList
      data={items}
      keyExtractor={(item) => item.id}
      contentContainerStyle={pageContent}
      refreshing={actions.isRefetching || reviews.isRefetching}
      onRefresh={() => { actions.refetch(); reviews.refetch(); }}
      ListHeaderComponent={reviews.isError
        ? <InlineError style={{ marginBottom: spacing.md }} message="โหลดงานรอตรวจไม่ได้" onRetry={() => reviews.refetch()} />
        : actions.data?.limited ? <Text style={[styles.detail, { marginBottom: spacing.sm }]}>แสดงรายการบางส่วน · เปิดคดีเพื่อดูรายการทั้งหมด</Text> : null}
      renderItem={({ item }) => {
        const meta = KIND_META[item.kind] ?? { label: item.kind, tone: 'plain' as TagTone, Icon: Inbox };
        const route = actionAppRoute(item);
        const metaLine = [item.caseRef, item.owner, item.dueAt ? thDate(item.dueAt) : null].filter(Boolean).join(' · ');
        const body = <Card style={{ marginBottom: spacing.md }}>
          <View style={styles.row}>
            <View style={styles.iconTile}><meta.Icon size={18} color={colors.ink} /></View>
            <View style={{ flex: 1, minWidth: 0, gap: spacing.xs }}>
              <Text style={styles.title} numberOfLines={2}>{item.title}</Text>
              <Tag tone={meta.tone}>{meta.label}</Tag>
              {item.detail ? <Text style={styles.detail} numberOfLines={2}>{item.detail}</Text> : null}
              {metaLine ? <Text style={styles.meta} numberOfLines={1}>{metaLine}</Text> : null}
            </View>
            {route ? <ChevronRight size={18} color={colors.faint} /> : null}
          </View>
        </Card>;
        // A row without a route in the app reads as information, not as a dead button.
        if (!route) return <View accessible accessibilityLabel={`${meta.label} · ${item.title}`}>{body}</View>;
        return (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`เปิด ${item.title}`}
            onPress={() => router.push(route as never)}
            style={({ pressed }) => pressed && { opacity: 0.7 }}
          >
            {body}
          </Pressable>
        );
      }}
      ListEmptyComponent={reviews.isLoading ? <LoadingState label="กำลังโหลดงานรอตรวจ…" /> : !reviews.isError ? <EmptyState>ไม่มีเรื่องรอจัดการ</EmptyState> : null}
    />
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  headerActions: { flexDirection: 'row', alignItems: 'center' },
  headerAction: { minWidth: TOUCH, minHeight: TOUCH, paddingHorizontal: spacing.sm, alignItems: 'center', justifyContent: 'center' },
  tabs: { paddingHorizontal: spacing.lg, paddingTop: spacing.md },
  row: { flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' },
  iconTile: { width: 36, height: 36, borderRadius: radius.md, backgroundColor: colors.soft, alignItems: 'center', justifyContent: 'center' },
  inboxCard: { marginBottom: spacing.sm, paddingVertical: spacing.md },
  // Unread rows stay raised with an info edge; read rows sit flat so the new ones lead.
  unreadCard: { borderColor: colors.info, borderLeftWidth: 3, backgroundColor: colors.raised },
  dot: { width: 9, height: 9, borderRadius: radius.full, backgroundColor: colors.info, marginTop: 6 },
  title: { color: colors.text, fontWeight: '600', fontSize: 15, lineHeight: 22 },
  detail: { color: colors.muted, fontSize: 13, lineHeight: 20 },
  meta: { color: colors.faint, fontSize: 12, lineHeight: 18 },
});

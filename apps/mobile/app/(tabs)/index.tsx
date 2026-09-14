import React from 'react';
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import {
  BarChart3,
  Bell,
  BookOpen,
  Contact,
  FilePlus2,
  LayoutGrid,
  MapPin,
  Receipt,
} from 'lucide-react-native';
import { useAuth } from '@/api/auth';
import { useActions, useDashboardStats, useMyDay } from '@/api/hooks';
import type { AgendaItem } from '@/api/types';
import {
  Card,
  EmptyNote,
  ErrorNote,
  SectionLabel,
  StatCard,
  Tag,
  TagTone,
} from '@/components/ui';
import { thDateLong, thTime } from '@/format';
import { colors, fonts, spacing } from '@/theme';

// The most-used destinations from the "อื่นๆ" menu, surfaced one tap away.
const SHORTCUTS = [
  { route: '/intake/new', Icon: FilePlus2, label: 'รับเรื่อง' },
  { route: '/expenses', Icon: Receipt, label: 'ค่าใช้จ่าย' },
  { route: '/clients', Icon: Contact, label: 'ลูกความ' },
  { route: '/reports', Icon: BarChart3, label: 'รายงาน' },
  { route: '/knowledge', Icon: BookOpen, label: 'ความรู้' },
] as const;

const KIND_LABEL: Record<string, { label: string; tone: TagTone }> = {
  COURT_DATE: { label: 'นัดศาล', tone: 'court' },
  CLIENT_MEETING: { label: 'นัดลูกความ', tone: 'info' },
  DEADLINE: { label: 'ครบกำหนด', tone: 'due' },
  TASK: { label: 'งาน', tone: 'plain' },
  OTHER: { label: 'นัดหมาย', tone: 'plain' },
};

function AgendaRow({ item, onPress }: { item: AgendaItem; onPress?: () => void }) {
  const kind = KIND_LABEL[item.kind] ?? KIND_LABEL.OTHER;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => pressed && { opacity: 0.7 }}>
      <View style={styles.agendaRow}>
        <Text style={styles.agendaTime}>{item.allDay ? 'ทั้งวัน' : thTime(item.at)}</Text>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={styles.agendaTitle} numberOfLines={2}>
            {item.title}
          </Text>
          {item.caseRef ? (
            <Text style={styles.agendaCase} numberOfLines={1}>
              {item.caseRef}
              {item.caseTitle ? ` · ${item.caseTitle}` : ''}
            </Text>
          ) : null}
          {item.location ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <MapPin size={11} color={colors.faint} />
              <Text style={styles.agendaCase} numberOfLines={1}>
                {item.location}
              </Text>
            </View>
          ) : null}
        </View>
        <Tag tone={kind.tone}>{kind.label}</Tag>
      </View>
    </Pressable>
  );
}

export default function MyDayScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const myDay = useMyDay();
  const stats = useDashboardStats();
  const actions = useActions();
  const pendingActions = actions.data?.items.length ?? 0;

  const openItem = (item: AgendaItem) => {
    if (item.kind === 'COURT_DATE') router.push(`/court-day/${item.entityId}`);
    else if (item.caseId) router.push(`/case/${item.caseId}`);
  };

  const courtToday =
    myDay.data?.todayItems.filter((item) => item.kind === 'COURT_DATE') ?? [];
  const otherToday =
    myDay.data?.todayItems.filter((item) => item.kind !== 'COURT_DATE') ?? [];

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={{ padding: spacing.lg, paddingBottom: 40 }}
      refreshControl={
        <RefreshControl
          refreshing={myDay.isRefetching}
          onRefresh={() => {
            myDay.refetch();
            stats.refetch();
          }}
        />
      }
    >
      <View style={styles.headerRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.hello}>สวัสดี คุณ{user?.firstName ?? ''}</Text>
          <Text style={styles.date}>{thDateLong(new Date())}</Text>
        </View>
        <Pressable style={styles.bell} hitSlop={8} onPress={() => router.push('/more')}>
          <LayoutGrid size={19} color={colors.ink} />
        </Pressable>
        <Pressable
          style={styles.bell}
          hitSlop={8}
          onPress={() => router.push('/notifications')}
        >
          <Bell size={20} color={colors.ink} />
          {pendingActions > 0 ? (
            <View style={styles.bellBadge}>
              <Text style={styles.bellBadgeText}>
                {pendingActions > 99 ? '99+' : pendingActions}
              </Text>
            </View>
          ) : null}
        </Pressable>
      </View>

      <View style={styles.statRow}>
        <StatCard label="นัดวันนี้" value={courtToday.length} />
        <StatCard
          label="เกินกำหนด"
          value={myDay.data?.overdue.length ?? '—'}
          tone="warn"
        />
        <StatCard label="คดีเปิด" value={stats.data?.stats.openCases ?? '—'} />
      </View>

      <View style={styles.shortcutRow}>
        {SHORTCUTS.map((shortcut) => (
          <Pressable
            key={shortcut.route}
            style={({ pressed }) => [styles.shortcut, pressed && { opacity: 0.7 }]}
            onPress={() => router.push(shortcut.route as never)}
          >
            <View style={styles.shortcutIcon}>
              <shortcut.Icon size={19} color={colors.accentInk} />
            </View>
            <Text style={styles.shortcutLabel} numberOfLines={1}>
              {shortcut.label}
            </Text>
          </Pressable>
        ))}
      </View>

      {myDay.isError ? (
        <View style={{ marginTop: spacing.lg }}>
          <ErrorNote
            message="โหลดข้อมูลวันนี้ไม่สำเร็จ — แสดงข้อมูลล่าสุดที่บันทึกไว้"
            onRetry={() => myDay.refetch()}
          />
        </View>
      ) : null}

      <SectionLabel>นัดศาลวันนี้</SectionLabel>
      <Card>
        {courtToday.length === 0 ? (
          <EmptyNote>วันนี้ไม่มีนัดศาล</EmptyNote>
        ) : (
          courtToday.map((item, index) => (
            <View key={item.id}>
              {index > 0 && <View style={styles.divider} />}
              <AgendaRow item={item} onPress={() => openItem(item)} />
            </View>
          ))
        )}
      </Card>

      <SectionLabel>งานและนัดอื่นวันนี้</SectionLabel>
      <Card>
        {otherToday.length === 0 ? (
          <EmptyNote>ไม่มีรายการอื่นของวันนี้</EmptyNote>
        ) : (
          otherToday.map((item, index) => (
            <View key={item.id}>
              {index > 0 && <View style={styles.divider} />}
              <AgendaRow item={item} onPress={() => openItem(item)} />
            </View>
          ))
        )}
      </Card>

      {(myDay.data?.overdue.length ?? 0) > 0 ? (
        <>
          <SectionLabel>เกินกำหนด</SectionLabel>
          <Card style={{ borderColor: colors.warnSoft }}>
            {myDay.data!.overdue.map((item, index) => (
              <View key={item.id}>
                {index > 0 && <View style={styles.divider} />}
                <AgendaRow item={item} onPress={() => openItem(item)} />
              </View>
            ))}
          </Card>
        </>
      ) : null}

      {(myDay.data?.warnings.length ?? 0) > 0 ? (
        <>
          <SectionLabel>คำเตือน</SectionLabel>
          <Card style={{ borderColor: colors.warnSoft }}>
            {myDay.data!.warnings.map((warning, index) => (
              <Text key={index} style={{ color: colors.warn, fontSize: 13 }}>
                {warning.message}
              </Text>
            ))}
          </Card>
        </>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  bell: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.soft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bellBadge: {
    position: 'absolute',
    top: 2,
    right: 0,
    minWidth: 17,
    height: 17,
    borderRadius: 9,
    backgroundColor: colors.warn,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
    borderWidth: 1.5,
    borderColor: colors.bg,
  },
  bellBadgeText: { color: '#fff', fontSize: 9, fontWeight: '700' },
  hello: { fontSize: 24, fontFamily: fonts.bold, color: colors.ink },
  date: { fontSize: 13, color: colors.muted, marginTop: 2 },
  statRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.lg },
  shortcutRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: spacing.md,
  },
  shortcut: { alignItems: 'center', gap: 4, flex: 1 },
  shortcutIcon: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shortcutLabel: { fontSize: 11, color: colors.muted, fontWeight: '600' },
  agendaRow: {
    flexDirection: 'row',
    gap: spacing.md,
    alignItems: 'flex-start',
    paddingVertical: spacing.sm,
  },
  agendaTime: {
    fontWeight: '700',
    color: colors.ink,
    fontVariant: ['tabular-nums'],
    width: 48,
    fontSize: 14,
  },
  agendaTitle: { color: colors.text, fontWeight: '600', fontSize: 14 },
  agendaCase: { color: colors.faint, fontSize: 12 },
  divider: { height: 1, backgroundColor: colors.soft },
});

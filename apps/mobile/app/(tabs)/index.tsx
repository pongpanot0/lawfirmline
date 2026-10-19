import React, { useCallback, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '@/components/AppText';
import { useFocusEffect, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  BarChart3,
  Bell,
  ChevronRight,
  BookOpen,
  Contact,
  FilePlus2,
  LayoutGrid,
  MapPin,
  Receipt,
  CalendarOff,
  Search,
  Mail,
} from 'lucide-react-native';
import { useAuth } from '@/api/auth';
import { listTaskDrafts, taskDraftScope } from '@/api/drafts';
import { useActions, useDashboardStats, useMyDay, useWorkload, useExpenseClaims, useLeaves, useCalendarRange, useTodos, useDailyWorkboard, usePendingLeaves, useOwnerFinance, useUnreadNotifications } from '@/api/hooks';
import { AgendaItemKind, AgendaUrgency, followUpReason, ownerDecisionTasks, assignmentCandidates, assignmentWarnings, canAssignFirmRole, FirmRole, hasFirmCapability, subscriptionAllowsWrites, TaskWorkType } from '@lawfirm/shared';
import { Disclosure } from '@/components/Disclosure';
import { OwnerFinanceSummary } from '@/components/OwnerFinanceSummary';
import type { AgendaItem } from '@/api/types';
import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  EVENT_KIND_LABEL,
  InlineError,
  LoadingState,
  SectionLabel,
  Tag,
  TagTone,
} from '@/components/ui';
import { bangkokDay, formatMoney, initials, thDateLong, thTime } from '@/format';
import { agendaIncludesPerson } from '@/workflow';
import { leaveFlagsForDate } from '@/lib/leave-flags';
import { CHROME_MAX_SCALE, colors, fonts, radius, shadow, spacing, typeScale, pageContent } from '@/theme';

// The most-used destinations from the "อื่นๆ" menu, surfaced one tap away.
const SHORTCUTS = [
  { route: '/search', Icon: Search, label: 'ค้นไฟล์' },
  { route: '/email-search', Icon: Mail, label: 'ค้นอีเมล' },
  { route: '/leaves', Icon: CalendarOff, label: 'ขอลา' },
  { route: '/case/new', Icon: FilePlus2, label: 'รับเคส' },
  { route: '/expenses', Icon: Receipt, label: 'ค่าใช้จ่าย' },
  { route: '/clients', Icon: Contact, label: 'ลูกความ' },
  { route: '/reports', Icon: BarChart3, label: 'รายงาน' },
  { route: '/knowledge', Icon: BookOpen, label: 'ความรู้' },
] as const;

/**
 * The whole row is one target (court → วันขึ้นศาล, other events → ทีมที่ไปด้วย, tasks → งาน). People are read here and
 * opened from "กำลังคนวันนี้" or the ทีม tab, so small name links nested in the row can no longer misroute a tap.
 */
function AgendaRow({ item, onPress, overdue = false }: { item: AgendaItem; onPress: () => void; overdue?: boolean }) {
  const kind = EVENT_KIND_LABEL[item.kind] ?? EVENT_KIND_LABEL.OTHER;
  const companions = (Array.isArray(item.assignees) ? item.assignees : []).filter((person) => person.id !== item.assigneeId);
  const when = item.allDay ? 'ทั้งวัน' : thTime(item.at);
  const people = [
    `หลัก: ${item.assigneeId ? item.assigneeName ?? 'ผู้รับผิดชอบ' : 'ยังไม่ระบุ'}`,
    ...(item.kind !== 'TASK' && companions.length ? [`ร่วม: ${companions.map(person => person.name).join(', ')}`] : []),
  ].join(' · ');
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${kind.label} ${when} ${item.title}${item.caseRef ? ` · ${item.caseRef}` : ''} · ${people}`}
      onPress={onPress} style={({ pressed }) => [styles.agendaRow, pressed && { backgroundColor: colors.soft }]}>
      <Text style={[styles.agendaTime, overdue && { color: colors.warn }]}>{when}</Text>
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <Text style={styles.agendaTitle} numberOfLines={2}>{item.title}</Text>
        {item.caseRef ? (
          <Text style={styles.agendaCase} numberOfLines={1}>
            {item.caseRef}
            {item.caseTitle ? ` · ${item.caseTitle}` : ''}
          </Text>
        ) : null}
        {item.location ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <MapPin size={12} color={colors.faint} />
            <Text style={styles.agendaCase} numberOfLines={1}>{item.location}</Text>
          </View>
        ) : null}
        <Text style={styles.agendaCase}>{people}</Text>
      </View>
      <View style={{ alignItems: 'flex-end', gap: spacing.xs }}>
        <Tag tone={kind.tone}>{kind.label}</Tag>
        <ChevronRight size={18} color={colors.faint} />
      </View>
    </Pressable>
  );
}

/** Non-zero facts only; an idle person reads as one plain sentence instead of four zeros. */
function DayTags({ items }: { items: Array<{ label: string; count: number | undefined; tone?: TagTone }> }) {
  const shown = items.filter(item => (item.count ?? 0) > 0);
  if (!shown.length) return <Text style={styles.personSummary}>ไม่มีนัดหรืองานวันนี้</Text>;
  return <View style={styles.tagRow}>{shown.map(item => <Tag key={item.label} tone={item.tone}>{`${item.label} ${item.count}`}</Tag>)}</View>;
}

export default function MyDayScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const myDay = useMyDay();
  const stats = useDashboardStats();
  const actions = useActions();
  const unread = useUnreadNotifications().data ?? 0;
  // One flag per API capability: office managers run operations, leave and invoices; expense approval and reviews stay with the owner.
  const owner = hasFirmCapability(user?.firmRole, 'runOperations');
  const canClaim = hasFirmCapability(user?.firmRole, 'approveExpenses'), canLeave = hasFirmCapability(user?.firmRole, 'approveLeave');
  const canFinance = hasFirmCapability(user?.firmRole, 'manageInvoices'), isOwner = user?.firmRole === FirmRole.OWNER;
  const workload = useWorkload(owner);
  const claims = useExpenseClaims(canClaim);
  const pendingLeaves = usePendingLeaves(canLeave);
  const finance = useOwnerFinance(canFinance);
  const today = bangkokDay(new Date().toISOString());
  const reviews = useTodos('review');
  const daily = useDailyWorkboard(today, owner);
  const peopleToday = daily.data && !daily.isError ? assignmentCandidates(daily.data.members, daily.data.tasks, TaskWorkType.GENERAL, today) : [];
  const decisions = daily.data && !daily.isError ? ownerDecisionTasks(daily.data.tasks, today) : [];
  // ponytail: recorded queues rank candidates; add confirmed work windows when the office records them.
  const assignmentPeople = peopleToday.filter(person => person.member.userId !== user?.id && !person.member.onLeave && person.configured && canAssignFirmRole(user!.firmRole as FirmRole, person.member.role as FirmRole)).slice(0, 2);
  const scope = user ? taskDraftScope(user) : null;
  const localDrafts = useQuery({ queryKey: ['local-task-drafts', scope], enabled: !!scope, networkMode: 'always',
    queryFn: () => scope ? listTaskDrafts(scope) : Promise.resolve([]) });
  const reloadDrafts = localDrafts.refetch;
  useFocusEffect(useCallback(() => { if (scope) void reloadDrafts(); }, [scope, reloadDrafts]));
  useFocusEffect(useCallback(() => {
    if (canLeave) void pendingLeaves.refetch();
    if (canClaim) void claims.refetch();
    if (isOwner) void reviews.refetch();
    if (owner) void daily.refetch();
    if (canFinance) void finance.refetch();
  }, [owner, canLeave, canClaim, canFinance, isOwner, pendingLeaves.refetch, claims.refetch, reviews.refetch, daily.refetch, finance.refetch]));
  const tasksToFollow = daily.data?.tasks.filter(task => task.assigneeId && followUpReason(task, today) !== null);
  const unassignedTasks = daily.data?.tasks.filter(task => !task.assigneeId && task.status !== 'DONE');
  const appointments = useCalendarRange(today, today);
  const leaves = useLeaves(today, today, owner);
  const [showAllPeople, setShowAllPeople] = useState(false);
  const leaveFlags = leaveFlagsForDate(leaves.data ?? [], today);
  const pendingActions = new Set([...(actions.data?.items ?? []).map(item => item.id), ...(reviews.data ?? []).map(task => `task:${task.id}`)]).size;

  const openItem = (item: AgendaItem) => {
    if (item.kind === 'COURT_DATE') router.push(`/court-day/${item.entityId}`);
    else if (item.kind !== 'TASK') router.push(`/event/${item.entityId}/team`);
    else router.push(`/task/new?id=${item.entityId}`);
  };
  const openPerson = (id: string) => router.push({ pathname: '/person/[id]', params: { id } });

  // The work queue omits finished appointments; today's calendar must keep them visible.
  const courtToday: AgendaItem[] = appointments.data ? appointments.data.map((event) => ({
    id: `event:${event.id}`, entityId: event.id, kind: event.type as AgendaItemKind,
    title: event.title, at: event.startAt, endAt: event.endAt,
    allDay: event.type === 'DEADLINE', urgency: AgendaUrgency.TODAY,
    caseId: event.caseId, caseRef: event.case?.ownRef ?? null, caseTitle: event.case?.title ?? null,
    location: event.courtName, departBy: null, url: `/calendar/events/${event.id}`,
    assigneeId: event.assigneeId, assigneeName: event.assignee ? `${event.assignee.firstName} ${event.assignee.lastName}` : null,
    assignees: (event.assignees ?? []).map((person) => ({ id: person.userId, name: `${person.user.firstName} ${person.user.lastName}` })),
  })).sort((a, b) => a.at.localeCompare(b.at)) : myDay.data?.todayItems.filter((item) => item.kind !== 'TASK') ?? [];
  const otherToday =
    myDay.data?.todayItems.filter((item) => item.kind === 'TASK') ?? [];
  const overdue = myDay.data?.overdue ?? [];
  const openCases = stats.data?.stats.openCases;
  const decisionTiles = [
    ...(isOwner ? [{ view: 'review', label: 'งานรอคุณตรวจ', count: reviews.isError ? undefined : reviews.data?.length }] : []),
    ...(canLeave ? [{ view: 'leave', label: 'ลารออนุมัติ', count: pendingLeaves.isError ? undefined : pendingLeaves.data?.length }] : []),
    ...(canClaim ? [{ view: 'claim', label: 'เบิกรออนุมัติ', count: claims.isError ? undefined : claims.data?.filter(item => item.status === 'PENDING').length }] : []),
  ];
  const taskViews = [
    { view: 'created', label: 'งานที่ฉันสร้าง', count: undefined as number | undefined },
    { view: 'review', label: 'รอฉันตรวจ', count: reviews.data?.length },
    ...(owner ? [{ view: 'follow-up', label: 'ต้องตาม', count: tasksToFollow?.length },
      { view: 'unassigned', label: 'ยังไม่มีคนรับ', count: unassignedTasks?.length }] : []),
  ];

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={pageContent}
      refreshControl={
        <RefreshControl
          refreshing={myDay.isRefetching}
          onRefresh={() => {
            myDay.refetch();
            stats.refetch();
            appointments.refetch();
            actions.refetch(); reviews.refetch();
            if (owner) { workload.refetch(); leaves.refetch(); daily.refetch(); }
            if (canClaim) claims.refetch();
            if (canLeave) pendingLeaves.refetch();
            if (canFinance) finance.refetch();
          }}
        />
      }
    >
      {/* No price, link or "renew on the web" here: App Store anti-steering. Owners get the billing link by email. */}
      {user?.subscriptionStatus && !subscriptionAllowsWrites(user.subscriptionStatus) ? (
        <InlineError style={{ marginBottom: spacing.md }} message="สำนักงานอยู่ในโหมดดูอย่างเดียว · การใช้งานหมดอายุแล้ว ยังเปิดดูคดีและเอกสารได้ แต่สร้างหรือแก้ไขข้อมูลไม่ได้" />
      ) : null}
      <View style={styles.headerRow}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text accessibilityRole="header" style={styles.hello}>สวัสดี คุณ{user?.firstName ?? ''}</Text>
          <Text style={styles.date}>{thDateLong(new Date())}{openCases ? ` · คดีเปิด ${openCases}` : ''}</Text>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="เมนูเพิ่มเติม" style={styles.bell} hitSlop={8} onPress={() => router.push('/more')}>
          <LayoutGrid size={19} color={colors.surface} />
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={unread ? `การแจ้งเตือน ยังไม่อ่าน ${unread} รายการ` : pendingActions ? `การแจ้งเตือน รอจัดการ ${pendingActions} เรื่อง` : 'การแจ้งเตือน'}
          style={styles.bell}
          hitSlop={8}
          onPress={() => router.push('/notifications')}
        >
          <Bell size={20} color={colors.surface} />
          {/* The number is unread news; a bare dot means only the waiting queue has items. */}
          {unread > 0 ? (
            <View style={styles.bellBadge}>
              <Text maxFontSizeMultiplier={CHROME_MAX_SCALE} style={styles.bellBadgeText}>
                {unread > 99 ? '99+' : unread}
              </Text>
            </View>
          ) : pendingActions > 0 ? <View style={styles.bellDot} /> : null}
        </Pressable>
      </View>

      {/* Shortcuts stay one tap away under the greeting without pushing today's work down. */}
      <Disclosure variant="plain" title="ทางลัด" summary="ค้นไฟล์ · ค้นอีเมล · ขอลา · รับเคส · ค่าใช้จ่าย · อื่น ๆ">
        <View style={styles.shortcutRow}>
          {SHORTCUTS.map((shortcut) => (
            <Pressable
              key={shortcut.route}
              accessibilityRole="button"
              accessibilityLabel={shortcut.label}
              style={({ pressed }) => [styles.shortcut, pressed && { opacity: 0.7 }]}
              onPress={() => router.push(shortcut.route as never)}
            >
              <View style={styles.shortcutIcon}>
                <shortcut.Icon size={19} color={colors.info} />
              </View>
              <Text maxFontSizeMultiplier={CHROME_MAX_SCALE} style={styles.shortcutLabel} numberOfLines={1}>
                {shortcut.label}
              </Text>
            </Pressable>
          ))}
        </View>
      </Disclosure>

      {/* With nothing cached the failure is the whole story; with cached data it is a one-line note above it. */}
      {myDay.isError ? (
        <View style={{ marginTop: spacing.md }}>
          {myDay.data ? (
            <InlineError message="โหลดข้อมูลวันนี้ไม่สำเร็จ — แสดงข้อมูลล่าสุดที่บันทึกไว้" onRetry={() => myDay.refetch()} />
          ) : (
            <ErrorState message="โหลดข้อมูลวันนี้ไม่สำเร็จ — แสดงข้อมูลล่าสุดที่บันทึกไว้" onRetry={() => myDay.refetch()} />
          )}
        </View>
      ) : null}

      {/* Overdue work comes first: it is the one thing on this screen that is already late. */}
      {overdue.length > 0 ? (
        <>
          <View style={styles.overdueHead}>
            <AlertTriangle size={18} color={colors.warn} />
            <SectionLabel style={{ marginTop: 0, marginBottom: 0, color: colors.warn }}>{`เกินกำหนด · ${overdue.length}`}</SectionLabel>
          </View>
          <Card style={styles.overdueCard}>
            {overdue.map((item, index) => (
              <View key={item.id}>
                {index > 0 && <View style={styles.divider} />}
                <AgendaRow overdue item={item} onPress={() => openItem(item)} />
              </View>
            ))}
          </Card>
        </>
      ) : null}

      {(myDay.data?.warnings.length ?? 0) > 0 ? (
        <>
          <SectionLabel>คำเตือน</SectionLabel>
          <Card style={styles.warningCard}>
            {myDay.data!.warnings.map((warning, index) => (
              <Text key={index} style={{ color: colors.warn, fontSize: 14, lineHeight: 22 }}>
                {warning.message}
              </Text>
            ))}
          </Card>
        </>
      ) : null}

      {decisionTiles.length > 0 && <>
        <SectionLabel>คิวตัดสินใจวันนี้</SectionLabel>
        {/* Each tile is the link to its queue, so no separate "ดูทั้งหมด" row repeats them. */}
        <View style={styles.tileRow}>{decisionTiles.map(item =>
          <Pressable key={item.view} accessibilityRole="button"
            accessibilityLabel={`${item.label} ${item.count === undefined ? 'ยังโหลดไม่ได้' : `${item.count} รายการ`}`} accessibilityHint="เปิดรายการ"
            style={({ pressed }) => [styles.decisionTile, !!item.count && styles.decisionTileActive, pressed && { backgroundColor: colors.soft }]}
            onPress={() => router.push(`/owner-decisions?view=${item.view}`)}>
            <View style={styles.decisionHead}>
              <Text style={styles.tileLabel}>{item.label}</Text>
              <ChevronRight size={16} color={colors.muted} />
            </View>
            <Text style={[styles.tileValue, { color: item.count ? colors.ink : colors.muted }]}>{item.count ?? '—'}</Text>
          </Pressable>)}</View>
        {(isOwner && reviews.isError) || (canLeave && pendingLeaves.isError) || (canClaim && claims.isError) ? <View style={{ gap: spacing.sm, marginTop: spacing.sm }}>
          {isOwner && reviews.isError && <InlineError message="โหลดงานรอตรวจไม่ได้" onRetry={() => reviews.refetch()} />}
          {canLeave && pendingLeaves.isError && <InlineError message="โหลดลารออนุมัติไม่ได้" onRetry={() => pendingLeaves.refetch()} />}
          {canClaim && claims.isError && <InlineError message="โหลดชุดเบิกไม่ได้" onRetry={() => claims.refetch()} />}
        </View> : null}
      </>}
      {canFinance && <>
        <Disclosure title="เงินสำนักงาน" summary={finance.data ? `ลูกหนี้ ${formatMoney(finance.data.totals.receivable)} ฿ · ดูรายการ` : 'ลูกหนี้และรายการที่ต้องตาม'}>
          <View style={{ gap: spacing.sm }}>
            {finance.isError && <InlineError message="โหลดข้อมูลการเงินล่าสุดไม่ได้" onRetry={() => finance.refetch()} />}
            <OwnerFinanceSummary data={finance.data} onOpen={view => router.push(`/owner-finance?view=${view}`)} />
          </View>
        </Disclosure>
      </>}
      {owner && (decisions.length > 0 || daily.isLoading || daily.isError) && <>
        <SectionLabel>งานที่ต้องเข้าไปช่วย</SectionLabel>
        <Card style={{ paddingVertical: spacing.xs }}>
          {daily.isError ? <View style={{ paddingVertical: spacing.sm }}><InlineError message="ยังตรวจงานทีมล่าสุดไม่ได้" onRetry={() => daily.refetch()} /></View>
            : daily.isLoading ? <LoadingState inline label="กำลังตรวจงานทีม…" />
              : decisions.slice(0, 4).map(({ task, reason }, index) => <View key={task.id}>
                {index > 0 && <View style={styles.divider} />}
                <Pressable accessibilityRole="button" accessibilityLabel={`${task.title} · ${reason}`}
                  style={({ pressed }) => [styles.linkRow, pressed && { backgroundColor: colors.soft }]} onPress={() => router.push(`/task/new?id=${task.id}`)}>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.rowTitle}>{task.title}</Text>
                    <Text style={styles.rowWarn}>{reason}</Text>
                  </View>
                  <ChevronRight size={18} color={colors.faint} />
                </Pressable>
              </View>)}
          {decisions.length > 4 && <Button variant="link" title={`เปิดคิวติดตามทั้งหมด · ${decisions.length} เรื่อง`}
            onPress={() => router.push({ pathname: '/(tabs)/tasks', params: { view: 'follow-up' } })} />}
        </Card>
      </>}

      <SectionLabel>งานที่ต้องจัดการ</SectionLabel>
      <Card style={{ gap: spacing.sm }}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
          {/* A count appears only once it is known and above zero, so no chip reads "· —" or "· 0". */}
          {taskViews.map(item => <Pressable key={item.view} accessibilityRole="button"
            accessibilityLabel={item.count ? `${item.label} ${item.count} งาน` : item.label}
            style={({ pressed }) => [styles.viewChip, pressed && { opacity: 0.7 }]}
            onPress={() => router.push({ pathname: '/(tabs)/tasks', params: { view: item.view } })}>
            <Text maxFontSizeMultiplier={CHROME_MAX_SCALE} style={styles.viewChipText}>{item.label}{item.count ? ` · ${item.count}` : ''}</Text>
          </Pressable>)}
        </View>
        {!isOwner && reviews.isError && <InlineError message="โหลดงานรอตรวจไม่ได้" onRetry={() => reviews.refetch()} />}
        {(!owner ? reviews.data ?? [] : []).slice(0, 3).map(task => <Pressable key={task.id} accessibilityRole="button" accessibilityLabel={`ตรวจงาน ${task.title}`}
          style={({ pressed }) => [styles.linkRow, styles.linkRowRule, pressed && { backgroundColor: colors.soft }]} onPress={() => router.push(`/task/new?id=${task.id}`)}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.rowTitle}>{task.title}</Text>
            <Text style={styles.agendaCase}>รอคุณตรวจ</Text>
          </View>
          <ChevronRight size={18} color={colors.faint} />
        </Pressable>)}
      </Card>

      {!!localDrafts.data?.length && <>
        <SectionLabel>กลับมาทำร่างต่อ · ในเครื่องนี้</SectionLabel>
        <Card style={{ paddingVertical: spacing.xs }}>{localDrafts.data.slice(0, 3).map((item, index) => <View key={item.key}>
          {index > 0 && <View style={styles.divider} />}
          <Pressable accessibilityRole="button" accessibilityLabel={`ทำร่างต่อ ${item.name}`}
            style={({ pressed }) => [styles.linkRow, pressed && { backgroundColor: colors.soft }]} onPress={() => router.push(item.route as never)}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.rowTitle}>{item.name}</Text>
              <Text style={styles.agendaCase}>เก็บร่าง {thTime(item.savedAt)} · ยังไม่ส่งข้อมูลส่วนนี้</Text>
            </View>
            <ChevronRight size={18} color={colors.faint} />
          </Pressable>
        </View>)}</Card>
      </>}
      {localDrafts.isError && <InlineError style={{ marginTop: spacing.md }} message="โหลดร่างในเครื่องไม่ได้" onRetry={() => localDrafts.refetch()} />}

      {owner && <>
        <SectionLabel>กำลังคนวันนี้ · ใครทำอะไร</SectionLabel>
        {(workload.isError || leaves.isError) && <View style={{ gap: spacing.sm, marginBottom: spacing.sm }}>
          {workload.isError && <InlineError message="โหลดกำลังคนไม่ได้" onRetry={() => workload.refetch()} />}
          {leaves.isError && <InlineError message="โหลดข้อมูลวันลาไม่ได้" onRetry={() => leaves.refetch()} />}
        </View>}
        {daily.data && <Text style={styles.agendaCase}>ข้อมูลภาระงาน {thTime(daily.data.fetchedAt)} · ดึงลงเพื่ออัปเดต</Text>}
        <Card style={{ marginTop: spacing.sm, paddingVertical: spacing.xs }}>
          {workload.isLoading ? <LoadingState inline label="กำลังโหลดกำลังคน…" /> : workload.data?.members.length === 0 ? <EmptyState compact>ยังไม่มีสมาชิกทีม</EmptyState> : null}
          {workload.data?.members.slice(0, showAllPeople ? undefined : 3).map((member, index) => {
            const events = courtToday.filter((item) => agendaIncludesPerson(item, member.id));
            const tasks = otherToday.filter((item) => item.assigneeId === member.id);
            const leave = leaveFlags.get(member.id);
            const load = peopleToday.find(p => p.member.userId === member.id);
            return <View key={member.id}>
              {index > 0 && <View style={styles.divider} />}
              {/* The whole person row opens their detail; counts are non-zero tags only. */}
              <Pressable accessibilityRole="button" accessibilityLabel={`ดูงานและนัดของ ${member.name}`}
                style={({ pressed }) => [styles.personDay, pressed && { backgroundColor: colors.soft }]} onPress={() => openPerson(member.id)}>
                <View style={styles.personHead}>
                  <View style={styles.personAvatar}><Text maxFontSizeMultiplier={CHROME_MAX_SCALE} style={styles.personInitials}>{initials(member.name)}</Text></View>
                  <Text style={styles.personName}>{member.name}</Text>
                  {leave ? <Tag tone={leave.kind === 'ON_LEAVE' ? 'due' : 'plain'}>{leave.label}</Tag> : null}
                  <ChevronRight size={18} color={colors.faint} />
                </View>
                <DayTags items={[
                  { label: 'นัดวันนี้', count: events.length },
                  { label: 'งานครบกำหนด', count: tasks.length },
                  { label: 'คิวค้าง', count: load?.queue.length },
                  { label: 'รอตรวจ', count: load?.reviews.length, tone: 'court' },
                ]} />
                {leave?.kind === 'ON_LEAVE' && (events.length > 0 || tasks.length > 0)
                  ? <Text style={styles.rowWarn}>มีนัดหรืองานตรงวันลา · ตรวจผู้รับผิดชอบ</Text> : null}
              </Pressable>
            </View>;
          })}
          {(workload.data?.members.length ?? 0) > 3 && <Button variant="link"
            title={showAllPeople ? 'ย่อรายชื่อ' : `ดูครบ ${workload.data!.members.length} คน`} onPress={() => setShowAllPeople(!showAllPeople)} />}
          <View style={styles.peopleActions}>
            <Button variant="link" title="มอบหมายงาน" onPress={() => router.push('/task/new')} />
            <Button variant="link" title="ดูภาระงาน 7 วัน ›" onPress={() => router.push('/team-week')} />
          </View>
        </Card>
        <Disclosure title="เทียบคนก่อนมอบหมาย" summary="คนที่พอรับงานใหม่ได้ จากคิวและวันลา">
          <View style={{ gap: spacing.xs }}>
            <Text style={styles.agendaCase}>เรียงจากคิวและรายงานที่บันทึกไว้ · ยังไม่ได้ยืนยันเวลาว่าง</Text>
            {assignmentPeople.map(person => <Pressable key={person.member.userId} accessibilityRole="button"
              accessibilityLabel={`มอบหมายงานให้ ${person.member.firstName} ${person.member.lastName}`}
              style={({ pressed }) => [styles.linkRow, pressed && { backgroundColor: colors.soft }]}
              onPress={() => router.push({ pathname: '/task/new', params: { assigneeId: person.member.userId } })}>
              <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                <Text style={styles.rowTitle}>{person.member.firstName} {person.member.lastName}</Text>
                <Text style={styles.personSummary}>{[
                  person.queue.length ? `คิว ${person.queue.length}` : '',
                  person.reviews.length ? `รอตรวจ ${person.reviews.length}` : '',
                  person.member.appointments.length ? `นัด ${person.member.appointments.length}` : '',
                ].filter(Boolean).join(' · ') || 'ไม่มีคิวค้าง'}</Text>
                <Text style={styles.rowWarn}>{person.queue.find(task => task.blocker || task.holdReason || task.blockedBy)
                  ? followUpReason(person.queue.find(task => task.blocker || task.holdReason || task.blockedBy)!, today)
                  : assignmentWarnings(person)[0] ?? 'ตรวจรายละเอียดและเวลานัดก่อนเพิ่มงาน'}</Text>
              </View>
              <ChevronRight size={18} color={colors.faint} />
            </Pressable>)}
            {!assignmentPeople.length && <EmptyState compact>ยังไม่มีคนที่ตั้งประเภทงานนี้และไม่ตรงวันลา · เทียบทั้งทีมได้ในหน้ามอบหมายงาน</EmptyState>}
          </View>
        </Disclosure>
      </>}

      <SectionLabel>{owner ? 'งานครบกำหนดวันนี้ของทีม' : 'งานครบกำหนดวันนี้'}</SectionLabel>
      <Card style={{ paddingVertical: spacing.xs }}>
        {otherToday.length === 0 ? (
          myDay.isLoading ? <LoadingState inline label="กำลังโหลดงานวันนี้…" />
            : myDay.data ? <EmptyState compact>ไม่มีงานครบกำหนดวันนี้</EmptyState>
              : <View style={{ paddingVertical: spacing.sm }}><InlineError message="ยังโหลดงานวันนี้ไม่ได้" onRetry={() => myDay.refetch()} /></View>
        ) : (
          otherToday.map((item, index) => (
            <View key={item.id}>
              {index > 0 && <View style={styles.divider} />}
              <AgendaRow item={item} onPress={() => openItem(item)} />
            </View>
          ))
        )}
        <Button variant="link" title="ดูงานทั้งหมด ›" onPress={() => router.push('/(tabs)/tasks')} />
      </Card>

      <SectionLabel>{owner ? 'นัดวันนี้ของสำนักงาน' : 'นัดวันนี้'}</SectionLabel>
      {appointments.isError && <InlineError style={courtToday.length ? { marginBottom: spacing.sm } : undefined}
        message={courtToday.length ? 'นัดวันนี้อาจยังไม่ล่าสุด' : 'โหลดนัดวันนี้ไม่สำเร็จ'} onRetry={() => appointments.refetch()} />}
      {!(appointments.isError && courtToday.length === 0) && <Card style={{ paddingVertical: spacing.xs }}>
        {courtToday.length === 0 ? (
          appointments.isLoading ? <LoadingState inline label="กำลังโหลดนัดวันนี้…" /> : <EmptyState compact>วันนี้ไม่มีนัดหมาย</EmptyState>
        ) : (
          courtToday.map((item, index) => (
            <View key={item.id}>
              {index > 0 && <View style={styles.divider} />}
              <AgendaRow item={item} onPress={() => openItem(item)} />
            </View>
          ))
        )}
      </Card>}

      {/* A failed claims load is reported once, in the decision queue above. */}
      {canClaim && !claims.isError && <>
        <SectionLabel>ชุดเบิกที่ต้องจัดการ</SectionLabel>
        <Card>
          <View style={{ flexDirection: 'row', gap: spacing.lg }}>
            {(['PENDING', 'APPROVED'] as const).map((status, index) => {
              const rows = claims.data?.filter((item) => item.status === status);
              const label = status === 'PENDING' ? 'รออนุมัติ' : 'รอจ่าย';
              return <Pressable key={status} accessibilityRole="button" accessibilityLabel={`ดูชุดเบิก${label}${rows ? ` ${rows.length} ชุด` : ''}`}
                onPress={() => router.push(`/expenses/claims?status=${status}`)} style={({ pressed }) => [styles.claimTile, index > 0 && styles.claimTileRule, pressed && { opacity: 0.7 }]}>
                <Text style={styles.tileLabel}>{label}</Text>
                <Text style={[styles.claimValue, { color: rows?.length ? colors.ink : colors.muted }]}>{rows ? (rows.length ? `${rows.length} ชุด` : 'ไม่มี') : '—'}</Text>
                <Text style={{ color: colors.info, fontWeight: '600', fontSize: 14 }}>{rows ? (rows.length ? `${formatMoney(rows.reduce((sum, item) => sum + item.totalAmount, 0))} ฿ ›` : 'ดูรายการ ›') : 'กำลังโหลด…'}</Text>
              </Pressable>;
            })}
          </View>
        </Card>
      </>}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  bell: {
    width: 44,
    height: 44,
    borderRadius: radius.full,
    backgroundColor: colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.sm,
  },
  // Width follows the number so "99+" and enlarged text never spill out of a fixed box.
  bellBadge: {
    position: 'absolute',
    top: 0,
    right: -2,
    minWidth: 18,
    minHeight: 18,
    borderRadius: 9,
    backgroundColor: colors.warn,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    borderWidth: 1.5,
    borderColor: colors.bg,
  },
  bellBadgeText: { color: colors.surface, fontSize: 10, lineHeight: 14, fontWeight: '700' },
  bellDot: { position: 'absolute', top: 8, right: 8, width: 9, height: 9, borderRadius: 5, backgroundColor: colors.warn, borderWidth: 1.5, borderColor: colors.bg },
  hello: { ...typeScale.display, color: colors.ink },
  date: { ...typeScale.meta, color: colors.muted, marginTop: 2 },
  overdueHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.xl, marginBottom: spacing.sm },
  // Late work is the one red-edged card on the screen: warn top rule plus a warn hairline, on a raised surface.
  overdueCard: { borderColor: colors.warn, borderTopWidth: 3, paddingVertical: spacing.xs, ...shadow.md },
  warningCard: { gap: spacing.xs, borderLeftWidth: 3, borderLeftColor: colors.warn, backgroundColor: colors.warnSoft, borderColor: colors.warnSoft },
  tileRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  // Raised count tiles: the number leads, the label is a muted overline above it.
  decisionTile: { flexBasis: '30%', flexGrow: 1, minWidth: 96, minHeight: 96, justifyContent: 'space-between', gap: spacing.xs,
    padding: spacing.md, borderRadius: radius.card, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, ...shadow.sm },
  decisionTileActive: { borderTopWidth: 3, borderTopColor: colors.ink },
  decisionHead: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.xs },
  tileLabel: { flex: 1, ...typeScale.overline, color: colors.muted },
  tileValue: { ...typeScale.stat, fontVariant: ['tabular-nums'] },
  claimTile: { flex: 1, minHeight: 72, gap: spacing.xs },
  claimTileRule: { borderLeftWidth: 1, borderLeftColor: colors.divider, paddingLeft: spacing.lg },
  claimValue: { ...typeScale.title, fontVariant: ['tabular-nums'] },
  viewChip: { minHeight: 44, justifyContent: 'center', paddingHorizontal: spacing.md, backgroundColor: colors.infoSoft, borderRadius: radius.button },
  viewChipText: { color: colors.info, fontWeight: '600', fontSize: 14 },
  linkRow: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.md },
  linkRowRule: { borderTopWidth: 1, borderTopColor: colors.divider },
  rowTitle: { color: colors.ink, fontWeight: '600', fontSize: 15, lineHeight: 22 },
  rowWarn: { color: colors.warn, fontSize: 13, lineHeight: 20, fontWeight: '600' },
  personDay: { paddingVertical: spacing.md, gap: spacing.xs, minHeight: 56 },
  personHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  personAvatar: { width: 36, height: 36, borderRadius: radius.full, backgroundColor: colors.infoSoft, alignItems: 'center', justifyContent: 'center' },
  personInitials: { color: colors.info, fontFamily: fonts.bold, fontSize: 12 },
  personName: { flex: 1, minWidth: 0, color: colors.ink, fontFamily: fonts.semibold, fontSize: 15 },
  personSummary: { ...typeScale.meta, color: colors.muted },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  peopleActions: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: spacing.md },
  shortcutRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    rowGap: spacing.md,
  },
  shortcut: { alignItems: 'center', gap: spacing.xs, flexBasis: '25%', minHeight: 64 },
  shortcutIcon: {
    width: 46,
    height: 46,
    borderRadius: radius.lg,
    backgroundColor: colors.infoSoft,
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
    paddingVertical: spacing.md,
    minHeight: 56,
  },
  agendaTime: {
    fontWeight: '700',
    color: colors.ink,
    fontVariant: ['tabular-nums'],
    width: 48,
    fontSize: 14,
  },
  agendaTitle: { color: colors.ink, fontWeight: '600', fontSize: 15, lineHeight: 22 },
  agendaCase: { ...typeScale.meta, color: colors.muted },
  divider: { height: 1, backgroundColor: colors.divider },
});

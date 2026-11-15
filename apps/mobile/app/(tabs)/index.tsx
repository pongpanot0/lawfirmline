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
  Mic,
  ClipboardList,
  Users,
  CircleCheck,
  LoaderCircle,
  Eye,
  History,
  ClipboardCheck,
  BellRing,
  UserX,
  CalendarClock,
} from 'lucide-react-native';
import { ProgressRing } from '@/components/ProgressRing';
import type { TaskItem } from '@/api/types';
import { liftedCard, Masthead, mastheadStyles } from '@/components/Masthead';
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
import { bangkokDay, formatMoney, initials, thDate, thDateLong, thTime } from '@/format';
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

const DAY = 86_400_000;
const daysLate = (due: string, today: string) => Math.round((Date.parse(today) - Date.parse(bangkokDay(due))) / DAY);

/** "ทำต่อเลย" order: sent back first, then late, due today, in progress, then the rest by due date. */
function nextUpRank(task: TaskItem, today: string) {
  const due = task.dueDate ? bangkokDay(task.dueDate) : null;
  if (task.status === 'NEEDS_REVISION') return 0;
  if (due && due < today) return 1;
  if (due === today) return 2;
  if (task.status === 'IN_PROGRESS') return 3;
  return 4;
}

/** One next-up task: what state it is in, the case it belongs to, and the one action that moves it on. */
function NextUpCard({ task, today, onPress }: { task: TaskItem; today: string; onPress: () => void }) {
  const late = task.dueDate && bangkokDay(task.dueDate) < today ? daysLate(task.dueDate, today) : 0;
  const sentBack = task.status === 'NEEDS_REVISION';
  const tag = sentBack ? 'ส่งกลับแก้ไข' : late ? `ต้องทำ · เลยกำหนด ${late} วัน` : task.status === 'IN_PROGRESS' ? 'กำลังทำ' : 'ต้องทำ';
  const action = sentBack ? 'แก้งาน' : task.status === 'IN_PROGRESS' ? 'ทำต่อ' : 'เริ่มทำ';
  const urgent = sentBack || late > 0;
  const note = sentBack ? task.comments?.[0]?.body : task.case?.title;
  return <Card style={[styles.nextCard, urgent && styles.nextCardUrgent]}>
    <View style={styles.nextHead}>
      <View style={[styles.nextTag, urgent && styles.nextTagUrgent]}>
        <Text maxFontSizeMultiplier={CHROME_MAX_SCALE} numberOfLines={1} style={[styles.nextTagText, urgent && { color: colors.warn }]}>{tag}</Text>
      </View>
      {task.case?.ownRef ? <Text maxFontSizeMultiplier={CHROME_MAX_SCALE} numberOfLines={1} style={styles.nextRef}>{task.case.ownRef}</Text> : null}
    </View>
    <Text style={styles.nextTitle}>{task.title}</Text>
    {note ? <Text style={styles.agendaCase} numberOfLines={2}>{note}</Text> : null}
    <View style={styles.nextFoot}>
      {task.dueDate ? <View style={styles.nextDue}>
        <CalendarClock size={16} color={late ? colors.warn : colors.muted} />
        <Text style={[styles.agendaCase, late ? { color: colors.warn, fontWeight: '600' } : null]}>กำหนดส่ง {thDate(task.dueDate)}</Text>
      </View> : <View style={{ flex: 1 }} />}
      <Pressable accessibilityRole="button" accessibilityLabel={`${action} ${task.title}`} onPress={onPress}
        style={({ pressed }) => [styles.nextButton, pressed && { backgroundColor: colors.inkPressed }]}>
        <Text maxFontSizeMultiplier={CHROME_MAX_SCALE} style={styles.nextButtonText}>{action}</Text>
      </Pressable>
    </View>
  </Card>;
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
  const mine = useTodos('mine');
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
  // My own tasks drive the day ring, the status strip and "ทำต่อเลย"; all from /todos?view=mine (finished ones included).
  const myTasks = (mine.data ?? []).filter(task => task.assigneeId === user?.id);
  const openMine = myTasks.filter(task => !['DONE', 'PENDING_REVIEW'].includes(task.status));
  const dueNow = openMine.filter(task => task.dueDate && bangkokDay(task.dueDate) <= today);
  const lateCount = dueNow.filter(task => bangkokDay(task.dueDate!) < today).length;
  const doneToday = myTasks.filter(task => task.status === 'DONE' && task.completedAt && bangkokDay(task.completedAt) === today).length;
  const dayTotal = doneToday + dueNow.length;
  const nextUp = [...openMine].sort((a, b) => nextUpRank(a, today) - nextUpRank(b, today)
    || (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999')).slice(0, 4);
  const nextIds = new Set(nextUp.map(task => task.id));
  const count = (status: string) => mine.data ? myTasks.filter(task => task.status === status).length : undefined;
  // The status strip: one tile per state of my work, a red count badge only when the state is known and non-empty.
  const taskViews = [
    { key: 'TODO', label: 'ต้องทำ', Icon: CircleCheck, count: count('TODO'), params: { view: 'mine', status: 'TODO' } },
    { key: 'IN_PROGRESS', label: 'กำลังทำ', Icon: LoaderCircle, count: count('IN_PROGRESS'), params: { view: 'mine', status: 'IN_PROGRESS' } },
    { key: 'PENDING_REVIEW', label: 'รอตรวจ', Icon: Eye, count: count('PENDING_REVIEW'), params: { view: 'mine', status: 'PENDING_REVIEW' } },
    { key: 'NEEDS_REVISION', label: 'ส่งกลับแก้', Icon: History, count: count('NEEDS_REVISION'), params: { view: 'mine', status: 'NEEDS_REVISION' }, urgent: true },
    { key: 'review', label: 'รอฉันตรวจ', Icon: ClipboardCheck, count: reviews.data?.length, params: { view: 'review' } },
  ];
  // Office roles chase the team: their strip swaps "รอตรวจ" and "ส่งกลับแก้" for the two team queues.
  const stripItems = owner ? [
    ...taskViews.filter(item => ['TODO', 'IN_PROGRESS', 'review'].includes(item.key)),
    { key: 'follow-up', label: 'ต้องตาม', Icon: BellRing, count: tasksToFollow?.length, params: { view: 'follow-up' }, urgent: true },
    { key: 'unassigned', label: 'ไม่มีคนรับ', Icon: UserX, count: unassignedTasks?.length, params: { view: 'unassigned' } },
  ] : taskViews;
  const lateItems = overdue.filter(item => !(item.kind === 'TASK' && nextIds.has(item.entityId)));
  // My own tasks already lead in "ทำต่อเลย"; the due-today list keeps everyone else's.
  const dueTodayList = otherToday.filter(item => !nextIds.has(item.entityId));

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
            actions.refetch(); reviews.refetch(); mine.refetch();
            if (owner) { workload.refetch(); leaves.refetch(); daily.refetch(); }
            if (canClaim) claims.refetch();
            if (canLeave) pendingLeaves.refetch();
            if (canFinance) finance.refetch();
          }}
        />
      }
    >
      <Masthead safeTop title="วันนี้"
        subtitle={<View style={{ gap: 2, marginTop: 2 }}>
          <Text style={mastheadStyles.onInkMuted}>{thDateLong(new Date())}</Text>
          <Text style={mastheadStyles.onInkMuted}>สวัสดี คุณ{user?.firstName ?? ''}{openCases ? ` · คดีเปิด ${openCases}` : ''}</Text>
        </View>}
        actions={<>
          <Pressable accessibilityRole="button" accessibilityLabel="เมนูเพิ่มเติม" style={({ pressed }) => [mastheadStyles.roundButton, pressed && { opacity: 0.7 }]} onPress={() => router.push('/more')}>
            <LayoutGrid size={20} color={colors.onInk} />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={unread ? `การแจ้งเตือน ยังไม่อ่าน ${unread} รายการ` : pendingActions ? `การแจ้งเตือน รอจัดการ ${pendingActions} เรื่อง` : 'การแจ้งเตือน'}
            style={({ pressed }) => [mastheadStyles.roundButton, pressed && { opacity: 0.7 }]}
            onPress={() => router.push('/notifications')}
          >
            <Bell size={20} color={colors.onInk} />
            {/* The number is unread news; a bare dot means only the waiting queue has items. */}
            {unread > 0 ? (
              <View style={styles.bellBadge}>
                <Text maxFontSizeMultiplier={CHROME_MAX_SCALE} style={styles.bellBadgeText}>
                  {unread > 99 ? '99+' : unread}
                </Text>
              </View>
            ) : pendingActions > 0 ? <View style={styles.bellDot} /> : null}
          </Pressable>
        </>}>
        {mine.data ? <View style={styles.dayRow}>
          <Text style={[styles.dayLeft, { flex: 1 }]}>
            {dueNow.length ? `เหลือ ${dueNow.length} เรื่อง` : 'งานครบกำหนดเคลียร์แล้ว'}
            {lateCount ? <Text style={styles.dayLate}>{` · ด่วน ${lateCount}`}</Text> : null}
          </Text>
          {dayTotal > 0 ? <View style={{ alignItems: 'center' }}>
            <ProgressRing value={doneToday} total={dayTotal} size={84} stroke={9} color={colors.accent} track="rgba(255,255,255,0.14)"
              textColor={colors.onInk} label={`วันนี้เสร็จ ${doneToday} จาก ${dayTotal} เรื่อง`} />
            <Text maxFontSizeMultiplier={CHROME_MAX_SCALE} style={styles.ringCaption}>เสร็จวันนี้</Text>
          </View> : null}
        </View> : null}
      </Masthead>

      {/* The lifted card: every task queue one tap away, counts as badges. */}
      <Card style={[liftedCard, { gap: spacing.md }]}>
        <View style={styles.stripHead}>
          <Text accessibilityRole="header" style={styles.stripTitle}>{owner ? 'งานของฉันและทีม' : 'งานของฉัน'}</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="ดูงานทั้งหมด" hitSlop={8} onPress={() => router.push('/(tabs)/tasks')}
            style={({ pressed }) => [styles.stripLink, pressed && { opacity: 0.6 }]}>
            <Text maxFontSizeMultiplier={CHROME_MAX_SCALE} style={styles.stripLinkText}>ดูทั้งหมด</Text>
            <ChevronRight size={16} color={colors.muted} />
          </Pressable>
        </View>
        <View style={styles.strip}>
          {stripItems.map(item => <Pressable key={item.key} accessibilityRole="button"
            accessibilityLabel={item.count ? `${item.label} ${item.count} งาน` : item.label}
            style={({ pressed }) => [styles.stripItem, pressed && { opacity: 0.7 }]}
            onPress={() => router.push({ pathname: '/(tabs)/tasks', params: item.params })}>
            <View style={[styles.stripTile, !!item.count && (item.urgent ? styles.stripTileUrgent : styles.stripTileOn)]}>
              <item.Icon size={24} color={item.count ? (item.urgent ? colors.warn : colors.accentIcon) : colors.ink} strokeWidth={2} />
              {item.count ? <View style={styles.stripBadge}>
                <Text maxFontSizeMultiplier={CHROME_MAX_SCALE} style={styles.bellBadgeText}>{item.count > 99 ? '99+' : item.count}</Text>
              </View> : null}
            </View>
            <Text maxFontSizeMultiplier={CHROME_MAX_SCALE} numberOfLines={1} style={[styles.stripLabel, !!item.count && (item.urgent ? { color: colors.warn, fontWeight: '700' } : styles.stripLabelOn)]}>{item.label}</Text>
          </Pressable>)}
        </View>
        {mine.isError && <InlineError message="โหลดงานของฉันไม่ได้" onRetry={() => mine.refetch()} />}
        {!isOwner && reviews.isError && <InlineError message="โหลดงานรอตรวจไม่ได้" onRetry={() => reviews.refetch()} />}
      </Card>
      {nextUp.length > 0 && <>
        <View style={styles.nextSection}>
          <Text accessibilityRole="header" style={styles.nextSectionTitle}>ทำต่อเลย</Text>
          <Text style={styles.agendaCase}>{`${nextUp.length} รายการ`}</Text>
        </View>
        <View style={{ gap: spacing.md }}>
          {nextUp.map(task => <NextUpCard key={task.id} task={task} today={today} onPress={() => router.push(`/task/new?id=${task.id}`)} />)}
        </View>
      </>}
      {/* No price, link or "renew on the web" here: App Store anti-steering. Owners get the billing link by email. */}
      {user?.subscriptionStatus && !subscriptionAllowsWrites(user.subscriptionStatus) ? (
        <InlineError style={{ marginTop: spacing.md }} message="สำนักงานอยู่ในโหมดดูอย่างเดียว · การใช้งานหมดอายุแล้ว ยังเปิดดูคดีและเอกสารได้ แต่สร้างหรือแก้ไขข้อมูลไม่ได้" />
      ) : null}

      {hasFirmCapability(user?.firmRole, 'viewAllCases') ? <View style={{ marginVertical: spacing.md }}>
        <Button title="สรุปประจำวัน" icon={ClipboardList} variant="secondary" onPress={() => router.push('/brief')} />
      </View> : null}

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
      {lateItems.length > 0 ? (
        <>
          <View style={styles.overdueHead}>
            <AlertTriangle size={18} color={colors.warn} />
            <SectionLabel style={{ marginTop: 0, marginBottom: 0, color: colors.warn }}>{`เกินกำหนด · ${lateItems.length}`}</SectionLabel>
          </View>
          <Card style={styles.overdueCard}>
            {lateItems.map((item, index) => (
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
        <Card style={styles.tileCard}><View style={styles.tileRow}>{decisionTiles.map(item =>
          <Pressable key={item.view} accessibilityRole="button"
            accessibilityLabel={`${item.label} ${item.count === undefined ? 'ยังโหลดไม่ได้' : `${item.count} รายการ`}`} accessibilityHint="เปิดรายการ"
            style={({ pressed }) => [styles.decisionTile, !!item.count && styles.decisionTileActive, pressed && { backgroundColor: colors.soft }]}
            onPress={() => router.push(`/owner-decisions?view=${item.view}`)}>
            <View style={styles.decisionHead}>
              <Text style={styles.tileLabel}>{item.label}</Text>
              <ChevronRight size={16} color={colors.muted} />
            </View>
            <Text style={[styles.tileValue, { color: item.count ? colors.ink : colors.muted }]}>{item.count ?? '—'}</Text>
          </Pressable>)}</View></Card>
        {(isOwner && reviews.isError) || (canLeave && pendingLeaves.isError) || (canClaim && claims.isError) ? <View style={{ gap: spacing.sm, marginTop: spacing.sm }}>
          {isOwner && reviews.isError && <InlineError message="โหลดงานรอตรวจไม่ได้" onRetry={() => reviews.refetch()} />}
          {canLeave && pendingLeaves.isError && <InlineError message="โหลดลารออนุมัติไม่ได้" onRetry={() => pendingLeaves.refetch()} />}
          {canClaim && claims.isError && <InlineError message="โหลดชุดเบิกไม่ได้" onRetry={() => claims.refetch()} />}
        </View> : null}
      </>}
      {canFinance && <>
        <Disclosure icon={Receipt} title="เงินสำนักงาน" summary={finance.data ? `ลูกหนี้ ${formatMoney(finance.data.totals.receivable)} ฿ · ดูรายการ` : 'ลูกหนี้และรายการที่ต้องตาม'}>
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
        <Disclosure icon={Users} title="เทียบคนก่อนมอบหมาย" summary="คนที่พอรับงานใหม่ได้ จากคิวและวันลา">
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
        {dueTodayList.length === 0 ? (
          myDay.isLoading ? <LoadingState inline label="กำลังโหลดงานวันนี้…" />
            : myDay.data ? <EmptyState compact>{otherToday.length ? "งานของคุณอยู่ใน “ทำต่อเลย” ด้านบน" : "ไม่มีงานครบกำหนดวันนี้"}</EmptyState>
              : <View style={{ paddingVertical: spacing.sm }}><InlineError message="ยังโหลดงานวันนี้ไม่ได้" onRetry={() => myDay.refetch()} /></View>
        ) : (
          dueTodayList.map((item, index) => (
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

      <Pressable accessibilityRole="button" accessibilityLabel="ถามเลขา · พิมพ์หรือพูดถามข้อมูลคดี"
        onPress={() => router.push('/secretary')} style={({ pressed }) => pressed && { opacity: 0.7 }}>
        <Card style={styles.secretary}>
          <View style={styles.secretaryIcon}><Mic size={22} color={colors.ink} /></View>
          <View style={{ flex: 1 }}>
            <Text style={{ ...typeScale.section, color: colors.ink }}>ถามเลขา</Text>
            <Text style={{ ...typeScale.meta, color: colors.muted }}>พิมพ์หรือพูดถามข้อมูลคดี</Text>
          </View>
          <ChevronRight size={22} color={colors.muted} />
        </Card>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  stripHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  stripTitle: { ...typeScale.section, color: colors.ink },
  stripLink: { minHeight: 32, flexDirection: 'row', alignItems: 'center', gap: 2 },
  stripLinkText: { ...typeScale.meta, color: colors.muted },
  strip: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.xs },
  stripItem: { flex: 1, minWidth: 0, alignItems: 'center', gap: spacing.xs, minHeight: 72 },
  stripTile: { width: 52, height: 52, borderRadius: radius.xl, backgroundColor: colors.soft, alignItems: 'center', justifyContent: 'center' },
  stripTileOn: { backgroundColor: colors.accentSoft },
  stripTileUrgent: { backgroundColor: colors.warnSoft },
  dayRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginTop: 2 },
  dayLeft: { ...typeScale.section, color: colors.onInk },
  dayLate: { color: colors.accent, fontWeight: '700' },
  ringCaption: { fontSize: 12, lineHeight: 18, color: colors.onInkMuted, marginTop: 2 },
  nextSection: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginTop: spacing.xl, marginBottom: spacing.md },
  nextSectionTitle: { ...typeScale.title, color: colors.ink },
  nextCard: { gap: spacing.sm },
  nextCardUrgent: { backgroundColor: colors.warnSoft },
  nextHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  nextTag: { flexShrink: 1, paddingHorizontal: spacing.sm, paddingVertical: 2, borderRadius: radius.sm, backgroundColor: colors.soft },
  nextTagUrgent: { backgroundColor: colors.surface },
  nextTagText: { fontSize: 13, lineHeight: 20, fontWeight: '700', color: colors.muted },
  nextRef: { marginLeft: 'auto', ...typeScale.meta, color: colors.muted, fontVariant: ['tabular-nums'] },
  nextTitle: { ...typeScale.section, color: colors.ink },
  nextFoot: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderTopWidth: 1, borderTopColor: colors.divider, paddingTop: spacing.md, marginTop: spacing.xs },
  nextDue: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  nextButton: { minHeight: 44, justifyContent: 'center', paddingHorizontal: spacing.lg, borderRadius: radius.action, backgroundColor: colors.ink },
  nextButtonText: { color: colors.onInk, fontWeight: '700', fontSize: 15 },
  stripBadge: { position: 'absolute', top: -6, right: -8, minWidth: 20, minHeight: 20, borderRadius: 10, backgroundColor: colors.badge,
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4, borderWidth: 2, borderColor: colors.surface },
  stripLabel: { fontSize: 12, lineHeight: 18, color: colors.muted, fontWeight: '600' },
  stripLabelOn: { color: colors.accentInk, fontWeight: '700' },
  secretary: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 80, marginTop: spacing.xl },
  secretaryIcon: { width: 48, height: 48, borderRadius: radius.full, backgroundColor: colors.soft, alignItems: 'center', justifyContent: 'center' },
  // Width follows the number so "99+" and enlarged text never spill out of a fixed box.
  bellBadge: {
    position: 'absolute',
    top: 0,
    right: -2,
    minWidth: 18,
    minHeight: 18,
    borderRadius: 9,
    backgroundColor: colors.badge,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    borderWidth: 1.5,
    borderColor: colors.ink,
  },
  bellBadgeText: { color: colors.surface, fontSize: 10, lineHeight: 14, fontWeight: '700' },
  bellDot: { position: 'absolute', top: 8, right: 8, width: 9, height: 9, borderRadius: 5, backgroundColor: colors.badge, borderWidth: 1.5, borderColor: colors.ink },
  overdueHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.xl, marginBottom: spacing.sm },
  // Late work is the one warning-tinted card on the screen: soft red fill, a red hairline all round, lifted a step.
  overdueCard: { borderColor: colors.warnEdge, backgroundColor: colors.warnSoft, paddingVertical: spacing.xs, ...shadow.md },
  warningCard: { gap: spacing.xs, backgroundColor: colors.warnSoft, borderColor: colors.warnEdge },
  // The decision queue is one raised card holding sunken count wells.
  tileCard: { padding: spacing.md },
  tileRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  decisionTile: { flexBasis: '30%', flexGrow: 1, minWidth: 96, minHeight: 96, justifyContent: 'space-between', gap: spacing.xs,
    padding: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.sunken },
  decisionTileActive: { borderColor: colors.lineStrong },
  decisionHead: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.xs },
  tileLabel: { flex: 1, ...typeScale.overline, color: colors.muted },
  tileValue: { ...typeScale.stat, fontVariant: ['tabular-nums'] },
  claimTile: { flex: 1, minHeight: 72, gap: spacing.xs },
  claimTileRule: { borderLeftWidth: 1, borderLeftColor: colors.divider, paddingLeft: spacing.lg },
  claimValue: { ...typeScale.title, fontVariant: ['tabular-nums'] },
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

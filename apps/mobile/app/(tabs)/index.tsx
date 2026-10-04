import React, { useCallback, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '@/components/AppText';
import { useFocusEffect, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import {
  BarChart3,
  Bell,
  BookOpen,
  Contact,
  FilePlus2,
  LayoutGrid,
  MapPin,
  Receipt,
  CalendarOff,
  Search,
} from 'lucide-react-native';
import { useAuth } from '@/api/auth';
import { listTaskDrafts, taskDraftScope } from '@/api/drafts';
import { useActions, useDashboardStats, useMyDay, useWorkload, useExpenseClaims, useLeaves, useCalendarRange, useTodos, useDailyWorkboard, usePendingLeaves, useOwnerFinance, useUnreadNotifications } from '@/api/hooks';
import { AgendaItemKind, AgendaUrgency, followUpReason, ownerDecisionTasks, assignmentCandidates, assignmentWarnings, canAssignFirmRole, FirmRole, TaskWorkType } from '@lawfirm/shared';
import { Disclosure } from '@/components/Disclosure';
import { OwnerFinanceSummary } from '@/components/OwnerFinanceSummary';
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
import { bangkokDay, formatMoney, initials, thDateLong, thTime } from '@/format';
import { agendaIncludesPerson } from '@/workflow';
import { leaveFlagsForDate } from '@/lib/leave-flags';
import { colors, fonts, spacing, pageContent } from '@/theme';

// The most-used destinations from the "อื่นๆ" menu, surfaced one tap away.
const SHORTCUTS = [
  { route: '/search', Icon: Search, label: 'ค้นไฟล์' },
  { route: '/leaves', Icon: CalendarOff, label: 'ขอลา' },
  { route: '/case/new', Icon: FilePlus2, label: 'รับเคส' },
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

function AgendaRow({ item, onPress, onPersonPress }: { item: AgendaItem; onPress?: () => void; onPersonPress: (id: string) => void }) {
  const kind = KIND_LABEL[item.kind] ?? KIND_LABEL.OTHER;
  const companions = (Array.isArray(item.assignees) ? item.assignees : []).filter((person) => person.id !== item.assigneeId);
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
          <View style={styles.personLinks}>
            <Text style={styles.agendaCase}>หลัก: </Text>
            {item.assigneeId ? <Pressable accessibilityRole="link" accessibilityLabel={`ดูงานและนัดของ ${item.assigneeName ?? 'ผู้รับผิดชอบ'}`}
              onPress={(event) => { event.stopPropagation(); onPersonPress(item.assigneeId!); }} hitSlop={6}>
              <Text style={styles.personLink}>{item.assigneeName ?? 'ผู้รับผิดชอบ'}</Text>
            </Pressable> : <Text style={styles.agendaCase}>ยังไม่ระบุ</Text>}
          </View>
          {item.kind !== 'TASK' && <View style={styles.personLinks}>
            <Text style={styles.agendaCase}>ร่วม: </Text>
            {companions.length ? companions.map((person, index) => <React.Fragment key={person.id}>
              {index > 0 && <Text style={styles.agendaCase}>, </Text>}
              <Pressable accessibilityRole="link" accessibilityLabel={`ดูงานและนัดของ ${person.name}`}
                onPress={(event) => { event.stopPropagation(); onPersonPress(person.id); }} hitSlop={6}>
                <Text style={styles.personLink}>{person.name}</Text>
              </Pressable>
            </React.Fragment>) : <Text style={styles.agendaCase}>ไม่มี</Text>}
          </View>}
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
  const unread = useUnreadNotifications().data ?? 0;
  const owner = user?.firmRole === 'OWNER';
  const workload = useWorkload(owner);
  const claims = useExpenseClaims(owner);
  const pendingLeaves = usePendingLeaves(owner);
  const finance = useOwnerFinance(owner);
  const today = bangkokDay(new Date().toISOString());
  const reviews = useTodos('review');
  const daily = useDailyWorkboard(today, owner);
  const peopleToday = daily.data && !daily.isError ? assignmentCandidates(daily.data.members, daily.data.tasks, TaskWorkType.GENERAL, today) : [];
  const decisions = daily.data && !daily.isError ? ownerDecisionTasks(daily.data.tasks, today) : [];
  // ponytail: recorded queues rank candidates; add confirmed work windows when the office records them.
  const assignmentPeople = peopleToday.filter(person => person.member.userId !== user?.id && !person.member.onLeave && person.configured && canAssignFirmRole(FirmRole.OWNER, person.member.role as FirmRole)).slice(0, 2);
  const scope = user ? taskDraftScope(user) : null;
  const localDrafts = useQuery({ queryKey: ['local-task-drafts', scope], enabled: !!scope, networkMode: 'always',
    queryFn: () => scope ? listTaskDrafts(scope) : Promise.resolve([]) });
  const reloadDrafts = localDrafts.refetch;
  useFocusEffect(useCallback(() => { if (scope) void reloadDrafts(); }, [scope, reloadDrafts]));
  useFocusEffect(useCallback(() => {
    if (owner) { void pendingLeaves.refetch(); void claims.refetch(); void reviews.refetch(); void daily.refetch(); void finance.refetch(); }
  }, [owner, pendingLeaves.refetch, claims.refetch, reviews.refetch, daily.refetch, finance.refetch]));
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
            if (owner) { workload.refetch(); claims.refetch(); leaves.refetch(); pendingLeaves.refetch(); daily.refetch(); finance.refetch(); }
          }}
        />
      }
    >
      <View style={styles.headerRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.hello}>สวัสดี คุณ{user?.firstName ?? ''}</Text>
          <Text style={styles.date}>{thDateLong(new Date())}</Text>
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
              <Text style={styles.bellBadgeText}>
                {unread > 99 ? '99+' : unread}
              </Text>
            </View>
          ) : pendingActions > 0 ? <View style={styles.bellDot} /> : null}
        </Pressable>
      </View>

      {owner && <>
        <SectionLabel>คิวตัดสินใจวันนี้</SectionLabel>
        <Card style={{ gap: spacing.sm, backgroundColor: colors.ink, borderColor: colors.ink }}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>{[
            { view: 'review', label: 'งานรอคุณตรวจ', count: reviews.isError ? undefined : reviews.data?.length },
            { view: 'leave', label: 'ลารออนุมัติ', count: pendingLeaves.isError ? undefined : pendingLeaves.data?.length },
            { view: 'claim', label: 'เบิกรออนุมัติ', count: claims.isError ? undefined : claims.data?.filter(item => item.status === 'PENDING').length },
          ].map(item => <Pressable key={item.view} accessibilityRole="button" style={{ flexBasis: '30%', flexGrow: 1, minWidth: 92, minHeight: 64, gap: 4 }}
             onPress={() => router.push(`/owner-decisions?view=${item.view}`)}><Text style={{ color: colors.infoSoft }}>{item.label}</Text>
             <Text style={{ color: colors.surface, fontSize: 26, fontFamily: fonts.bold }}>{item.count ?? '—'}</Text><Text style={{ color: colors.infoSoft, fontSize: 12 }}>เปิดรายการ ›</Text></Pressable>)}</View>
          {pendingLeaves.isError && <ErrorNote message="โหลดลารออนุมัติไม่ได้" onRetry={() => pendingLeaves.refetch()} />}
          <Pressable accessibilityRole="button" style={styles.peopleButton} onPress={() => router.push('/owner-decisions')}><Text style={{ color: colors.surface }}>ดูคิวที่ต้องจัดการทั้งหมด ›</Text></Pressable>
        </Card>
        <Disclosure title="เงินสำนักงาน" summary={finance.data ? `ลูกหนี้ ${formatMoney(finance.data.totals.receivable)} ฿ · ดูรายการ` : 'ลูกหนี้และรายการที่ต้องตาม'}>
        {finance.isError && <ErrorNote message="โหลดข้อมูลการเงินล่าสุดไม่ได้" onRetry={() => finance.refetch()} />}
        <OwnerFinanceSummary data={finance.data} onOpen={view => router.push(`/owner-finance?view=${view}`)} />
        <Card style={{ marginTop: spacing.sm }}><Pressable accessibilityRole="button" style={styles.peopleButton} onPress={() => router.push('/owner-finance')}>
          <Text style={{ color: colors.ink, fontWeight: '700' }}>ลูกหนี้ที่ต้องตาม · {finance.data ? `${formatMoney(finance.data.totals.receivable)} ฿` : '—'}</Text>
          <Text style={{ color: colors.info }}>ดูครบกำหนด ผู้ติดตาม ปัญหา และบันทึกรับเงิน</Text>
        </Pressable></Card>
        </Disclosure>
        {(decisions.length > 0 || daily.isLoading || daily.isError) && <>
        <SectionLabel>งานที่ต้องเข้าไปช่วย</SectionLabel>
        <Card style={{ gap: spacing.sm }}>
          {daily.isError ? <ErrorNote message="ยังตรวจงานเสี่ยงล่าสุดไม่ได้" onRetry={() => daily.refetch()} />
            : daily.isLoading ? <EmptyNote>กำลังตรวจงานทีม…</EmptyNote>
              : !decisions.length ? <EmptyNote>ยังไม่มีเรื่องต้องตามจากงานที่บันทึกไว้</EmptyNote> : decisions.slice(0, 4).map(({ task, reason }) => <Pressable key={task.id} accessibilityRole="button" style={styles.peopleButton} onPress={() => router.push(`/task/new?id=${task.id}`)}>
                <Text style={{ color: colors.text, fontWeight: '600' }}>{task.title}</Text>
                <Text style={{ color: colors.warn, fontSize: 12 }}>{reason}</Text>
              </Pressable>)}
          {decisions.length > 4 && <Pressable accessibilityRole="button" style={styles.peopleButton} onPress={() => router.push({ pathname: '/(tabs)/tasks', params: { view: 'follow-up' } })}><Text style={{ color: colors.info }}>เปิดคิวติดตามทั้งหมด · {decisions.length} เรื่อง</Text></Pressable>}
        </Card>
        </>}
        <Disclosure title="เทียบคนก่อนมอบหมาย" summary="คิวงาน นัด และวันลาล่วงหน้า 7 วัน">
        <Card style={{ gap: spacing.sm }}>
          <Text style={styles.agendaCase}>เรียงจากคิวและรายงานที่บันทึกไว้ · ยังไม่ได้ยืนยันเวลาว่าง</Text>
          {assignmentPeople.map(person => <Pressable key={person.member.userId} accessibilityRole="button" style={styles.peopleButton} onPress={() => router.push({ pathname: '/task/new', params: { assigneeId: person.member.userId } })}>
            <Text style={{ color: colors.info, fontWeight: '600' }}>{person.member.firstName} {person.member.lastName}</Text>
            <Text style={styles.personSummary}>คิว {person.queue.length} · รอตรวจ {person.reviews.length} · นัด {person.member.appointments.length}</Text>
            <Text style={{ color: colors.warn, fontSize: 12 }}>{person.queue.find(task => task.blocker || task.holdReason || task.blockedBy)
              ? followUpReason(person.queue.find(task => task.blocker || task.holdReason || task.blockedBy)!, today)
              : assignmentWarnings(person)[0] ?? 'ตรวจรายละเอียดและเวลานัดก่อนเพิ่มงาน'}</Text>
          </Pressable>)}
          {!assignmentPeople.length && <EmptyNote>ยังไม่มีคนที่ตั้งประเภทงานนี้และไม่ตรงวันลา · เปิดเทียบทีมก่อนเลือก</EmptyNote>}
          <Pressable accessibilityRole="button" style={styles.peopleButton} onPress={() => router.push('/task/new')}><Text style={{ color: colors.info }}>เทียบคนทั้งทีม / เลือกประเภทงาน</Text></Pressable>
          <Pressable accessibilityRole="button" style={styles.peopleButton} onPress={() => router.push('/team-week')}><Text style={{ color: colors.info }}>ดูภาระงาน 7 วัน ›</Text></Pressable>
        </Card>
        </Disclosure>
      </>}
      <SectionLabel>งานที่ต้องจัดการ</SectionLabel>
      <Card style={{ marginBottom: spacing.md, gap: spacing.sm }}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
          {[
            { view: 'created', label: 'งานที่ฉันสร้าง', count: undefined },
            { view: 'review', label: 'รอฉันตรวจ', count: reviews.data?.length },
            ...(owner ? [{ view: 'follow-up', label: 'ต้องตาม', count: tasksToFollow?.length },
              { view: 'unassigned', label: 'ยังไม่มีคนรับ', count: unassignedTasks?.length }] : []),
          ].map(item => <Pressable key={item.view} accessibilityRole="button" style={{ minHeight: 44, justifyContent: 'center', padding: spacing.sm, backgroundColor: colors.soft, borderRadius: 8 }}
            onPress={() => router.push({ pathname: '/(tabs)/tasks', params: { view: item.view } })}>
            <Text style={{ color: colors.info, fontWeight: '600' }}>{item.label}{item.view !== 'created' ? ` · ${item.count ?? '—'}` : ''}</Text>
          </Pressable>)}
        </View>
        {reviews.isError && <ErrorNote message="โหลดงานรอตรวจไม่ได้" onRetry={() => reviews.refetch()} />}
        {owner && daily.isError && <ErrorNote message="โหลดงานทีมไม่ได้" onRetry={() => daily.refetch()} />}
        {(!owner ? reviews.data ?? [] : []).slice(0, 3).map(task => <Pressable key={task.id} accessibilityRole="button" accessibilityLabel={`ตรวจงาน ${task.title}`}
          style={{ minHeight: 44, justifyContent: 'center' }} onPress={() => router.push(`/task/new?id=${task.id}`)}>
          <Text style={{ color: colors.text }}>{task.title}</Text>
          <Text style={{ color: colors.info, fontSize: 12 }}>รอคุณตรวจ · เปิดงาน</Text>
        </Pressable>)}
      </Card>

      {!!localDrafts.data?.length && <>
        <SectionLabel>กลับมาทำร่างต่อ · ในเครื่องนี้</SectionLabel>
        <Card>{localDrafts.data.slice(0, 3).map(item => <Pressable key={item.key} accessibilityRole="button" style={styles.peopleButton} onPress={() => router.push(item.route as never)}>
          <Text style={{ color: colors.info, fontWeight: '600' }}>{item.name}</Text>
          <Text style={styles.agendaCase}>เก็บร่าง {thTime(item.savedAt)} · ยังไม่ส่งข้อมูลส่วนนี้</Text>
        </Pressable>)}</Card>
      </>}
      {localDrafts.isError && <ErrorNote message="โหลดร่างในเครื่องไม่ได้" onRetry={() => localDrafts.refetch()} />}
      {myDay.isError ? (
        <View style={{ marginTop: spacing.lg }}>
          <ErrorNote
            message="โหลดข้อมูลวันนี้ไม่สำเร็จ — แสดงข้อมูลล่าสุดที่บันทึกไว้"
            onRetry={() => myDay.refetch()}
          />
        </View>
      ) : null}

      {owner && <>
        <SectionLabel>กำลังคนวันนี้ · ใครทำอะไร</SectionLabel>
        {workload.isError && <ErrorNote message="โหลดกำลังคนไม่ได้" onRetry={() => workload.refetch()} />}
        {leaves.isError && <ErrorNote message="โหลดข้อมูลวันลาไม่ได้" onRetry={() => leaves.refetch()} />}
        {appointments.isError && <ErrorNote message="นัดวันนี้อาจยังไม่ล่าสุด" onRetry={() => appointments.refetch()} />}
        {daily.isError && <ErrorNote message="ยังตรวจรายงานภาระงานล่าสุดไม่ได้" onRetry={() => daily.refetch()} />}
        {daily.data && <Text style={styles.agendaCase}>ข้อมูลภาระงาน {thTime(daily.data.fetchedAt)} · ดึงลงเพื่ออัปเดต</Text>}
        <View style={[styles.statRow, { marginTop: 0, marginBottom: spacing.md }]}>
          <StatCard label="คนในทีม" value={workload.data?.members.length ?? '—'} />
          <StatCard label="มีนัดศาลวันนี้" value={workload.data && (appointments.data || myDay.data)
            ? workload.data.members.filter((member) => courtToday.some((item) => item.kind === 'COURT_DATE' && agendaIncludesPerson(item, member.id))).length
            : '—'} />
          <StatCard label="ลาวันนี้" value={leaves.data && workload.data
            ? workload.data.members.filter((member) => leaveFlags.get(member.id)?.kind === 'ON_LEAVE').length
            : '—'} tone="warn" />
        </View>
        <Card>
          {workload.isLoading ? <EmptyNote>กำลังโหลดกำลังคน…</EmptyNote> : workload.data?.members.length === 0 ? <EmptyNote>ยังไม่มีสมาชิกทีม</EmptyNote> : null}
          {workload.data?.members.slice(0, showAllPeople ? undefined : 4).map((member, index) => {
            const events = courtToday.filter((item) => agendaIncludesPerson(item, member.id));
            const tasks = otherToday.filter((item) => item.assigneeId === member.id);
            const leave = leaveFlags.get(member.id);
            return <View key={member.id}>
              {index > 0 && <View style={styles.divider} />}
              <View style={styles.personDay}>
                <View style={styles.personHead}>
                  <Pressable accessibilityRole="link" accessibilityLabel={`ดูงานและนัดของ ${member.name}`}
                    style={styles.personIdentity} onPress={() => openPerson(member.id)}>
                    <View style={styles.personAvatar}><Text style={styles.personInitials}>{initials(member.name)}</Text></View>
                    <Text style={styles.personName}>{member.name} ›</Text>
                  </Pressable>
                  {leave ? <Tag tone={leave.kind === 'ON_LEAVE' ? 'due' : 'plain'}>{leave.label}</Tag> : null}
                </View>
                <Text style={styles.personSummary}>
                  นัดวันนี้ {appointments.data || myDay.data ? events.length : '—'} · งานครบกำหนด {myDay.data ? tasks.length : '—'}
                </Text>
                <Text style={styles.personSummary}>คิวค้าง {peopleToday.find(p => p.member.userId === member.id)?.queue.length ?? '—'} · รอตรวจ {peopleToday.find(p => p.member.userId === member.id)?.reviews.length ?? '—'}</Text>
                {leave?.kind === 'ON_LEAVE' && (events.length > 0 || tasks.length > 0)
                  ? <Text style={{ color: colors.warn, fontSize: 12 }}>มีนัดหรืองานตรงวันลา · ตรวจผู้รับผิดชอบ</Text> : null}
              </View>
            </View>;
          })}
          {(workload.data?.members.length ?? 0) > 4 && <Pressable accessibilityRole="button" style={styles.peopleButton}
            onPress={() => setShowAllPeople(!showAllPeople)}>
            <Text style={{ color: colors.info }}>{showAllPeople ? 'ย่อรายชื่อ' : `ดูครบ ${workload.data!.members.length} คน`}</Text>
          </Pressable>}
          <View style={styles.peopleActions}>
            <Pressable accessibilityRole="button" style={styles.peopleButton} onPress={() => router.push('/task/new')}>
              <Text style={{ color: colors.info, fontWeight: '600' }}>สร้างงาน / เลือกผู้รับผิดชอบ</Text>
            </Pressable>
            <Pressable accessibilityRole="button" style={styles.peopleButton} onPress={() => router.push('/(tabs)/team')}>
              <Text style={{ color: colors.info }}>ดูภาระงานทั้งทีม</Text>
            </Pressable>
          </View>
        </Card>
      </>}

      <SectionLabel>{owner ? 'งานครบกำหนดวันนี้ของทีม' : 'งานครบกำหนดวันนี้'}</SectionLabel>
      <Card>
        {otherToday.length === 0 ? (
          <EmptyNote>{myDay.isLoading ? 'กำลังโหลดงานวันนี้…' : myDay.data ? 'ไม่มีงานครบกำหนดวันนี้' : 'ยังโหลดงานวันนี้ไม่ได้'}</EmptyNote>
        ) : (
          otherToday.map((item, index) => (
            <View key={item.id}>
              {index > 0 && <View style={styles.divider} />}
              <AgendaRow item={item} onPress={() => openItem(item)} onPersonPress={openPerson} />
            </View>
          ))
        )}
        <Pressable accessibilityRole="button" style={styles.peopleButton} onPress={() => router.push('/(tabs)/tasks')}>
          <Text style={{ color: colors.info }}>ดูงานทั้งหมด / เพิ่มงาน</Text>
        </Pressable>
      </Card>

      <SectionLabel>{owner ? 'นัดวันนี้ของสำนักงาน' : 'นัดวันนี้'}</SectionLabel>
      {appointments.isError && <ErrorNote message="โหลดนัดวันนี้ไม่สำเร็จ" onRetry={() => appointments.refetch()} />}
      <Card>
        {courtToday.length === 0 ? (
          <EmptyNote>{appointments.isLoading ? 'กำลังโหลดนัดวันนี้…' : appointments.data ? 'วันนี้ไม่มีนัดหมาย' : 'ยังโหลดนัดวันนี้ไม่ได้'}</EmptyNote>
        ) : (
          courtToday.map((item, index) => (
            <View key={item.id}>
              {index > 0 && <View style={styles.divider} />}
              <AgendaRow item={item} onPress={() => openItem(item)} onPersonPress={openPerson} />
              <Pressable accessibilityRole="button" style={{ minHeight: 44, justifyContent: 'center', paddingLeft: 60 }} onPress={() => router.push(`/event/${item.entityId}/team`)}>
                <Text style={{ color: colors.info }}>ดู / จัดทีมที่ไปด้วย</Text>
              </Pressable>
            </View>
          ))
        )}
      </Card>

      {owner && <>
        <SectionLabel>ชุดเบิกที่ต้องจัดการ</SectionLabel>
        <Card>
          {claims.isError ? <ErrorNote message="โหลดชุดเบิกไม่ได้" onRetry={() => claims.refetch()} /> : <View style={{ flexDirection: 'row', gap: spacing.md }}>
            {(['PENDING', 'APPROVED'] as const).map((status) => {
              const rows = claims.data?.filter((item) => item.status === status);
              const label = status === 'PENDING' ? 'รออนุมัติ' : 'รอจ่าย';
              return <Pressable key={status} accessibilityRole="button" accessibilityLabel={`ดูชุดเบิก${label}`}
                onPress={() => router.push(`/expenses/claims?status=${status}`)} style={{ flex: 1, minHeight: 64, gap: 2 }}>
                <Text style={{ color: colors.muted }}>{label}</Text>
                <Text style={{ color: colors.ink, fontSize: 22, fontWeight: '700' }}>{rows?.length ?? '—'} ชุด</Text>
                <Text style={{ color: colors.info }}>{rows ? `${formatMoney(rows.reduce((sum, item) => sum + item.totalAmount, 0))} ฿ · ดูรายการ` : 'กำลังโหลด…'}</Text>
              </Pressable>;
            })}
          </View>}
        </Card>
      </>}

      <View style={styles.statRow}>
        <StatCard label="นัดวันนี้" value={appointments.data || myDay.data ? courtToday.length : '—'} tone="court" />
        <StatCard
          label="เกินกำหนด"
          value={myDay.data?.overdue.length ?? '—'}
          tone="warn"
        />
        <StatCard label="คดีเปิด" value={stats.data?.stats.openCases ?? '—'} />
      </View>

      {(myDay.data?.overdue.length ?? 0) > 0 ? (
        <>
          <SectionLabel>เกินกำหนด</SectionLabel>
          <Card style={{ borderColor: colors.warnSoft }}>
            {myDay.data!.overdue.map((item, index) => (
              <View key={item.id}>
                {index > 0 && <View style={styles.divider} />}
                <AgendaRow item={item} onPress={() => openItem(item)} onPersonPress={openPerson} />
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
            <Text style={styles.shortcutLabel} numberOfLines={1}>
              {shortcut.label}
            </Text>
          </Pressable>
        ))}
      </View>
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
    backgroundColor: colors.ink,
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
  bellBadgeText: { color: colors.surface, fontSize: 9, fontWeight: '700' },
  bellDot: { position: 'absolute', top: 8, right: 8, width: 9, height: 9, borderRadius: 5, backgroundColor: colors.warn, borderWidth: 1.5, borderColor: colors.bg },
  hello: { fontSize: 24, fontFamily: fonts.bold, color: colors.ink },
  date: { fontSize: 13, color: colors.muted, marginTop: 2 },
  personDay: { paddingVertical: spacing.md, gap: spacing.xs },
  personHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  personIdentity: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 48 },
  personAvatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.infoSoft, alignItems: 'center', justifyContent: 'center' },
  personInitials: { color: colors.info, fontFamily: fonts.bold, fontSize: 12 },
  personName: { flex: 1, color: colors.ink, fontFamily: fonts.semibold, fontSize: 15 },
  personLinks: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center' },
  personLink: { color: colors.info, fontSize: 12, fontWeight: '600' },
  personSummary: { color: colors.muted, fontSize: 13 },
  peopleButton: { minHeight: 44, justifyContent: 'center' },
  peopleActions: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: spacing.md },
  statRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.lg },
  shortcutRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    rowGap: spacing.md,
    marginTop: spacing.md,
  },
  shortcut: { alignItems: 'center', gap: spacing.xs, flexBasis: '25%', minHeight: 64 },
  shortcutIcon: {
    width: 46,
    height: 46,
    borderRadius: 23,
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

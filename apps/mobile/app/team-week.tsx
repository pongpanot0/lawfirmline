import React, { useCallback, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { ChevronRight } from 'lucide-react-native';
import { canAssignFirmRole, FirmRole, hasFirmCapability, HEAVY_DAY_POINTS, type PersonWorkload, type TeamRadar, type TeamRadarDay } from '@lawfirm/shared';
import { useAuth } from '@/api/auth';
import { api } from '@/api/client';
import { Text } from '@/components/AppText';
import { Button, Card, EmptyNote, ErrorNote, FilterTabs, Loading, PageIntro, SectionLabel, Tag } from '@/components/ui';
import { DatePicker } from '@/components/DatePicker';
import { Disclosure } from '@/components/Disclosure';
import { FieldError } from '@/components/Form';
import { ReassignSheet } from '@/components/ReassignSheet';
import type { TaskItem } from '@/api/types';
import { bangkokDay, initials, thDate, thTime } from '@/format';
import { CHROME_MAX_SCALE, colors, pageContent, radius, spacing } from '@/theme';

const TH_DOW_SHORT = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'];
/** A calendar day (YYYY-MM-DD) read on the Bangkok wall clock. */
const noonOf = (day: string) => `${day}T12:00:00+07:00`;

/** Seven days in one compact row: weekday, date, and only the marks that matter (ลา, งานแน่น, ศาล). */
function WeekStrip({ days }: { days: TeamRadarDay[] }) {
  return <View style={styles.strip}>
    {days.map(day => {
      const date = new Date(noonOf(day.date));
      const heavy = day.points >= HEAVY_DAY_POINTS;
      const load = day.taskCount + day.eventCount;
      const label = `${thDate(noonOf(day.date))}${day.onLeave ? ' ลา' : ''}${heavy ? ' งานแน่น' : ''} · งาน ${day.taskCount} · นัด ${day.eventCount}${day.courtCount ? ` · ศาล ${day.courtCount}` : ''} · ภาระ ${day.points} คะแนน`;
      return <View key={day.date} accessible accessibilityLabel={label}
        style={[styles.day, day.onLeave && { backgroundColor: colors.warnSoft }, heavy && { borderColor: colors.warn }]}>
        <Text maxFontSizeMultiplier={CHROME_MAX_SCALE} style={styles.dayDow}>{TH_DOW_SHORT[(date.getUTCDay())]}</Text>
        <Text maxFontSizeMultiplier={CHROME_MAX_SCALE} style={styles.dayNum}>{Number(day.date.slice(8, 10))}</Text>
        <Text maxFontSizeMultiplier={CHROME_MAX_SCALE} style={[styles.dayMark, day.onLeave || heavy ? { color: colors.warn } : null]}>
          {day.onLeave ? 'ลา' : heavy ? 'แน่น' : load ? String(load) : '·'}
        </Text>
        {day.courtCount > 0 ? <View style={styles.courtDot} /> : null}
      </View>;
    })}
  </View>;
}

export default function TeamWeek() {
  const { date } = useLocalSearchParams<{ date?: string }>();
  const { user } = useAuth();
  const router = useRouter();
  const pickedDate = !!date && /^\d{4}-\d{2}-\d{2}$/.test(date);
  const [start, setStart] = useState(pickedDate ? date! : bangkokDay(new Date().toISOString()));
  const [person, setPerson] = useState('');
  const owner = hasFirmCapability(user?.firmRole, 'runOperations');
  const canView = owner || user?.firmRole === 'SENIOR_LAWYER';
  // Opened from add-task with a date: the question is "who can take this", so the lightest load comes first.
  const [lightFirst, setLightFirst] = useState(pickedDate);
  const [moving, setMoving] = useState<TaskItem | null>(null), [opening, setOpening] = useState('');
  const [moveError, setMoveError] = useState<{ taskId: string; message: string } | null>(null);
  const radar = useQuery({ queryKey: ['team-radar', start], enabled: canView, queryFn: () => api<TeamRadar>(`/operations/radar?date=${start}`) });
  const detail = useQuery({ queryKey: ['person-workload', person, start], enabled: canView && !!person,
    queryFn: () => api<PersonWorkload>(`/operations/people/${person}?from=${start}`) });
  useFocusEffect(useCallback(() => {
    if (canView) { void radar.refetch(); if (person) void detail.refetch(); }
  }, [canView, start, person, radar.refetch, detail.refetch]));
  if (!canView) return <EmptyNote>หน้านี้สำหรับ Owner ผู้จัดการสำนักงาน และ Senior</EmptyNote>;
  const members = [...(radar.data?.members ?? [])].sort((a, b) => (lightFirst ? 1 : -1) * (a.openPoints - b.openPoints || a.reviewCount - b.reviewCount));
  const openMove = async (taskId: string) => {
    setOpening(taskId); setMoveError(null);
    try { setMoving(await api<TaskItem>(`/tasks/${taskId}`)); }
    catch (error) { setMoveError({ taskId, message: `เปิดงานเพื่อย้ายไม่ได้ · ${error instanceof Error ? error.message : 'ลองโหลดล่าสุด'}` }); }
    finally { setOpening(''); }
  };
  return <><ScrollView style={{ backgroundColor: colors.bg }} contentContainerStyle={pageContent}
    refreshControl={<RefreshControl refreshing={radar.isRefetching} onRefresh={() => { void radar.refetch(); if (person) void detail.refetch(); }} />}>
    <Stack.Screen options={{ title: 'ภาระงานทีม 7 วัน' }} />
    <PageIntro detailOnly title="ภาระงานทีม 7 วัน" detail="ดูงาน นัด และวันลาก่อนเลือกคนรับงาน · คะแนนงานไม่ได้บอกชั่วโมงว่าง" />
    <DatePicker label="เริ่มดูตั้งแต่วันที่" value={start} onChange={value => { setStart(value); setPerson(''); }} />
    <FilterTabs items={[{ value: 'heavy', label: 'ภาระมากก่อน' }, { value: 'light', label: 'ภาระน้อยก่อน' }]}
      value={lightFirst ? 'light' : 'heavy'} onChange={value => setLightFirst(value === 'light')} />
    <Text style={styles.legend}>ตัวเลขใต้วันที่ = งานและนัดของวันนั้น · จุดสีทอง = มีนัดศาล</Text>
    {radar.isLoading && <Loading label="กำลังตรวจภาระงานทีม…" />}
    {radar.isError && <ErrorNote message="ตรวจภาระงานล่าสุดไม่ได้ ลองโหลดใหม่ก่อนมอบหมาย" onRetry={() => radar.refetch()} />}
    {members.map(member => {
      const name = `${member.firstName} ${member.lastName}`;
      const facts = [
        `งานเปิด ${member.openCount}`,
        ...(member.openPoints ? [`ภาระ ${member.openPoints} คะแนน`] : []),
        ...(member.reviewCount ? [`รอตรวจ ${member.reviewCount}`] : []),
        ...(member.unscheduledCount ? [`ยังไม่ลงวัน ${member.unscheduledCount}`] : []),
      ].join(' · ');
      const expanded = person === member.userId;
      const canAssign = owner && (member.userId === user?.id || canAssignFirmRole(user!.firmRole as FirmRole, member.role as FirmRole));
      return <Card key={member.userId} style={{ gap: spacing.sm, marginTop: spacing.md }}>
        {/* Identity row: the person's page is one tap on their name. */}
        <Pressable accessibilityRole="button" accessibilityLabel={`ดูรายละเอียด ${name} · ${facts}${member.overdueCount ? ` · เกินกำหนด ${member.overdueCount}` : ''}`}
          onPress={() => router.push({ pathname: '/person/[id]', params: { id: member.userId, from: start } })}
          style={({ pressed }) => [styles.identity, pressed && { opacity: 0.7 }]}>
          <View style={styles.avatar}><Text maxFontSizeMultiplier={CHROME_MAX_SCALE} style={styles.avatarText}>{initials(name)}</Text></View>
          <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
            <Text style={styles.name}>{name}</Text>
            <Text style={styles.meta}>{facts}</Text>
          </View>
          {member.overdueCount > 0 && <Tag tone="due">{`เกินกำหนด ${member.overdueCount}`}</Tag>}
          <ChevronRight size={18} color={colors.faint} />
        </Pressable>
        <WeekStrip days={member.days} />
        <Disclosure variant="plain" title={`งานและนัดของ ${member.firstName}`} summary={expanded ? undefined : 'ดูงานรายชิ้น ย้ายงาน หรือมอบหมายเพิ่ม'}
          open={expanded} onToggle={open => setPerson(open ? member.userId : '')}>
          {expanded && <>
            {detail.isLoading && <Loading label="กำลังโหลดรายละเอียด…" />}
            {detail.isError && <ErrorNote message="โหลดรายละเอียดไม่ได้" onRetry={() => detail.refetch()} />}
            {detail.data && !detail.data.events.length && !detail.data.tasks.length && <EmptyNote>ไม่มีงานหรือนัดในช่วงนี้</EmptyNote>}
            {!!detail.data?.events.length && <SectionLabel style={styles.subhead}>นัดหมาย</SectionLabel>}
            {detail.data?.events.map(event => <Text key={event.id} style={styles.eventLine}>
              {thDate(event.startAt)} {thTime(event.startAt)} · {event.title}{event.courtName ? ` · ${event.courtName}` : ''}
            </Text>)}
            {!!detail.data?.tasks.length && <SectionLabel style={styles.subhead}>งาน</SectionLabel>}
            {detail.data?.tasks.map(task => {
              const when = task.scheduledFor ? thDate(noonOf(task.scheduledFor)) : task.dueDate ? `กำหนด ${thDate(task.dueDate)}` : 'ยังไม่ลงวัน';
              const openable = owner || !!task.case || person === user?.id;
              const body = <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                <Text style={styles.taskTitle}>{task.title}</Text>
                <Text style={[styles.meta, task.overdue && { color: colors.warn }]}>{task.overdue ? `เกินกำหนด · ${when}` : when}</Text>
                {!!task.holdReason && <Text style={{ color: colors.warn, fontSize: 13 }}>ติด: {task.holdReason}</Text>}
              </View>;
              return <View key={task.id} style={styles.taskRow}>
                {openable
                  ? <Pressable accessibilityRole="button" accessibilityLabel={`เปิดงาน ${task.title} · ${when}`}
                    onPress={() => router.push({ pathname: '/task/new', params: { id: task.id } })}
                    style={({ pressed }) => [styles.taskOpen, pressed && { opacity: 0.7 }]}>
                    {body}<ChevronRight size={18} color={colors.faint} />
                  </Pressable>
                  : <View style={styles.taskOpen}>{body}</View>}
                {owner && <Pressable accessibilityRole="button" accessibilityLabel={`เทียบคนและย้ายงาน ${task.title}`}
                  disabled={!!opening || detail.isError || detail.isFetching} onPress={() => void openMove(task.id)}
                  style={({ pressed }) => [styles.move, (!!opening || detail.isFetching) && { opacity: 0.5 }, pressed && { backgroundColor: colors.soft }]}>
                  <Text maxFontSizeMultiplier={CHROME_MAX_SCALE} style={styles.moveText}>{opening === task.id ? '…' : 'ย้าย'}</Text>
                </Pressable>}
                {moveError?.taskId === task.id ? <View style={{ width: '100%' }}><FieldError message={moveError.message} /></View> : null}
              </View>;
            })}
            {canAssign && <Button variant="link" title={`มอบหมายงานให้ ${member.firstName}`}
              onPress={() => router.push({ pathname: '/task/new', params: { assigneeId: member.userId } })} />}
          </>}
        </Disclosure>
      </Card>;
    })}
    {radar.data?.members.length === 0 && <EmptyNote>ยังไม่มีสมาชิกทีม</EmptyNote>}
  </ScrollView><ReassignSheet task={moving} caseId={moving?.caseId} onClose={() => { setMoving(null); void radar.refetch(); void detail.refetch(); }} /></>;
}

const styles = StyleSheet.create({
  legend: { color: colors.muted, fontSize: 13, lineHeight: 20 },
  identity: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 48 },
  avatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.soft, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: colors.ink, fontWeight: '700', fontSize: 12 },
  name: { color: colors.ink, fontWeight: '600', fontSize: 15 },
  meta: { color: colors.muted, fontSize: 13 },
  strip: { flexDirection: 'row', gap: 4 },
  day: { flex: 1, minWidth: 0, minHeight: 64, alignItems: 'center', justifyContent: 'center', gap: 1, paddingVertical: spacing.xs,
    borderRadius: radius.button, backgroundColor: colors.soft, borderWidth: 1, borderColor: 'transparent' },
  dayDow: { color: colors.muted, fontSize: 11 },
  dayNum: { color: colors.ink, fontWeight: '700', fontSize: 14, fontVariant: ['tabular-nums'] },
  dayMark: { color: colors.muted, fontSize: 11, fontWeight: '600' },
  courtDot: { position: 'absolute', top: 4, right: 4, width: 5, height: 5, borderRadius: 3, backgroundColor: colors.accent },
  subhead: { marginTop: spacing.sm, marginBottom: 0, fontSize: 14 },
  eventLine: { color: colors.text, fontSize: 14, lineHeight: 22 },
  taskRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.sm, borderTopWidth: 1, borderTopColor: colors.soft },
  taskOpen: { flex: 1, minWidth: 0, minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm },
  taskTitle: { color: colors.text, fontWeight: '600', fontSize: 14 },
  move: { minHeight: 44, minWidth: 56, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.md,
    borderWidth: 1, borderColor: colors.line, borderRadius: radius.button },
  moveText: { color: colors.info, fontWeight: '600' },
});

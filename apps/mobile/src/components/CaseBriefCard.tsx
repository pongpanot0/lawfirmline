import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { CalendarClock, CalendarPlus, Check, ChevronRight } from 'lucide-react-native';
import { MAIN_PATH, stageStep } from '@/case-stage';
import { liftedCard } from '@/components/Masthead';
import { ProgressRing } from '@/components/ProgressRing';
import { ApiError } from '@/api/client';
import { useCaseBrief } from '@/api/hooks';
import { Text } from '@/components/AppText';
import { Card, ErrorState, EVENT_KIND_LABEL, LoadingState, SectionLabel, TASK_STATUS_LABEL, Tag } from '@/components/ui';
import { bangkokDay, formatMoney, thDate, thDateLong, thTime } from '@/format';
import { colors, radius, spacing, TOUCH, typeScale } from '@/theme';

const DECISIONS: Record<string, string> = {
  FILE_SUIT: 'ฟ้องได้', DO_NOT_FILE: 'ไม่ควรฟ้อง', NEGOTIATE_FIRST: 'เจรจาก่อน',
  SEND_NOTICE: 'ส่งหนังสือบอกกล่าวก่อน', COMPLAIN_TO_AUTHORITY: 'ร้องเรียนหน่วยงาน',
  CONSULTATION_ONLY: 'ให้คำปรึกษาอย่างเดียว', PENDING: 'รอประเมิน',
};

/** "วันนี้" / "พรุ่งนี้" / "อีก 16 วัน", counted in Bangkok calendar days. */
function daysAway(iso: string, now = new Date()): string {
  const days = Math.round((Date.parse(bangkokDay(iso)) - Date.parse(bangkokDay(now.toISOString()))) / 86_400_000);
  return days <= 0 ? 'วันนี้' : days === 1 ? 'พรุ่งนี้' : `อีก ${days} วัน`;
}

/** Shown only when it has a value; the brief no longer prints "ไม่มีข้อมูล" rows. */
function Fact({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return <View style={styles.fact}>
    <Text style={styles.label}>{label}</Text>
    <Text selectable style={styles.value}>{value}</Text>
  </View>;
}

function briefError(error: unknown) {
  const status = error instanceof ApiError ? error.status : null;
  return {
    message: status === 403 ? 'คุณไม่มีสิทธิ์ดูภาพรวมคดีนี้' : status === 404 ? 'ไม่พบภาพรวมคดีนี้' : 'โหลดภาพรวมคดีไม่สำเร็จ',
    retryable: status !== 403 && status !== 404,
  };
}

/**
 * The first card on case detail: the case's next appointment, big enough to read at the court counter.
 * Court dates sit on the brass tint (design.md: brass marks court dates). Owns the brief's loading and error.
 */
export function CaseNextHearing({ caseId }: { caseId: string }) {
  const query = useCaseBrief(caseId);
  const router = useRouter();
  if (query.isLoading) return <LoadingState inline label="กำลังโหลดนัดถัดไป…" />;
  if (query.isError) {
    const { message, retryable } = briefError(query.error);
    return <View style={{ marginBottom: spacing.md }}><ErrorState title="ภาพรวมคดี" message={message} onRetry={retryable ? () => query.refetch() : undefined} /></View>;
  }
  const next = query.data?.nextEvent;
  if (!next) return <Card style={styles.nextEmpty}>
    <CalendarClock size={20} color={colors.muted} />
    <Text style={[styles.value, { flex: 1, color: colors.muted }]}>ยังไม่มีนัดถัดไป</Text>
    <Pressable accessibilityRole="button" accessibilityLabel="เพิ่มนัดหมายของคดีนี้" onPress={() => router.push(`/event/new?caseId=${caseId}`)}
      style={({ pressed }) => [styles.addLink, pressed && { opacity: 0.6 }]}>
      <CalendarPlus size={16} color={colors.info} /><Text style={styles.addLinkText}>เพิ่มนัด</Text>
    </Pressable>
  </Card>;

  const kind = EVENT_KIND_LABEL[next.type] ?? { label: 'นัดหมาย', tone: 'plain' as const };
  const court = next.type === 'COURT_DATE';
  return <Pressable accessibilityRole="button"
    accessibilityLabel={`นัดถัดไป ${kind.label} ${thDateLong(next.at)} เวลา ${thTime(next.at)} ${daysAway(next.at)} ${next.title}${next.courtName ? ` ${next.courtName}` : ''}`}
    accessibilityHint="เปิดรายละเอียดนัด" onPress={() => router.push(`/event/${next.id}`)}
    style={({ pressed }) => [styles.next, court && styles.nextCourt, pressed && { opacity: 0.85 }]}>
    <View style={styles.nextTop}>
      <Text style={styles.nextWhen}>{thDate(next.at)} · {thTime(next.at)}</Text>
      <Tag tone={kind.tone}>{kind.label}</Tag>
    </View>
    <View style={styles.nextBottom}>
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <Text style={styles.value}>
          <Text style={[styles.value, styles.nextAway, court && { color: colors.accentInk }]}>{daysAway(next.at)}</Text>
          {' · '}{next.title}
        </Text>
        {next.courtName && next.courtName !== next.title ? <Text style={styles.label}>{next.courtName}</Text> : null}
      </View>
      <ChevronRight size={18} color={court ? colors.accentInk : colors.muted} />
    </View>
  </Pressable>;
}

/** The lifted card under the case masthead: stage ring (n/10), the stage name, what comes next, and the step dots. */
export function CaseStageCard({ caseId }: { caseId: string }) {
  const brief = useCaseBrief(caseId).data;
  const progress = stageStep(brief?.stage);
  const index = progress?.index ?? -1, step = progress?.step ?? 0, total = MAIN_PATH.length;
  const next = progress?.next ?? null;
  return <Card style={[liftedCard, { gap: spacing.lg, marginBottom: spacing.md }]}>
    <View style={styles.stageHead}>
      {step > 0 ? <ProgressRing value={step} total={total} label={`ขั้นที่ ${step} จาก ${total}`} /> : null}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.label}>ความคืบหน้าคดี</Text>
        <Text accessibilityRole="header" style={styles.stageName}>{progress?.label ?? (brief?.stage || 'ยังไม่ระบุขั้นตอน')}</Text>
        {next ? <Text style={styles.label}>ถัดไป: {next}</Text>
          : brief?.stageChangedAt ? <Text style={styles.label}>ตั้งแต่ {thDate(brief.stageChangedAt)}</Text> : null}
      </View>
    </View>
    {step > 0 ? <View accessible={false} importantForAccessibility="no-hide-descendants" style={styles.track}>
      {MAIN_PATH.map((item, i) => <React.Fragment key={item}>
        {i > 0 ? <View style={[styles.trackLine, i <= index && styles.trackLineDone]} /> : null}
        <View style={[styles.dot, i < index && styles.dotDone, i === index && styles.dotNow]}>
          {i < index ? <Check size={11} color={colors.surface} strokeWidth={3} /> : i === index ? <View style={styles.dotCore} /> : null}
        </View>
      </React.Fragment>)}
    </View> : null}
  </Card>;
}

/** Where the case stands: stage, intake assessment, open work to chase and recent activity. Facts shown elsewhere are not repeated. */
export function CaseBriefCard({ caseId }: { caseId: string }) {
  const query = useCaseBrief(caseId);
  const router = useRouter();
  const brief = query.data;
  if (!brief) return null;
  const assessment = brief.assessment;
  return <Card style={{ gap: spacing.md, marginTop: spacing.md }}>
    <Text accessibilityRole="header" style={styles.title}>ความคืบหน้า</Text>
    <Fact label="ผลประเมิน" value={assessment ? [
      assessment.decision && (DECISIONS[assessment.decision] ?? assessment.decision), assessment.caseStrength,
    ].filter(Boolean).join(' · ') : null} />
    <Fact label="หมายเหตุประเมิน" value={assessment?.notes} />
    <Fact label="ความเสียหายประมาณ" value={assessment?.estimatedDamage != null ? `${formatMoney(assessment.estimatedDamage)} บาท` : null} />
    <Fact label="ทนายฝั่งตรงข้าม" value={brief.opposingCounsel.join(', ')} />
    <SectionLabel>งานค้าง · ต้องตามใคร</SectionLabel>
    {brief.openTasks.length ? brief.openTasks.map(task => <Pressable key={task.id} accessibilityRole="button"
      accessibilityLabel={`เปิดงาน ${task.title}`} onPress={() => router.push(`/task/${task.id}`)}
      style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.soft }]}>
      <View style={styles.rowBody}>
        <Text style={styles.value}>{task.title}</Text>
        <Text style={styles.label}>{task.assigneeName ?? 'ยังไม่มีผู้รับผิดชอบ'} · {TASK_STATUS_LABEL[task.status] ?? task.status}</Text>
        <View style={styles.tags}>
          <Tag tone={task.daysStuck >= 3 ? 'due' : 'plain'}>{`ค้าง ${task.daysStuck} วัน`}</Tag>
          {task.daysOverdue > 0 ? <Tag tone="due">{`เลยกำหนด ${task.daysOverdue} วัน`}</Tag> : null}
        </View>
        {task.holdReason ? <Text style={styles.label}>พักไว้: {task.holdReason}</Text> : null}
      </View><ChevronRight size={18} color={colors.muted} />
    </Pressable>) : <Text style={styles.label}>ไม่มีงานค้าง</Text>}
    {brief.recentEvents.length ? <>
      <SectionLabel>ล่าสุด</SectionLabel>
      {brief.recentEvents.map((event, index) => <Text key={`${event.at}:${index}`} style={styles.recent}>
        <Text style={styles.label}>{thDate(event.at)}</Text>  {event.title}
      </Text>)}
    </> : null}
  </Card>;
}

const styles = StyleSheet.create({
  stageHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg },
  stageName: { ...typeScale.title, color: colors.ink },
  track: { flexDirection: 'row', alignItems: 'center' },
  trackLine: { flex: 1, height: 2, backgroundColor: colors.line },
  trackLineDone: { backgroundColor: colors.good },
  dot: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: colors.line, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  dotDone: { backgroundColor: colors.good, borderColor: colors.good },
  dotNow: { width: 26, height: 26, borderRadius: 13, borderColor: colors.ink, borderWidth: 2.5 },
  dotCore: { width: 12, height: 12, borderRadius: 6, backgroundColor: colors.ink },
  title: { ...typeScale.section, color: colors.ink },
  fact: { gap: spacing.xs },
  label: { ...typeScale.meta, color: colors.muted },
  value: { ...typeScale.body, color: colors.text },
  recent: { ...typeScale.body, color: colors.text },
  row: { minHeight: TOUCH, paddingVertical: spacing.md, borderTopWidth: 1, borderTopColor: colors.divider,
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  rowBody: { flex: 1, minWidth: 0, gap: spacing.xs },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  next: {
    marginBottom: spacing.md, padding: spacing.lg, gap: spacing.sm, borderRadius: radius.card,
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line,
  },
  nextCourt: { backgroundColor: colors.accentSoft, borderColor: colors.accentEdge },
  nextTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  nextWhen: { ...typeScale.display, color: colors.ink, fontVariant: ['tabular-nums'], flexShrink: 1 },
  nextAway: { fontWeight: '700', color: colors.ink },
  nextBottom: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  nextEmpty: { marginBottom: spacing.md, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm },
  addLink: { minHeight: TOUCH, flexDirection: 'row', alignItems: 'center', gap: spacing.xs, paddingHorizontal: spacing.xs },
  addLinkText: { color: colors.info, fontWeight: '600', fontSize: 15 },
});

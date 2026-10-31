import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { ChevronRight } from 'lucide-react-native';
import { CASE_STAGE_LABELS_TH, PARTICIPANT_ROLE_LABELS, PARTY_ROLE_LABELS, type CaseStage, type ParticipantRole, type PartyRole } from '@lawfirm/shared';
import { ApiError } from '@/api/client';
import { useCaseBrief } from '@/api/hooks';
import { Text } from '@/components/AppText';
import { Card, ErrorState, LoadingState, SectionLabel, TASK_STATUS_LABEL, Tag } from '@/components/ui';
import { formatMoney, thDate, thTime } from '@/format';
import { colors, spacing, TOUCH, typeScale } from '@/theme';

const DECISIONS: Record<string, string> = {
  FILE_SUIT: 'ฟ้องได้', DO_NOT_FILE: 'ไม่ควรฟ้อง', NEGOTIATE_FIRST: 'เจรจาก่อน',
  SEND_NOTICE: 'ส่งหนังสือบอกกล่าวก่อน', COMPLAIN_TO_AUTHORITY: 'ร้องเรียนหน่วยงาน',
  CONSULTATION_ONLY: 'ให้คำปรึกษาอย่างเดียว', PENDING: 'รอประเมิน',
};

function Fact({ label, value }: { label: string; value?: string | null }) {
  return <View style={styles.fact}>
    <Text style={styles.label}>{label}</Text>
    <Text selectable style={styles.value}>{value || 'ไม่มีข้อมูล'}</Text>
  </View>;
}

export function CaseBriefCard({ caseId }: { caseId: string }) {
  const query = useCaseBrief(caseId);
  const router = useRouter();
  if (query.isLoading) return <LoadingState inline label="กำลังโหลดภาพรวมคดี…" />;
  if (query.isError) {
    const status = query.error instanceof ApiError ? query.error.status : null;
    return <ErrorState title="ภาพรวมคดี" message={status === 403 ? 'คุณไม่มีสิทธิ์ดูภาพรวมคดีนี้'
      : status === 404 ? 'ไม่พบภาพรวมคดีนี้' : 'โหลดภาพรวมคดีไม่สำเร็จ'}
      onRetry={status === 403 || status === 404 ? undefined : () => query.refetch()} />;
  }
  const brief = query.data;
  if (!brief) return null;
  const stage = brief.stage ? CASE_STAGE_LABELS_TH[brief.stage as CaseStage] ?? brief.stage : null;
  const next = brief.nextEvent;
  return <Card style={{ gap: spacing.md, marginBottom: spacing.md }}>
    <Text accessibilityRole="header" style={styles.title}>ภาพรวมคดี</Text>
    <Fact label="คดี" value={[brief.ownRef, brief.title].filter(Boolean).join(' · ')} />
    <Fact label="ลูกความ" value={brief.clientName} />
    <Fact label="เราเป็น" value={brief.partyRole ? PARTY_ROLE_LABELS[brief.partyRole as PartyRole] ?? brief.partyRole : null} />
    <Fact label="ฝ่ายเรา" value={brief.ourParties.join(', ')} />
    <Fact label="คู่กรณี" value={brief.opponents.map(item => `${item.name}${item.role ? ` (${PARTICIPANT_ROLE_LABELS[item.role as ParticipantRole] ?? item.role})` : ''}`).join(', ')} />
    <Fact label="ทนายฝั่งตรงข้าม" value={brief.opposingCounsel.join(', ')} />
    <Fact label="ศาล / เลขคดี" value={[
      brief.courtName, brief.blackCaseNumber && `ดำ ${brief.blackCaseNumber}`, brief.redCaseNumber && `แดง ${brief.redCaseNumber}`,
    ].filter(Boolean).join(' · ')} />
    <Fact label="ทุนทรัพย์" value={brief.claimedAmount != null ? `${formatMoney(brief.claimedAmount)} บาท` : null} />
    <Fact label="ผลประเมิน" value={brief.assessment ? [
      brief.assessment.decision && (DECISIONS[brief.assessment.decision] ?? brief.assessment.decision), brief.assessment.caseStrength,
    ].filter(Boolean).join(' · ') : null} />
    {brief.assessment?.notes ? <Fact label="หมายเหตุประเมิน" value={brief.assessment.notes} /> : null}
    {brief.assessment?.estimatedDamage != null ? <Fact label="ความเสียหายประมาณ" value={`${formatMoney(brief.assessment.estimatedDamage)} บาท`} /> : null}
    <Fact label="ขั้นตอนตอนนี้" value={stage ? `${stage}${brief.stageChangedAt ? ` · ตั้งแต่ ${thDate(brief.stageChangedAt)}` : ''}` : null} />
    <Fact label="ทนายผู้รับผิดชอบ" value={brief.leadLawyerName} />
    <SectionLabel>นัดถัดไป</SectionLabel>
    {next ? <Pressable accessibilityRole="button" accessibilityLabel={`เปิดนัด ${next.title}`}
      onPress={() => router.push(`/event/${next.id}`)} style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.soft }]}>
      <View style={styles.rowBody}>
        <Text style={styles.value}>{next.title}</Text>
        <Text style={styles.label}>{thDate(next.at)} · {thTime(next.at)}{next.courtName ? ` · ${next.courtName}` : ''}</Text>
      </View><ChevronRight size={18} color={colors.muted} />
    </Pressable> : <Text style={styles.label}>ไม่มีข้อมูลนัดถัดไป</Text>}
    <SectionLabel>ล่าสุด</SectionLabel>
    {brief.recentEvents.length ? brief.recentEvents.map((event, index) => <Text key={`${event.at}:${index}`} style={styles.value}>
      {thDate(event.at)} · {event.title}
    </Text>) : <Text style={styles.label}>ไม่มีข้อมูล</Text>}
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
  </Card>;
}

const styles = StyleSheet.create({
  title: { ...typeScale.section, color: colors.ink },
  fact: { gap: spacing.xs },
  label: { ...typeScale.meta, color: colors.muted },
  value: { ...typeScale.body, color: colors.text },
  row: { minHeight: TOUCH, paddingVertical: spacing.md, borderTopWidth: 1, borderTopColor: colors.divider,
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  rowBody: { flex: 1, minWidth: 0, gap: spacing.xs },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
});

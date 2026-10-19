import React, { useState } from 'react';
import { Alert, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '@/components/AppText';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Camera, Check, ChevronRight, FileText, ShieldCheck } from 'lucide-react-native';
import { groupParticipantsBySide, PARTICIPANT_ROLE_LABELS, PARTY_ROLE_LABELS, type ParticipantRole, type PartyRole } from '@lawfirm/shared';
import { api, ApiError } from '@/api/client';
import { useAuth } from '@/api/auth';
import { canToggleTask } from '@/workflow';
import { openCaseDocument } from '@/api/files';
import {
  useCase,
  useCaseTasks,
  useInsuranceClaim,
  useToggleTask,
} from '@/api/hooks';
import { ReassignSheet } from '@/components/ReassignSheet';
import { CaseEmailTab } from '@/components/CaseEmailTab';
import type { CalendarEventItem, TaskItem } from '@/api/types';
import {
  Card,
  EmptyState,
  ErrorState,
  LoadingState,
  Button,
  Tag,
  TagTone,
  TASK_STATUS_LABEL,
} from '@/components/ui';
import { formatMoney, thDate, thTime } from '@/format';
import { CHROME_MAX_SCALE, colors, radius, shadow, spacing, pageContent, TOUCH, typeScale } from '@/theme';

const TABS = ['ภาพรวม', 'นัดหมาย', 'งาน', 'เอกสาร', 'อีเมล'] as const;
type TabName = (typeof TABS)[number];

const INSURANCE_STAGE_LABEL: Record<string, string> = {
  CLAIM_FILED: 'ยื่นเคลมแล้ว',
  DENIED_OR_PARTIAL: 'ปฏิเสธ/จ่ายบางส่วน',
  DEMAND_SENT: 'ส่ง demand แล้ว',
  OIC_COMPLAINT: 'ร้อง คปภ.',
  SUIT_FILED: 'ฟ้องคดีแล้ว',
};

const STATUS_LABEL: Record<string, { label: string; tone: TagTone }> = {
  OPEN: { label: 'เปิด', tone: 'info' },
  DRAFTING: { label: 'ร่างเอกสาร', tone: 'info' },
  COURT_DATE: { label: 'รอนัดศาล', tone: 'court' },
  PENDING: { label: 'รอดำเนินการ', tone: 'plain' },
  ARCHIVED: { label: 'เก็บเข้าคลัง', tone: 'plain' },
  IN_PROGRESS: { label: 'ดำเนินการ', tone: 'court' },
  ON_HOLD: { label: 'พักไว้', tone: 'plain' },
  CLOSED: { label: 'ปิดแล้ว', tone: 'ok' },
};

interface DocumentItem {
  id: string;
  filename?: string;
  name?: string;
  fileName?: string;
  version?: number;
  updatedAt?: string;
}

/** Label/value row; every row after the first sits under a divider hairline. */
function InfoRow({ label, value, onPress, first = false }: { label: string; value: string | null | undefined; onPress?: () => void; first?: boolean }) {
  if (onPress && value) return <Pressable accessibilityRole="button" accessibilityLabel={`${label} ${value}`} accessibilityHint="เปิดรายละเอียด" onPress={onPress}
    style={({ pressed }) => [styles.infoRow, !first && styles.infoRowRule, { minHeight: TOUCH, alignItems: 'center' }, pressed && { opacity: 0.6 }]}>
    <Text style={styles.infoLabel}>{label}</Text>
    <Text style={[styles.infoValue, { color: colors.info, fontWeight: '600' }]}>{value}</Text>
    <ChevronRight size={16} color={colors.info} />
  </Pressable>;
  return (
    <View style={[styles.infoRow, !first && styles.infoRowRule]}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>
        {value || '—'}
      </Text>
    </View>
  );
}

export default function CaseDetailScreen() {
  const { id, section } = useLocalSearchParams<{ id: string; section?: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [tab, setTab] = useState<TabName>(section === 'documents' ? 'เอกสาร' : section === 'email' ? 'อีเมล' : 'ภาพรวม');
  const [reassigning, setReassigning] = useState<TaskItem | null>(null);
  const [openingDoc, setOpeningDoc] = useState<string | null>(null);

  const caseQuery = useCase(id);
  const tasks = useCaseTasks(id);
  const toggle = useToggleTask();
  const insurance = useInsuranceClaim(id);
  // The calendar API has no case filter yet, so the case's events are picked out here.
  const events = useQuery({
    queryKey: ['case-events', id],
    queryFn: () =>
      api<CalendarEventItem[]>('/calendar/events').then((rows) =>
        rows.filter((event) => event.caseId === id),
      ),
    enabled: !!id && tab === 'นัดหมาย',
  });
  const documents = useQuery({
    queryKey: ['case-documents', id],
    queryFn: () => api<DocumentItem[]>(`/cases/${id}/documents`),
    enabled: !!id && tab === 'เอกสาร',
  });

  if (caseQuery.isLoading) return <View style={styles.screen}><LoadingState label="กำลังโหลดคดี…" /></View>;
  if (caseQuery.isError || !caseQuery.data)
    return (
      <View style={[styles.screen, { padding: spacing.lg }]}>
        <ErrorState message="โหลดข้อมูลคดีไม่สำเร็จ" onRetry={() => caseQuery.refetch()} />
      </View>
    );

  const detail = caseQuery.data;
  const status = STATUS_LABEL[detail.status] ?? { label: detail.status, tone: 'plain' as TagTone };
  const manager = user?.firmRole === 'OWNER' || user?.role === 'ADMIN' || user?.role === 'LAWYER';
  const closed = detail.status === 'CLOSED' || detail.status === 'ARCHIVED';
  const buddies = (detail.assignments ?? []).filter(item => item.assignmentType === 'BUDDY');
  const clientId = detail.client?.id;
  const caseRef = { id, ownRef: detail.ownRef, title: detail.title, leadLawyerId: detail.leadLawyer?.id };

  return (
    <>
      <Stack.Screen options={{
        title: 'คดี',
        headerRight: () => <Pressable accessibilityRole="button" accessibilityLabel="แก้ไขคดี" accessibilityHint="แก้รายละเอียดและจัดคนหลักคนรอง"
          onPress={() => router.push(`/case/new?id=${id}`)} style={({ pressed }) => [styles.headerAction, pressed && { opacity: 0.6 }]}>
          <Text maxFontSizeMultiplier={CHROME_MAX_SCALE} style={styles.headerActionText}>แก้ไข</Text>
        </Pressable>,
      }} />
      <ScrollView
        style={styles.screen}
        contentContainerStyle={pageContent}
        refreshControl={
          <RefreshControl
            refreshing={caseQuery.isRefetching}
            onRefresh={() => { caseQuery.refetch(); if (tab === 'อีเมล') queryClient.invalidateQueries({ queryKey: ['case-email-threads', id] }); }}
          />
        }
      >
        <View style={styles.header}>
          <Text accessibilityRole="header" style={styles.caseTitle}>{detail.title}</Text>
          <View style={styles.meta}>
            <Text style={styles.metaText}>{detail.ownRef}</Text>
            <Tag tone={status.tone}>{status.label}</Tag>
          </View>
        </View>
        <View accessibilityRole="tablist" style={styles.segment}>
          {TABS.map((name) => (
            <Pressable
              key={name}
              accessibilityRole="tab"
              accessibilityState={{ selected: tab === name }}
              style={({ pressed }) => [styles.segmentItem, tab === name ? styles.segmentItemOn : pressed && { backgroundColor: colors.soft }]}
              onPress={() => setTab(name)}
            >
              <Text maxFontSizeMultiplier={CHROME_MAX_SCALE} style={[styles.segmentText, tab === name && styles.segmentTextOn]}>
                {name}
              </Text>
            </Pressable>
          ))}
        </View>

        {tab === 'ภาพรวม' ? (
          <>
          <Card>
            <InfoRow
              first
              label="คนหลัก"
              onPress={detail.leadLawyer?.id ? () => router.push({ pathname: '/person/[id]', params: { id: detail.leadLawyer!.id } }) : undefined}
              value={
                detail.leadLawyer
                  ? `${detail.leadLawyer.firstName} ${detail.leadLawyer.lastName}`
                  : null
              }
            />
            {buddies.length ?
              buddies.map(item => <InfoRow key={item.userId} label="คนรอง"
                value={`${item.user.firstName} ${item.user.lastName}`} onPress={() => router.push({ pathname: '/person/[id]', params: { id: item.userId } })} />)
              : <InfoRow label="คนรอง" value={null} />}
            <InfoRow label="ลูกความ" value={detail.clientName ?? detail.client?.name}
              onPress={clientId ? () => router.push({ pathname: '/clients/[id]', params: { id: clientId } }) : undefined} />
            <InfoRow label="เราเป็น" value={detail.partyRole ? PARTY_ROLE_LABELS[detail.partyRole as PartyRole] : null} />
            <InfoRow label="ศาล" value={detail.courtName} />
            <InfoRow
              label="เลขคดี"
              value={
                [detail.blackCaseNumber, detail.redCaseNumber].filter(Boolean).join(' / ') || null
              }
            />
            <InfoRow
              label="ทุนทรัพย์"
              value={
                detail.claimedAmount != null
                  ? `${formatMoney(detail.claimedAmount)} บาท`
                  : null
              }
            />
            <InfoRow label="เปิดคดี" value={thDate(detail.openedAt)} />
            {detail.description ? (
              <>
                <View style={styles.divider} />
                <Text style={styles.description}>
                  {detail.description}
                </Text>
              </>
            ) : null}
          </Card>
          <Card style={{ marginTop: spacing.md }}>
            <View style={styles.cardHead}>
              <Text accessibilityRole="header" style={styles.cardTitle}>คู่ความ</Text>
              <Button title="เพิ่มคู่ความ" variant="link" onPress={() => router.push(`/case/${id}/party`)} />
            </View>
            {(detail.participants ?? []).length === 0
              ? <EmptyState compact>ยังไม่มีคู่ความ</EmptyState>
              : groupParticipantsBySide(detail.participants ?? []).map(group => <View key={group.side} style={{ marginTop: spacing.md }}>
                  <Text style={styles.groupLabel}>{group.label}</Text>
                  {group.items.map((p, index) => {
                    const role = PARTICIPANT_ROLE_LABELS[p.role as ParticipantRole] ?? p.role;
                    return <Pressable key={p.id} accessibilityRole="button" accessibilityLabel={`${p.name} · ${role}`} accessibilityHint="แก้ไขคู่ความ"
                      style={({ pressed }) => [styles.partyRow, index > 0 && styles.infoRowRule, pressed && { backgroundColor: colors.soft }]}
                      onPress={() => router.push(`/case/${id}/party?participantId=${p.id}`)}>
                      <Text style={{ flex: 1, color: colors.text, fontSize: 15 }}>{p.name} · {role}</Text>
                      <ChevronRight size={16} color={colors.faint} />
                    </Pressable>;
                  })}
                </View>)}
          </Card>
          </>
        ) : null}

        {/* 404 means the case has no insurance claim; only a real failure is shown. */}
        {tab === 'ภาพรวม' && insurance.isError && !(insurance.error instanceof ApiError && insurance.error.status === 404) ? (
          <View style={{ marginTop: spacing.md }}>
            <ErrorState message="โหลดข้อมูลสินไหมประกันภัยไม่ได้" onRetry={() => insurance.refetch()} />
          </View>
        ) : null}
        {tab === 'ภาพรวม' && insurance.data ? (
          <Card style={{ marginTop: spacing.md }}>
            <View style={[styles.cardHead, { gap: spacing.sm, paddingBottom: spacing.sm }]}>
              <View style={styles.iconTile}><ShieldCheck size={18} color={colors.accentInk} /></View>
              <Text accessibilityRole="header" style={[styles.cardTitle, { flex: 1 }]}>สินไหมประกันภัย</Text>
              <Tag tone="court">
                {INSURANCE_STAGE_LABEL[insurance.data.stage] ?? insurance.data.stage}
              </Tag>
            </View>
            <InfoRow label="บริษัทประกัน" value={insurance.data.insurerName} />
            <InfoRow label="เลขเคลม" value={insurance.data.claimNumber} />
            <InfoRow label="เลขกรมธรรม์" value={insurance.data.policyNumber} />
            {insurance.data.demandLetterDeadline ? (
              <InfoRow
                label="กำหนด demand letter"
                value={thDate(insurance.data.demandLetterDeadline)}
              />
            ) : null}
          </Card>
        ) : null}

        {tab === 'ภาพรวม' && manager ? (
          <View style={styles.lifecycle}>
            {closed
              ? <Button title="เปิดคดีอีกครั้ง" variant="secondary" onPress={() => router.push(`/case/${id}/close?action=reopen`)} />
              : <Button title="ปิดคดี · ตรวจรายการค้าง" variant="secondary" onPress={() => router.push(`/case/${id}/close`)} />}
            {detail.status === 'CLOSED' && <Button title="เก็บคดีเข้าคลัง" variant="link" onPress={() => router.push(`/case/${id}/close?action=archive`)} />}
          </View>
        ) : null}

        {tab === 'นัดหมาย' ? (
          <>
            <Button title="เพิ่มนัดหมาย" onPress={() => router.push(`/event/new?caseId=${id}`)} />
            {events.isLoading ? (
              <LoadingState label="กำลังโหลดนัดหมาย…" />
            ) : events.isError ? (
              <View style={{ marginTop: spacing.md }}>
                <ErrorState message="โหลดนัดหมายของคดีไม่ได้" onRetry={() => events.refetch()} />
              </View>
            ) : (events.data?.length ?? 0) === 0 ? (
              <EmptyState compact>คดีนี้ยังไม่มีนัดหมาย</EmptyState>
            ) : (
              <Card style={{ marginTop: spacing.md, paddingVertical: spacing.sm }}>
                {events.data!.map((event, index) => {
                  const court = event.type === 'COURT_DATE';
                  const others = event.assignees?.filter((person) => person.userId !== event.assigneeId).length ?? 0;
                  const body = <>
                    <View style={[styles.dateTile, court && styles.dateTileCourt]}>
                      <Text style={[styles.rowStrong, court && { color: colors.accentInk }]}>{thDate(event.startAt)}</Text>
                      <Text style={styles.rowFaint}>{thTime(event.startAt)}</Text>
                    </View>
                    <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                      <Text style={styles.rowStrong} numberOfLines={2}>{event.title}</Text>
                      {event.courtName ? <Text style={styles.rowFaint}>{event.courtName}</Text> : null}
                      <Text style={styles.rowFaint}>
                        {event.assignee ? `${event.assignee.firstName} ${event.assignee.lastName}` : 'ยังไม่ระบุคนหลัก'}{others ? ` และอีก ${others} คน` : ''}
                      </Text>
                      {court ? <Text style={[styles.rowFaint, { color: colors.info, fontWeight: '600' }]}>เปิด Court Day</Text> : null}
                    </View>
                    {court ? <ChevronRight size={18} color={colors.faint} /> : null}
                  </>;
                  return (
                    <View key={event.id}>
                      {index > 0 && <View style={styles.divider} />}
                      {court
                        ? <Pressable accessibilityRole="button" accessibilityLabel={`${event.title} ${thDate(event.startAt)} ${thTime(event.startAt)}`}
                            accessibilityHint="เปิด Court Day" style={({ pressed }) => [styles.listRow, pressed && { opacity: 0.7 }]}
                            onPress={() => router.push(`/court-day/${event.id}`)}>{body}</Pressable>
                        : <View style={styles.listRow}>{body}</View>}
                      <Pressable accessibilityRole="button" accessibilityLabel={`ทีมที่ไปด้วย ${event.title}`}
                        onPress={() => router.push(`/event/${event.id}/team`)} style={{ minHeight: 44, justifyContent: 'center', paddingLeft: 84 + spacing.md }}>
                        <Text style={{ color: colors.info }}>ทีมที่ไปด้วย ›</Text>
                      </Pressable>
                    </View>
                  );
                })}
              </Card>
            )}
          </>
        ) : null}

        {tab === 'งาน' ? (
          <>
            <Button title="เพิ่มงาน" onPress={() => router.push(`/task/new?caseId=${id}`)} />
            {tasks.isLoading ? (
              <LoadingState label="กำลังโหลดงาน…" />
            ) : tasks.isError ? (
              <View style={{ marginTop: spacing.md }}>
                <ErrorState message="โหลดงานของคดีไม่ได้" onRetry={() => tasks.refetch()} />
              </View>
            ) : (tasks.data?.length ?? 0) === 0 ? (
              <EmptyState compact>คดีนี้ยังไม่มีงาน</EmptyState>
            ) : (
              <Card style={{ marginTop: spacing.md, paddingVertical: spacing.sm }}>
                {tasks.data!.map((task, index) => {
                  const done = task.status === 'DONE';
                  const canToggle = user ? canToggleTask({ ...task, caseId: id, case: caseRef }, user) : false;
                  const assignee = task.assignee ? `${task.assignee.firstName} ${task.assignee.lastName}` : 'ยังไม่มีผู้รับผิดชอบ';
                  return (
                    <View key={task.id}>
                      {index > 0 && <View style={styles.divider} />}
                      <View style={styles.taskRow}>
                        <Pressable
                          accessibilityRole="checkbox"
                          accessibilityLabel={`ทำงาน ${task.title} เสร็จแล้ว`}
                          accessibilityState={{ checked: done, disabled: !canToggle }}
                          disabled={!canToggle || toggle.isPending}
                          onPress={() => toggle.mutate({ task: { ...task, caseId: id }, done: !done })}
                          style={styles.checkboxHit}
                        >
                          <View style={[styles.checkbox, done && styles.checkboxDone, !canToggle && { opacity: 0.4 }]}>
                            {done ? <Check size={13} color={colors.surface} strokeWidth={3} /> : null}
                          </View>
                        </Pressable>
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel={`${task.title} · ${assignee}`}
                          accessibilityHint="เปิดงาน"
                          accessibilityActions={done ? undefined : [{ name: 'reassign', label: 'ย้ายผู้รับผิดชอบ' }]}
                          onAccessibilityAction={({ nativeEvent }) => { if (nativeEvent.actionName === 'reassign') setReassigning({ ...task, caseId: id }); }}
                          style={({ pressed }) => [styles.taskBody, pressed && { opacity: 0.7 }]}
                          onPress={() => router.push(`/task/new?id=${task.id}`)}
                          onLongPress={() => !done && setReassigning({ ...task, caseId: id })}
                          delayLongPress={350}
                        >
                          <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                            <Text style={[styles.rowStrong, done && styles.doneText]} numberOfLines={2}>{task.title}</Text>
                            <Text style={styles.rowFaint}>{assignee}{!done && TASK_STATUS_LABEL[task.status] ? ` · ${TASK_STATUS_LABEL[task.status]}` : ''}</Text>
                          </View>
                          {task.dueDate && !done ? (
                            <Tag tone={new Date(task.dueDate) < new Date() ? 'due' : 'plain'}>
                              {thDate(task.dueDate)}
                            </Tag>
                          ) : null}
                          <ChevronRight size={18} color={colors.faint} />
                        </Pressable>
                      </View>
                    </View>
                  );
                })}
              </Card>
            )}
          </>
        ) : null}

        {tab === 'เอกสาร' ? (
          <>
            {/* One primary action; template and waiting-list stay as quieter secondary links. */}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="แนบเอกสาร ถ่ายรูปหรือเลือกไฟล์"
              onPress={() => router.push(`/scan/${id}`)}
              style={({ pressed }) => [styles.scanButton, pressed && { backgroundColor: colors.inkPressed, ...shadow.none }]}
            >
              <Camera size={18} color={colors.bg} />
              <Text style={styles.scanText}>แนบเอกสาร · ถ่ายรูปหรือเลือกไฟล์</Text>
            </Pressable>
            <View style={styles.docLinks}>
              <Pressable accessibilityRole="link" style={styles.docLink}
                onPress={() => router.push({ pathname: '/document-template', params: { caseId: id } })}>
                <Text style={styles.docLinkText}>สร้างจากแบบสำเร็จ ›</Text>
              </Pressable>
              <Pressable accessibilityRole="link" style={styles.docLink}
                onPress={() => router.push({ pathname: '/document-waiting', params: { caseId: id } })}>
                <Text style={styles.docLinkText}>รอเอกสารจากภายนอก ›</Text>
              </Pressable>
            </View>
            {/* A failed refresh keeps any list already loaded below the error; "ยังไม่มี…" only shows after a successful load. */}
            {documents.isError && <ErrorState message="โหลดรายการเอกสารล่าสุดไม่ได้ ลองโหลดอีกครั้ง" onRetry={() => documents.refetch()} style={{ marginBottom: spacing.md }} />}
            {documents.isLoading ? (
              <LoadingState label="กำลังโหลดเอกสาร…" />
            ) : (documents.data?.length ?? 0) === 0 ? (
              documents.isError ? null : <EmptyState compact>ยังไม่มีเอกสารในคดีนี้ · กด “แนบเอกสาร” ด้านบนเพื่อเพิ่ม</EmptyState>
            ) : (
              <Card style={{ paddingVertical: spacing.sm }}>
                {documents.data!.map((doc, index) => {
                  const filename = doc.filename ?? doc.name ?? doc.fileName ?? 'เอกสาร';
                  return (
                    <View key={doc.id}>
                      {index > 0 && <View style={styles.divider} />}
                      <Pressable
                        style={({ pressed }) => [styles.listRow, pressed && { opacity: 0.7 }]}
                        accessibilityRole="button"
                        accessibilityLabel={`เปิด ${filename}`}
                        accessibilityState={{ busy: openingDoc === doc.id }}
                        disabled={openingDoc === doc.id}
                        onPress={async () => {
                          setOpeningDoc(doc.id);
                          try {
                            await openCaseDocument(id, doc.id, filename);
                          } catch (error) {
                            Alert.alert(
                              'เปิดเอกสารไม่สำเร็จ',
                              error instanceof Error ? error.message : 'ลองใหม่อีกครั้ง',
                            );
                          } finally {
                            setOpeningDoc(null);
                          }
                        }}
                      >
                        <View style={styles.iconTile}><FileText size={18} color={colors.info} /></View>
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Text style={styles.rowStrong} numberOfLines={2}>
                            {filename}
                          </Text>
                          <Text style={styles.rowFaint}>
                            {openingDoc === doc.id
                              ? 'กำลังดาวน์โหลด…'
                              : [
                                  doc.version ? `ฉบับ ${doc.version}` : null,
                                  doc.updatedAt ? thDate(doc.updatedAt) : null,
                                ]
                                  .filter(Boolean)
                                  .join(' · ') || 'แตะเพื่อเปิด'}
                          </Text>
                        </View>
                        <ChevronRight size={18} color={colors.faint} />
                      </Pressable>
                    </View>
                  );
                })}
              </Card>
            )}
          </>
        ) : null}
        {tab === 'อีเมล' ? <CaseEmailTab caseId={id} /> : null}
      </ScrollView>
      <ReassignSheet caseId={id} task={reassigning} onClose={() => setReassigning(null)} />
    </>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  headerAction: { minWidth: TOUCH, minHeight: TOUCH, justifyContent: 'center', alignItems: 'flex-end', paddingHorizontal: spacing.xs },
  headerActionText: { color: colors.ink, fontWeight: '600', fontSize: 16 },
  header: { gap: spacing.sm, paddingTop: spacing.xs },
  caseTitle: { ...typeScale.display, color: colors.ink },
  meta: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.sm },
  metaText: { ...typeScale.meta, color: colors.muted, fontWeight: '600', fontVariant: ['tabular-nums'] },
  /** Sunken track; the selected tab is a raised pill lifted by shadow.sm. */
  segment: {
    flexDirection: 'row',
    backgroundColor: colors.sunken,
    borderRadius: radius.lg,
    padding: spacing.xs,
    gap: 2,
    marginTop: spacing.lg,
    marginBottom: spacing.lg,
  },
  segmentItem: {
    flex: 1,
    minHeight: TOUCH,
    justifyContent: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: 2,
    borderRadius: radius.md,
    alignItems: 'center',
  },
  segmentItemOn: {
    backgroundColor: colors.raised,
    ...shadow.sm,
  },
  segmentText: { fontSize: 13, fontWeight: '600', color: colors.muted },
  segmentTextOn: { color: colors.ink, fontWeight: '700' },
  cardHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardTitle: { ...typeScale.section, color: colors.ink },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    gap: spacing.md,
    paddingVertical: spacing.md,
  },
  infoRowRule: { borderTopWidth: 1, borderTopColor: colors.divider },
  infoLabel: { ...typeScale.overline, color: colors.muted, maxWidth: '35%' },
  infoValue: { color: colors.text, fontSize: 15, lineHeight: 22, flex: 1, textAlign: 'right' },
  description: { color: colors.text, fontSize: 14, lineHeight: 22, paddingTop: spacing.xs },
  divider: { height: 1, backgroundColor: colors.divider, marginVertical: spacing.xs },
  groupLabel: { ...typeScale.overline, color: colors.muted, marginBottom: spacing.xs },
  iconTile: { width: 36, height: 36, borderRadius: radius.md, backgroundColor: colors.infoSoft, alignItems: 'center', justifyContent: 'center' },
  dateTile: { width: 84, paddingVertical: spacing.xs, paddingHorizontal: spacing.sm, borderRadius: radius.md, backgroundColor: colors.sunken },
  dateTileCourt: { backgroundColor: colors.accentSoft },
  partyRow: { minHeight: TOUCH, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm },
  lifecycle: { marginTop: spacing.xl, gap: spacing.xs },
  listRow: {
    flexDirection: 'row',
    gap: spacing.md,
    alignItems: 'center',
    paddingVertical: spacing.sm,
    minHeight: TOUCH,
  },
  taskRow: { flexDirection: 'row', alignItems: 'center' },
  taskBody: { flex: 1, minWidth: 0, minHeight: TOUCH, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm },
  rowStrong: { color: colors.text, fontWeight: '600', fontSize: 14 },
  rowFaint: { color: colors.faint, fontSize: 12, marginTop: 2 },
  doneText: { color: colors.faint, textDecorationLine: 'line-through' },
  checkboxHit: { width: TOUCH, height: TOUCH, alignItems: 'center', justifyContent: 'center', marginLeft: -spacing.sm },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: colors.muted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxDone: { backgroundColor: colors.good, borderColor: colors.good },
  scanButton: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.ink,
    borderRadius: radius.button,
    paddingVertical: 12,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.xs,
    minHeight: 48,
    ...shadow.sm,
  },
  scanText: { fontWeight: '700', color: colors.bg, fontSize: 15, flexShrink: 1, textAlign: 'center' },
  docLinks: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.sm },
  docLink: { minHeight: 44, justifyContent: 'center', paddingHorizontal: spacing.sm },
  docLinkText: { color: colors.info, fontWeight: '600', fontSize: 14 },
});

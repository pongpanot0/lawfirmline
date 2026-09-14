import React, { useState } from 'react';
import {
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Camera, Check, FileText, ShieldCheck } from 'lucide-react-native';
import { api } from '@/api/client';
import { openCaseDocument } from '@/api/files';
import { useCase, useCaseTasks, useInsuranceClaim, useToggleTask } from '@/api/hooks';
import { ReassignSheet } from '@/components/ReassignSheet';
import type { CalendarEventItem, TaskItem } from '@/api/types';
import {
  Card,
  EmptyNote,
  ErrorNote,
  Loading,
  Tag,
  TagTone,
} from '@/components/ui';
import { thDate, thTime } from '@/format';
import { colors, radius, spacing } from '@/theme';

const TABS = ['ภาพรวม', 'นัดหมาย', 'งาน', 'เอกสาร'] as const;
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
  IN_PROGRESS: { label: 'ดำเนินการ', tone: 'court' },
  ON_HOLD: { label: 'พักไว้', tone: 'plain' },
  CLOSED: { label: 'ปิดแล้ว', tone: 'ok' },
};

interface DocumentItem {
  id: string;
  name?: string;
  fileName?: string;
  version?: number;
  updatedAt?: string;
}

function InfoRow({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue} numberOfLines={2}>
        {value || '—'}
      </Text>
    </View>
  );
}

export default function CaseDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [tab, setTab] = useState<TabName>('ภาพรวม');
  const [reassigning, setReassigning] = useState<TaskItem | null>(null);
  const [openingDoc, setOpeningDoc] = useState<string | null>(null);

  const caseQuery = useCase(id);
  const tasks = useCaseTasks(id);
  const toggle = useToggleTask();
  const insurance = useInsuranceClaim(id);
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

  if (caseQuery.isLoading) return <Loading />;
  if (caseQuery.isError || !caseQuery.data)
    return (
      <View style={{ padding: spacing.lg }}>
        <ErrorNote message="โหลดข้อมูลคดีไม่สำเร็จ" onRetry={() => caseQuery.refetch()} />
      </View>
    );

  const detail = caseQuery.data;
  const status = STATUS_LABEL[detail.status] ?? { label: detail.status, tone: 'plain' as TagTone };

  return (
    <>
      <Stack.Screen options={{ title: detail.ownRef }} />
      <ScrollView
        style={styles.screen}
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: 40 }}
        refreshControl={
          <RefreshControl
            refreshing={caseQuery.isRefetching}
            onRefresh={() => caseQuery.refetch()}
          />
        }
      >
        <Text style={styles.caseTitle}>{detail.title}</Text>

        <View style={styles.segment}>
          {TABS.map((name) => (
            <Pressable
              key={name}
              style={[styles.segmentItem, tab === name && styles.segmentItemOn]}
              onPress={() => setTab(name)}
            >
              <Text style={[styles.segmentText, tab === name && styles.segmentTextOn]}>
                {name}
              </Text>
            </Pressable>
          ))}
        </View>

        {tab === 'ภาพรวม' ? (
          <Card>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={styles.infoLabel}>สถานะ</Text>
              <Tag tone={status.tone}>{status.label}</Tag>
            </View>
            <View style={styles.divider} />
            <InfoRow
              label="Case Owner"
              value={
                detail.leadLawyer
                  ? `${detail.leadLawyer.firstName} ${detail.leadLawyer.lastName}`
                  : null
              }
            />
            <InfoRow label="ลูกความ" value={detail.clientName ?? detail.client?.name} />
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
                  ? `${detail.claimedAmount.toLocaleString('th-TH')} บาท`
                  : null
              }
            />
            <InfoRow label="เปิดคดี" value={thDate(detail.openedAt)} />
            {detail.description ? (
              <>
                <View style={styles.divider} />
                <Text style={{ color: colors.muted, fontSize: 13, lineHeight: 20 }}>
                  {detail.description}
                </Text>
              </>
            ) : null}
          </Card>
        ) : null}

        {tab === 'ภาพรวม' && insurance.data ? (
          <Card style={{ marginTop: spacing.md }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
              <ShieldCheck size={16} color={colors.accentInk} />
              <Text style={[styles.rowStrong, { flex: 1 }]}>สินไหมประกันภัย</Text>
              <Tag tone="court">
                {INSURANCE_STAGE_LABEL[insurance.data.stage] ?? insurance.data.stage}
              </Tag>
            </View>
            <View style={styles.divider} />
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

        {tab === 'นัดหมาย' ? (
          <Card>
            {events.isLoading ? (
              <EmptyNote>กำลังโหลด…</EmptyNote>
            ) : (events.data?.length ?? 0) === 0 ? (
              <EmptyNote>ไม่มีนัดหมาย</EmptyNote>
            ) : (
              events.data!.map((event, index) => (
                <View key={event.id}>
                  {index > 0 && <View style={styles.divider} />}
                  <Pressable
                    style={({ pressed }) => [styles.listRow, pressed && { opacity: 0.7 }]}
                    onPress={() =>
                      event.type === 'COURT_DATE' && router.push(`/court-day/${event.id}`)
                    }
                  >
                    <View style={{ width: 74 }}>
                      <Text style={styles.rowStrong}>{thDate(event.startAt)}</Text>
                      <Text style={styles.rowFaint}>{thTime(event.startAt)}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.rowStrong} numberOfLines={2}>
                        {event.title}
                      </Text>
                      {event.courtName ? (
                        <Text style={styles.rowFaint}>{event.courtName}</Text>
                      ) : null}
                    </View>
                    {event.type === 'COURT_DATE' ? <Tag tone="court">ศาล</Tag> : null}
                  </Pressable>
                </View>
              ))
            )}
          </Card>
        ) : null}

        {tab === 'งาน' ? (
          <Card>
            {tasks.isLoading ? (
              <EmptyNote>กำลังโหลด…</EmptyNote>
            ) : (tasks.data?.length ?? 0) === 0 ? (
              <EmptyNote>ไม่มีงานในคดีนี้</EmptyNote>
            ) : (
              tasks.data!.map((task, index) => {
                const done = task.status === 'DONE';
                return (
                  <View key={task.id}>
                    {index > 0 && <View style={styles.divider} />}
                    <Pressable
                      style={styles.listRow}
                      onLongPress={() => !done && setReassigning({ ...task, caseId: id })}
                      delayLongPress={350}
                    >
                      <Pressable
                        hitSlop={10}
                        onPress={() => toggle.mutate({ task: { ...task, caseId: id }, done: !done })}
                        style={[styles.checkbox, done && styles.checkboxDone]}
                      >
                        {done ? <Check size={13} color="#fff" strokeWidth={3} /> : null}
                      </Pressable>
                      <View style={{ flex: 1 }}>
                        <Text
                          style={[styles.rowStrong, done && styles.doneText]}
                          numberOfLines={2}
                        >
                          {task.title}
                        </Text>
                        <Text style={styles.rowFaint}>
                          {task.assignee
                            ? `${task.assignee.firstName} ${task.assignee.lastName}`
                            : 'ยังไม่มีผู้รับผิดชอบ'}
                          {!done ? ' · กดค้างเพื่อมอบหมาย' : ''}
                        </Text>
                      </View>
                      {task.dueDate && !done ? (
                        <Tag tone={new Date(task.dueDate) < new Date() ? 'due' : 'plain'}>
                          {thDate(task.dueDate)}
                        </Tag>
                      ) : null}
                    </Pressable>
                  </View>
                );
              })
            )}
          </Card>
        ) : null}

        {tab === 'เอกสาร' ? (
          <>
            <Pressable
              onPress={() => router.push(`/scan/${id}`)}
              style={({ pressed }) => [styles.scanButton, pressed && { opacity: 0.8 }]}
            >
              <Camera size={17} color={colors.ink} />
              <Text style={styles.scanText}>สแกนเอกสารด้วยกล้อง</Text>
            </Pressable>
            <Card>
              {documents.isLoading ? (
                <EmptyNote>กำลังโหลด…</EmptyNote>
              ) : (documents.data?.length ?? 0) === 0 ? (
                <EmptyNote>ไม่มีเอกสาร</EmptyNote>
              ) : (
                documents.data!.map((doc, index) => {
                  const filename = doc.name ?? doc.fileName ?? 'เอกสาร';
                  return (
                    <View key={doc.id}>
                      {index > 0 && <View style={styles.divider} />}
                      <Pressable
                        style={({ pressed }) => [styles.listRow, pressed && { opacity: 0.7 }]}
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
                        <FileText size={16} color={colors.muted} />
                        <View style={{ flex: 1 }}>
                          <Text style={styles.rowStrong} numberOfLines={2}>
                            {filename}
                          </Text>
                          <Text style={styles.rowFaint}>
                            {openingDoc === doc.id
                              ? 'กำลังดาวน์โหลด…'
                              : [
                                  doc.version ? `v${doc.version}` : null,
                                  doc.updatedAt ? thDate(doc.updatedAt) : null,
                                ]
                                  .filter(Boolean)
                                  .join(' · ') || 'แตะเพื่อเปิด'}
                          </Text>
                        </View>
                      </Pressable>
                    </View>
                  );
                })
              )}
            </Card>
          </>
        ) : null}
      </ScrollView>
      <ReassignSheet caseId={id} task={reassigning} onClose={() => setReassigning(null)} />
    </>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  caseTitle: { fontSize: 18, fontWeight: '700', color: colors.ink, marginBottom: spacing.md },
  segment: {
    flexDirection: 'row',
    backgroundColor: colors.soft,
    borderRadius: radius.button,
    padding: 3,
    marginBottom: spacing.md,
  },
  segmentItem: {
    flex: 1,
    paddingVertical: 9,
    borderRadius: radius.button - 2,
    alignItems: 'center',
  },
  segmentItemOn: {
    backgroundColor: colors.surface,
    shadowColor: colors.ink,
    shadowOpacity: 0.12,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  segmentText: { fontSize: 13, fontWeight: '600', color: colors.muted },
  segmentTextOn: { color: colors.ink },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.md,
    paddingVertical: 7,
  },
  infoLabel: { color: colors.faint, fontSize: 12, fontWeight: '600', textTransform: 'uppercase' },
  infoValue: { color: colors.text, fontSize: 14, flex: 1, textAlign: 'right' },
  divider: { height: 1, backgroundColor: colors.soft, marginVertical: 6 },
  listRow: {
    flexDirection: 'row',
    gap: spacing.md,
    alignItems: 'flex-start',
    paddingVertical: spacing.sm,
  },
  rowStrong: { color: colors.text, fontWeight: '600', fontSize: 14 },
  rowFaint: { color: colors.faint, fontSize: 12, marginTop: 2 },
  doneText: { color: colors.faint, textDecorationLine: 'line-through' },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: '#B9C1CC',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxDone: { backgroundColor: colors.good, borderColor: colors.good },
  scanButton: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.soft,
    borderRadius: radius.button,
    paddingVertical: 12,
    marginBottom: spacing.sm,
    minHeight: 48,
  },
  scanText: { fontWeight: '600', color: colors.ink, fontSize: 14 },
});

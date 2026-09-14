import React, { useState } from 'react';
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Check, FileText } from 'lucide-react-native';
import { api } from '@/api/client';
import { useCase, useCaseTasks, useToggleTask } from '@/api/hooks';
import type { CalendarEventItem } from '@/api/types';
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

  const caseQuery = useCase(id);
  const tasks = useCaseTasks(id);
  const toggle = useToggleTask();
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
                    <View style={styles.listRow}>
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
                        {task.assignee ? (
                          <Text style={styles.rowFaint}>
                            {task.assignee.firstName} {task.assignee.lastName}
                          </Text>
                        ) : null}
                      </View>
                      {task.dueDate && !done ? (
                        <Tag tone={new Date(task.dueDate) < new Date() ? 'due' : 'plain'}>
                          {thDate(task.dueDate)}
                        </Tag>
                      ) : null}
                    </View>
                  </View>
                );
              })
            )}
          </Card>
        ) : null}

        {tab === 'เอกสาร' ? (
          <Card>
            {documents.isLoading ? (
              <EmptyNote>กำลังโหลด…</EmptyNote>
            ) : (documents.data?.length ?? 0) === 0 ? (
              <EmptyNote>ไม่มีเอกสาร</EmptyNote>
            ) : (
              documents.data!.map((doc, index) => (
                <View key={doc.id}>
                  {index > 0 && <View style={styles.divider} />}
                  <View style={styles.listRow}>
                    <FileText size={16} color={colors.muted} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.rowStrong} numberOfLines={2}>
                        {doc.name ?? doc.fileName ?? 'เอกสาร'}
                      </Text>
                      <Text style={styles.rowFaint}>
                        {[doc.version ? `v${doc.version}` : null, doc.updatedAt ? thDate(doc.updatedAt) : null]
                          .filter(Boolean)
                          .join(' · ')}
                      </Text>
                    </View>
                  </View>
                </View>
              ))
            )}
          </Card>
        ) : null}
      </ScrollView>
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
});

import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { ActivityType, AnswerExtensionStatus, SERVICE_METHOD_LABELS, type AnswerExtensionItem } from '@lawfirm/shared';
import { useAnswerDeadline, useCreateAnswerExtension, useUpdateAnswerExtension } from '@/api/hooks';
import type { CaseDetail } from '@/api/types';
import { Text } from '@/components/AppText';
import { DateField } from '@/components/Input';
import { Card, ErrorState, LoadingState, Tag } from '@/components/ui';
import { bangkokDay, bangkokDaysBetween, thDate } from '@/format';
import { colors, spacing, typeScale } from '@/theme';
import {
  CourtTimelineRow, CourtWorkflowAction, CourtWorkflowChoice, CourtWorkflowSheet, courtWorkflowStyles as workflow,
} from './CourtWorkflowUI';

const ORDERS = [
  { value: AnswerExtensionStatus.PENDING, label: 'รอคำสั่ง' },
  { value: AnswerExtensionStatus.GRANTED, label: 'อนุญาต' },
  { value: AnswerExtensionStatus.DENIED, label: 'ไม่อนุญาต' },
] as const;

// The deadline response has no service metadata. The case activity retains the actual service date and method.
const SERVICE_ACTIVITY_METHODS = new Map(Object.values(SERVICE_METHOD_LABELS).map(label =>
  [`ส่งหมายเรียกและสำเนาคำฟ้องแล้ว (${label})`, label]));

type Editor = { kind: 'request' } | { kind: 'order'; extension: AnswerExtensionItem; number: number };

export function AnswerDeadlineCard({ caseId, readOnly, activities }: {
  caseId: string;
  readOnly: boolean;
  activities?: CaseDetail['activities'];
}) {
  const deadline = useAnswerDeadline(caseId);
  const [editor, setEditor] = useState<Editor | null>(null);
  const data = deadline.data;
  const days = data?.effectiveDueAt ? bangkokDaysBetween(new Date().toISOString(), data.effectiveDueAt) : null;
  const firstPending = data?.extensions.find(item => item.status === AnswerExtensionStatus.PENDING)?.id;
  const service = activities?.filter(item => item.type === ActivityType.DEADLINE && SERVICE_ACTIVITY_METHODS.has(item.title))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];

  return (
    <Card style={workflow.card}>
      <View style={workflow.header}>
        <Text accessibilityRole="header" style={workflow.title}>กำหนดยื่นคำให้การ</Text>
        {days !== null && (
          <Tag tone={days > 0 ? 'court' : 'due'}>
            {days < 0 ? `เลยกำหนด ${-days} วัน` : days === 0 ? 'ครบกำหนดวันนี้' : `อีก ${days} วัน`}
          </Tag>
        )}
      </View>
      {deadline.isError && <ErrorState message={deadline.error.message} onRetry={() => { void deadline.refetch(); }} />}
      {!data && deadline.isLoading && <LoadingState inline label="กำลังโหลดกำหนดยื่นคำให้การ…" />}
      {data && (
        <>
          {data.effectiveDueAt && <Text style={styles.deadline}>ยื่นได้ถึง {thDate(data.effectiveDueAt)}</Text>}
          {data.fileBy && <Text style={styles.fileBy}>ควรยื่นไม่เกิน {thDate(data.fileBy)}</Text>}
          <View style={workflow.timeline}>
            <CourtTimelineRow state={data.answerDueAt ? 'done' : 'upcoming'} last={data.extensions.length === 0}>
              <Text style={workflow.rowTitle}>{data.answerDueAt ? `ตามกฎหมาย ${thDate(data.answerDueAt)}` : 'ยังไม่มีวันครบกำหนดตามกฎหมาย'}</Text>
              {service && <Text style={workflow.meta}>{SERVICE_ACTIVITY_METHODS.get(service.title)} {thDate(service.activityAt)}</Text>}
            </CourtTimelineRow>
            {data.extensions.map((extension, index) => {
              const number = index + 1;
              const pending = extension.status === AnswerExtensionStatus.PENDING;
              const granted = extension.status === AnswerExtensionStatus.GRANTED;
              return (
                <CourtTimelineRow key={extension.id} last={number === data.extensions.length}
                  state={!pending ? 'done' : extension.id === firstPending ? 'active' : 'upcoming'}>
                  <View style={styles.orderLine}>
                    <Text style={workflow.rowTitle}>ขอขยายครั้งที่ {number}</Text>
                    {pending && <Tag>รอคำสั่งศาล</Tag>}
                  </View>
                  {granted && extension.grantedUntil && (
                    <Text style={workflow.meta}>ศาลอนุญาตถึง {thDate(extension.grantedUntil)}</Text>
                  )}
                  {extension.status === AnswerExtensionStatus.DENIED && <Text style={workflow.meta}>ศาลไม่อนุญาต</Text>}
                  {!readOnly && (
                    <CourtWorkflowAction title={pending ? 'ใส่คำสั่งศาล' : 'แก้ไขคำสั่งศาล'} variant={pending ? 'secondary' : 'link'}
                      inline hint={`ระบุผลตามคำสั่งศาลครั้งที่ ${number}`}
                      onPress={() => setEditor({ kind: 'order', extension, number })} />
                  )}
                </CourtTimelineRow>
              );
            })}
          </View>
          {!readOnly && (
            <View style={styles.extend}>
              <CourtWorkflowAction title="บันทึกการขอขยาย" hint="ใส่วันที่ยื่นคำร้องและวันที่ขอขยายถึง"
                onPress={() => setEditor({ kind: 'request' })} />
            </View>
          )}
        </>
      )}
      {!readOnly && editor?.kind === 'request' && (
        <ExtensionRequestSheet caseId={caseId} onClose={() => setEditor(null)} />
      )}
      {!readOnly && editor?.kind === 'order' && (
        <CourtOrderSheet key={editor.extension.id} caseId={caseId} extension={editor.extension} number={editor.number}
          onClose={() => setEditor(null)} />
      )}
    </Card>
  );
}

function ExtensionRequestSheet({ caseId, onClose }: { caseId: string; onClose: () => void }) {
  const create = useCreateAnswerExtension(caseId);
  const [filedAt, setFiledAt] = useState('');
  const [requestedUntil, setRequestedUntil] = useState('');
  return (
    <CourtWorkflowSheet title="บันทึกการขอขยาย" onClose={onClose} error={create.error?.message} action={{
      title: 'บันทึก', hint: 'เก็บคำร้องไว้รอคำสั่งศาล', busy: create.isPending, disabled: !filedAt || !requestedUntil,
      onPress: () => {
        if (!create.isPending && filedAt && requestedUntil) create.mutate({ filedAt, requestedUntil }, { onSuccess: onClose });
      },
    }}>
      <DateField label="วันที่ยื่นคำร้อง" required value={filedAt} onChange={setFiledAt} disabled={create.isPending} />
      <DateField label="ขอขยายถึง" required value={requestedUntil} onChange={setRequestedUntil} disabled={create.isPending} />
    </CourtWorkflowSheet>
  );
}

function CourtOrderSheet({ caseId, extension, number, onClose }: {
  caseId: string;
  extension: AnswerExtensionItem;
  number: number;
  onClose: () => void;
}) {
  const update = useUpdateAnswerExtension(caseId);
  const [status, setStatus] = useState<AnswerExtensionItem['status']>(extension.status);
  const [grantedUntil, setGrantedUntil] = useState(() => bangkokDay(extension.grantedUntil ?? extension.requestedUntil));
  const granted = status === AnswerExtensionStatus.GRANTED;
  const valid = !granted || !!grantedUntil;

  return (
    <CourtWorkflowSheet title="ใส่คำสั่งศาล" subtitle={`ขอขยายเวลายื่นคำให้การครั้งที่ ${number}`}
      onClose={onClose} error={update.error?.message} action={{
        title: 'บันทึก', hint: 'ระบบเลื่อนวันเตือนให้', busy: update.isPending, disabled: !valid,
        onPress: () => {
          if (!update.isPending && valid) {
            update.mutate({ extensionId: extension.id, status, ...(granted ? { grantedUntil } : {}) }, { onSuccess: onClose });
          }
        },
      }}>
      <CourtWorkflowChoice label="คำสั่งศาล" options={ORDERS} value={status} onChange={next => {
        setStatus(next);
        update.reset();
      }} disabled={update.isPending} />
      {granted && (
        <View style={styles.orderDate}>
          <DateField label="อนุญาตถึง" required value={grantedUntil} disabled={update.isPending} onChange={setGrantedUntil} />
          <Text style={workflow.meta}>วันที่ศาลอนุญาตต้องไม่ก่อนกำหนดเดิม</Text>
        </View>
      )}
    </CourtWorkflowSheet>
  );
}

const styles = StyleSheet.create({
  deadline: { ...typeScale.title, fontSize: 23, marginTop: spacing.sm },
  fileBy: { ...typeScale.meta, color: colors.warn, fontWeight: '600' },
  orderLine: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.sm },
  orderDate: { gap: spacing.xs },
  extend: { borderTopWidth: 1, borderTopColor: colors.divider, paddingTop: spacing.md, marginTop: spacing.md },
});

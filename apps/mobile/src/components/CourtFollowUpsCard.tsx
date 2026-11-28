import React, { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Minus, Plus } from 'lucide-react-native';
import {
  answerDaysFor, answerDueDate, COURT_FOLLOW_UP_LABELS, CourtFollowUpKind, SERVICE_METHOD_LABELS, ServiceMethod,
  type CourtFollowUpItem,
} from '@lawfirm/shared';
import { useCourtFollowUps, useRecordCourtFollowUp, useRecordService } from '@/api/hooks';
import { Text } from '@/components/AppText';
import { DateField, SelectField, TextArea } from '@/components/Input';
import { Card, ErrorState, LoadingState, Tag } from '@/components/ui';
import { bangkokDaysBetween, thDate } from '@/format';
import { colors, radius, spacing, TOUCH, typeScale } from '@/theme';
import {
  CourtTimelineRow, CourtWorkflowAction, CourtWorkflowChoice, CourtWorkflowSheet, courtWorkflowStyles as workflow,
} from './CourtWorkflowUI';

const SERVICE_METHODS = Object.values(ServiceMethod).map(value => ({ value, label: SERVICE_METHOD_LABELS[value] }));
const SERVICE_OUTCOMES = [
  { value: 'retry', label: 'ยังส่งไม่ได้' },
  { value: 'done', label: 'ส่งหมายได้แล้ว' },
] as const;
const CALL_OUTCOMES = [
  { value: 'done', label: 'ติดตามเสร็จแล้ว' },
  { value: 'retry', label: 'ถามซ้ำ' },
] as const;

export function CourtFollowUpsCard({ caseId, trial, filedAt, readOnly }: {
  caseId: string;
  trial: boolean;
  filedAt?: string | null;
  readOnly: boolean;
}) {
  const calls = useCourtFollowUps(caseId);
  const [editing, setEditing] = useState<CourtFollowUpItem['kind'] | null>(null);
  const rows = calls.data ?? [];
  if (!trial && rows.length === 0) return null;

  const firstOpen = rows.find(row => !row.doneAt)?.kind;
  const hasAnswer = rows.some(row => row.kind === CourtFollowUpKind.ANSWER);
  const today = new Date().toISOString();
  const canEdit = trial && !readOnly;

  return (
    <Card style={workflow.card}>
      <Text accessibilityRole="header" style={workflow.title}>ติดตามหลังยื่นฟ้อง</Text>
      {filedAt && <Text style={workflow.meta}>ยื่นฟ้อง {thDate(filedAt)}</Text>}
      {calls.isError && <ErrorState message={calls.error.message} onRetry={() => { void calls.refetch(); }} />}
      {!calls.data && calls.isLoading && <LoadingState inline label="กำลังโหลดรายการติดตาม…" />}
      {calls.data && rows.length === 0 && (
        <Text style={workflow.meta}>ยังไม่มีรายการติดตาม ระบบจะตั้งวันติดตามเมื่อบันทึกการยื่นฟ้องหรือการส่งหมาย</Text>
      )}
      {rows.length > 0 && (
        <View style={workflow.timeline}>
          {rows.map((row, index) => {
            const days = bangkokDaysBetween(today, row.dueAt);
            const due = !row.doneAt && days <= 0;
            const service = row.kind === CourtFollowUpKind.SERVICE;
            return (
              <CourtTimelineRow key={row.kind} state={row.doneAt ? 'done' : firstOpen === row.kind ? 'active' : 'upcoming'}
                last={hasAnswer && index === rows.length - 1}>
                <Text style={workflow.rowTitle}>{COURT_FOLLOW_UP_LABELS[row.kind]}</Text>
                <View style={styles.dueLine}>
                  <Text style={workflow.meta}>{due ? '' : 'ภายใน '}{thDate(row.dueAt)}</Text>
                  {due && <Tag tone="due">{days === 0 ? 'ถึงกำหนดวันนี้' : `เลยกำหนด ${-days} วัน`}</Tag>}
                </View>
                {row.lastResult && <Text style={row.doneAt ? styles.result : workflow.meta}>{row.lastResult}</Text>}
                {!row.doneAt && canEdit && (
                  <CourtWorkflowAction title="บันทึกผลการโทร" variant={firstOpen === row.kind ? 'primary' : 'secondary'}
                    inline={firstOpen !== row.kind}
                    hint={service ? 'ระบุผลการติดตามหมายจากศาล' : 'บันทึกผลหรือตั้งวันโทรซ้ำ'}
                    onPress={() => setEditing(row.kind)} />
                )}
              </CourtTimelineRow>
            );
          })}
          {!hasAnswer && (
            <CourtTimelineRow state="upcoming" last>
              <Text style={workflow.rowTitle}>{COURT_FOLLOW_UP_LABELS.ANSWER}</Text>
              <Text style={workflow.meta}>เริ่มนับเมื่อส่งหมายแล้ว</Text>
            </CourtTimelineRow>
          )}
        </View>
      )}
      {canEdit && editing && (
        <FollowUpSheet key={editing} caseId={caseId} kind={editing} onClose={() => setEditing(null)} />
      )}
    </Card>
  );
}

function FollowUpSheet({ caseId, kind, onClose }: { caseId: string; kind: CourtFollowUpItem['kind']; onClose: () => void }) {
  const recordFollowUp = useRecordCourtFollowUp(caseId);
  const recordService = useRecordService(caseId);
  const [outcome, setOutcome] = useState<'retry' | 'done'>('retry');
  const [result, setResult] = useState('');
  const [retryInDays, setRetryInDays] = useState(7);
  const [servedAt, setServedAt] = useState('');
  const [method, setMethod] = useState<ServiceMethod | ''>('');
  const service = kind === CourtFollowUpKind.SERVICE;
  const served = service && outcome === 'done';
  const retry = outcome === 'retry';
  const due = servedAt && method ? answerDueDate(new Date(`${servedAt}T00:00:00+07:00`), method) : null;
  const busy = recordFollowUp.isPending || recordService.isPending;
  const valid = served ? !!servedAt && !!method : !!result.trim();
  const error = served ? recordService.error : recordFollowUp.error;

  const save = () => {
    if (busy || !valid) return;
    if (served && method) {
      recordService.mutate({ servedAt: `${servedAt}T00:00:00+07:00`, method }, { onSuccess: onClose });
    } else if (retry) {
      recordFollowUp.mutate({ kind, result: result.trim(), done: false, retryInDays }, { onSuccess: onClose });
    } else if (kind !== CourtFollowUpKind.SERVICE) {
      recordFollowUp.mutate({ kind, result: result.trim(), done: true }, { onSuccess: onClose });
    }
  };

  return (
    <CourtWorkflowSheet title="บันทึกผลการโทร" subtitle={COURT_FOLLOW_UP_LABELS[kind]} onClose={onClose}
      error={error?.message} action={{
        title: served ? 'บันทึกการส่งหมาย' : 'บันทึก',
        hint: served ? 'ปิดรายการนี้และเริ่มนับวันยื่นคำให้การ' : retry ? `เลื่อนวันเตือนไปอีก ${retryInDays} วัน` : 'เก็บผลและปิดรายการติดตาม',
        busy, disabled: !valid, onPress: save,
      }}>
      <TextArea label="ผลการโทร" value={served ? (method ? `ส่งหมายแล้ว (${SERVICE_METHOD_LABELS[method]})` : 'ส่งหมายแล้ว') : result}
        onChange={setResult} maxLength={2000} disabled={busy || served} inputStyle={styles.resultInput} />
      <CourtWorkflowChoice label={service ? 'สถานะการส่งหมาย' : 'ผลลัพธ์'} options={service ? SERVICE_OUTCOMES : CALL_OUTCOMES}
        value={outcome} disabled={busy} onChange={next => {
          setOutcome(next);
          recordFollowUp.reset();
          recordService.reset();
        }} />
      {retry && (
        <View style={styles.retryField}>
          <Text style={styles.stepperLabel}>ถามซ้ำใน</Text>
          <View style={styles.stepper}>
            <RetryButton direction="less" disabled={busy || retryInDays === 1} onPress={() => setRetryInDays(retryInDays - 1)} />
            <Text accessibilityLiveRegion="polite" style={styles.stepperCount}>{retryInDays}</Text>
            <RetryButton direction="more" disabled={busy || retryInDays === 60} onPress={() => setRetryInDays(retryInDays + 1)} />
            <Text>วัน</Text>
          </View>
        </View>
      )}
      {served && (
        <>
          <DateField label="วันที่จำเลยได้รับหมาย" required value={servedAt} onChange={setServedAt} disabled={busy} />
          <SelectField label="วิธีส่งหมาย" required value={method} options={SERVICE_METHODS}
            onChange={value => setMethod(value as ServiceMethod)} disabled={busy} />
          {due && method && (
            <View style={styles.notice}>
              <Text style={styles.noticeText}>จำเลยต้องยื่นคำให้การภายใน {answerDaysFor(method)} วัน → <Text style={styles.noticeDeadline}>ครบ {thDate(due)}</Text></Text>
            </View>
          )}
        </>
      )}
    </CourtWorkflowSheet>
  );
}

function RetryButton({ direction, disabled, onPress }: { direction: 'less' | 'more'; disabled: boolean; onPress: () => void }) {
  const Icon = direction === 'less' ? Minus : Plus;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={direction === 'less' ? 'ลดหนึ่งวัน' : 'เพิ่มหนึ่งวัน'}
      accessibilityState={{ disabled }} disabled={disabled} onPress={onPress}
      style={({ pressed }) => [styles.stepperButton, pressed && { backgroundColor: colors.soft }, disabled && { opacity: 0.5 }]}>
      <Icon size={18} color={colors.ink} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  dueLine: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.sm },
  result: { ...typeScale.meta, color: colors.good },
  resultInput: { minHeight: 68 },
  retryField: { gap: spacing.xs },
  stepper: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: spacing.md },
  stepperLabel: { ...typeScale.body, fontWeight: '600' },
  stepperCount: { ...typeScale.body, minWidth: spacing.md, textAlign: 'center', fontVariant: ['tabular-nums'] },
  stepperButton: {
    width: TOUCH, height: TOUCH, borderWidth: 1, borderColor: colors.lineStrong, borderRadius: radius.action,
    alignItems: 'center', justifyContent: 'center',
  },
  notice: { padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.infoSoft },
  noticeText: { ...typeScale.body, color: colors.info },
  noticeDeadline: { color: colors.info, fontWeight: '700' },
});

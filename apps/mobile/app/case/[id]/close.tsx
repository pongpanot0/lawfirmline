import React, { useEffect, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api/client';
import { useAuth } from '@/api/auth';
import { useCase } from '@/api/hooks';
import type { CaseOutstandingResult } from '@/api/types';
import { Text } from '@/components/AppText';
import { SelectField, TextArea } from '@/components/Input';
import { CheckRow, FormPage, FormSection, MissingSummary } from '@/components/Form';
import { ActionRow, Button, Card, ErrorState, InlineError, LoadingState, PageIntro } from '@/components/ui';
import { formatMoney, thDate } from '@/format';
import { colors, spacing, typeScale } from '@/theme';

const styles = StyleSheet.create({
  outstanding: { gap: spacing.xs },
  outstandingDue: { borderTopWidth: 3, borderTopColor: colors.warn },
  outstandingTitle: { ...typeScale.section, color: colors.ink },
  outstandingDetail: { color: colors.muted, fontSize: 14, lineHeight: 22 },
  rows: { marginTop: spacing.xs },
  row: { borderTopWidth: 1, borderTopColor: colors.divider },
  note: { color: colors.muted, fontSize: 15, lineHeight: 24 },
});

const outcomes = [
  { value: 'WON', label: 'ชนะคดี' },
  { value: 'SETTLED', label: 'ตกลงกันได้' }, { value: 'MEDIATED', label: 'ไกล่เกลี่ยสำเร็จ' },
  { value: 'LOST', label: 'แพ้คดี' }, { value: 'WITHDRAWN', label: 'ถอนฟ้อง / ยุติ' },
];
const SUMMARY_MIN = 10;

export default function CaseCloseScreen() {
  const { id, action: requested } = useLocalSearchParams<{ id: string; action?: string }>();
  const action = requested === 'reopen' || requested === 'archive' ? requested : 'close';
  const title = action === 'reopen' ? 'เปิดคดีอีกครั้ง' : action === 'archive' ? 'เก็บคดีเข้าคลัง' : 'ปิดคดี';
  const { user } = useAuth();
  const allowed = user?.firmRole === 'OWNER' || user?.role === 'ADMIN' || user?.role === 'LAWYER';
  const router = useRouter();
  const cache = useQueryClient();
  const legalCase = useCase(id);
  const [summary, setSummary] = useState('');
  const [outcome, setOutcome] = useState('');
  const [acknowledged, setAcknowledged] = useState(false);
  const [removeFutureEvents, setRemoveFutureEvents] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [triedSave, setTriedSave] = useState(false);
  const outstanding = useQuery({ queryKey: ['case-outstanding', id], staleTime: 0,
    enabled: !!id && action === 'close' && allowed,
    queryFn: () => api<CaseOutstandingResult>(`/cases/${id}/outstanding`) });
  useEffect(() => { setAcknowledged(false); }, [JSON.stringify(outstanding.data)]);
  if (legalCase.isLoading) return <View style={{ flex: 1, backgroundColor: colors.bg }}><LoadingState label="กำลังโหลดคดี…" /></View>;
  if (!allowed) return <FormPage>
    <Stack.Screen options={{ title }} />
    <Text style={{ color: colors.text }}>คุณไม่มีสิทธิ์ทำรายการนี้ · ให้ทนายผู้รับผิดชอบหรือเจ้าของสำนักงานทำแทน</Text>
    <Button title="กลับ" variant="secondary" onPress={() => router.back()} />
  </FormPage>;
  if (!legalCase.data) return <FormPage><ErrorState message="โหลดคดีไม่สำเร็จ" onRetry={() => legalCase.refetch()} /></FormPage>;

  const shortBy = Math.max(0, SUMMARY_MIN - summary.trim().length);
  const needsAck = !!outstanding.data && outstanding.data.total > 0 && !acknowledged;
  const missing = action === 'close' ? [
    !outcome ? 'ผลคดี' : '',
    shortBy ? (summary.trim() ? `สรุปผลคดี (อีก ${shortBy} ตัวอักษร)` : 'สรุปผลคดี') : '',
    needsAck ? 'ยืนยันว่าตรวจรายการค้างแล้ว' : '',
  ].filter(Boolean) : [];
  const outstandingReady = !!outstanding.data && !outstanding.isError && !outstanding.isFetching;

  const submit = async () => {
    if (busy) return;
    setBusy(true); setError('');
    try {
      await api(`/cases/${id}/${action}`, { method: 'POST', body: action === 'close'
        ? { closingSummary: summary.trim(), outcome, acknowledgeOutstanding: acknowledged, removeFutureEvents } : {} });
      await Promise.all(['case', 'cases', 'my-day', 'dashboard-stats', 'owner-kpis', 'workload', 'case-outstanding', 'calendar', 'case-events'].map(key =>
        cache.invalidateQueries({ queryKey: [key] })));
      router.back();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'บันทึกไม่สำเร็จ');
      if (action === 'close') { setAcknowledged(false); void outstanding.refetch(); }
    } finally { setBusy(false); }
  };
  const confirm = () => {
    if (action === 'close') {
      setTriedSave(true);
      // Missing fields show inline; once complete, closing still gets the same final confirm as before.
      if (missing.length) return;
    }
    Alert.alert(title, `${title} ${legalCase.data!.ownRef}?`, [
      { text: 'ยกเลิก', style: 'cancel' }, { text: 'ยืนยัน', onPress: submit },
    ]);
  };
  const data = outstanding.data;
  return <FormPage>
    <Stack.Screen options={{ title }} />
    <PageIntro title={legalCase.data.ownRef} detail={legalCase.data.title} />
    {action === 'close' ? <>
      {outstanding.isLoading && <LoadingState inline label="กำลังตรวจรายการค้าง…" />}
      {outstanding.isError && <ErrorState message="ตรวจรายการค้างไม่สำเร็จ · ต้องตรวจได้ก่อนปิดคดี" onRetry={() => outstanding.refetch()} />}
      {data && <Card style={[styles.outstanding, data.total > 0 && styles.outstandingDue]}>
        <Text accessibilityRole="header" style={styles.outstandingTitle}>
          {data.total > 0 ? `รายการค้าง ${data.total} รายการ` : 'ไม่มีรายการค้าง'}
        </Text>
        {data.total > 0 && <Text style={styles.outstandingDetail}>ตรวจรายการค้างก่อนปิดคดี</Text>}
        <View style={styles.rows}>
          {data.openTasks.map(item => <View key={item.id} style={styles.row}><ActionRow title={item.title} detail="งานที่ยังไม่เสร็จ"
            onPress={() => router.push(`/task/new?id=${item.id}`)} /></View>)}
          {data.upcomingEvents.map(item => <View key={item.id} style={styles.row}><ActionRow title={item.title} detail={`นัดหมาย · ${thDate(item.startAt)}`}
            onPress={() => router.push(`/event/new?id=${item.id}`)} /></View>)}
          {data.unapprovedDocuments.map(item => <View key={item.id} style={styles.row}><ActionRow title={item.filename} detail="เอกสารรออนุมัติ"
            onPress={() => router.push(`/case/${id}?section=documents`)} /></View>)}
          <Text style={styles.outstandingDetail}>เวลายังไม่เรียกเก็บ: {data.unbilledTime.hours} ชั่วโมง · {formatMoney(data.unbilledTime.amount)} บาท</Text>
          <Text style={styles.outstandingDetail}>ค่าใช้จ่ายยังไม่เรียกเก็บ: {data.unbilledExpenses.count} รายการ · {formatMoney(data.unbilledExpenses.amount)} บาท</Text>
          <Text style={styles.outstandingDetail}>ใบแจ้งหนี้ค้างชำระ: {data.unpaidInvoices.count} ใบ · {formatMoney(data.unpaidInvoices.outstandingAmount)} บาท</Text>
          <Text style={styles.outstandingDetail}>ใบแจ้งหนี้ร่าง: {data.draftInvoices.count} ใบ</Text>
          {data.total > 0 && <View style={styles.row}><CheckRow label="ตรวจรายการค้างแล้ว และยืนยันจะปิดคดี" checked={acknowledged} onChange={setAcknowledged} disabled={busy} /></View>}
        </View>
      </Card>}
      {data && data.upcomingEvents.length > 0 && <View>
        <CheckRow label={`ลบนัดในอนาคต ${data.upcomingEvents.length} รายการ`} checked={removeFutureEvents} onChange={setRemoveFutureEvents} disabled={busy} />
        <Text style={styles.outstandingDetail}>เปิดคดีใหม่จะไม่กู้นัดที่ลบ</Text>
      </View>}
      <FormSection title="ผลและสรุปก่อนปิดคดี">
        <SelectField label="ผลคดี" required placeholder="เลือกผลคดี" value={outcome} options={outcomes} onChange={setOutcome} disabled={busy}
          error={triedSave && !outcome ? 'เลือกผลคดี' : undefined} />
        <TextArea label="สรุปผลคดี" required hint={`อย่างน้อย ${SUMMARY_MIN} ตัวอักษร${summary.trim() && shortBy ? ` · อีก ${shortBy} ตัวอักษร` : ''}`}
          value={summary} onChange={setSummary} disabled={busy} placeholder="ผลคดี ข้อตกลง หรือบันทึกสำคัญก่อนปิดคดี"
          error={triedSave && shortBy ? `เขียนสรุปอย่างน้อย ${SUMMARY_MIN} ตัวอักษร` : undefined} />
      </FormSection>
    </> : <Text style={styles.note}>{action === 'reopen'
      ? 'คดีจะกลับเป็นสถานะดำเนินการ' : 'เก็บคดีที่ปิดแล้วเข้าคลัง โดยยังเปิดคดีอีกครั้งได้'}</Text>}
    <InlineError message={error || undefined} />
    {triedSave && <MissingSummary items={missing} />}
    <View style={{ marginTop: spacing.md }}><Button title={`ยืนยัน${title}`} busy={busy}
      disabled={action === 'close' && !outstandingReady} onPress={confirm} /></View>
  </FormPage>;
}

import React, { useState } from 'react';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';
import { CalendarOff, CircleCheck } from 'lucide-react-native';
import { Text } from '@/components/AppText';
import { useAuth } from '@/api/auth';
import { useLeaves, useRequestLeave } from '@/api/hooks';
import type { LeaveItem } from '@/api/types';
import { DatePicker } from '@/components/DatePicker';
import { Dropdown } from '@/components/Dropdown';
import { FormSection, SwitchRow } from '@/components/Form';
import { Button, Card, EmptyState, ErrorState, InlineError, LoadingState, PageIntro, SectionLabel, Tag } from '@/components/ui';
import { bangkokDay, thDate } from '@/format';
import { colors, radius, spacing, pageContent } from '@/theme';

const TYPES = [
  { value: 'SICK', label: 'ลาป่วย' },
  { value: 'PERSONAL', label: 'ลากิจ' },
  { value: 'VACATION', label: 'ลาพักร้อน' },
];

const dateRange = (start: string, end: string) => start === end ? thDate(start) : `${thDate(start)} – ${thDate(end)}`;

export default function LeavesScreen() {
  const { user } = useAuth();
  const today = bangkokDay(new Date().toISOString());
  const [type, setType] = useState<LeaveItem['type']>('PERSONAL');
  const [start, setStart] = useState(today);
  const [end, setEnd] = useState(today);
  const [multiple, setMultiple] = useState(false);
  const [sent, setSent] = useState('');
  const history = useLeaves(today, bangkokDay(new Date(Date.now() + 180 * 86400000).toISOString()));
  const request = useRequestLeave();
  const endDate = multiple ? end : start;
  // The pickers already block past days; these checks only catch a stale value (e.g. a form left open past midnight).
  const startError = start < today ? 'วันเริ่มลาต้องไม่ย้อนหลัง' : undefined;
  const endError = endDate < start ? 'วันสิ้นสุดต้องไม่ก่อนวันเริ่ม' : undefined;
  // Sending a leave request keeps its confirm (it notifies the owner); the result shows inline, not in a second alert.
  const submit = () => {
    if (startError || endError) return;
    const label = `${TYPES.find((item) => item.value === type)?.label} · ${dateRange(start, endDate)}`;
    Alert.alert('ยืนยันขอลา', label, [
      { text: 'ยกเลิก', style: 'cancel' },
      { text: 'ส่งคำขอ', onPress: () => {
        setSent('');
        request.mutate({ type, startDate: start, endDate }, {
          onSuccess: (data) => setSent(`${label} · ${data.status === 'APPROVED' ? 'บันทึกการลาแล้ว' : 'ส่งคำขอแล้ว รอเจ้าของสำนักงานอนุมัติ'}`),
        });
      } },
    ]);
  };
  const mine = history.data?.filter((item) => item.userId === user?.id) ?? [];
  return <ScrollView style={{ backgroundColor: colors.bg }} contentContainerStyle={pageContent} keyboardShouldPersistTaps="handled">
    <PageIntro detailOnly title="ขอลา" detail="เลือกประเภทและวันที่ แล้วส่งคำขอ" />
    <FormSection title="วันและประเภทการลา">
      <Dropdown inline label="ประเภทการลา" fieldLabel="ประเภทการลา" value={type} options={TYPES}
        onChange={(value) => setType(value as LeaveItem['type'])} disabled={request.isPending} />
      <DatePicker label={multiple ? 'วันเริ่มลา' : 'วันที่ลา'} required value={start} minDate={today} error={startError} disabled={request.isPending}
        onChange={(value) => { setStart(value); if (end < value) setEnd(value); }} />
      <SwitchRow label="ลาหลายวัน" value={multiple} onValueChange={setMultiple} disabled={request.isPending} />
      {multiple && <DatePicker label="ถึงวันที่" required value={end} minDate={start} error={endError} onChange={setEnd} disabled={request.isPending} />}
      <InlineError message={request.isError ? `ส่งไม่สำเร็จ · ${request.error.message}` : undefined} />
      {!!sent && <View accessibilityLiveRegion="polite" style={styles.sent}>
        <CircleCheck size={18} color={colors.good} style={{ marginTop: 2 }} />
        <Text style={{ flex: 1, color: colors.good, fontWeight: '600' }}>{sent}</Text>
      </View>}
      <View style={{ marginTop: spacing.sm }}><Button title="ส่งคำขอลา" onPress={submit} busy={request.isPending} disabled={!!startError || !!endError} /></View>
    </FormSection>
    <SectionLabel>คำขอของฉัน · วันนี้เป็นต้นไป</SectionLabel>
    {history.isLoading ? <LoadingState inline label="กำลังโหลดคำขอ…" />
      : history.isError && !history.data ? <ErrorState message="โหลดคำขอไม่สำเร็จ" onRetry={() => history.refetch()} />
        : !mine.length ? <Card><EmptyState compact>ยังไม่มีคำขอ</EmptyState></Card> : null}
    {history.isError && !!history.data && <InlineError message="รายการอาจยังไม่ล่าสุด" onRetry={() => history.refetch()} style={{ marginBottom: spacing.sm }} />}
    {mine.length > 0 && <Card style={styles.list}>
      {mine.map((item, index) => <View key={item.id} style={[styles.row, index > 0 && styles.divided]}>
        <View style={styles.iconTile}><CalendarOff size={18} color={colors.info} /></View>
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <Text style={{ color: colors.ink, fontWeight: '700' }}>{TYPES.find((option) => option.value === item.type)?.label ?? 'ลา'}</Text>
          <Text style={{ color: colors.muted, fontSize: 14 }}>{dateRange(item.startDate, item.endDate)}</Text>
        </View>
        <Tag tone={item.status === 'APPROVED' ? 'ok' : item.status === 'REJECTED' ? 'due' : 'info'}>
          {item.status === 'APPROVED' ? 'อนุมัติแล้ว' : item.status === 'REJECTED' ? 'ไม่อนุมัติ' : 'รออนุมัติ'}
        </Tag>
      </View>)}
    </Card>}
  </ScrollView>;
}

const styles = StyleSheet.create({
  sent: { flexDirection: 'row', gap: spacing.sm, padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.goodSoft,
    borderLeftWidth: 3, borderLeftColor: colors.good },
  list: { paddingVertical: spacing.xs },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md },
  divided: { borderTopWidth: 1, borderTopColor: colors.divider },
  iconTile: { width: 40, height: 40, borderRadius: radius.md, backgroundColor: colors.infoSoft, alignItems: 'center', justifyContent: 'center' },
});

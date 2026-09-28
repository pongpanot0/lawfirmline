import React, { useState } from 'react';
import { Alert, ScrollView, Switch, View } from 'react-native';
import { Text } from '@/components/AppText';
import { useAuth } from '@/api/auth';
import { useLeaves, useRequestLeave } from '@/api/hooks';
import type { LeaveItem } from '@/api/types';
import { DatePicker } from '@/components/DatePicker';
import { Dropdown } from '@/components/Dropdown';
import { Button, Card, EmptyNote, ErrorNote, SectionLabel, Tag } from '@/components/ui';
import { bangkokDay, thDate } from '@/format';
import { colors, spacing, pageContent } from '@/theme';

const TYPES = [
  { value: 'SICK', label: 'ลาป่วย' },
  { value: 'PERSONAL', label: 'ลากิจ' },
  { value: 'VACATION', label: 'ลาพักร้อน' },
];

export default function LeavesScreen() {
  const { user } = useAuth();
  const today = bangkokDay(new Date().toISOString());
  const [type, setType] = useState<LeaveItem['type']>('PERSONAL');
  const [start, setStart] = useState(today);
  const [end, setEnd] = useState(today);
  const [multiple, setMultiple] = useState(false);
  const history = useLeaves(today, bangkokDay(new Date(Date.now() + 180 * 86400000).toISOString()));
  const request = useRequestLeave();
  const submit = () => {
    const endDate = multiple ? end : start;
    if (start < today || endDate < start) return Alert.alert('ตรวจสอบวันที่', 'วันเริ่มต้องไม่ย้อนหลัง และวันสิ้นสุดต้องไม่ก่อนวันเริ่ม');
    Alert.alert('ยืนยันขอลา', `${TYPES.find((item) => item.value === type)?.label} · ${thDate(start)}${endDate !== start ? ` ถึง ${thDate(endDate)}` : ''}`, [
      { text: 'ยกเลิก', style: 'cancel' },
      { text: 'ส่งคำขอ', onPress: () => request.mutate({ type, startDate: start, endDate }, {
        onSuccess: (data) => Alert.alert('ส่งคำขอแล้ว', data.status === 'APPROVED' ? 'บันทึกการลาแล้ว' : 'รอเจ้าของสำนักงานอนุมัติ'),
        onError: (error) => Alert.alert('ส่งไม่สำเร็จ', error.message),
      }) },
    ]);
  };
  return <ScrollView style={{ backgroundColor: colors.bg }} contentContainerStyle={pageContent}>
    <Text style={{ color: colors.muted }}>เลือกประเภทและวันลา แล้วส่งได้เลย</Text>
    <SectionLabel>ประเภทการลา</SectionLabel>
    <Dropdown label="ประเภทการลา" value={type} options={TYPES} onChange={(value) => setType(value as LeaveItem['type'])} disabled={request.isPending} />
    <SectionLabel>วันที่ลา</SectionLabel>
    <DatePicker value={start} onChange={(value) => { setStart(value); if (end < value) setEnd(value); }} />
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginVertical: spacing.md }}>
      <Text style={{ color: colors.text }}>ลาหลายวัน</Text><Switch accessibilityLabel="ลาหลายวัน" value={multiple} onValueChange={setMultiple} />
    </View>
    {multiple && <><SectionLabel>ถึงวันที่</SectionLabel><DatePicker value={end} onChange={setEnd} /></>}
    <View style={{ marginTop: spacing.lg }}><Button title="ส่งคำขอลา" onPress={submit} busy={request.isPending} /></View>
    <SectionLabel>คำขอของฉัน · วันนี้เป็นต้นไป</SectionLabel>
    {history.isError && <ErrorNote message="โหลดคำขอไม่สำเร็จ" onRetry={() => history.refetch()} />}
    {history.isLoading ? <Text>กำลังโหลด…</Text> : !history.data?.some((item) => item.userId === user?.id) && <EmptyNote>ยังไม่มีคำขอ</EmptyNote>}
    {history.data?.filter((item) => item.userId === user?.id).map((item) => <Card key={item.id} style={{ marginBottom: spacing.md }}>
      <Text style={{ color: colors.ink, fontWeight: '600' }}>{TYPES.find((option) => option.value === item.type)?.label}</Text>
      <Text style={{ color: colors.muted, marginVertical: spacing.sm }}>{thDate(item.startDate)} – {thDate(item.endDate)}</Text>
      <Tag tone={item.status === 'APPROVED' ? 'ok' : item.status === 'REJECTED' ? 'due' : 'info'}>
        {item.status === 'APPROVED' ? 'อนุมัติแล้ว' : item.status === 'REJECTED' ? 'ไม่อนุมัติ' : 'รออนุมัติ'}
      </Tag>
    </Card>)}
  </ScrollView>;
}

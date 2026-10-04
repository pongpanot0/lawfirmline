import React, { useEffect, useState } from 'react';
import { Alert, Pressable, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api/client';
import { useAuth } from '@/api/auth';
import { useCase } from '@/api/hooks';
import { Text } from '@/components/AppText';
import { Dropdown } from '@/components/Dropdown';
import { FormField, FormPage, FormSection } from '@/components/Form';
import { Button, Card, ErrorNote, Loading, PageIntro } from '@/components/ui';
import { thDate } from '@/format';
import { colors, spacing } from '@/theme';

interface Outstanding {
  total: number;
  openTasks: Array<{ id: string; title: string }>;
  upcomingEvents: Array<{ id: string; title: string; startAt: string }>;
  unapprovedDocuments: Array<{ id: string; filename: string }>;
}
const outcomes = [
  { value: '', label: 'ไม่ระบุผลคดี' }, { value: 'WON', label: 'ชนะคดี' },
  { value: 'SETTLED', label: 'ตกลงกันได้' }, { value: 'MEDIATED', label: 'ไกล่เกลี่ยสำเร็จ' },
  { value: 'LOST', label: 'แพ้คดี' }, { value: 'WITHDRAWN', label: 'ถอนฟ้อง / ยุติ' },
];

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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const outstanding = useQuery({ queryKey: ['case-outstanding', id], staleTime: 0,
    enabled: !!id && action === 'close' && allowed,
    queryFn: () => api<Outstanding>(`/cases/${id}/outstanding`) });
  useEffect(() => { setAcknowledged(false); }, [JSON.stringify(outstanding.data)]);
  if (legalCase.isLoading) return <Loading />;
  if (!allowed) return <FormPage><Text>คุณไม่มีสิทธิ์ทำรายการนี้</Text></FormPage>;
  if (!legalCase.data) return <FormPage><ErrorNote message="โหลดคดีไม่สำเร็จ" onRetry={() => legalCase.refetch()} /></FormPage>;

  const submit = async () => {
    if (busy) return;
    setBusy(true); setError('');
    try {
      await api(`/cases/${id}/${action}`, { method: 'POST', body: action === 'close'
        ? { closingSummary: summary.trim(), ...(outcome ? { outcome } : {}), acknowledgeOutstanding: acknowledged } : {} });
      await Promise.all(['case', 'cases', 'my-day', 'dashboard-stats', 'owner-kpis', 'workload', 'case-outstanding'].map(key =>
        cache.invalidateQueries({ queryKey: [key] })));
      router.back();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'บันทึกไม่สำเร็จ');
      if (action === 'close') { setAcknowledged(false); void outstanding.refetch(); }
    } finally { setBusy(false); }
  };
  return <FormPage>
    <Stack.Screen options={{ title }} />
    <PageIntro title={legalCase.data.ownRef} detail={legalCase.data.title} />
    {action === 'close' ? <>
      {outstanding.isLoading && <Text>กำลังตรวจรายการค้าง…</Text>}
      {outstanding.isError && <ErrorNote message="ตรวจรายการค้างไม่สำเร็จ" onRetry={() => outstanding.refetch()} />}
      {outstanding.data && <Card>
        <Text style={{ color: colors.ink, fontWeight: '700' }}>รายการค้าง {outstanding.data.total} รายการ</Text>
        {outstanding.data.openTasks.map(item => <Text key={item.id} style={{ marginTop: spacing.sm }}>งาน: {item.title}</Text>)}
        {outstanding.data.upcomingEvents.map(item => <Text key={item.id} style={{ marginTop: spacing.sm }}>นัดหมาย: {item.title} · {thDate(item.startAt)}</Text>)}
        {outstanding.data.unapprovedDocuments.map(item => <Text key={item.id} style={{ marginTop: spacing.sm }}>เอกสารรออนุมัติ: {item.filename}</Text>)}
        {outstanding.data.total > 0 && <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: acknowledged }}
          onPress={() => setAcknowledged(!acknowledged)} style={{ minHeight: 48, paddingVertical: spacing.md }}>
          <Text style={{ color: colors.warn }}>{acknowledged ? '☑' : '☐'} ตรวจรายการค้างแล้ว และยืนยันจะปิดคดี</Text>
        </Pressable>}
      </Card>}
      <FormSection title="ผลและสรุปก่อนปิดคดี">
      <Dropdown label="ผลคดี" value={outcome} options={outcomes} onChange={setOutcome} disabled={busy} />
      <FormField label="สรุปผลคดี (อย่างน้อย 10 ตัวอักษร)" value={summary} onChange={setSummary} multiline disabled={busy} placeholder="ผลคดี ข้อตกลง หรือบันทึกสำคัญก่อนปิดคดี" />
      </FormSection>
    </> : <Text style={{ color: colors.muted }}>{action === 'reopen'
      ? 'คดีจะกลับเป็นสถานะดำเนินการ' : 'เก็บคดีที่ปิดแล้วเข้าคลัง โดยยังเปิดคดีอีกครั้งได้'}</Text>}
    {!!error && <Text accessibilityRole="alert" style={{ color: colors.warn }}>{error}</Text>}
    <View style={{ marginTop: spacing.md }}><Button title={`ยืนยัน${title}`} busy={busy}
      disabled={action === 'close' && (summary.trim().length < 10 || !outstanding.data || outstanding.isError || outstanding.isFetching || (outstanding.data.total > 0 && !acknowledged))}
      onPress={() => Alert.alert(title, `${title} ${legalCase.data!.ownRef}?`, [
        { text: 'ยกเลิก', style: 'cancel' }, { text: 'ยืนยัน', onPress: submit },
      ])} /></View>
  </FormPage>;
}

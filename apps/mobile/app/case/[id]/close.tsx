import React, { useEffect, useState } from 'react';
import { Alert, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api/client';
import { useAuth } from '@/api/auth';
import { useCase } from '@/api/hooks';
import { Text } from '@/components/AppText';
import { Dropdown } from '@/components/Dropdown';
import { CheckRow, FormField, FormPage, FormSection, MissingSummary } from '@/components/Form';
import { ActionRow, Button, Card, ErrorNote, Loading, PageIntro } from '@/components/ui';
import { thDate } from '@/format';
import { colors, fonts, spacing } from '@/theme';

interface Outstanding {
  total: number;
  openTasks: Array<{ id: string; title: string }>;
  upcomingEvents: Array<{ id: string; title: string; startAt: string }>;
  unapprovedDocuments: Array<{ id: string; filename: string }>;
}
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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [triedSave, setTriedSave] = useState(false);
  const outstanding = useQuery({ queryKey: ['case-outstanding', id], staleTime: 0,
    enabled: !!id && action === 'close' && allowed,
    queryFn: () => api<Outstanding>(`/cases/${id}/outstanding`) });
  useEffect(() => { setAcknowledged(false); }, [JSON.stringify(outstanding.data)]);
  if (legalCase.isLoading) return <Loading label="กำลังโหลดคดี…" />;
  if (!allowed) return <FormPage>
    <Stack.Screen options={{ title }} />
    <Text style={{ color: colors.text }}>คุณไม่มีสิทธิ์ทำรายการนี้ · ให้ทนายผู้รับผิดชอบหรือเจ้าของสำนักงานทำแทน</Text>
    <Button title="กลับ" variant="secondary" onPress={() => router.back()} />
  </FormPage>;
  if (!legalCase.data) return <FormPage><ErrorNote message="โหลดคดีไม่สำเร็จ" onRetry={() => legalCase.refetch()} /></FormPage>;

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
        ? { closingSummary: summary.trim(), outcome, acknowledgeOutstanding: acknowledged } : {} });
      await Promise.all(['case', 'cases', 'my-day', 'dashboard-stats', 'owner-kpis', 'workload', 'case-outstanding'].map(key =>
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
      {outstanding.isLoading && <Text accessibilityLiveRegion="polite" style={{ color: colors.muted }}>กำลังตรวจรายการค้าง…</Text>}
      {outstanding.isError && <ErrorNote message="ตรวจรายการค้างไม่สำเร็จ · ต้องตรวจได้ก่อนปิดคดี" onRetry={() => outstanding.refetch()} />}
      {data && <Card style={{ gap: spacing.xs }}>
        <Text accessibilityRole="header" style={{ color: colors.ink, fontSize: 17, fontFamily: fonts.bold }}>
          {data.total > 0 ? `รายการค้าง ${data.total} รายการ` : 'ไม่มีรายการค้าง'}
        </Text>
        {data.total > 0 && <Text style={{ color: colors.muted, fontSize: 14 }}>แตะเพื่อเปิดและจัดการก่อนปิดคดี</Text>}
        {data.openTasks.map(item => <ActionRow key={item.id} title={item.title} detail="งานที่ยังไม่เสร็จ"
          onPress={() => router.push(`/task/new?id=${item.id}`)} />)}
        {data.upcomingEvents.map(item => <ActionRow key={item.id} title={item.title} detail={`นัดหมาย · ${thDate(item.startAt)}`}
          onPress={() => router.push(`/event/new?id=${item.id}`)} />)}
        {data.unapprovedDocuments.map(item => <ActionRow key={item.id} title={item.filename} detail="เอกสารรออนุมัติ"
          onPress={() => router.push(`/case/${id}?section=documents`)} />)}
        {data.total > 0 && <CheckRow label="ตรวจรายการค้างแล้ว และยืนยันจะปิดคดี" checked={acknowledged} onChange={setAcknowledged} disabled={busy} />}
      </Card>}
      <FormSection title="ผลและสรุปก่อนปิดคดี">
        <Dropdown label="ผลคดี" fieldLabel="ผลคดี" required placeholder="เลือกผลคดี" value={outcome} options={outcomes} onChange={setOutcome} disabled={busy}
          error={triedSave && !outcome ? 'เลือกผลคดี' : undefined} />
        <FormField label="สรุปผลคดี" required hint={`อย่างน้อย ${SUMMARY_MIN} ตัวอักษร${summary.trim() && shortBy ? ` · อีก ${shortBy} ตัวอักษร` : ''}`}
          value={summary} onChange={setSummary} multiline disabled={busy} placeholder="ผลคดี ข้อตกลง หรือบันทึกสำคัญก่อนปิดคดี"
          error={triedSave && shortBy ? `เขียนสรุปอย่างน้อย ${SUMMARY_MIN} ตัวอักษร` : undefined} />
      </FormSection>
    </> : <Text style={{ color: colors.muted }}>{action === 'reopen'
      ? 'คดีจะกลับเป็นสถานะดำเนินการ' : 'เก็บคดีที่ปิดแล้วเข้าคลัง โดยยังเปิดคดีอีกครั้งได้'}</Text>}
    {!!error && <ErrorNote message={error} />}
    {triedSave && <MissingSummary items={missing} />}
    <View style={{ marginTop: spacing.md }}><Button title={`ยืนยัน${title}`} busy={busy}
      disabled={action === 'close' && !outstandingReady} onPress={confirm} /></View>
  </FormPage>;
}

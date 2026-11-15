import React, { useCallback } from 'react';
import { Alert, View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useFocusEffect, useRouter } from 'expo-router';
import { CASE_STAGE_LABELS_TH, type CaseStage } from '@lawfirm/shared';
import { api } from '@/api/client';
import { Text } from '@/components/AppText';
import { Button, Card, EmptyState, InlineError, LoadingState, Tag } from '@/components/ui';
import { formatMoney } from '@/format';
import { colors, spacing } from '@/theme';

type Milestone = { id: string; label: string; stage: CaseStage; amount: number; closeAmount: number | null; status: 'PENDING' | 'INVOICED' | 'PARTIAL' | 'WAIVED'; reached: boolean };
type CaseFee = { packageSnapshot: { name: string } | null; agreedAmount: number; milestones: Milestone[] };
const statusLabels = { PENDING: 'รอออกใบแจ้งหนี้', INVOICED: 'ออกใบแจ้งหนี้แล้ว', PARTIAL: 'เก็บบางส่วน', WAIVED: 'ยกเว้น' };

export function CaseFeeSection({ caseId, customerId }: { caseId: string; customerId?: string }) {
  const router = useRouter(), client = useQueryClient();
  const fee = useQuery({ queryKey: ['case-fee', caseId], queryFn: () => api<CaseFee | null>(`/cases/${caseId}/fee`) });
  useFocusEffect(useCallback(() => { void fee.refetch(); }, [fee.refetch]));
  const create = useMutation({ retry: false, mutationFn: (milestoneId: string) => api<Array<{ id: string }>>(`/cases/${caseId}/billing/invoices`, {
    method: 'POST', body: { milestoneLines: [{ id: milestoneId }], ...(customerId ? { billToCustomerId: customerId } : {}) },
  }), onSuccess: rows => { void client.invalidateQueries({ queryKey: ['case-fee', caseId] }); if (rows[0]) router.push(`/invoice/${rows[0].id}`); },
  onError: () => { void fee.refetch(); } });
  return <Card style={{ gap: spacing.md, marginTop: spacing.md }}>
    <Text accessibilityRole="header" style={{ fontSize: 18, fontWeight: '700', color: colors.ink }}>ค่าวิชาชีพ</Text>
    {fee.isLoading && <LoadingState inline label="กำลังโหลดค่าวิชาชีพ…" />}
    {fee.isError && <InlineError message="โหลดค่าวิชาชีพไม่ได้ ตรวจการเชื่อมต่อแล้วลองใหม่" onRetry={() => fee.refetch()} />}
    {fee.data === null && <EmptyState compact>ยังไม่ได้กำหนดค่าวิชาชีพสำหรับคดีนี้</EmptyState>}
    {fee.data && <>
      <View style={{ gap: spacing.xs, borderTopWidth: 1, borderColor: colors.divider, paddingTop: spacing.md }}>
        <Text style={{ color: colors.muted }}>{fee.data.packageSnapshot?.name ?? 'ค่าวิชาชีพที่ตกลง'}</Text>
        <Text style={{ color: colors.ink, fontSize: 20, fontWeight: '700' }}>{formatMoney(fee.data.agreedAmount)} ฿</Text>
      </View>
      {fee.data.milestones.map(m => <View key={m.id} style={{ gap: spacing.sm, borderTopWidth: 1, borderColor: colors.divider, paddingTop: spacing.md }}>
        <Text style={{ color: colors.ink, fontWeight: '700' }}>{m.label} · {formatMoney(m.status === 'WAIVED' ? m.amount : (m.closeAmount ?? m.amount))} ฿</Text>
        {(CASE_STAGE_LABELS_TH[m.stage] ?? m.stage) !== m.label && <Text style={{ color: colors.muted }}>{CASE_STAGE_LABELS_TH[m.stage] ?? m.stage}</Text>}
        <Tag tone={m.reached && m.status === 'PENDING' ? 'court' : 'plain'}>{statusLabels[m.status]}{m.reached && m.status === 'PENDING' ? ' · ถึงขั้นตอนแล้ว' : ''}</Tag>
        {m.reached && (m.status === 'PENDING' || m.status === 'PARTIAL') && <Button title="ออกใบแจ้งหนี้งวดนี้" accessibilityHint="สร้างใบแจ้งหนี้ฉบับร่างสำหรับงวดนี้" disabled={create.isPending || fee.isFetching || fee.isError} onPress={() => Alert.alert('สร้างใบแจ้งหนี้งวดนี้', `${m.label} · ${formatMoney(m.closeAmount ?? m.amount)} ฿\nสร้างเป็นฉบับร่างเพื่อตรวจสอบก่อนวางบิล`, [{ text: 'ยกเลิก', style: 'cancel' }, { text: 'สร้างใบแจ้งหนี้', onPress: () => create.mutate(m.id) }])} />}
      </View>)}
      {!fee.data.milestones.length && <Text style={{ color: colors.muted }}>ยังไม่มีงวดค่าวิชาชีพ</Text>}
    </>}
    {create.isError && <InlineError message={`สร้างใบแจ้งหนี้ไม่สำเร็จ · ${create.error.message} · ตรวจสถานะงวดก่อนลองใหม่`} />}
  </Card>;
}

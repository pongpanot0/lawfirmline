import React, { useState } from 'react';
import { Alert, RefreshControl, ScrollView, View } from 'react-native';
import { Text } from '@/components/AppText';
import { useLocalSearchParams } from 'expo-router';
import { useAuth } from '@/api/auth';
import { useExpenseClaim, useReviewClaim } from '@/api/hooks';
import { openExpenseReceipt } from '@/api/files';
import { Button, Card, ErrorNote, Loading, PageIntro, SectionLabel, Tag } from '@/components/ui';
import { claimActions } from '@/workflow';
import { formatMoney, thDate, thTime } from '@/format';
import { colors, spacing, pageContent } from '@/theme';
import { CLAIM_STATUS } from '../claims';

const LABEL = { APPROVED: 'อนุมัติทั้งชุด', REJECTED: 'ไม่อนุมัติทั้งชุด', PAID: 'ติ๊กว่าจ่ายทั้งชุดแล้ว' };
export default function ClaimScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const claim = useExpenseClaim(id);
  const review = useReviewClaim(id);
  const [opening, setOpening] = useState<string | null>(null);
  if (claim.isLoading) return <Loading />;
  if (!claim.data) return <View style={{ padding: spacing.lg }}><ErrorNote message="โหลดชุดเบิกไม่สำเร็จ" onRetry={() => claim.refetch()} /></View>;
  const data = claim.data;
  const act = (status: 'APPROVED' | 'REJECTED' | 'PAID') => Alert.alert(LABEL[status],
    `${data.submittedBy.firstName} · ${data.itemCount} รายการ · ${formatMoney(data.totalAmount)} บาท${status === 'PAID' ? '\nยืนยันว่าได้จ่ายเงินจริงแล้ว' : ''}`,
    [{ text: 'ยกเลิก', style: 'cancel' }, { text: 'ยืนยัน', onPress: () => review.mutate(status, {
      onError: (error) => Alert.alert('เปลี่ยนสถานะไม่สำเร็จ', error.message),
    }) }]);
  return <ScrollView style={{ backgroundColor: colors.bg }} contentContainerStyle={{ ...pageContent, gap: spacing.md }}
    refreshControl={<RefreshControl refreshing={claim.isRefetching} onRefresh={() => claim.refetch()} />}>
    <PageIntro title="รายละเอียดชุดเบิก" detail={`ชุด ${data.id.slice(0, 8)} · ตรวจหลักฐานก่อนทำรายการ`} />
    {claim.isError && <ErrorNote message="โหลดสถานะล่าสุดไม่ได้ กรุณาลองใหม่ก่อนดำเนินการ" onRetry={() => claim.refetch()} />}
    <Card>
      <Text style={{ color: colors.ink, fontWeight: '700', fontSize: 18 }}>{data.submittedBy.firstName} {data.submittedBy.lastName}</Text>
      <Text style={{ color: colors.ink, fontSize: 28, fontWeight: '700', marginVertical: spacing.sm }}>{formatMoney(data.totalAmount)} ฿</Text>
      <Tag tone={CLAIM_STATUS[data.status].tone}>{CLAIM_STATUS[data.status].label}</Tag>
      <Text style={{ color: colors.muted, marginTop: spacing.sm }}>ชุด {data.id.slice(0, 8)}</Text>
      <Text style={{ color: colors.muted }}>ส่ง {thDate(data.submittedAt)} {thTime(data.submittedAt)} · {data.itemCount} รายการ · {data.receiptCount} ใบเสร็จ</Text>
      {data.reviewedAt && <Text style={{ color: colors.muted }}>ตรวจ {thDate(data.reviewedAt)} {thTime(data.reviewedAt)}</Text>}
      {data.paidAt && <Text style={{ color: colors.good }}>จ่าย {thDate(data.paidAt)} {thTime(data.paidAt)}</Text>}
    </Card>
    <SectionLabel>เบิกค่าอะไรบ้าง</SectionLabel>
    {data.expenses.map((expense) => <Card key={expense.id}>
      <Text style={{ color: colors.ink, fontWeight: '700' }}>{expense.category} · {formatMoney(expense.amount)} ฿</Text>
      <Text style={{ color: colors.text }}>{expense.description}</Text>
      <Text style={{ color: colors.muted, marginVertical: spacing.sm }}>{expense.case?.ownRef ?? 'สำนักงาน'} · {thDate(expense.date)}</Text>
      {expense.receiptFilename ? <Button title="เปิดใบเสร็จ" ghost disabled={!!opening} busy={opening === expense.id} onPress={async () => {
        setOpening(expense.id);
        try { await openExpenseReceipt(expense.id, expense.receiptFilename!); }
        catch (error) { Alert.alert('เปิดใบเสร็จไม่ได้', error instanceof Error ? error.message : 'ลองใหม่'); }
        finally { setOpening(null); }
      }} /> : <Text style={{ color: colors.muted }}>ไม่มีใบเสร็จแนบ</Text>}
    </Card>)}
    {claimActions(data.status, user?.firmRole === 'OWNER').length > 0 && <Card style={{ gap: spacing.sm }}>
    <SectionLabel style={{ marginTop: 0 }}>ดำเนินการกับชุดนี้</SectionLabel>
    {claimActions(data.status, user?.firmRole === 'OWNER').map((status) => <Button key={status}
      title={LABEL[status]} ghost={status === 'REJECTED'} onPress={() => act(status)}
      busy={review.isPending} disabled={claim.isError || claim.isFetching} />)}
    </Card>}
  </ScrollView>;
}

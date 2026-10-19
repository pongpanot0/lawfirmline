import React, { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '@/components/AppText';
import { useLocalSearchParams } from 'expo-router';
import { FileText } from 'lucide-react-native';
import { hasFirmCapability } from '@lawfirm/shared';
import { useAuth } from '@/api/auth';
import { useExpenseClaim, useReviewClaim } from '@/api/hooks';
import { openExpenseReceipt } from '@/api/files';
import { Button, Card, ErrorNote, Loading, SectionLabel, Tag } from '@/components/ui';
import { claimActions } from '@/workflow';
import { formatMoney, thDate, thTime } from '@/format';
import { colors, fonts, spacing, pageContent, TOUCH } from '@/theme';
import { CLAIM_STATUS } from '../claims';

const LABEL = { APPROVED: 'อนุมัติทั้งชุด', REJECTED: 'ไม่อนุมัติทั้งชุด', PAID: 'บันทึกว่าจ่ายเงินชุดนี้แล้ว' };
export default function ClaimScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const claim = useExpenseClaim(id);
  const review = useReviewClaim(id);
  const [opening, setOpening] = useState<string | null>(null);
  const [actionError, setActionError] = useState('');
  if (claim.isLoading) return <Loading label="กำลังโหลดชุดเบิก…" />;
  if (!claim.data) return <View style={{ flex: 1, backgroundColor: colors.bg, padding: spacing.lg }}><ErrorNote message="โหลดชุดเบิกไม่สำเร็จ" onRetry={() => claim.refetch()} /></View>;
  const data = claim.data;
  const approver = hasFirmCapability(user?.firmRole, 'approveExpenses');
  const actions = claimActions(data.status, approver);
  const act = (status: 'APPROVED' | 'REJECTED' | 'PAID') => Alert.alert(LABEL[status],
    `${data.submittedBy.firstName} · ${data.itemCount} รายการ · ${formatMoney(data.totalAmount)} บาท${status === 'PAID' ? '\nยืนยันว่าได้จ่ายเงินจริงแล้ว' : ''}`,
    [{ text: 'ยกเลิก', style: 'cancel' }, { text: 'ยืนยัน', style: status === 'REJECTED' ? 'destructive' : 'default', onPress: () => { setActionError(''); review.mutate(status, {
      onError: (error) => setActionError(`เปลี่ยนสถานะไม่สำเร็จ · ${error.message}`),
    }); } }]);
  const actionButton = (status: 'APPROVED' | 'REJECTED' | 'PAID') => <Button key={status} title={LABEL[status]}
    variant={status === 'REJECTED' ? 'danger' : 'primary'} inline={status === 'REJECTED'} onPress={() => act(status)}
    busy={review.isPending && review.variables === status} disabled={claim.isError || claim.isFetching || (review.isPending && review.variables !== status)} />;
  return <ScrollView style={{ backgroundColor: colors.bg }} contentContainerStyle={{ ...pageContent, gap: spacing.md }}
    refreshControl={<RefreshControl refreshing={claim.isRefetching} onRefresh={() => claim.refetch()} />}>
    {claim.isError && <ErrorNote message="โหลดสถานะล่าสุดไม่ได้ กรุณาลองใหม่ก่อนดำเนินการ" onRetry={() => claim.refetch()} />}
    <Card style={{ gap: spacing.xs }}>
      <Text style={{ color: colors.ink, fontWeight: '700', fontSize: 18 }}>{data.submittedBy.firstName} {data.submittedBy.lastName}</Text>
      <Text style={styles.total}>{formatMoney(data.totalAmount)} ฿</Text>
      <Tag tone={CLAIM_STATUS[data.status].tone}>{CLAIM_STATUS[data.status].label}</Tag>
      <Text style={[styles.meta, { marginTop: spacing.xs }]}>ส่ง {thDate(data.submittedAt)} {thTime(data.submittedAt)} · {data.itemCount} รายการ · {data.receiptCount} ใบเสร็จ · ชุด {data.id.slice(0, 8)}</Text>
      {data.reviewedAt && <Text style={styles.meta}>ตรวจ {thDate(data.reviewedAt)} {thTime(data.reviewedAt)}</Text>}
      {data.paidAt && <Text style={{ color: colors.good }}>จ่าย {thDate(data.paidAt)} {thTime(data.paidAt)}</Text>}
      {!approver && data.status === 'PENDING' && <Text style={[styles.meta, { color: colors.text }]}>รอผู้อนุมัติตรวจ</Text>}
      {!approver && data.status === 'APPROVED' && <Text style={[styles.meta, { color: colors.text }]}>อนุมัติแล้ว · รอสำนักงานจ่ายเงิน</Text>}
    </Card>
    <SectionLabel style={{ marginTop: spacing.sm, marginBottom: 0 }}>เบิกค่าอะไรบ้าง</SectionLabel>
    <Card style={{ paddingVertical: spacing.xs }}>
      {data.expenses.map((expense, index) => {
        const body = <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <Text style={{ color: colors.ink, fontWeight: '700' }}>{expense.category} · {formatMoney(expense.amount)} ฿</Text>
          {expense.description ? <Text style={{ color: colors.text }}>{expense.description}</Text> : null}
          <Text style={styles.meta}>{expense.case?.ownRef ?? 'สำนักงาน'} · {thDate(expense.date)}{expense.receiptFilename ? '' : ' · ไม่มีใบเสร็จแนบ'}</Text>
        </View>;
        if (!expense.receiptFilename) return <View key={expense.id} style={[styles.item, index > 0 && styles.divider]}>{body}</View>;
        // The row opens the receipt; the trailing icon says so.
        return <Pressable key={expense.id} accessibilityRole="button" accessibilityLabel={`เปิดใบเสร็จ ${expense.category} ${formatMoney(expense.amount)} บาท`}
          accessibilityState={{ busy: opening === expense.id, disabled: !!opening }} disabled={!!opening}
          onPress={async () => {
            setOpening(expense.id); setActionError('');
            try { await openExpenseReceipt(expense.id, expense.receiptFilename!); }
            catch (error) { setActionError(`เปิดใบเสร็จไม่ได้ · ${error instanceof Error ? error.message : 'ลองใหม่'}`); }
            finally { setOpening(null); }
          }}
          style={({ pressed }) => [styles.item, index > 0 && styles.divider, pressed && { backgroundColor: colors.soft }]}>
          {body}
          {opening === expense.id ? <ActivityIndicator color={colors.ink} /> : <View style={styles.receipt}><FileText size={18} color={colors.info} /><Text style={{ color: colors.info, fontSize: 13 }}>ใบเสร็จ</Text></View>}
        </Pressable>;
      })}
    </Card>
    {!!actionError && <ErrorNote message={actionError} />}
    {actions.length > 0 && <View style={{ gap: spacing.lg, marginTop: spacing.sm }}>
      {actions.filter(status => status !== 'REJECTED').map(actionButton)}
      {/* Reject is the destructive path: its own outline, set apart below the primary. */}
      {actions.includes('REJECTED') && actionButton('REJECTED')}
    </View>}
  </ScrollView>;
}

const styles = StyleSheet.create({
  total: { color: colors.ink, fontSize: 28, lineHeight: 40, fontFamily: fonts.bold, fontVariant: ['tabular-nums'] },
  meta: { color: colors.muted, fontSize: 14, lineHeight: 22 },
  item: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: TOUCH, paddingVertical: spacing.sm },
  divider: { borderTopWidth: 1, borderTopColor: colors.line },
  receipt: { alignItems: 'center', gap: 2, minWidth: TOUCH },
});

import React, { useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '@/components/AppText';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ChevronRight, Receipt } from 'lucide-react-native';
import { hasFirmCapability } from '@lawfirm/shared';
import { useAuth } from '@/api/auth';
import { useExpenseClaims } from '@/api/hooks';
import { Card, EmptyState, ErrorState, FilterTabs, LoadingState, PageIntro, Tag, TagTone } from '@/components/ui';
import { formatMoney, thDate, thTime } from '@/format';
import { colors, spacing, pageContent, typeScale } from '@/theme';

/** Brass marks the review queue (รออนุมัติ); approved-awaiting-payment reads as plain information. */
export const CLAIM_STATUS: Record<string, { label: string; tone: TagTone }> = {
  PENDING: { label: 'รออนุมัติ', tone: 'court' }, APPROVED: { label: 'อนุมัติ · รอจ่าย', tone: 'info' },
  PAID: { label: 'จ่ายแล้ว', tone: 'ok' }, REJECTED: { label: 'ไม่อนุมัติ', tone: 'due' },
};

export default function ClaimsScreen() {
  const { user } = useAuth();
  const claims = useExpenseClaims();
  const router = useRouter();
  const params = useLocalSearchParams<{ status?: string }>();
  const [status, setStatus] = useState(params.status && Object.hasOwn(CLAIM_STATUS, params.status) ? params.status : '');
  if (claims.isLoading) return <LoadingState label="กำลังโหลดชุดเบิก…" />;
  const approver = hasFirmCapability(user?.firmRole, 'approveExpenses');
  const all = claims.data ?? [];
  const rows = all.filter((claim) => !status || claim.status === status);
  const tabs = [{ value: '', label: 'ทั้งหมด' }, ...Object.entries(CLAIM_STATUS).map(([value, meta]) => {
    const count = all.filter((claim) => claim.status === value).length;
    return { value, label: count ? `${meta.label} (${count})` : meta.label };
  })];
  return <ScrollView style={{ backgroundColor: colors.bg }} contentContainerStyle={pageContent}
    refreshControl={<RefreshControl refreshing={claims.isRefetching} onRefresh={() => claims.refetch()} />}>
    <PageIntro title="ชุดเบิก" detailOnly detail={approver ? 'ชุดเบิกจากทีม · แตะเพื่อตรวจรายการและใบเสร็จ' : 'ชุดที่คุณส่งเบิก · แตะเพื่อดูรายการและสถานะ'} />
    <FilterTabs items={tabs} value={status} onChange={setStatus} />
    {claims.isError && <ErrorState message="โหลดชุดเบิกไม่สำเร็จ" onRetry={() => claims.refetch()} style={{ marginTop: spacing.md }} />}
    {!rows.length && !claims.isError && (status
      ? <EmptyState icon={Receipt}>ไม่มีชุดเบิกสถานะ “{CLAIM_STATUS[status].label}”</EmptyState>
      : <EmptyState icon={Receipt} action={{ title: 'ไปหน้าค่าใช้จ่าย', onPress: () => router.push('/expenses') }}>
          ยังไม่มีชุดเบิก · เลือกรายการที่หน้าค่าใช้จ่ายของฉันเพื่อส่งเบิก
        </EmptyState>)}
    <View style={{ gap: spacing.md, marginTop: spacing.md }}>
      {rows.map((claim) => {
        const mine = claim.submittedBy.id === user?.id;
        const who = `${claim.submittedBy.firstName} ${claim.submittedBy.lastName}`;
        const meta = CLAIM_STATUS[claim.status];
        return <Pressable key={claim.id} accessibilityRole="button"
          accessibilityLabel={`${mine ? '' : `${who} `}${formatMoney(claim.totalAmount)} บาท · ${meta.label} · เปิดรายละเอียด`}
          onPress={() => router.push(`/expenses/claim/${claim.id}`)} style={({ pressed }) => pressed && { opacity: 0.7 }}>
          <Card>
            <View style={styles.row}>
              <View style={{ flex: 1, minWidth: 0, gap: spacing.xs }}>
                <View style={styles.head}>
                  {!mine ? <Text style={styles.who} numberOfLines={1}>{who}</Text> : <View style={{ flex: 1 }} />}
                  <Tag tone={meta.tone}>{meta.label}</Tag>
                </View>
                <Text style={styles.total}>{formatMoney(claim.totalAmount)} ฿</Text>
                <Text style={styles.meta}>{claim.itemCount} รายการ · ใบเสร็จ {claim.receiptCount} ใบ</Text>
                <View style={styles.foot}>
                  <Text style={{ color: colors.text, fontSize: 14 }}>{claim.cases.map((item) => item.ownRef).join(' · ') || 'สำนักงาน'}</Text>
                  <Text style={{ color: colors.muted, fontSize: 13 }}>ส่ง {thDate(claim.submittedAt)} {thTime(claim.submittedAt)}</Text>
                </View>
              </View>
              <ChevronRight size={18} color={colors.muted} />
            </View>
          </Card>
        </Pressable>;
      })}
    </View>
  </ScrollView>;
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  who: { flex: 1, minWidth: 0, color: colors.ink, fontWeight: '700', fontSize: 15 },
  total: { ...typeScale.title, color: colors.ink, fontVariant: ['tabular-nums'] },
  meta: { color: colors.muted, fontSize: 14 },
  foot: { gap: 2, marginTop: spacing.xs, paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.divider },
});

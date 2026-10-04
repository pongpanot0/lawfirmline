import React, { useState } from 'react';
import { Pressable, RefreshControl, ScrollView, View } from 'react-native';
import { Text } from '@/components/AppText';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useAuth } from '@/api/auth';
import { useExpenseClaims } from '@/api/hooks';
import { Card, EmptyNote, ErrorNote, Loading, PageIntro, Tag, TagTone } from '@/components/ui';
import { Dropdown } from '@/components/Dropdown';
import { formatMoney, thDate, thTime } from '@/format';
import { colors, spacing, pageContent } from '@/theme';

export const CLAIM_STATUS: Record<string, { label: string; tone: TagTone }> = {
  PENDING: { label: 'รออนุมัติ', tone: 'info' }, APPROVED: { label: 'อนุมัติ · รอจ่าย', tone: 'court' },
  PAID: { label: 'จ่ายแล้ว', tone: 'ok' }, REJECTED: { label: 'ไม่อนุมัติ', tone: 'due' },
};

export default function ClaimsScreen() {
  const { user } = useAuth();
  const claims = useExpenseClaims();
  const router = useRouter();
  const params = useLocalSearchParams<{ status?: string }>();
  const [status, setStatus] = useState(params.status && Object.hasOwn(CLAIM_STATUS, params.status) ? params.status : '');
  if (claims.isLoading) return <Loading />;
  const rows = (claims.data ?? []).filter((claim) => !status || claim.status === status);
  return <ScrollView style={{ backgroundColor: colors.bg }} contentContainerStyle={pageContent}
    refreshControl={<RefreshControl refreshing={claims.isRefetching} onRefresh={() => claims.refetch()} />}>
    <PageIntro title={user?.firmRole === 'OWNER' ? 'ชุดเบิกจากทีม' : 'ชุดที่ฉันส่งเบิก'} detail="แตะชุดเบิกเพื่อตรวจรายการ ใบเสร็จ และสถานะ" />
    <Dropdown label="สถานะชุดเบิก" value={status} onChange={setStatus} options={[{ value: '', label: 'ทุกสถานะ' },
      ...Object.entries(CLAIM_STATUS).map(([value, meta]) => ({ value, label: meta.label }))]} />
    {claims.isError && <ErrorNote message="โหลดชุดเบิกไม่สำเร็จ" onRetry={() => claims.refetch()} />}
    {!rows.length && !claims.isError && <EmptyNote>ไม่มีชุดเบิกในสถานะนี้</EmptyNote>}
    {rows.map((claim) => <Pressable key={claim.id} accessibilityRole="button" onPress={() => router.push(`/expenses/claim/${claim.id}`)}>
      <Card style={{ marginTop: spacing.md }}>
        <View style={{ gap: spacing.sm }}>
          <Text style={{ flex: 1, color: colors.ink, fontWeight: '700' }}>{claim.submittedBy.firstName} {claim.submittedBy.lastName}</Text>
          <Tag tone={CLAIM_STATUS[claim.status].tone}>{CLAIM_STATUS[claim.status].label}</Tag>
        </View>
        <Text style={{ color: colors.ink, fontWeight: '700', fontSize: 24, marginVertical: spacing.sm }}>{formatMoney(claim.totalAmount)} ฿</Text>
        <Text style={{ color: colors.muted }}>{claim.itemCount} รายการ · ใบเสร็จ {claim.receiptCount} ใบ</Text>
        <Text style={{ color: colors.text }}>{claim.cases.map((item) => item.ownRef).join(' · ') || 'สำนักงาน'}</Text>
        <Text style={{ color: colors.muted }}>ส่ง {thDate(claim.submittedAt)} {thTime(claim.submittedAt)} · ชุด {claim.id.slice(0, 8)}</Text>
        <Text style={{ color: colors.info, marginTop: spacing.sm }}>เปิดรายละเอียด ›</Text>
      </Card>
    </Pressable>)}
  </ScrollView>;
}

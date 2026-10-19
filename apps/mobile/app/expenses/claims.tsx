import React, { useState } from 'react';
import { Pressable, RefreshControl, ScrollView, View } from 'react-native';
import { Text } from '@/components/AppText';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ChevronRight } from 'lucide-react-native';
import { hasFirmCapability } from '@lawfirm/shared';
import { useAuth } from '@/api/auth';
import { useExpenseClaims } from '@/api/hooks';
import { Button, Card, EmptyNote, ErrorNote, FilterTabs, Loading, PageIntro, Tag, TagTone } from '@/components/ui';
import { formatMoney, thDate, thTime } from '@/format';
import { colors, spacing, pageContent } from '@/theme';

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
  if (claims.isLoading) return <Loading label="กำลังโหลดชุดเบิก…" />;
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
    {claims.isError && <ErrorNote message="โหลดชุดเบิกไม่สำเร็จ" onRetry={() => claims.refetch()} />}
    {!rows.length && !claims.isError && (status
      ? <EmptyNote>ไม่มีชุดเบิกสถานะ “{CLAIM_STATUS[status].label}”</EmptyNote>
      : <View>
          <EmptyNote>ยังไม่มีชุดเบิก · เลือกรายการที่หน้าค่าใช้จ่ายของฉันเพื่อส่งเบิก</EmptyNote>
          <Button title="ไปหน้าค่าใช้จ่าย" variant="link" onPress={() => router.push('/expenses')} />
        </View>)}
    {rows.map((claim) => {
      const mine = claim.submittedBy.id === user?.id;
      const who = `${claim.submittedBy.firstName} ${claim.submittedBy.lastName}`;
      return <Pressable key={claim.id} accessibilityRole="button"
        accessibilityLabel={`${mine ? '' : `${who} `}${formatMoney(claim.totalAmount)} บาท · ${CLAIM_STATUS[claim.status].label} · เปิดรายละเอียด`}
        onPress={() => router.push(`/expenses/claim/${claim.id}`)} style={({ pressed }) => pressed && { opacity: 0.7 }}>
        <Card style={{ marginTop: spacing.sm }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
            <View style={{ flex: 1, minWidth: 0, gap: spacing.xs }}>
              {!mine && <Text style={{ color: colors.ink, fontWeight: '700' }}>{who}</Text>}
              <Tag tone={CLAIM_STATUS[claim.status].tone}>{CLAIM_STATUS[claim.status].label}</Tag>
              <Text style={{ color: colors.ink, fontWeight: '700', fontSize: 22 }}>{formatMoney(claim.totalAmount)} ฿</Text>
              <Text style={{ color: colors.muted, fontSize: 14 }}>{claim.itemCount} รายการ · ใบเสร็จ {claim.receiptCount} ใบ</Text>
              <Text style={{ color: colors.text, fontSize: 14 }}>{claim.cases.map((item) => item.ownRef).join(' · ') || 'สำนักงาน'}</Text>
              <Text style={{ color: colors.muted, fontSize: 13 }}>ส่ง {thDate(claim.submittedAt)} {thTime(claim.submittedAt)}</Text>
            </View>
            <ChevronRight size={18} color={colors.muted} />
          </View>
        </Card>
      </Pressable>;
    })}
  </ScrollView>;
}

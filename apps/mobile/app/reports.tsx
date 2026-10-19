import React from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '@/components/AppText';
import { hasFirmCapability } from '@lawfirm/shared';
import { useAuth } from '@/api/auth';
import { useOwnerKpis, useReportsSummary, useOwnerFinance } from '@/api/hooks';
import { useRouter } from 'expo-router';
import { ActionRow, Card, ErrorNote, Loading, PageIntro, SectionLabel, StatCard } from '@/components/ui';
import { formatMoney } from '@/format';
import { colors, spacing, pageContent } from '@/theme';

/** Read-only summary cards — the full report builder stays on web. */
export default function ReportsScreen() {
  const reports = useReportsSummary();
  const { user } = useAuth();
  const canViewFirm = hasFirmCapability(user?.firmRole, 'viewFirmReports');
  const ownerKpis = useOwnerKpis(canViewFirm);
  const finance = useOwnerFinance(canViewFirm);
  const router = useRouter();

  if (reports.isLoading) return <Loading label="กำลังโหลดรายงาน…" />;
  if (reports.isError || !reports.data)
    return (
      <View style={[styles.screen, { padding: spacing.lg }]}>
        <ErrorNote message="โหลดรายงานไม่สำเร็จ" onRetry={() => reports.refetch()} />
      </View>
    );

  const { kpis, caseVolumeByType, revenueByLawyer, scope } = reports.data;
  const maxVolume = Math.max(...caseVolumeByType.map((row) => row.count), 1);
  const owner = ownerKpis.data;
  const money = finance.data?.totals;
  const financeDetail = money
    ? [`ลูกหนี้ ${formatMoney(money.receivable)} ฿`, Number(money.unbilled) > 0 ? `ยังไม่วางบิล ${formatMoney(money.unbilled)} ฿` : '']
      .filter(Boolean).join(' · ')
    : finance.isError ? 'โหลดยอดไม่ได้ · เปิดเพื่อลองใหม่' : 'ลูกหนี้ รับเงิน วางบิล และรอจ่าย';
  const change = kpis.casesClosedChange;

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={pageContent}
      refreshControl={
        <RefreshControl refreshing={reports.isRefetching} onRefresh={() => { void reports.refetch(); if (canViewFirm) { void ownerKpis.refetch(); void finance.refetch(); } }} />
      }
    >
      <PageIntro title="รายงาน" detailOnly detail={scope === 'firm' ? 'ภาพรวมทั้งสำนักงาน' : 'เฉพาะคดีที่คุณรับผิดชอบ'} />

      {canViewFirm && (
        <>
          <SectionLabel>ภาพรวมเจ้าของสำนักงาน</SectionLabel>
          {/* One link to the finance screen instead of repeating its four totals here. */}
          <Card style={{ paddingVertical: 0 }}>
            <ActionRow title="การเงินสำนักงาน" detail={financeDetail} onPress={() => router.push('/owner-finance')} />
          </Card>
          {ownerKpis.isError && <View style={{ marginTop: spacing.sm }}><ErrorNote message="โหลดตัวชี้วัดการเงินไม่ได้" onRetry={() => ownerKpis.refetch()} /></View>}
          <View style={styles.statRow}>
            <StatCard
              label="อัตราเก็บเงินได้"
              value={owner?.collectionRate.value != null ? `${Math.round(owner.collectionRate.value * 100)}%` : '—'}
              hint={owner ? `เป้า ${Math.round(owner.collectionRate.target * 100)}%` : undefined}
              tone={owner?.collectionRate.value != null && owner.collectionRate.value < owner.collectionRate.target ? 'warn' : undefined}
              onPress={() => router.push('/owner-finance')}
            />
            <StatCard
              label="หนี้ค้างเฉลี่ย"
              value={owner?.avgDaysOutstanding != null ? `${owner.avgDaysOutstanding} วัน` : '—'}
              onPress={() => router.push('/owner-finance')}
            />
          </View>
          <SectionLabel>ผลคดี</SectionLabel>
        </>
      )}

      <View style={[styles.statRow, canViewFirm && { marginTop: 0 }]}>
        <StatCard label="ปิดคดีปีนี้" value={kpis.casesClosedYtd}
          hint={change ? `${change > 0 ? '+' : ''}${change} จากปีก่อน` : undefined} tone={change < 0 ? 'warn' : undefined} />
        <StatCard label="อัตราปิดคดี" value={`${kpis.winRate}%`} hint="ปิดแล้ว ÷ คดีทั้งหมด" />
      </View>
      <View style={[styles.statRow, { marginTop: spacing.sm }]}>
        <StatCard
          label="ระยะเวลาเฉลี่ย"
          value={kpis.avgCaseDurationMonths != null ? `${kpis.avgCaseDurationMonths} เดือน` : '—'}
        />
      </View>

      <SectionLabel>คดีตามประเภท</SectionLabel>
      <Card>
        {caseVolumeByType.length === 0 ? (
          <Text style={styles.empty}>ยังไม่มีข้อมูล</Text>
        ) : (
          caseVolumeByType.map((row) => (
            <View key={row.label} style={styles.volumeRow} accessible accessibilityLabel={`${row.label} ${row.count} คดี`}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                <Text style={styles.volumeLabel}>{row.label}</Text>
                <Text style={styles.count}>{row.count}</Text>
              </View>
              <View style={styles.track}>
                <View style={[styles.fill, { width: `${(row.count / maxVolume) * 100}%` }]} />
              </View>
            </View>
          ))
        )}
      </Card>

      {revenueByLawyer.length > 0 ? (
        <>
          <SectionLabel>ชั่วโมงงานตามทนาย</SectionLabel>
          <Card>
            {revenueByLawyer.map((row, index) => (
              <View key={row.lawyerName}>
                {index > 0 && <View style={styles.divider} />}
                <View style={styles.lawyerRow}>
                  <Text style={styles.volumeLabel}>{row.lawyerName}</Text>
                  <Text style={styles.meta}>{row.hours.toLocaleString('th-TH')} ชม.</Text>
                  {canViewFirm && <Text style={styles.count}>{formatMoney(row.revenue)} ฿</Text>}
                </View>
              </View>
            ))}
          </Card>
        </>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  statRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  empty: { color: colors.muted, textAlign: 'center', paddingVertical: spacing.lg },
  volumeRow: {
    gap: spacing.sm,
    paddingVertical: spacing.md,
  },
  volumeLabel: { flex: 1, minWidth: 0, fontSize: 14, color: colors.text, fontWeight: '600' },
  track: {
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.soft,
    overflow: 'hidden',
  },
  fill: { height: '100%', backgroundColor: colors.info, borderRadius: 3 },
  count: {
    minWidth: 40,
    textAlign: 'right',
    fontWeight: '700',
    color: colors.ink,
    fontSize: 14,
    fontVariant: ['tabular-nums'],
  },
  lawyerRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.md },
  meta: { fontSize: 13, color: colors.muted },
  divider: { height: 1, backgroundColor: colors.line },
});

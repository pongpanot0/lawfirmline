import React from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '@/api/auth';
import { useOwnerKpis, useReportsSummary } from '@/api/hooks';
import { Card, ErrorNote, Loading, SectionLabel, StatCard, Tag } from '@/components/ui';
import { colors, spacing } from '@/theme';

/** Read-only summary cards — the full report builder stays on web. */
export default function ReportsScreen() {
  const reports = useReportsSummary();
  const { user } = useAuth();
  const ownerKpis = useOwnerKpis(user?.firmRole === 'OWNER');

  if (reports.isLoading) return <Loading />;
  if (reports.isError || !reports.data)
    return (
      <View style={{ padding: spacing.lg }}>
        <ErrorNote message="โหลดรายงานไม่สำเร็จ" onRetry={() => reports.refetch()} />
      </View>
    );

  const { kpis, caseVolumeByType, revenueByLawyer, scope } = reports.data;
  const maxVolume = Math.max(...caseVolumeByType.map((row) => row.count), 1);

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={{ padding: spacing.lg, paddingBottom: 40 }}
      refreshControl={
        <RefreshControl refreshing={reports.isRefetching} onRefresh={() => reports.refetch()} />
      }
    >
      <Tag tone="info">{scope === 'firm' ? 'ภาพรวมทั้งสำนักงาน' : 'เฉพาะคดีของฉัน'}</Tag>

      {ownerKpis.isSuccess && ownerKpis.data && (
        <>
          <SectionLabel>ภาพรวมเจ้าของสำนักงาน</SectionLabel>
          <View style={styles.statRow}>
            <StatCard
              label="ยังไม่วางบิล"
              value={`${ownerKpis.data.unbilled.amount.toLocaleString('th-TH')} ฿`}
              hint={`${ownerKpis.data.unbilled.hours.toLocaleString('th-TH')} ชม. ยังไม่วางบิล`}
            />
            <StatCard
              label="อัตราเก็บเงินได้"
              value={
                ownerKpis.data.collectionRate.value != null
                  ? `${Math.round(ownerKpis.data.collectionRate.value * 100)}%`
                  : '—'
              }
              tone={
                ownerKpis.data.collectionRate.value != null &&
                ownerKpis.data.collectionRate.value < ownerKpis.data.collectionRate.target
                  ? 'warn'
                  : undefined
              }
            />
          </View>
          <View style={[styles.statRow, { marginTop: spacing.sm }]}>
            <StatCard
              label="หนี้ค้างเฉลี่ย"
              value={
                ownerKpis.data.avgDaysOutstanding != null
                  ? `${ownerKpis.data.avgDaysOutstanding} วัน`
                  : '—'
              }
            />
            <StatCard
              label="เงินรับเดือนนี้"
              value={`${ownerKpis.data.revenue.month.toLocaleString('th-TH')} ฿`}
            />
          </View>
        </>
      )}

      <View style={styles.statRow}>
        <StatCard label="ปิดคดีปีนี้" value={kpis.casesClosedYtd} />
        <StatCard
          label="เทียบปีก่อน"
          value={`${kpis.casesClosedChange >= 0 ? '+' : ''}${kpis.casesClosedChange}`}
          tone={kpis.casesClosedChange < 0 ? 'warn' : undefined}
        />
      </View>
      <View style={[styles.statRow, { marginTop: spacing.sm }]}>
        <StatCard label="อัตราปิดคดี" value={`${kpis.winRate}%`} />
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
            <View key={row.label} style={styles.volumeRow}>
              <Text style={styles.volumeLabel} numberOfLines={1}>
                {row.label}
              </Text>
              <View style={styles.track}>
                <View style={[styles.fill, { width: `${(row.count / maxVolume) * 100}%` }]} />
              </View>
              <Text style={styles.count}>{row.count}</Text>
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
                  <Text style={styles.volumeLabel} numberOfLines={1}>
                    {row.lawyerName}
                  </Text>
                  <Text style={styles.meta}>{row.hours.toLocaleString('th-TH')} ชม.</Text>
                  <Text style={styles.count}>
                    {row.revenue.toLocaleString('th-TH')} ฿
                  </Text>
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
  empty: { color: colors.faint, textAlign: 'center', paddingVertical: spacing.lg },
  volumeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: 6,
  },
  volumeLabel: { flex: 1, fontSize: 13, color: colors.text, fontWeight: '600' },
  track: {
    flex: 1,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.soft,
    overflow: 'hidden',
  },
  fill: { height: '100%', backgroundColor: colors.accent, borderRadius: 3 },
  count: {
    width: 76,
    textAlign: 'right',
    fontWeight: '700',
    color: colors.ink,
    fontSize: 13,
    fontVariant: ['tabular-nums'],
  },
  lawyerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 7 },
  meta: { fontSize: 12, color: colors.faint },
  divider: { height: 1, backgroundColor: colors.soft },
});

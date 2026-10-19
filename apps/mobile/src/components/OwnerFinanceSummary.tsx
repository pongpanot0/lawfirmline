import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { ChevronRight } from 'lucide-react-native';
import type { OwnerFinance } from '@/api/types';
import { Text } from './AppText';
import { formatMoney } from '@/format';
import { colors, fonts, radius, spacing, typeScale } from '@/theme';

export type FinanceView = 'receivables' | 'received' | 'billed' | 'unbilled' | 'payable';

/**
 * Each tile is the link to its list; a zero month reads "ไม่มียอด" instead of a bold 0.
 * Tiles are sunken wells because they sit inside the raised "เงินสำนักงาน" card.
 */
export function OwnerFinanceSummary({ data, onOpen }: { data?: OwnerFinance; onOpen: (view: FinanceView) => void }) {
  const items = [
    { view: 'received', key: 'received', label: 'เงินรับแล้ว', hint: `${data?.month ?? 'เดือนนี้'} · บันทึกรับเงินจริง` },
    { view: 'billed', key: 'billed', label: 'วางบิลแล้ว', hint: `${data?.month ?? 'เดือนนี้'} · ยังไม่ใช่เงินรับ` },
    { view: 'unbilled', key: 'unbilled', label: 'ยังไม่วางบิล', hint: 'งานที่เก็บเงินได้ + ร่างบิล' },
    { view: 'payable', key: 'payable', label: 'รอจ่าย', hint: 'อนุมัติแล้ว · ยังไม่บันทึกจ่าย' },
  ] as const;
  return <View style={styles.grid}>{items.map(item => {
    const amount = data ? Number(data.totals[item.key]) : null;
    const shown = amount === null ? '—' : amount === 0 ? 'ไม่มียอด' : `${formatMoney(data!.totals[item.key])} ฿`;
    return <Pressable key={item.key} accessibilityRole="button" accessibilityLabel={`${item.label} ${shown}`} accessibilityHint={`เปิดรายการ${item.label}`}
      onPress={() => onOpen(item.view)} style={({ pressed }) => [styles.card, pressed && { backgroundColor: colors.soft }]}>
      <View style={styles.head}><Text style={styles.label}>{item.label}</Text><ChevronRight size={16} color={colors.muted} /></View>
      <Text style={[styles.amount, amount === 0 && { color: colors.muted, fontSize: 16 }]}>{shown}</Text>
      <Text style={styles.hint}>{item.hint}</Text>
    </Pressable>;
  })}</View>;
}

const styles = StyleSheet.create({
  grid: { width: '100%', flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  card: { width: '48%', flexGrow: 1, minWidth: 140, minHeight: 96, gap: spacing.xs, padding: spacing.md, borderWidth: 1, borderColor: colors.line,
    borderRadius: radius.md, backgroundColor: colors.sunken },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  label: { flex: 1, ...typeScale.overline, color: colors.muted },
  // Money strings are longer than counts, so they sit one step under typeScale.stat.
  amount: { fontSize: 24, lineHeight: 34, color: colors.ink, fontFamily: fonts.bold, fontVariant: ['tabular-nums'] },
  hint: { color: colors.muted, fontSize: 12, lineHeight: 18 },
});

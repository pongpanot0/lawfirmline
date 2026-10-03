import React from 'react';
import { Pressable, View } from 'react-native';
import type { OwnerFinance } from '@/api/types';
import { Text } from './AppText';
import { Card } from './ui';
import { formatMoney } from '@/format';
import { colors, spacing } from '@/theme';

export type FinanceView = 'receivables' | 'received' | 'billed' | 'unbilled' | 'payable';
export function OwnerFinanceSummary({ data, onOpen }: { data?: OwnerFinance; onOpen: (view: FinanceView) => void }) {
  const items = [
    { view: 'received', key: 'received', label: 'เงินรับแล้ว', hint: `${data?.month ?? 'เดือนนี้'} · บันทึกรับเงินจริง` },
    { view: 'billed', key: 'billed', label: 'วางบิลแล้ว', hint: `${data?.month ?? 'เดือนนี้'} · ยังไม่ใช่เงินรับ` },
    { view: 'unbilled', key: 'unbilled', label: 'ยังไม่วางบิล', hint: 'งานที่เก็บเงินได้ + ร่างบิล' },
    { view: 'payable', key: 'payable', label: 'รอจ่าย', hint: 'อนุมัติแล้ว · ยังไม่บันทึกจ่าย' },
  ] as const;
  return <View style={{ width: '100%', flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>{items.map(item => <Pressable key={item.key}
    accessibilityRole="button" accessibilityLabel={`เปิดรายการ${item.label}`} onPress={() => onOpen(item.view)}
    style={{ width: '48%', flexGrow: 1, minWidth: 140 }}>
    <Card style={{ gap: spacing.xs, flex: 1 }}><Text style={{ color: colors.muted }}>{item.label}</Text>
      <Text style={{ fontSize: 22, color: colors.ink, fontWeight: '700' }}>{data ? `${formatMoney(data.totals[item.key])} ฿` : '—'}</Text>
      <Text style={{ color: colors.faint, fontSize: 12 }}>{item.hint}</Text>
      <Text style={{ color: colors.info, fontSize: 12 }}>เปิดรายการ / จัดการ</Text>
    </Card>
  </Pressable>)}</View>;
}

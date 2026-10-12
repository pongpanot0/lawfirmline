import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { DEFAULT_INTEREST_RATE } from '@lawfirm/shared';
import { Text } from '@/components/AppText';
import { bangkokDay, formatMoney, formatMoneyInput } from '@/format';
import { litigationEstimate } from '@/litigation';
import { colors, fonts, radius, spacing } from '@/theme';
import { FormField } from './Form';
import { SectionCard } from './SectionCard';
import { ThaiDateField } from './ThaiDateField';

/** Court fee + simple interest estimate. Pure shared functions: works offline, saves nothing. */
export function LitigationCalculatorCard({ claimedAmount }: { claimedAmount: number | null }) {
  // A stored 0 means "no money value entered", same as the web card and print forms.
  const known = claimedAmount ? claimedAmount : null;
  const [amount, setAmount] = useState(() => (known != null ? formatMoneyInput(String(known)) ?? '' : ''));
  const [rate, setRate] = useState(String(DEFAULT_INTEREST_RATE));
  const [from, setFrom] = useState<string | null>(null);
  const [to, setTo] = useState<string | null>(() => bangkokDay(new Date().toISOString()));
  const estimate = litigationEstimate({ amount, rate, from, to });
  return <SectionCard title="คำนวณค่าขึ้นศาล / ดอกเบี้ย" collapsible defaultOpen={false}
    summary={`ประมาณการ · ทุนทรัพย์ ${known != null ? `${formatMoney(known)} ฿` : '—'}`}>
    <FormField label="ทุนทรัพย์ (บาท)" value={amount} keyboardType="decimal-pad"
      onChange={(text) => { const next = formatMoneyInput(text); if (next !== null) setAmount(next); }} />
    <View style={styles.resultBox}>
      <Text style={styles.resultLabel}>ค่าขึ้นศาลโดยประมาณ</Text>
      <Text accessibilityLiveRegion="polite" style={styles.resultValue}>{estimate ? `${formatMoney(estimate.fee)} ฿` : 'กรอกทุนทรัพย์เพื่อคำนวณ'}</Text>
    </View>
    <View style={styles.divider} />
    <FormField label="ดอกเบี้ยต่อปี (%)" value={rate} onChange={setRate} keyboardType="decimal-pad" />
    <ThaiDateField label="ตั้งแต่" value={from} onChange={setFrom} />
    <ThaiDateField label="ถึง" value={to} onChange={setTo} />
    {estimate?.interest != null ? <View style={styles.resultBox}>
      <Text style={styles.resultLabel}>ดอกเบี้ย {estimate.days} วัน</Text>
      <Text accessibilityLiveRegion="polite" style={styles.resultValue}>{formatMoney(estimate.interest)} ฿</Text>
    </View> : <Text style={styles.note}>ใส่วันเริ่มคิดดอกเบี้ยเพื่อดูยอดดอกเบี้ย</Text>}
    <Text style={styles.note}>ⓘ ประมาณการเท่านั้น ไม่รวมคดีจำนอง/บังคับตามคำชี้ขาด/มโนสาเร่</Text>
    <Text style={styles.note}>ค่าเริ่มต้น 5% ต่อปี ตาม ป.พ.พ. ม.224 (แก้ไข 2564: 3% ตาม ม.7 + 2%) · ดอกเบี้ยอย่างง่าย เงินต้น × อัตรา × วัน / 365</Text>
  </SectionCard>;
}

const styles = StyleSheet.create({
  resultBox: {
    flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: spacing.sm,
    padding: spacing.sm, borderRadius: radius.card, backgroundColor: colors.accentSoft,
  },
  resultLabel: { color: colors.muted, fontSize: 13 },
  resultValue: { color: colors.ink, fontFamily: fonts.semibold, fontSize: 18, fontVariant: ['tabular-nums'] },
  divider: { height: 1, backgroundColor: colors.line, marginVertical: spacing.xs },
  note: { color: colors.muted, fontSize: 12, lineHeight: 18 },
});

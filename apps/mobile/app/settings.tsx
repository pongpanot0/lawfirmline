import React from 'react';
import { Pressable, View } from 'react-native';
import { Text } from '@/components/AppText';
import { FormPage } from '@/components/Form';
import { Card, SectionLabel } from '@/components/ui';
import { TEXT_SIZES, useDisplayPreferences } from '@/components/AppText';
import { colors, spacing } from '@/theme';

export default function SettingsScreen() {
  const { scale, setScale } = useDisplayPreferences();
  return <FormPage>
    <SectionLabel>ขนาดตัวอักษรทั้งแอป</SectionLabel>
    <Text style={{ color: colors.muted }}>เลือกขนาดที่อ่านสบาย · แอปจำค่าบนโทรศัพท์เครื่องนี้</Text>
    <View style={{ gap: spacing.sm }}>
      {TEXT_SIZES.map((value, index) => <Pressable key={value} accessibilityRole="radio"
        accessibilityState={{ selected: scale === value }} onPress={() => setScale(value)}
        style={{ minHeight: 52, padding: spacing.md, backgroundColor: scale === value ? colors.soft : colors.surface,
          borderWidth: 1, borderColor: scale === value ? colors.ink : colors.line, borderRadius: 10 }}>
        <Text style={{ color: colors.ink }}>{scale === value ? '✓ ' : ''}{['ปกติ', 'ใหญ่', 'ใหญ่มาก', 'ใหญ่พิเศษ'][index]}</Text>
      </Pressable>)}
    </View>
    <SectionLabel>ตัวอย่าง</SectionLabel>
    <Card><Text style={{ fontWeight: '700', color: colors.ink, fontSize: 17 }}>นัดศาลวันนี้ 09:00</Text>
      <Text style={{ color: colors.text, marginTop: spacing.sm }}>คนหลัก: ทนายสมชาย · คนรอง: ทนายศิริพร</Text>
      <Text style={{ color: colors.muted, marginTop: spacing.sm }}>ปรับแล้วมีผลกับรายการ ปุ่ม และช่องกรอกทันที</Text></Card>
  </FormPage>;
}

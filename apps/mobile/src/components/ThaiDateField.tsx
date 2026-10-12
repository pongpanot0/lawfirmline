import React, { forwardRef, useEffect, useState } from 'react';
import { Alert, Pressable, TextInput as NativeTextInput, View } from 'react-native';
import { X } from 'lucide-react-native';
import { Text, TextInput } from '@/components/AppText';
import { SectionLabel } from './ui';
import { Dropdown } from './Dropdown';
import { DatePicker } from './DatePicker';
import { thDateLong } from '@/format';
import { bangkokDayToIso, checkThaiDate, dayToParts, THAI_MONTH_OPTIONS, thaiDateAction, type ThaiDateParts } from '@/thai-date';
import { colors, formLabelSpacing, radius, spacing, TOUCH } from '@/theme';

const input = {
  minHeight: 48, paddingHorizontal: spacing.md, borderWidth: 1, borderColor: colors.line,
  borderRadius: radius.button, backgroundColor: colors.surface, color: colors.text, fontSize: 16,
} as const;
const digits = (text: string) => text.replace(/\D/g, '');

/**
 * วัน / เดือน / ปี พ.ศ. typed entry. `value` is a Bangkok day `YYYY-MM-DD` or null. The parent hears
 * only a real date, or null for a deliberate clear; a half-typed or impossible entry stays here and is
 * reported through `onInvalidChange(true)` so the form can block save. The ref is the วัน input.
 */
export const ThaiDateField = forwardRef<NativeTextInput, {
  label: string;
  value: string | null;
  onChange: (day: string | null) => void;
  onInvalidChange?: (invalid: boolean) => void;
  clearable?: boolean;
  clearConfirm?: { title: string; body: string };
  hint?: string;
  disabled?: boolean;
}>(function ThaiDateField({ label, value, onChange, onInvalidChange, clearable = false, clearConfirm, hint, disabled = false }, ref) {
  const [parts, setParts] = useState<ThaiDateParts>(() => dayToParts(value));
  const check = checkThaiDate(parts);

  // Follow a value set from outside (calendar pick, "คืนค่าเดิม") without wiping a half-typed entry.
  useEffect(() => {
    const shown = check.kind === 'ok' ? check.day : check.kind === 'empty' ? null : undefined;
    if (shown !== undefined && shown !== value) setParts(dayToParts(value));
  }, [value]);

  const apply = (next: ThaiDateParts) => {
    const action = thaiDateAction(next, value, !!clearConfirm);
    if (action.emit === 'confirm-clear' && clearConfirm) {
      Alert.alert(clearConfirm.title, clearConfirm.body, [
        { text: 'ยกเลิก', style: 'cancel', onPress: () => setParts(dayToParts(value)) },
        { text: 'ลบวันที่', style: 'destructive', onPress: () => { setParts(next); onInvalidChange?.(false); onChange(null); } },
      ]);
      return;
    }
    setParts(next);
    onInvalidChange?.(action.invalid);
    if (action.emit === 'day') onChange(action.day);
    if (action.emit === 'clear') onChange(null);
  };
  const typed = !!(parts.d || parts.m || parts.y);

  return <View style={{ gap: spacing.sm }}>
    <SectionLabel style={formLabelSpacing}>{label}</SectionLabel>
    {hint ? <Text style={{ color: colors.muted, fontSize: 13 }}>{hint}</Text> : null}
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
      <TextInput ref={ref} accessibilityLabel={`${label} วัน`} placeholder="วัน" placeholderTextColor={colors.faint}
        keyboardType="number-pad" maxLength={2} editable={!disabled} value={parts.d}
        onChangeText={(text) => apply({ ...parts, d: digits(text) })} style={[input, { width: 64 }]} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Dropdown label="เดือน" value={parts.m} options={THAI_MONTH_OPTIONS} disabled={disabled}
          onChange={(m) => apply({ ...parts, m })} />
      </View>
      <TextInput accessibilityLabel={`${label} ปี พ.ศ.`} placeholder="ปี พ.ศ." placeholderTextColor={colors.faint}
        keyboardType="number-pad" maxLength={4} editable={!disabled} value={parts.y}
        onChangeText={(text) => apply({ ...parts, y: digits(text) })} style={[input, { width: 84 }]} />
      {disabled ? null : <DatePicker iconOnly value={check.kind === 'ok' ? check.day : value ?? ''} onChange={(day) => apply(dayToParts(day))} />}
      {clearable && typed && !disabled ? <Pressable accessibilityRole="button" accessibilityLabel={`ล้าง${label}`}
        onPress={() => apply({ d: '', m: '', y: '' })}
        style={{ width: TOUCH, height: TOUCH, alignItems: 'center', justifyContent: 'center' }}>
        <X size={18} color={colors.muted} />
      </Pressable> : null}
    </View>
    {check.kind === 'partial' || check.kind === 'invalid'
      ? <Text accessibilityRole="alert" style={{ color: colors.warn, fontSize: 13 }}>{check.message}</Text>
      : check.kind === 'ok' ? <Text style={{ color: colors.muted, fontSize: 13 }}>{thDateLong(bangkokDayToIso(check.day))}</Text> : null}
  </View>;
});

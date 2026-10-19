import React, { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '@/components/AppText';
import { Calendar, ChevronLeft, ChevronRight } from 'lucide-react-native';
import { bangkokDay, isoDay, thDate } from '@/format';
import { colors, control, fonts, radius, shadow, spacing, TOUCH } from '@/theme';
import { Button } from './Button';
import { FieldLabel, fieldA11yLabel } from './FieldLabel';
import { InlineError as FieldError } from './States';

const TH_MONTHS = [
  'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม',
];
const TH_DOW = ['จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส', 'อา'];

// ponytail: pure-JS calendar so it works on the current dev build; swap for
// the native @react-native-community/datetimepicker at the next native build
// if the OS sheet is wanted.
function monthGrid(year: number, month: number): Array<Date | null> {
  const lead = (new Date(year, month, 1).getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: Array<Date | null> = Array(lead).fill(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

/** A plain YYYY-MM-DD stays as is; a full timestamp is read on the Bangkok wall clock. */
function toDayKey(value: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  return value && !Number.isNaN(new Date(value).getTime()) ? bangkokDay(value) : '';
}

/**
 * Field + modal calendar; value is an ISO day (YYYY-MM-DD, ค.ศ.), shown พ.ศ.
 * `label` renders a visible label above the field (with `required`/`error` like FormField).
 * `onClear` adds "ล้างวันที่" for optional dates; `minDate`/`maxDate` (YYYY-MM-DD) disable days outside the range.
 */
export function DatePicker({
  value,
  onChange,
  label,
  required = false,
  error,
  hint,
  placeholder = 'เลือกวันที่',
  minDate,
  maxDate,
  onClear,
  disabled = false,
}: {
  value: string;
  onChange: (isoDate: string) => void;
  label?: string;
  required?: boolean;
  error?: string;
  /** One short helper line under the label. */
  hint?: string;
  placeholder?: string;
  minDate?: string;
  maxDate?: string;
  onClear?: () => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const dayKey = toDayKey(value);
  const cursorFor = (key: string) => {
    if (key) return { y: Number(key.slice(0, 4)), m: Number(key.slice(5, 7)) - 1 };
    const now = new Date();
    return { y: now.getFullYear(), m: now.getMonth() };
  };
  const [cursor, setCursor] = useState(() => cursorFor(dayKey));

  const cells = monthGrid(cursor.y, cursor.m);
  const todayKey = bangkokDay(new Date().toISOString());
  const outOfRange = (key: string) => (!!minDate && key < minDate) || (!!maxDate && key > maxDate);
  const name = label ?? 'วันที่';
  const pick = (key: string) => { onChange(key); setOpen(false); };

  return (
    <View style={label || error ? { gap: spacing.sm } : undefined}>
      {label ? <FieldLabel required={required} hint={hint}>{label}</FieldLabel> : null}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={fieldA11yLabel(label ?? placeholder, required)}
        accessibilityHint={error || hint || undefined}
        accessibilityValue={{ text: dayKey ? thDate(dayKey) : 'ยังไม่ได้เลือก' }}
        accessibilityState={{ disabled }}
        disabled={disabled}
        style={({ pressed }) => [styles.field, error ? { borderColor: colors.warn } : null, disabled && styles.fieldDisabled,
          pressed && { borderColor: colors.ink, ...(error ? shadow.focusWarn : shadow.focus) }]}
        onPress={() => {
          setCursor(cursorFor(dayKey));
          setOpen(true);
        }}
      >
        <Calendar size={17} color={colors.muted} />
        <Text style={[styles.fieldText, !dayKey && { color: colors.muted }]}>{dayKey ? thDate(dayKey) : placeholder}</Text>
      </Pressable>
      <FieldError message={error} />

      <Modal visible={open} transparent animationType="fade" supportedOrientations={['portrait', 'portrait-upside-down', 'landscape-left', 'landscape-right']} onRequestClose={() => setOpen(false)}>
        <Pressable accessible={false} style={styles.backdrop} onPress={() => setOpen(false)}>
          <Pressable accessible={false} style={styles.sheet} onPress={() => {}}>
            {label ? <Text accessibilityRole="header" style={styles.sheetLabel}>{name}</Text> : null}
            <View style={styles.head}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="เดือนก่อนหน้า"
                style={styles.nav}
                onPress={() =>
                  setCursor(({ y, m }) => (m === 0 ? { y: y - 1, m: 11 } : { y, m: m - 1 }))
                }
              >
                <ChevronLeft size={20} color={colors.ink} />
              </Pressable>
              <Text style={styles.title}>
                {TH_MONTHS[cursor.m]} {cursor.y + 543}
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="เดือนถัดไป"
                style={styles.nav}
                onPress={() =>
                  setCursor(({ y, m }) => (m === 11 ? { y: y + 1, m: 0 } : { y, m: m + 1 }))
                }
              >
                <ChevronRight size={20} color={colors.ink} />
              </Pressable>
            </View>
            <ScrollView style={{ flexShrink: 1 }}>
            <View style={styles.grid}>
              {TH_DOW.map((d) => (
                <Text key={d} style={styles.dow}>
                  {d}
                </Text>
              ))}
              {cells.map((date, index) => {
                if (!date) return <View key={`x${index}`} style={styles.cell} />;
                const key = isoDay(date);
                const isSelected = key === dayKey;
                const isToday = key === todayKey;
                const blocked = outOfRange(key);
                return (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`${isToday ? 'วันนี้ ' : ''}${thDate(key)}`}
                    accessibilityState={{ selected: isSelected, disabled: blocked }}
                    disabled={blocked}
                    key={key}
                    style={[styles.cell, isToday && styles.cellToday, isSelected && styles.cellOn, blocked && { opacity: 0.3 }]}
                    onPress={() => pick(key)}
                  >
                    <Text
                      style={[
                        styles.cellText,
                        isToday && !isSelected && { fontWeight: '700', color: colors.ink },
                        isSelected && { color: colors.bg, fontWeight: '700' },
                      ]}
                    >
                      {date.getDate()}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            </ScrollView>
            <View style={styles.footer}>
              {!outOfRange(todayKey) && todayKey !== dayKey ? <Button title="วันนี้" variant="link" onPress={() => pick(todayKey)} /> : null}
              {onClear && dayKey ? <Button title="ล้างวันที่" variant="link" onPress={() => { onClear(); setOpen(false); }} /> : null}
              <View style={{ flex: 1 }} />
              <Button title="ปิด" variant="secondary" inline onPress={() => setOpen(false)} />
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.raised,
    borderColor: colors.lineStrong,
    borderWidth: control.borderWidth,
    borderRadius: radius.button,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    minHeight: control.height,
  },
  fieldDisabled: { backgroundColor: colors.sunken, borderColor: colors.line },
  fieldText: { fontSize: 16, color: colors.text },
  backdrop: {
    flex: 1,
    backgroundColor: colors.scrim,
    justifyContent: 'center',
    padding: spacing.lg,
  },
  sheet: {
    width: '100%',
    maxWidth: 380,
    maxHeight: '90%',
    alignSelf: 'center',
    backgroundColor: colors.bg,
    borderRadius: radius.xl,
    padding: spacing.lg,
    ...shadow.lg,
  },
  sheetLabel: { fontSize: 14, fontWeight: '600', color: colors.muted, textAlign: 'center', marginBottom: spacing.xs },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  nav: { width: TOUCH, height: TOUCH, alignItems: 'center', justifyContent: 'center' },
  title: { flex: 1, textAlign: 'center', fontSize: 17, fontFamily: fonts.bold, color: colors.ink },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  // Stay just below 100% across seven columns so Yoga rounding cannot wrap Sunday.
  dow: {
    width: '14.28%',
    textAlign: 'center',
    fontSize: 11,
    fontWeight: '600',
    color: colors.muted,
    paddingBottom: 4,
  },
  cell: {
    width: '14.28%',
    minHeight: TOUCH,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.button,
  },
  // Same marking as the calendar tab: today is outlined, the chosen day is filled.
  cellToday: { borderWidth: 1, borderColor: colors.ink },
  cellOn: { backgroundColor: colors.ink },
  cellText: { fontSize: 13, color: colors.text, fontVariant: ['tabular-nums'] },
  footer: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginTop: spacing.sm },
});

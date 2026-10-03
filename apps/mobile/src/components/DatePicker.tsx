import React, { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '@/components/AppText';
import { Calendar, ChevronLeft, ChevronRight } from 'lucide-react-native';
import { isoDay, thDate } from '@/format';
import { colors, radius, spacing, TOUCH } from '@/theme';
import { Button } from './ui';

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

/** Field + modal calendar; value is an ISO day (YYYY-MM-DD, ค.ศ.), shown พ.ศ. */
export function DatePicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (isoDate: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const parsed = new Date(value);
  const valid = !Number.isNaN(parsed.getTime());
  const [cursor, setCursor] = useState(() => {
    const base = valid ? parsed : new Date();
    return { y: base.getFullYear(), m: base.getMonth() };
  });

  const cells = monthGrid(cursor.y, cursor.m);
  const todayKey = isoDay(new Date());

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="เลือกวันที่"
        accessibilityValue={{ text: valid ? thDate(parsed) : 'ยังไม่ได้เลือก' }}
        style={styles.field}
        onPress={() => {
          if (valid) setCursor({ y: parsed.getFullYear(), m: parsed.getMonth() });
          setOpen(true);
        }}
      >
        <Calendar size={17} color={colors.faint} />
        <Text style={styles.fieldText}>{valid ? thDate(parsed) : 'เลือกวันที่'}</Text>
      </Pressable>

      <Modal visible={open} transparent animationType="fade" supportedOrientations={['portrait', 'portrait-upside-down', 'landscape-left', 'landscape-right']} onRequestClose={() => setOpen(false)}>
        <Pressable accessible={false} style={styles.backdrop} onPress={() => setOpen(false)}>
          <Pressable accessible={false} style={styles.sheet} onPress={() => {}}>
            <View style={styles.head}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="เดือนก่อนหน้า"
                hitSlop={8}
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
                hitSlop={8}
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
                const isSelected = key === value;
                const isToday = key === todayKey;
                return (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={thDate(date)}
                    key={key}
                    style={[styles.cell, isToday && styles.cellToday, isSelected && styles.cellOn]}
                    onPress={() => {
                      onChange(key);
                      setOpen(false);
                    }}
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
            <Button title="ปิดปฏิทิน" ghost onPress={() => setOpen(false)} />
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: radius.button,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    minHeight: TOUCH,
  },
  fieldText: { fontSize: 15, color: colors.text },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.45)',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  sheet: {
    width: '100%',
    maxWidth: 380,
    maxHeight: '90%',
    alignSelf: 'center',
    backgroundColor: colors.bg,
    borderRadius: 16,
    padding: spacing.lg,
  },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  nav: { width: TOUCH, height: TOUCH, alignItems: 'center', justifyContent: 'center' },
  title: { flex: 1, textAlign: 'center', fontSize: 16, fontWeight: '700', color: colors.ink },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  // Stay just below 100% across seven columns so Yoga rounding cannot wrap Sunday.
  dow: {
    width: '14.28%',
    textAlign: 'center',
    fontSize: 11,
    fontWeight: '600',
    color: colors.faint,
    paddingBottom: 4,
  },
  cell: {
    width: '14.28%',
    minHeight: TOUCH,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
  },
  cellToday: { backgroundColor: colors.soft },
  cellOn: { backgroundColor: colors.ink },
  cellText: { fontSize: 13, color: colors.text, fontVariant: ['tabular-nums'] },
});

import React, { useEffect, useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Check } from 'lucide-react-native';
import { useConfirmTime, useTimeSuggestions } from '@/api/hooks';
import { Button, EmptyNote, ErrorNote, Loading } from '@/components/ui';
import { DatePicker } from '@/components/DatePicker';
import { isoDay } from '@/format';
import { colors, radius, spacing } from '@/theme';

type RowState = { checked: boolean; hours: string };

/** Hours must be present and within the API's accepted range (0.25–24). */
const isHoursInRange = (hours: string) => {
  const n = Number(hours);
  return hours !== '' && !Number.isNaN(n) && n >= 0.25 && n <= 24;
};

export default function TimesheetScreen() {
  const insets = useSafeAreaInsets();
  const [date, setDate] = useState(() => isoDay(new Date()));
  const suggestions = useTimeSuggestions(date);
  const confirmTime = useConfirmTime();
  const [rows, setRows] = useState<Record<string, RowState>>({});

  useEffect(() => {
    const data = suggestions.data ?? [];
    setRows(
      Object.fromEntries(
        data.map((s) => [s.sourceKey, { checked: s.hours !== null, hours: s.hours !== null ? String(s.hours) : '' }]),
      ),
    );
  }, [suggestions.data]);

  if (suggestions.isLoading) return <Loading />;

  const data = suggestions.data ?? [];
  const checkedKeys = data.filter((s) => rows[s.sourceKey]?.checked).map((s) => s.sourceKey);
  const hasMissingHours = checkedKeys.some((key) => !rows[key]?.hours);
  const hasOutOfRangeHours = checkedKeys.some((key) => rows[key]?.hours && !isHoursInRange(rows[key].hours));
  const hasInvalidHours = hasMissingHours || hasOutOfRangeHours;

  const toggle = (sourceKey: string) =>
    setRows((prev) => ({ ...prev, [sourceKey]: { ...prev[sourceKey], checked: !prev[sourceKey]?.checked } }));

  const setHours = (sourceKey: string, hours: string) =>
    setRows((prev) => ({ ...prev, [sourceKey]: { ...prev[sourceKey], hours } }));

  const confirm = () => {
    const entries = data
      .filter((s) => rows[s.sourceKey]?.checked)
      .map((s) => ({
        caseId: s.caseId,
        hours: Number(rows[s.sourceKey].hours),
        description: s.description,
        date: s.date,
        sourceKey: s.sourceKey,
      }));
    confirmTime.mutate(entries, {
      onSuccess: (result) => Alert.alert('บันทึกเวลาแล้ว', `ยืนยันเวลาแล้ว ${result.created} รายการ`),
      onError: () => Alert.alert('ยืนยันเวลาไม่สำเร็จ', 'กรุณาลองใหม่'),
    });
  };

  return (
    <View style={styles.screen}>
      <View style={styles.dateRow}>
        <DatePicker value={date} onChange={setDate} />
      </View>

      {suggestions.isError ? (
        <View style={{ padding: spacing.lg }}>
          <ErrorNote message="โหลดรายการไม่สำเร็จ" onRetry={() => suggestions.refetch()} />
        </View>
      ) : (
        <FlatList
          data={data}
          keyExtractor={(item) => item.sourceKey}
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: 140 }}
          renderItem={({ item }) => {
            const row = rows[item.sourceKey] ?? { checked: false, hours: '' };
            const invalidHours = row.checked && !isHoursInRange(row.hours);
            return (
              <View style={styles.row}>
                <Pressable
                  onPress={() => toggle(item.sourceKey)}
                  style={[styles.checkbox, row.checked && styles.checkboxOn]}
                  hitSlop={8}
                >
                  {row.checked ? <Check size={14} color={colors.bg} /> : null}
                </Pressable>
                <View style={{ flex: 1 }}>
                  <Text style={styles.description} numberOfLines={2}>
                    {item.description}
                  </Text>
                  {item.caseRef ? <Text style={styles.meta}>{item.caseRef}</Text> : null}
                </View>
                <TextInput
                  value={row.hours}
                  onChangeText={(text) => setHours(item.sourceKey, text)}
                  keyboardType="decimal-pad"
                  placeholder="ชม."
                  style={[styles.hoursInput, invalidHours && styles.hoursInputError]}
                />
              </View>
            );
          }}
          ListEmptyComponent={<EmptyNote>ไม่มีรายการรอยืนยันสำหรับวันนี้</EmptyNote>}
        />
      )}

      <View style={[styles.footer, { paddingBottom: spacing.md + insets.bottom }]}>
        {hasMissingHours ? (
          <Text style={styles.warning}>กรอกชั่วโมงก่อน</Text>
        ) : hasOutOfRangeHours ? (
          <Text style={styles.warning}>ชั่วโมงต้องอยู่ระหว่าง 0.25–24</Text>
        ) : null}
        <Button
          title={`ยืนยัน ${checkedKeys.length} รายการ`}
          onPress={confirm}
          disabled={checkedKeys.length === 0 || hasInvalidHours}
          busy={confirmTime.isPending}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  dateRow: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: radius.card,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxOn: { backgroundColor: colors.ink, borderColor: colors.ink },
  description: { fontSize: 14, fontWeight: '600', color: colors.text },
  meta: { fontSize: 12, color: colors.faint, marginTop: 2 },
  hoursInput: {
    width: 56,
    height: 40,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.bg,
    textAlign: 'center',
    fontSize: 14,
    color: colors.text,
  },
  hoursInputError: { borderColor: colors.warn },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    padding: spacing.lg,
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.line,
  },
  warning: { color: colors.warn, fontSize: 13, textAlign: 'center' },
});

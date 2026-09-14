import React, { useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
} from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { View } from 'react-native';
import { useCreateEvent } from '@/api/hooks';
import { CasePicker, CaseRef } from '@/components/CasePicker';
import { Button, SectionLabel } from '@/components/ui';
import { isoDay } from '@/format';
import { useKeyboardHeight } from '@/hooks/useKeyboardHeight';
import { colors, radius, spacing } from '@/theme';

// Same options as the web's event-type <select> (CalendarEventDialog).
const EVENT_TYPES = [
  { value: 'COURT_DATE', label: 'นัดศาล' },
  { value: 'CLIENT_MEETING', label: 'นัดลูกความ' },
  { value: 'DEADLINE', label: 'ครบกำหนด' },
  { value: 'OTHER', label: 'อื่นๆ' },
] as const;

export default function NewEventScreen() {
  const router = useRouter();
  const { date } = useLocalSearchParams<{ date?: string }>();
  const createEvent = useCreateEvent();
  const keyboardHeight = useKeyboardHeight();

  const [caseRef, setCaseRef] = useState<CaseRef | null>(null);
  const [title, setTitle] = useState('');
  const [type, setType] = useState<string>('COURT_DATE');
  const [courtName, setCourtName] = useState('');
  const [day, setDay] = useState(date || isoDay(new Date()));
  const [time, setTime] = useState('09:00');

  const submit = () => {
    if (!caseRef) {
      Alert.alert('เลือกคดี', 'นัดหมายต้องผูกกับคดี');
      return;
    }
    if (!title.trim()) {
      Alert.alert('กรอกไม่ครบ', 'ใส่ชื่อนัดหมายก่อนบันทึก');
      return;
    }
    const startAt = new Date(`${day.trim()}T${time.trim() || '09:00'}:00`);
    if (Number.isNaN(startAt.getTime())) {
      Alert.alert('วันที่ไม่ถูกต้อง', 'ใช้รูปแบบ ค.ศ. เช่น 2026-09-14 และเวลา 09:00');
      return;
    }
    createEvent.mutate(
      {
        caseId: caseRef.id,
        title: title.trim(),
        startAt: startAt.toISOString(),
        type,
        courtName: type === 'COURT_DATE' ? courtName.trim() || undefined : undefined,
      },
      {
        onSuccess: () => router.back(),
        onError: (error) =>
          Alert.alert(
            'บันทึกไม่สำเร็จ',
            error instanceof Error ? error.message : 'ลองใหม่อีกครั้ง',
          ),
      },
    );
  };

  return (
    <>
      <Stack.Screen options={{ title: 'นัดหมายใหม่' }} />
      <KeyboardAvoidingView
        style={styles.screen}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: 40 + keyboardHeight }}
          keyboardShouldPersistTaps="handled"
        >
          <SectionLabel>คดี</SectionLabel>
          <CasePicker value={caseRef} onChange={setCaseRef} />

          <SectionLabel>ชื่อนัดหมาย</SectionLabel>
          <TextInput
            style={styles.input}
            placeholder="เช่น นัดสืบพยานโจทก์"
            placeholderTextColor={colors.faint}
            value={title}
            onChangeText={setTitle}
          />

          <SectionLabel>ประเภท</SectionLabel>
          <View style={styles.chips}>
            {EVENT_TYPES.map((option) => (
              <Pressable
                key={option.value}
                onPress={() => setType(option.value)}
                style={[styles.chip, type === option.value && styles.chipOn]}
              >
                <Text
                  style={[styles.chipText, type === option.value && styles.chipTextOn]}
                >
                  {option.label}
                </Text>
              </Pressable>
            ))}
          </View>

          {type === 'COURT_DATE' ? (
            <>
              <SectionLabel>ศาล</SectionLabel>
              <TextInput
                style={styles.input}
                placeholder="เช่น ศาลแพ่ง"
                placeholderTextColor={colors.faint}
                value={courtName}
                onChangeText={setCourtName}
              />
            </>
          ) : null}

          <View style={styles.datetimeRow}>
            <View style={{ flex: 3 }}>
              <SectionLabel>วันที่ (ค.ศ. ปี-เดือน-วัน)</SectionLabel>
              <TextInput
                style={styles.input}
                placeholder="2026-09-14"
                placeholderTextColor={colors.faint}
                value={day}
                onChangeText={setDay}
              />
            </View>
            <View style={{ flex: 2 }}>
              <SectionLabel>เวลา</SectionLabel>
              <TextInput
                style={styles.input}
                placeholder="09:00"
                placeholderTextColor={colors.faint}
                keyboardType="numbers-and-punctuation"
                value={time}
                onChangeText={setTime}
              />
            </View>
          </View>

          <View style={{ marginTop: spacing.xl }}>
            <Button title="บันทึกนัดหมาย" onPress={submit} busy={createEvent.isPending} />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  input: {
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: radius.button,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    fontSize: 15,
    color: colors.text,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  chipOn: { backgroundColor: colors.ink, borderColor: colors.ink },
  chipText: { fontSize: 13, color: colors.muted, fontWeight: '600' },
  chipTextOn: { color: colors.bg },
  datetimeRow: { flexDirection: 'row', gap: spacing.md },
});

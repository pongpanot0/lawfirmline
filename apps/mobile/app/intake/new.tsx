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
  View,
} from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { useCreateIntake } from '@/api/hooks';
import { Button, SectionLabel } from '@/components/ui';
import { isoDay } from '@/format';
import { useKeyboardHeight } from '@/hooks/useKeyboardHeight';
import { colors, radius, spacing } from '@/theme';

// Same keys/labels as the web intake's matter-type dropdown.
const MATTER_TYPES = [
  { value: 'CIVIL', label: 'แพ่ง' },
  { value: 'CRIMINAL', label: 'อาญา' },
  { value: 'ADMINISTRATIVE', label: 'ปกครอง' },
  { value: 'MEDICAL', label: 'ทางการแพทย์' },
  { value: 'LABOR', label: 'แรงงาน' },
  { value: 'OTHER', label: 'อื่นๆ' },
] as const;

/**
 * Quick capture while talking to a client outside the office — just enough
 * to land the matter in the intake queue; the full assessment happens on web.
 */
export default function NewIntakeScreen() {
  const router = useRouter();
  const createIntake = useCreateIntake();
  const [title, setTitle] = useState('');
  const [clientName, setClientName] = useState('');
  const [matterType, setMatterType] = useState<string | null>(null);
  const [description, setDescription] = useState('');
  const keyboardHeight = useKeyboardHeight();

  const submit = () => {
    if (!title.trim() && !description.trim()) {
      Alert.alert('กรอกไม่ครบ', 'ใส่ชื่อเรื่องหรือรายละเอียดอย่างน้อยหนึ่งอย่าง');
      return;
    }
    createIntake.mutate(
      {
        receivedDate: isoDay(new Date()),
        title: title.trim() || undefined,
        clientName: clientName.trim() || undefined,
        matterType: matterType ?? undefined,
        description: description.trim() || undefined,
      },
      {
        onSuccess: () => {
          Alert.alert('บันทึกแล้ว', 'เรื่องเข้าคิว intake เรียบร้อย ทีมจะประเมินต่อบนเว็บ', [
            { text: 'ตกลง', onPress: () => router.back() },
          ]);
        },
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
      <Stack.Screen options={{ title: 'รับเรื่องใหม่' }} />
      <KeyboardAvoidingView
        style={styles.screen}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 40 + keyboardHeight }}>
          <SectionLabel>ชื่อเรื่อง</SectionLabel>
          <TextInput
            style={styles.input}
            placeholder="เช่น อุบัติเหตุรถชน ถ.แจ้งวัฒนะ"
            placeholderTextColor={colors.faint}
            value={title}
            onChangeText={setTitle}
          />
          <SectionLabel>ชื่อลูกความ</SectionLabel>
          <TextInput
            style={styles.input}
            placeholder="ชื่อ-นามสกุล หรือชื่อบริษัท"
            placeholderTextColor={colors.faint}
            value={clientName}
            onChangeText={setClientName}
          />
          <SectionLabel>ประเภทเรื่อง</SectionLabel>
          <View style={styles.chips}>
            {MATTER_TYPES.map((option) => (
              <Pressable
                key={option.value}
                onPress={() =>
                  setMatterType((current) => (current === option.value ? null : option.value))
                }
                style={[styles.chip, matterType === option.value && styles.chipOn]}
              >
                <Text
                  style={[styles.chipText, matterType === option.value && styles.chipTextOn]}
                >
                  {option.label}
                </Text>
              </Pressable>
            ))}
          </View>
          <SectionLabel>รายละเอียดเบื้องต้น</SectionLabel>
          <TextInput
            style={[styles.input, styles.multiline]}
            placeholder="จดสิ่งที่ลูกความเล่า…"
            placeholderTextColor={colors.faint}
            multiline
            value={description}
            onChangeText={setDescription}
          />
          <SectionLabel> </SectionLabel>
          <Button title="บันทึกเข้าคิว intake" onPress={submit} busy={createIntake.isPending} />
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
  multiline: { minHeight: 110, textAlignVertical: 'top' },
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
});

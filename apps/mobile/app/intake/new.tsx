import React, { useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  TextInput,
} from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { useCreateIntake } from '@/api/hooks';
import { Button, SectionLabel } from '@/components/ui';
import { isoDay } from '@/format';
import { colors, radius, spacing } from '@/theme';

/**
 * Quick capture while talking to a client outside the office — just enough
 * to land the matter in the intake queue; the full assessment happens on web.
 */
export default function NewIntakeScreen() {
  const router = useRouter();
  const createIntake = useCreateIntake();
  const [title, setTitle] = useState('');
  const [clientName, setClientName] = useState('');
  const [matterType, setMatterType] = useState('');
  const [description, setDescription] = useState('');

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
        matterType: matterType.trim() || undefined,
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
        <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 40 }}>
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
          <TextInput
            style={styles.input}
            placeholder="เช่น ละเมิด, ผิดสัญญา, ประกันภัย"
            placeholderTextColor={colors.faint}
            value={matterType}
            onChangeText={setMatterType}
          />
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
});

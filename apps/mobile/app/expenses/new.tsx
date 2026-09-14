import React, { useState } from 'react';
import {
  Alert,
  Image,
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
import * as ImagePicker from 'expo-image-picker';
import { Camera } from 'lucide-react-native';
import { useQueryClient } from '@tanstack/react-query';
import { EXPENSE_CATEGORIES } from '@lawfirm/shared';
import { createExpense } from '@/api/files';
import { Button, Card, SectionLabel } from '@/components/ui';
import { isoDay } from '@/format';
import { colors, radius, spacing } from '@/theme';

export default function NewExpenseScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<string>(EXPENSE_CATEGORIES[0]);
  const [billable, setBillable] = useState(true);
  const [receiptUri, setReceiptUri] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const snapReceipt = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) return;
    const result = await ImagePicker.launchCameraAsync({ quality: 0.6 });
    if (!result.canceled && result.assets[0]) setReceiptUri(result.assets[0].uri);
  };

  const submit = async () => {
    const parsedAmount = Number(amount.replace(/,/g, ''));
    if (!parsedAmount || parsedAmount <= 0 || !description.trim()) {
      Alert.alert('กรอกไม่ครบ', 'ใส่จำนวนเงินและรายละเอียดก่อนบันทึก');
      return;
    }
    setBusy(true);
    try {
      await createExpense({
        amount: parsedAmount,
        description: description.trim(),
        category,
        date: isoDay(new Date()),
        billable,
        receiptUri: receiptUri ?? undefined,
      });
      queryClient.invalidateQueries({ queryKey: ['expenses'] });
      router.back();
    } catch (error) {
      Alert.alert(
        'บันทึกไม่สำเร็จ',
        error instanceof Error ? error.message : 'ตรวจสอบการเชื่อมต่อแล้วลองใหม่',
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Stack.Screen options={{ title: 'ค่าใช้จ่ายใหม่' }} />
      <KeyboardAvoidingView
        style={styles.screen}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 40 }}>
          <SectionLabel>จำนวนเงิน (บาท)</SectionLabel>
          <TextInput
            style={[styles.input, styles.amountInput]}
            placeholder="0"
            placeholderTextColor={colors.faint}
            keyboardType="decimal-pad"
            value={amount}
            onChangeText={setAmount}
          />

          <SectionLabel>รายละเอียด</SectionLabel>
          <TextInput
            style={styles.input}
            placeholder="เช่น ค่าทางด่วนไปศาลนนทบุรี"
            placeholderTextColor={colors.faint}
            value={description}
            onChangeText={setDescription}
          />

          <SectionLabel>ประเภท</SectionLabel>
          <View style={styles.chips}>
            {EXPENSE_CATEGORIES.map((option) => (
              <Pressable
                key={option}
                onPress={() => setCategory(option)}
                style={[styles.chip, category === option && styles.chipOn]}
              >
                <Text
                  style={[styles.chipText, category === option && styles.chipTextOn]}
                >
                  {option}
                </Text>
              </Pressable>
            ))}
          </View>

          <SectionLabel>เรียกเก็บลูกความ</SectionLabel>
          <View style={styles.chips}>
            {[
              { value: true, label: 'ใช่ · billable' },
              { value: false, label: 'ไม่ · ค่าใช้จ่ายสำนักงาน' },
            ].map((option) => (
              <Pressable
                key={String(option.value)}
                onPress={() => setBillable(option.value)}
                style={[styles.chip, billable === option.value && styles.chipOn]}
              >
                <Text
                  style={[
                    styles.chipText,
                    billable === option.value && styles.chipTextOn,
                  ]}
                >
                  {option.label}
                </Text>
              </Pressable>
            ))}
          </View>

          <SectionLabel>ใบเสร็จ</SectionLabel>
          {receiptUri ? (
            <Card>
              <Image source={{ uri: receiptUri }} style={styles.receipt} />
              <Pressable onPress={snapReceipt} style={{ marginTop: spacing.sm }}>
                <Text style={{ color: colors.ink, fontWeight: '600', textAlign: 'center' }}>
                  ถ่ายใหม่
                </Text>
              </Pressable>
            </Card>
          ) : (
            <Pressable
              onPress={snapReceipt}
              style={({ pressed }) => [styles.receiptButton, pressed && { opacity: 0.8 }]}
            >
              <Camera size={18} color={colors.ink} />
              <Text style={{ fontWeight: '600', color: colors.ink }}>ถ่ายใบเสร็จ</Text>
            </Pressable>
          )}

          <View style={{ marginTop: spacing.xl }}>
            <Button title="บันทึกค่าใช้จ่าย" onPress={submit} busy={busy} />
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
  amountInput: { fontSize: 24, fontWeight: '700', fontVariant: ['tabular-nums'] },
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
  receipt: { width: '100%', aspectRatio: 3 / 4, borderRadius: 8 },
  receiptButton: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.soft,
    borderRadius: radius.button,
    paddingVertical: 14,
    minHeight: 48,
  },
});

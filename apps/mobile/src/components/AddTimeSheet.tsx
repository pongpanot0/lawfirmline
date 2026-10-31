import React, { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from '@/components/AppText';
import { useCreateTimeEntry, useDefaultTimeRate } from '@/api/hooks';
import { Button, InlineError } from '@/components/ui';
import { CasePicker, type CaseRef } from '@/components/CasePicker';
import { CheckRow } from '@/components/Form';
import { DateField, TextField } from '@/components/Input';
import { isoDay } from '@/format';
import { colors, radius, shadow, spacing, typeScale } from '@/theme';

/** Hours must be present and within the API's accepted range (0.25–24). */
const isHoursInRange = (hours: string) => {
  const n = Number(hours);
  return hours !== '' && !Number.isNaN(n) && n >= 0.25 && n <= 24;
};

/** บันทึกเวลาเอง — คดี วันที่ ชั่วโมง รายละเอียด อัตรา (เติมจากค่าเริ่มต้นของสมาชิก) และคิดเงิน/ไม่คิดเงิน */
export function AddTimeSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { bottom } = useSafeAreaInsets();
  const create = useCreateTimeEntry();
  const defaultRate = useDefaultTimeRate(visible);
  const [caseRef, setCaseRef] = useState<CaseRef | null>(null);
  const [date, setDate] = useState(() => isoDay(new Date()));
  const [hours, setHours] = useState('');
  const [description, setDescription] = useState('');
  const [rate, setRate] = useState('');
  const [rateTouched, setRateTouched] = useState(false);
  const [billable, setBillable] = useState(true);

  useEffect(() => {
    if (defaultRate.data && !rateTouched) setRate(String(defaultRate.data.rate));
  }, [defaultRate.data, rateTouched]);

  const valid = !!caseRef && !!date && isHoursInRange(hours) && (rate === '' || Number(rate) >= 0);

  const save = () => {
    if (!caseRef || !valid) return;
    create.mutate(
      {
        caseId: caseRef.id,
        hours: Number(hours),
        rate: rate === '' ? undefined : Number(rate),
        description: description.trim() || undefined,
        date,
        billable,
      },
      {
        onSuccess: () => {
          setCaseRef(null);
          setHours('');
          setDescription('');
          setBillable(true);
          setRateTouched(false);
          create.reset();
          onClose();
        },
      },
    );
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.backdrop}>
        <Pressable accessible={false} style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={[styles.sheet, { paddingBottom: spacing.lg + bottom }]}>
          <View style={styles.handle} />
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: spacing.md }}>
            <Text accessibilityRole="header" style={styles.title}>เพิ่มเวลา</Text>
            <CasePicker label="คดี" required value={caseRef} onChange={setCaseRef} />
            <DateField label="วันที่" required value={date} onChange={setDate} />
            <TextField label="ชั่วโมง" required hint="0.25–24" keyboardType="decimal-pad" value={hours} onChange={setHours} />
            <TextField
              label="อัตราต่อชั่วโมง (฿)"
              keyboardType="decimal-pad"
              value={rate}
              onChange={(next) => { setRateTouched(true); setRate(next); }}
            />
            <TextField label="รายละเอียด" value={description} onChange={setDescription} maxLength={500} />
            <CheckRow label="คิดเงินลูกความ" checked={billable} onChange={setBillable} />
            {create.isError ? <InlineError message={create.error.message || 'บันทึกเวลาไม่สำเร็จ กรุณาลองใหม่'} /> : null}
          </ScrollView>
          <View style={styles.footer}>
            <View style={{ flex: 1 }}><Button title="ยกเลิก" variant="secondary" disabled={create.isPending} onPress={onClose} /></View>
            <View style={{ flex: 1 }}><Button title="บันทึก" busy={create.isPending} disabled={!valid} onPress={save} /></View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: colors.scrim, justifyContent: 'flex-end' },
  sheet: {
    width: '100%',
    maxWidth: 760,
    alignSelf: 'center',
    backgroundColor: colors.raised,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    padding: spacing.lg,
    maxHeight: '92%',
    ...shadow.lg,
  },
  handle: { alignSelf: 'center', width: 36, height: 4, borderRadius: 2, backgroundColor: colors.line, marginBottom: spacing.md },
  title: { ...typeScale.title, color: colors.ink },
  footer: { flexDirection: 'row', gap: spacing.sm, paddingTop: spacing.md },
});

import React, { useState } from 'react';
import { Linking, Pressable, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Text, TextInput } from '@/components/AppText';
import { FormField, FormPage, FormSection } from '@/components/Form';
import { Button, ErrorNote, SectionLabel } from '@/components/ui';
import { useAuth } from '@/api/auth';
import { ApiError } from '@/api/client';
import { colors, spacing } from '@/theme';
import { passwordError } from '@/account-validation';

export default function RegisterScreen() {
  const router = useRouter();
  const { register } = useAuth();
  const [firmName, setFirmName] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (busy) return;
    setError(null);
    if ([firmName, firstName, lastName].some(value => value.trim().length < 2)) {
      setError('กรอกชื่อสำนักงาน ชื่อ และนามสกุล อย่างน้อยช่องละ 2 ตัวอักษร'); return;
    }
    if (firmName.trim().length > 200 || firstName.trim().length > 100 || lastName.trim().length > 100) {
      setError('ชื่อสำนักงานไม่เกิน 200 ตัวอักษร ชื่อและนามสกุลช่องละไม่เกิน 100 ตัวอักษร'); return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) { setError('กรอกอีเมลให้ถูกต้อง'); return; }
    const invalidPassword = passwordError(password, confirmation);
    if (invalidPassword) { setError(invalidPassword); return; }
    setBusy(true);
    try {
      await register({ firmName: firmName.trim(), firstName: firstName.trim(), lastName: lastName.trim(),
        email: email.trim().toLowerCase(), password });
    } catch (err) {
      setError(err instanceof ApiError ? (err.status === 409 ? 'อีเมลนี้มีบัญชีแล้ว กลับไปเข้าสู่ระบบหรือตั้งรหัสผ่านใหม่' : err.status === 429 ? 'สมัครถี่เกินไป รอสักครู่แล้วลองใหม่' : 'สมัครไม่สำเร็จ ตรวจข้อมูลแล้วลองใหม่ หรือติดต่อ hello@samnuan.co')
        : 'เชื่อมต่อไม่ได้ ตรวจสอบอินเทอร์เน็ตแล้วลองใหม่');
    } finally { setBusy(false); }
  };

  return <FormPage>
    <View style={{ gap: spacing.sm, marginTop: spacing.xl, marginBottom: spacing.lg }}>
      <Text style={{ color: colors.ink, fontWeight: '700', fontSize: 28 }}>สมัคร Samnuan</Text>
      <Text style={{ color: colors.muted }}>สร้างสำนักงานใหม่และบัญชีเจ้าของสำนักงาน · ทดลองใช้งาน 30 วัน</Text>
      <Text style={{ color: colors.muted }}>ถ้าสำนักงานมีบัญชีแล้ว ให้เจ้าของสำนักงานเชิญคุณด้วยอีเมล เพื่อไม่สร้างสำนักงานซ้ำ</Text>
    </View>
    <FormSection title="สำนักงานและชื่อของคุณ">
    <FormField label="ชื่อสำนักงาน" value={firmName} onChange={setFirmName} disabled={busy} />
    <FormField label="ชื่อ" value={firstName} onChange={setFirstName} disabled={busy} />
    <FormField label="นามสกุล" value={lastName} onChange={setLastName} disabled={busy} />
    </FormSection>
    <FormSection title="ข้อมูลเข้าสู่ระบบ" detail="ใช้อีเมลนี้สำหรับเข้าระบบและตั้งรหัสผ่านใหม่">
    <SectionLabel>อีเมล</SectionLabel>
    <TextInput style={styles.input} accessibilityLabel="อีเมล" autoCapitalize="none" keyboardType="email-address"
      autoComplete="email" value={email} onChangeText={setEmail} editable={!busy} />
    <SectionLabel>รหัสผ่าน · อย่างน้อย 8 ตัวอักษร</SectionLabel>
    <TextInput style={styles.input} accessibilityLabel="รหัสผ่าน" autoCapitalize="none" autoComplete="new-password"
      secureTextEntry value={password} onChangeText={setPassword} editable={!busy} />
    <SectionLabel>ยืนยันรหัสผ่าน</SectionLabel>
    <TextInput style={styles.input} accessibilityLabel="ยืนยันรหัสผ่าน" autoCapitalize="none" autoComplete="new-password"
      secureTextEntry value={confirmation} onChangeText={setConfirmation} editable={!busy} onSubmitEditing={submit} />
    </FormSection>
    {error && <ErrorNote message={error} />}
    <Button title="สร้างบัญชีและสำนักงาน" onPress={submit} busy={busy} />
    <Button ghost title="มีบัญชีแล้ว · เข้าสู่ระบบ" onPress={() => router.replace('/(auth)/login')} disabled={busy} />
    <Pressable accessibilityRole="link" onPress={() => Linking.openURL('https://samnuan.com/privacy')}
      style={{ minHeight: 44, justifyContent: 'center' }}>
      <Text style={{ color: colors.info, textAlign: 'center' }}>อ่านนโยบายความเป็นส่วนตัว</Text>
    </Pressable>
  </FormPage>;
}

const styles = StyleSheet.create({ input: { backgroundColor: colors.surface, color: colors.text,
  minHeight: 48, padding: spacing.md, borderWidth: 1, borderColor: colors.line, borderRadius: 10, fontSize: 15 } });

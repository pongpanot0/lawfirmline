import React, { useState } from 'react';
import { Linking, Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Text } from '@/components/AppText';
import { FormPage, FormSection, MissingSummary } from '@/components/Form';
import { TextField } from '@/components/Input';
import { Button, InlineError } from '@/components/ui';
import { useAuth } from '@/api/auth';
import { ApiError } from '@/api/client';
import { colors, radius, spacing, typeScale } from '@/theme';
import { passwordError } from '@/account-validation';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function nameError(value: string, label: string, max: number) {
  const size = value.trim().length;
  if (size < 2) return `ใส่${label}อย่างน้อย 2 ตัวอักษร`;
  if (size > max) return `${label}ไม่เกิน ${max} ตัวอักษร`;
  return undefined;
}

export default function RegisterScreen() {
  const router = useRouter();
  const { register } = useAuth();
  const [firmName, setFirmName] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [triedSave, setTriedSave] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Same rules as before, but each message sits under the field it belongs to.
  const ownPasswordError = passwordError(password, password);
  const errors = {
    firmName: nameError(firmName, 'ชื่อสำนักงาน', 200),
    firstName: nameError(firstName, 'ชื่อ', 100),
    lastName: nameError(lastName, 'นามสกุล', 100),
    email: EMAIL.test(email.trim()) ? undefined : 'กรอกอีเมลให้ถูกต้อง เช่น name@firm.co.th',
    password: ownPasswordError ?? undefined,
    confirmation: !ownPasswordError && password !== confirmation ? 'รหัสผ่านทั้งสองช่องไม่ตรงกัน' : undefined,
  };
  const shown = (key: keyof typeof errors) => (triedSave ? errors[key] : undefined);
  const missing = triedSave ? ([
    ['firmName', 'ชื่อสำนักงาน'], ['firstName', 'ชื่อ'], ['lastName', 'นามสกุล'], ['email', 'อีเมล'], ['password', 'รหัสผ่าน'], ['confirmation', 'ยืนยันรหัสผ่าน'],
  ] as const).filter(([key]) => errors[key]).map(([, label]) => label) : [];

  const submit = async () => {
    if (busy) return;
    setError(null);
    setTriedSave(true);
    if (Object.values(errors).some(Boolean) || passwordError(password, confirmation)) return;
    setBusy(true);
    try {
      await register({ firmName: firmName.trim(), firstName: firstName.trim(), lastName: lastName.trim(),
        email: email.trim().toLowerCase(), password });
    } catch (err) {
      setError(err instanceof ApiError ? (err.status === 409 ? 'อีเมลนี้มีบัญชีแล้ว กลับไปเข้าสู่ระบบหรือตั้งรหัสผ่านใหม่' : err.status === 429 ? 'สมัครถี่เกินไป รอสักครู่แล้วลองใหม่' : 'สมัครไม่สำเร็จ ตรวจข้อมูลแล้วลองใหม่ หรือติดต่อ hello@samnuan.com')
        : 'เชื่อมต่อไม่ได้ ตรวจสอบอินเทอร์เน็ตแล้วลองใหม่');
    } finally { setBusy(false); }
  };

  return <FormPage>
    <View style={{ gap: spacing.sm, marginTop: spacing.xl, marginBottom: spacing.sm }}>
      <Text accessibilityRole="header" style={{ ...typeScale.display, color: colors.ink }}>สมัคร Samnuan</Text>
      <Text style={{ color: colors.muted, fontSize: 15, lineHeight: 24 }}>สร้างสำนักงานใหม่ สำหรับเจ้าของสำนักงาน</Text>
      <Text style={{ color: colors.info, backgroundColor: colors.infoSoft, borderRadius: radius.md, padding: spacing.md, fontWeight: '600',
        fontSize: 14, lineHeight: 22 }}>พนักงานไม่ต้องสมัคร — เปิดลิงก์ในอีเมลเชิญจากสำนักงานของคุณ</Text>
    </View>
    <FormSection title="สำนักงานและชื่อของคุณ">
      <TextField label="ชื่อสำนักงาน" required value={firmName} onChange={setFirmName} disabled={busy} error={shown('firmName')}
        maxLength={200} returnKeyType="next" />
      <TextField label="ชื่อ" required value={firstName} onChange={setFirstName} disabled={busy} error={shown('firstName')}
        maxLength={100} autoComplete="given-name" textContentType="givenName" returnKeyType="next" />
      <TextField label="นามสกุล" required value={lastName} onChange={setLastName} disabled={busy} error={shown('lastName')}
        maxLength={100} autoComplete="family-name" textContentType="familyName" returnKeyType="next" />
    </FormSection>
    <FormSection title="ข้อมูลเข้าสู่ระบบ" detail="ใช้อีเมลนี้สำหรับเข้าระบบและตั้งรหัสผ่านใหม่">
      <TextField label="อีเมล" required value={email} onChange={setEmail} disabled={busy} error={shown('email')} placeholder="name@firm.co.th"
        keyboardType="email-address" autoCapitalize="none" autoComplete="email" textContentType="emailAddress" returnKeyType="next" />
      <TextField label="รหัสผ่าน" required hint="อย่างน้อย 8 ตัวอักษร" value={password} onChange={setPassword} disabled={busy} error={shown('password')}
        secureTextEntry={!showPassword} autoCapitalize="none" autoComplete="new-password" textContentType="newPassword" returnKeyType="next" />
      <TextField label="ยืนยันรหัสผ่าน" required value={confirmation} onChange={setConfirmation} disabled={busy} error={shown('confirmation')}
        secureTextEntry={!showPassword} autoCapitalize="none" autoComplete="new-password" textContentType="newPassword"
        returnKeyType="done" onSubmitEditing={submit} />
      <Button title={showPassword ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน'} variant="link" onPress={() => setShowPassword(!showPassword)} />
    </FormSection>
    <MissingSummary items={missing} />
    {error && <InlineError message={error} />}
    <Button title="สร้างบัญชีและสำนักงาน" onPress={submit} busy={busy} />
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: spacing.md }}>
      <Button variant="link" title="มีบัญชีแล้ว · เข้าสู่ระบบ" onPress={() => router.replace('/(auth)/login')} disabled={busy} />
      <Pressable accessibilityRole="link" onPress={() => Linking.openURL('https://samnuan.com/privacy')}
        style={({ pressed }) => [{ minHeight: 44, justifyContent: 'center' }, pressed && { opacity: 0.6 }]}>
        <Text style={{ color: colors.info, fontSize: 14 }}>นโยบายความเป็นส่วนตัว</Text>
      </Pressable>
    </View>
  </FormPage>;
}

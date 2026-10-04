import React, { useState } from 'react';
import { Alert, Linking, Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '@/api/auth';
import { api, ApiError } from '@/api/client';
import { FormField, FormPage, FormSection } from '@/components/Form';
import { Disclosure } from '@/components/Disclosure';
import { Text, TextInput } from '@/components/AppText';
import { ActionRow, Button, Card, ErrorNote, PageIntro, SectionLabel } from '@/components/ui';
import { passwordError } from '@/account-validation';
import { colors, spacing } from '@/theme';

function failure(error: unknown) {
  if (error instanceof ApiError) {
    if (error.status === 401) return 'รหัสผ่านปัจจุบันไม่ถูกต้อง หรือเซสชันหมดอายุ กรุณาตรวจรหัสผ่านหรือเข้าสู่ระบบใหม่';
    if (error.status === 400) return 'ตรวจข้อมูลที่กรอก ชื่อไม่เกิน 100 ตัวอักษร และรหัสผ่านใหม่ต้องตรงกัน';
    if (error.status === 429) return 'ทำรายการถี่เกินไป รอสักครู่แล้วลองใหม่';
    return 'ระบบยังทำรายการไม่ได้ กรุณาลองใหม่ หรือติดต่อ hello@samnuan.co';
  }
  return 'เชื่อมต่อไม่ได้ ตรวจสอบอินเทอร์เน็ตแล้วลองใหม่';
}

export default function AccountScreen() {
  const router = useRouter();
  const { user, refreshUser, logout } = useAuth();
  const [firstName, setFirstName] = useState(user?.firstName ?? '');
  const [lastName, setLastName] = useState(user?.lastName ?? '');
  const [currentPassword, setCurrentPassword] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState<'profile' | 'password' | null>(null);
  const [error, setError] = useState<{ section: 'profile' | 'password'; message: string } | null>(null);
  const [saved, setSaved] = useState(false);

  const saveProfile = async () => {
    if (busy) return;
    if (!firstName.trim() || !lastName.trim() || firstName.trim().length > 100 || lastName.trim().length > 100) {
      setError({ section: 'profile', message: 'กรอกชื่อและนามสกุลให้ครบ ช่องละไม่เกิน 100 ตัวอักษร' }); return;
    }
    setBusy('profile'); setError(null); setSaved(false);
    try {
      await api('/auth/account/profile', { method: 'PATCH', body: { firstName: firstName.trim(), lastName: lastName.trim() } });
      await refreshUser(); setSaved(true);
    } catch (err) { setError({ section: 'profile', message: failure(err) }); }
    finally { setBusy(null); }
  };

  const changePassword = async () => {
    if (busy) return;
    const invalid = passwordError(password, confirmation);
    if (invalid) { setError({ section: 'password', message: invalid }); return; }
    setBusy('password'); setError(null);
    try {
      await api('/auth/account/password', { method: 'POST', body: { currentPassword, password } });
      setCurrentPassword(''); setPassword(''); setConfirmation('');
      await logout();
      Alert.alert('เปลี่ยนรหัสผ่านแล้ว', 'เข้าสู่ระบบอีกครั้งด้วยรหัสผ่านใหม่');
    } catch (err) { setError({ section: 'password', message: failure(err) }); }
    finally { setBusy(null); }
  };

  return <FormPage>
    <PageIntro title="ข้อมูลส่วนตัว" detail="จัดการชื่อ รหัสผ่าน และข้อมูลบัญชีของคุณ" />
    <Card><Text style={{ color: colors.ink, fontWeight: '700' }}>{user?.email}</Text>
      <Text style={{ color: colors.muted, marginTop: spacing.xs }}>{user?.firmName}</Text>
      <Text style={{ color: colors.muted, marginTop: spacing.sm }}>บัญชีนี้เป็นของคุณ และอาจใช้ร่วมกับหลายสำนักงาน</Text></Card>
    <Card><ActionRow title="ลบบัญชีและข้อมูลส่วนตัว" detail="ส่งคำขอและติดตามสถานะ" destructive
      onPress={() => router.push('/delete-account' as never)} /></Card>
    <FormSection title="ชื่อที่แสดงในทีม">
    <FormField label="ชื่อ" value={firstName} onChange={setFirstName} disabled={!!busy} />
    <FormField label="นามสกุล" value={lastName} onChange={setLastName} disabled={!!busy} />
    <Button title="บันทึกชื่อของฉัน" onPress={saveProfile} busy={busy === 'profile'} disabled={!!busy} />
    {error?.section === 'profile' && <ErrorNote message={error.message} />}
    {saved && <Text style={{ color: colors.good }}>บันทึกชื่อแล้ว</Text>}
    </FormSection>

    <Disclosure title="เปลี่ยนรหัสผ่าน" summary="ยืนยันรหัสผ่านปัจจุบันก่อนเปลี่ยน">
    <View style={{ gap: spacing.sm }}>
    <PasswordField label="รหัสผ่านปัจจุบัน" value={currentPassword} onChange={setCurrentPassword} disabled={!!busy} />
    <PasswordField label="รหัสผ่านใหม่ · อย่างน้อย 8 ตัวอักษร" value={password} onChange={setPassword} disabled={!!busy} newPassword />
    <PasswordField label="ยืนยันรหัสผ่านใหม่" value={confirmation} onChange={setConfirmation} disabled={!!busy} newPassword />
    <Text style={{ color: colors.muted }}>หลังเปลี่ยนรหัสผ่าน คุณจะต้องเข้าสู่ระบบใหม่ในโทรศัพท์เครื่องนี้</Text>
    <Button title="เปลี่ยนรหัสผ่าน" onPress={changePassword} busy={busy === 'password'} disabled={!!busy || !currentPassword} />
    {error?.section === 'password' && <ErrorNote message={error.message} />}
    </View></Disclosure>
    <Pressable accessibilityRole="link" onPress={() => Linking.openURL('https://samnuan.com/privacy')}
      style={{ minHeight: 44, justifyContent: 'center' }}>
      <Text style={{ color: colors.info }}>นโยบายความเป็นส่วนตัว</Text>
    </Pressable>
  </FormPage>;
}

function PasswordField({ label, value, onChange, disabled, newPassword = false }: {
  label: string; value: string; onChange: (value: string) => void; disabled: boolean; newPassword?: boolean;
}) {
  return <View style={{ gap: spacing.sm }}><SectionLabel>{label}</SectionLabel>
    <TextInput accessibilityLabel={label} value={value} onChangeText={onChange} editable={!disabled}
      secureTextEntry autoCapitalize="none" autoComplete={newPassword ? 'new-password' : 'current-password'}
      style={{ minHeight: 48, padding: spacing.md, borderRadius: 10, borderWidth: 1, borderColor: colors.line,
        backgroundColor: colors.surface, color: colors.text, fontSize: 15 }} />
  </View>;
}

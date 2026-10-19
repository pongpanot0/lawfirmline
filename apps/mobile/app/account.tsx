import React, { useState } from 'react';
import { Alert, Linking, Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '@/api/auth';
import { api, ApiError } from '@/api/client';
import { FormPage, FormSection } from '@/components/Form';
import { TextField } from '@/components/Input';
import { Disclosure } from '@/components/Disclosure';
import { Text } from '@/components/AppText';
import { ActionRow, Button, Card, InlineError } from '@/components/ui';
import { passwordError } from '@/account-validation';
import { initials } from '@/format';
import { colors, fonts, radius, spacing, typeScale } from '@/theme';

function failure(error: unknown) {
  if (error instanceof ApiError) {
    if (error.status === 401) return 'รหัสผ่านปัจจุบันไม่ถูกต้อง หรือเซสชันหมดอายุ กรุณาตรวจรหัสผ่านหรือเข้าสู่ระบบใหม่';
    if (error.status === 400) return 'ตรวจข้อมูลที่กรอก ชื่อไม่เกิน 100 ตัวอักษร และรหัสผ่านใหม่ต้องตรงกัน';
    if (error.status === 429) return 'ทำรายการถี่เกินไป รอสักครู่แล้วลองใหม่';
    return 'ระบบยังทำรายการไม่ได้ กรุณาลองใหม่ หรือติดต่อ hello@samnuan.com';
  }
  return 'เชื่อมต่อไม่ได้ ตรวจสอบอินเทอร์เน็ตแล้วลองใหม่';
}

function nameError(value: string, label: string) {
  if (!value.trim()) return `ใส่${label}`;
  if (value.trim().length > 100) return `${label}ไม่เกิน 100 ตัวอักษร`;
  return undefined;
}

export default function AccountScreen() {
  const router = useRouter();
  const { user, refreshUser, logout } = useAuth();
  const [firstName, setFirstName] = useState(user?.firstName ?? '');
  const [lastName, setLastName] = useState(user?.lastName ?? '');
  const [currentPassword, setCurrentPassword] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState<'profile' | 'password' | null>(null);
  const [error, setError] = useState<{ section: 'profile' | 'password'; message: string } | null>(null);
  const [saved, setSaved] = useState(false);
  const [triedProfile, setTriedProfile] = useState(false), [triedPassword, setTriedPassword] = useState(false);

  const profileErrors = { firstName: nameError(firstName, 'ชื่อ'), lastName: nameError(lastName, 'นามสกุล') };
  const changed = firstName.trim() !== (user?.firstName ?? '') || lastName.trim() !== (user?.lastName ?? '');
  const ownPasswordError = passwordError(password, password);
  const passwordErrors = {
    current: currentPassword ? undefined : 'กรอกรหัสผ่านปัจจุบัน',
    password: ownPasswordError ?? undefined,
    confirmation: !ownPasswordError && password !== confirmation ? 'รหัสผ่านทั้งสองช่องไม่ตรงกัน' : undefined,
  };
  const editName = (set: (value: string) => void) => (value: string) => { set(value); setSaved(false); };

  const saveProfile = async () => {
    if (busy) return;
    setTriedProfile(true);
    if (profileErrors.firstName || profileErrors.lastName) return;
    setBusy('profile'); setError(null); setSaved(false);
    try {
      await api('/auth/account/profile', { method: 'PATCH', body: { firstName: firstName.trim(), lastName: lastName.trim() } });
      await refreshUser(); setSaved(true); setTriedProfile(false);
    } catch (err) { setError({ section: 'profile', message: failure(err) }); }
    finally { setBusy(null); }
  };

  const changePassword = async () => {
    if (busy) return;
    setTriedPassword(true);
    if (passwordErrors.current || passwordError(password, confirmation)) return;
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
    <Card style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
      <View style={{ width: 48, height: 48, borderRadius: radius.full, backgroundColor: colors.infoSoft, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: colors.info, fontFamily: fonts.bold, fontSize: 17 }}>{initials(`${user?.firstName ?? ''} ${user?.lastName ?? ''}`.trim() || user?.email || '')}</Text>
      </View>
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <Text style={{ ...typeScale.section, color: colors.ink }}>{user?.email}</Text>
        {user?.firmName ? <Text style={{ color: colors.muted, fontSize: 14 }}>{user.firmName}</Text> : null}
      </View>
    </Card>
    <FormSection title="ชื่อที่แสดงในทีม">
      <TextField label="ชื่อ" required value={firstName} onChange={editName(setFirstName)} disabled={!!busy}
        error={triedProfile ? profileErrors.firstName : undefined} maxLength={100} autoComplete="given-name" textContentType="givenName" />
      <TextField label="นามสกุล" required value={lastName} onChange={editName(setLastName)} disabled={!!busy}
        error={triedProfile ? profileErrors.lastName : undefined} maxLength={100} autoComplete="family-name" textContentType="familyName" />
      {error?.section === 'profile' && <InlineError message={error.message} />}
      {saved && !changed && <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={{ color: colors.good, fontWeight: '600' }}>บันทึกชื่อแล้ว</Text>}
      <Button title="บันทึกชื่อของฉัน" onPress={saveProfile} busy={busy === 'profile'} disabled={!!busy || !changed}
        accessibilityHint={changed ? undefined : 'แก้ชื่อหรือนามสกุลก่อนบันทึก'} />
    </FormSection>

    <Disclosure title="เปลี่ยนรหัสผ่าน" summary="ยืนยันรหัสผ่านปัจจุบันก่อนเปลี่ยน">
      <View style={{ gap: spacing.sm }}>
        <TextField label="รหัสผ่านปัจจุบัน" required value={currentPassword} onChange={setCurrentPassword} disabled={!!busy}
          error={triedPassword ? passwordErrors.current : undefined}
          secureTextEntry={!showPassword} autoCapitalize="none" autoComplete="current-password" textContentType="password" />
        <TextField label="รหัสผ่านใหม่" required hint="อย่างน้อย 8 ตัวอักษร" value={password} onChange={setPassword} disabled={!!busy}
          error={triedPassword ? passwordErrors.password : undefined}
          secureTextEntry={!showPassword} autoCapitalize="none" autoComplete="new-password" textContentType="newPassword" />
        <TextField label="ยืนยันรหัสผ่านใหม่" required value={confirmation} onChange={setConfirmation} disabled={!!busy}
          error={triedPassword ? passwordErrors.confirmation : undefined}
          secureTextEntry={!showPassword} autoCapitalize="none" autoComplete="new-password" textContentType="newPassword"
          returnKeyType="done" onSubmitEditing={changePassword} />
        <Button title={showPassword ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน'} variant="link" onPress={() => setShowPassword(!showPassword)} />
        <Text style={{ color: colors.muted, fontSize: 14, lineHeight: 22 }}>หลังเปลี่ยนรหัสผ่าน คุณจะต้องเข้าสู่ระบบใหม่ในโทรศัพท์เครื่องนี้</Text>
        {error?.section === 'password' && <InlineError message={error.message} />}
        <Button title="เปลี่ยนรหัสผ่าน" variant="secondary" onPress={changePassword} busy={busy === 'password'} disabled={!!busy} />
      </View>
    </Disclosure>
    <Pressable accessibilityRole="link" onPress={() => Linking.openURL('https://samnuan.com/privacy')}
      style={({ pressed }) => [{ minHeight: 44, justifyContent: 'center', marginTop: spacing.sm }, pressed && { opacity: 0.6 }]}>
      <Text style={{ color: colors.info }}>นโยบายความเป็นส่วนตัว</Text>
    </Pressable>
    {/* Destructive request stays visible, but last, away from everyday edits. */}
    <Card style={{ marginTop: spacing.md, paddingVertical: 0 }}>
      <ActionRow title="ลบบัญชีและข้อมูลส่วนตัว" detail="ส่งคำขอและติดตามสถานะ · ยังไม่ลบทันที" destructive
        onPress={() => router.push('/delete-account' as never)} />
    </Card>
  </FormPage>;
}

import React, { useState } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Text } from '@/components/AppText';
import { FormPage, FormSection } from '@/components/Form';
import { TextField } from '@/components/Input';
import { Button, InlineError } from '@/components/ui';
import { api, ApiError } from '@/api/client';
import { colors, spacing, typeScale } from '@/theme';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ email?: string }>();
  // Carry over what was typed on the login screen.
  const [email, setEmail] = useState(typeof params.email === 'string' ? params.email : '');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [tried, setTried] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const emailError = EMAIL.test(email.trim()) ? undefined : 'กรอกอีเมลให้ถูกต้อง เช่น name@firm.co.th';
  const submit = async () => {
    if (busy) return;
    setTried(true);
    if (emailError) return;
    setBusy(true); setError(null);
    try {
      await api('/auth/forgot-password', { method: 'POST', body: { email: email.trim().toLowerCase() } });
      setSent(true);
    } catch (err) {
      setError(err instanceof ApiError ? (err.status === 429 ? 'ขอลิงก์ถี่เกินไป รอสักครู่แล้วลองใหม่' : 'ระบบยังส่งอีเมลไม่ได้ ลองใหม่หรือติดต่อ hello@samnuan.com') : 'เชื่อมต่อไม่ได้ ตรวจสอบอินเทอร์เน็ตแล้วลองใหม่');
    } finally { setBusy(false); }
  };
  const backToLogin = () => router.replace('/(auth)/login');
  return <FormPage><View style={{ gap: spacing.md, marginTop: spacing.xl }}>
    <Text accessibilityRole="header" style={{ ...typeScale.display, color: colors.ink }}>ลืมรหัสผ่าน</Text>
    <FormSection title={sent ? 'ตรวจอีเมลของคุณ' : 'ขอลิงก์ตั้งรหัสผ่านใหม่'}>
      {sent ? <>
        <Text accessibilityLiveRegion="polite" style={{ color: colors.text, lineHeight: 24 }}>
          ส่งลิงก์ไปที่ {email.trim()} แล้ว (ถ้ามีบัญชี) ตรวจกล่องจดหมายและสแปม แล้วกลับมาเข้าสู่ระบบด้วยรหัสใหม่
        </Text>
        {error && <InlineError message={error} />}
        <Button title="กลับไปเข้าสู่ระบบ" onPress={backToLogin} />
        <Button title="ส่งลิงก์อีกครั้ง" variant="link" busy={busy} onPress={submit} />
      </> : <>
        <TextField label="อีเมลที่ใช้สมัคร" required value={email} onChange={setEmail} disabled={busy}
          error={tried ? emailError : undefined} placeholder="name@firm.co.th"
          keyboardType="email-address" autoCapitalize="none" autoComplete="email" textContentType="emailAddress"
          returnKeyType="send" onSubmitEditing={submit} />
        {error && <InlineError message={error} />}
        <Button title="ส่งลิงก์ตั้งรหัสผ่านใหม่" onPress={submit} busy={busy} />
      </>}
    </FormSection>
    {!sent && <Button variant="link" title="กลับไปเข้าสู่ระบบ" onPress={backToLogin} disabled={busy} />}
  </View></FormPage>;
}

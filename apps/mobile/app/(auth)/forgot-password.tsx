import React, { useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { Text, TextInput } from '@/components/AppText';
import { FormPage } from '@/components/Form';
import { Button, ErrorNote, SectionLabel } from '@/components/ui';
import { api, ApiError } from '@/api/client';
import { colors, spacing } from '@/theme';

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async () => {
    if (busy) return;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) { setError('กรอกอีเมลให้ถูกต้อง'); return; }
    setBusy(true); setError(null);
    try {
      await api('/auth/forgot-password', { method: 'POST', body: { email: email.trim().toLowerCase() } });
      setSent(true);
    } catch (err) {
      setError(err instanceof ApiError ? (err.status === 429 ? 'ขอลิงก์ถี่เกินไป รอสักครู่แล้วลองใหม่' : 'ระบบยังส่งอีเมลไม่ได้ ลองใหม่หรือติดต่อ hello@samnuan.co') : 'เชื่อมต่อไม่ได้ ตรวจสอบอินเทอร์เน็ตแล้วลองใหม่');
    } finally { setBusy(false); }
  };
  return <FormPage><View style={{ gap: spacing.md, marginTop: spacing.xl }}>
    <Text style={{ fontSize: 26, fontWeight: '700', color: colors.ink }}>ลืมรหัสผ่าน</Text>
    {sent ? <Text style={{ color: colors.text }}>ถ้าอีเมลนี้มีบัญชี เราจะส่งลิงก์ตั้งรหัสผ่านใหม่ให้ ตรวจกล่องจดหมายและโฟลเดอร์สแปม แล้วกลับมาเข้าสู่ระบบด้วยรหัสใหม่</Text> : <>
      <SectionLabel>อีเมลที่ใช้สมัคร</SectionLabel>
      <TextInput accessibilityLabel="อีเมล" autoCapitalize="none" keyboardType="email-address" autoComplete="email"
        value={email} onChangeText={setEmail} editable={!busy} onSubmitEditing={submit}
        style={{ padding: spacing.md, minHeight: 48, borderRadius: 10, backgroundColor: colors.surface, color: colors.text }} />
      <Button title="ส่งลิงก์ตั้งรหัสผ่านใหม่" onPress={submit} busy={busy} disabled={!email.trim()} />
    </>}
    {error && <ErrorNote message={error} />}
    <Button ghost title="กลับไปเข้าสู่ระบบ" onPress={() => router.replace('/(auth)/login')} disabled={busy} />
  </View></FormPage>;
}

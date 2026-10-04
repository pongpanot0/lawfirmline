import React, { useState } from 'react';
import { KeyboardAvoidingView, Linking, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Text, TextInput } from '@/components/AppText';
import { Eye, EyeOff } from 'lucide-react-native';
import { useAuth } from '@/api/auth';
import { useKeyboardHeight } from '@/hooks/useKeyboardHeight';
import { ApiError } from '@/api/client';
import { Button, Card, SectionLabel } from '@/components/ui';
import { colors, radius, spacing, TOUCH } from '@/theme';

export default function LoginScreen() {
  const { login, verifyMfa } = useAuth();
  const router = useRouter();
  const [mfaToken, setMfaToken] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const keyboardHeight = useKeyboardHeight();
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      if (mfaToken) await verifyMfa(mfaToken, code);
      else {
        const challenge = await login(email.trim(), password);
        if (challenge) setMfaToken(challenge.mfaToken);
      }
    } catch (err) {
      if (err instanceof ApiError) {
        // Surface the server's own reason — a generic message hides
        // fixable mistakes like a too-short password or a typo'd email.
        setError(
          err.status === 401
            ? (mfaToken ? 'รหัสยืนยันไม่ถูกต้องหรือหมดอายุ กลับไปเข้าสู่ระบบแล้วขอรหัสใหม่' : 'อีเมลหรือรหัสผ่านไม่ถูกต้อง')
            : `เข้าสู่ระบบไม่สำเร็จ: ${err.message}`,
        );
      } else {
        setError('เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ ตรวจสอบอินเทอร์เน็ตแล้วลองใหม่');
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={[styles.screen, keyboardHeight > 0 && { paddingBottom: keyboardHeight }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
      <Card style={styles.form}>
        <Text style={styles.brand}>Samnuan</Text>
        <Text style={styles.subtitle}>ระบบบริหารสำนักงานกฎหมาย</Text>

        {mfaToken ? <>
          <Text style={styles.subtitle}>กรอกรหัสยืนยันที่ส่งไปยังอีเมลของคุณ</Text>
          <TextInput style={styles.input} accessibilityLabel="รหัสยืนยัน" placeholder="รหัสยืนยัน 6 หลัก"
            keyboardType="number-pad" autoComplete="one-time-code" maxLength={6} value={code}
            onChangeText={(value) => setCode(value.replace(/\D/g, ''))} onSubmitEditing={submit} />
          <Button ghost title="กลับไปเข้าสู่ระบบ" onPress={() => { setMfaToken(null); setCode(''); setError(null); }} disabled={busy} />
        </> : <>
        <SectionLabel style={{ marginTop: 0, marginBottom: 0 }}>อีเมล</SectionLabel>
        <TextInput
          accessibilityLabel="อีเมล"
          style={styles.input}
          placeholder="อีเมล"
          placeholderTextColor={colors.faint}
          autoCapitalize="none"
          keyboardType="email-address"
          autoComplete="email"
          value={email}
          onChangeText={setEmail}
        />
        <SectionLabel style={{ marginTop: 0, marginBottom: 0 }}>รหัสผ่าน</SectionLabel>
        <View style={styles.passwordRow}>
          <TextInput
            accessibilityLabel="รหัสผ่าน"
            style={[styles.input, styles.passwordInput]}
            placeholder="รหัสผ่าน"
            placeholderTextColor={colors.faint}
            secureTextEntry={!showPassword}
            autoCapitalize="none"
            autoComplete="password"
            value={password}
            onChangeText={setPassword}
            onSubmitEditing={submit}
          />
          <Pressable
            accessibilityRole="button" accessibilityLabel={showPassword ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน'}
            style={styles.eyeButton}
            hitSlop={8}
            onPress={() => setShowPassword((visible) => !visible)}
          >
            {showPassword ? (
              <EyeOff size={20} color={colors.faint} />
            ) : (
              <Eye size={20} color={colors.faint} />
            )}
          </Pressable>
        </View>
        </>}
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Button title={mfaToken ? 'ยืนยันรหัส' : 'เข้าสู่ระบบ'} onPress={submit} busy={busy}
          disabled={mfaToken ? code.length !== 6 : !email || !password} />
        {!mfaToken && <>
          <Pressable accessibilityRole="button" onPress={() => router.push('/(auth)/register')} disabled={busy}
            style={{ minHeight: TOUCH, justifyContent: 'center' }}>
            <Text style={{ color: colors.info, textAlign: 'center' }}>ยังไม่มีบัญชี · สมัครใช้งาน</Text>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={() => router.push('/(auth)/forgot-password')} disabled={busy}
            style={{ minHeight: TOUCH, justifyContent: 'center' }}>
            <Text style={{ color: colors.muted, textAlign: 'center' }}>ลืมรหัสผ่าน</Text>
          </Pressable>
          <Pressable accessibilityRole="link" onPress={() => Linking.openURL('https://samnuan.com/privacy')}
            style={{ minHeight: TOUCH, justifyContent: 'center' }}>
            <Text style={{ color: colors.muted, textAlign: 'center', fontSize: 12 }}>นโยบายความเป็นส่วนตัว</Text>
          </Pressable>
        </>}
      </Card>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  content: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: spacing.xl,
  },
  form: { width: '100%', maxWidth: 480, alignSelf: 'center', gap: spacing.md, padding: spacing.xl },
  brand: {
    color: colors.ink,
    fontSize: 36,
    fontWeight: '700',
    textAlign: 'center',
  },
  subtitle: {
    color: colors.muted,
    textAlign: 'center',
    marginBottom: spacing.lg,
    fontSize: 14,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    borderRadius: radius.button,
    paddingHorizontal: spacing.lg,
    paddingVertical: 14,
    fontSize: 16,
    color: colors.text,
  },
  passwordRow: { position: 'relative', justifyContent: 'center' },
  passwordInput: { paddingRight: TOUCH + 4 },
  eyeButton: {
    position: 'absolute',
    right: 4,
    top: 0,
    bottom: 0,
    width: TOUCH,
    alignItems: 'center',
    justifyContent: 'center',
  },
  error: { color: colors.warn, fontSize: 13, textAlign: 'center' },
});

import React, { useRef, useState } from 'react';
import { KeyboardAvoidingView, Linking, Platform, Pressable, ScrollView, StyleSheet, TextInput as NativeTextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Text, TextInput } from '@/components/AppText';
import { Eye, EyeOff } from 'lucide-react-native';
import { useAuth } from '@/api/auth';
import { useKeyboardHeight } from '@/hooks/useKeyboardHeight';
import { ApiError } from '@/api/client';
import { Button, Card, InlineError } from '@/components/ui';
import { FieldLabel } from '@/components/Form';
import { fieldFrame, TextField } from '@/components/Input';
import { colors, fonts, shadow, spacing, TOUCH } from '@/theme';

export default function LoginScreen() {
  const { login, verifyMfa } = useAuth();
  const router = useRouter();
  const [mfaToken, setMfaToken] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [passwordFocused, setPasswordFocused] = useState(false);
  const [busy, setBusy] = useState(false);
  const keyboardHeight = useKeyboardHeight();
  const [error, setError] = useState<string | null>(null);
  const passwordRef = useRef<NativeTextInput>(null);

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
        <Text accessibilityRole="header" style={styles.brand}>Samnuan</Text>
        {/* One subtitle per step: the MFA step replaces the product line with its instruction. */}
        <Text style={styles.subtitle}>{mfaToken ? 'กรอกรหัสยืนยันที่ส่งไปยังอีเมลของคุณ' : 'ระบบบริหารสำนักงานกฎหมาย'}</Text>

        {mfaToken ? <TextField label="รหัสยืนยัน 6 หลัก" accessibilityLabel="รหัสยืนยัน 6 หลัก" placeholder="000000"
            keyboardType="number-pad" autoComplete="one-time-code" textContentType="oneTimeCode" maxLength={6} value={code} autoFocus
            onChange={(value) => setCode(value.replace(/\D/g, ''))} onSubmitEditing={submit} inputStyle={styles.codeInput} />
        : <>
        <TextField
            label="อีเมล"
            accessibilityLabel="อีเมล"
            placeholder="name@firm.co.th"
            autoCapitalize="none"
            keyboardType="email-address"
            autoComplete="email"
            textContentType="emailAddress"
            returnKeyType="next"
            blurOnSubmit={false}
            onSubmitEditing={() => passwordRef.current?.focus()}
            value={email}
            onChange={setEmail}
          />
        <View style={styles.field}>
          <FieldLabel>รหัสผ่าน</FieldLabel>
          <View style={styles.passwordRow}>
            <TextInput
              ref={passwordRef}
              accessibilityLabel="รหัสผ่าน"
              onFocus={() => setPasswordFocused(true)}
              onBlur={() => setPasswordFocused(false)}
              style={[fieldFrame({ focused: passwordFocused }), styles.passwordInput]}
              secureTextEntry={!showPassword}
              autoCapitalize="none"
              autoComplete="password"
              textContentType="password"
              returnKeyType="go"
              value={password}
              onChangeText={setPassword}
              onSubmitEditing={submit}
            />
            <Pressable
              accessibilityRole="button" accessibilityLabel={showPassword ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน'}
              style={styles.eyeButton}
              onPress={() => setShowPassword((visible) => !visible)}
            >
              {showPassword ? (
                <EyeOff size={20} color={colors.muted} />
              ) : (
                <Eye size={20} color={colors.muted} />
              )}
            </Pressable>
          </View>
        </View>
        </>}
        <InlineError message={error ?? undefined} />
        <Button title={mfaToken ? 'ยืนยันรหัส' : 'เข้าสู่ระบบ'} onPress={submit} busy={busy}
          disabled={mfaToken ? code.length !== 6 : !email || !password} />
        {mfaToken ? <View style={{ alignItems: 'center' }}>
          <Button variant="link" title="กลับไปเข้าสู่ระบบ" onPress={() => { setMfaToken(null); setCode(''); setError(null); }} disabled={busy} />
        </View> : <>
          <Pressable accessibilityRole="button" disabled={busy}
            onPress={() => router.push({ pathname: '/(auth)/forgot-password', params: email.trim() ? { email: email.trim() } : {} })}
            style={({ pressed }) => [styles.link, pressed && { opacity: 0.6 }]}>
            <Text style={{ color: colors.info, textAlign: 'center' }}>ลืมรหัสผ่าน</Text>
          </Pressable>
          <View style={styles.footer}>
            <Pressable accessibilityRole="button" onPress={() => router.push('/(auth)/register')} disabled={busy}
              style={({ pressed }) => [styles.link, pressed && { opacity: 0.6 }]}>
              <Text style={{ color: colors.info, textAlign: 'center' }}>เจ้าของสำนักงาน · สร้างสำนักงานใหม่</Text>
            </Pressable>
            <Pressable accessibilityRole="link" onPress={() => Linking.openURL('https://samnuan.com/privacy')}
              style={({ pressed }) => [styles.link, pressed && { opacity: 0.6 }]}>
              <Text style={{ color: colors.muted, textAlign: 'center', fontSize: 13 }}>นโยบายความเป็นส่วนตัว</Text>
            </Pressable>
          </View>
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
  // The sign-in card is the one surface on this screen, so it lifts a step above resting cards.
  form: { width: '100%', maxWidth: 480, alignSelf: 'center', gap: spacing.lg, padding: spacing.xl, ...shadow.md },
  brand: {
    color: colors.ink,
    fontSize: 36,
    lineHeight: 48,
    fontFamily: fonts.bold,
    textAlign: 'center',
  },
  subtitle: {
    color: colors.muted,
    textAlign: 'center',
    marginTop: -spacing.sm,
    marginBottom: spacing.xs,
    fontSize: 15,
    lineHeight: 24,
  },
  field: { gap: spacing.sm },
  codeInput: { fontSize: 22, letterSpacing: 6, textAlign: 'center', fontVariant: ['tabular-nums'] },
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
  link: { minHeight: TOUCH, justifyContent: 'center' },
  footer: { borderTopWidth: 1, borderTopColor: colors.divider, marginTop: spacing.xs, paddingTop: spacing.xs },
});

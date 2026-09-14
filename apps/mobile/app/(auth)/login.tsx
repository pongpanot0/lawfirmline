import React, { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Eye, EyeOff } from 'lucide-react-native';
import { useAuth } from '@/api/auth';
import { useKeyboardHeight } from '@/hooks/useKeyboardHeight';
import { ApiError } from '@/api/client';
import { Button } from '@/components/ui';
import { colors, radius, spacing, TOUCH } from '@/theme';

export default function LoginScreen() {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const keyboardHeight = useKeyboardHeight();
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await login(email.trim(), password);
    } catch (err) {
      if (err instanceof ApiError) {
        // Surface the server's own reason — a generic message hides
        // fixable mistakes like a too-short password or a typo'd email.
        setError(
          err.status === 401
            ? 'อีเมลหรือรหัสผ่านไม่ถูกต้อง'
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
      <View style={styles.form}>
        <Text style={styles.brand}>LexFlow</Text>
        <Text style={styles.subtitle}>ระบบบริหารสำนักงานกฎหมาย</Text>

        <TextInput
          style={styles.input}
          placeholder="อีเมล"
          placeholderTextColor={colors.faint}
          autoCapitalize="none"
          keyboardType="email-address"
          autoComplete="email"
          value={email}
          onChangeText={setEmail}
        />
        <View style={styles.passwordRow}>
          <TextInput
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
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Button title="เข้าสู่ระบบ" onPress={submit} busy={busy} disabled={!email || !password} />
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.ink,
    justifyContent: 'center',
    padding: spacing.xl,
  },
  form: { gap: spacing.md },
  brand: {
    color: colors.accentSoft,
    fontSize: 36,
    fontWeight: '700',
    textAlign: 'center',
  },
  subtitle: {
    color: '#93A0B5',
    textAlign: 'center',
    marginBottom: spacing.lg,
    fontSize: 14,
  },
  input: {
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
  error: { color: '#E07A63', fontSize: 13, textAlign: 'center' },
});

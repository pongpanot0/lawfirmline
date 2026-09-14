import React, { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useAuth } from '@/api/auth';
import { ApiError } from '@/api/client';
import { Button } from '@/components/ui';
import { colors, radius, spacing } from '@/theme';

export default function LoginScreen() {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await login(email.trim(), password);
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 401
          ? 'อีเมลหรือรหัสผ่านไม่ถูกต้อง'
          : 'เข้าสู่ระบบไม่สำเร็จ ตรวจสอบการเชื่อมต่อแล้วลองใหม่',
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
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
        <TextInput
          style={styles.input}
          placeholder="รหัสผ่าน"
          placeholderTextColor={colors.faint}
          secureTextEntry
          value={password}
          onChangeText={setPassword}
          onSubmitEditing={submit}
        />
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
  error: { color: '#E07A63', fontSize: 13, textAlign: 'center' },
});

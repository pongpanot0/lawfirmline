import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Pressable, StyleSheet, Text, View } from 'react-native';
import * as LocalAuthentication from 'expo-local-authentication';
import { Lock } from 'lucide-react-native';
import { useAuth } from '@/api/auth';
import { colors, spacing } from '@/theme';

/** Re-lock after this long in the background — a pocketed phone at court. */
const RELOCK_AFTER_MS = 60 * 1000;

/**
 * Biometric/passcode gate over the whole app. Devices without any enrolled
 * security skip the gate — the OS cannot challenge what does not exist.
 */
export function LockGate({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [locked, setLocked] = useState(true);
  const [supported, setSupported] = useState<boolean | null>(null);
  const backgroundedAt = useRef<number | null>(null);

  const challenge = useCallback(async () => {
    try {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: 'ปลดล็อก LexFlow',
        cancelLabel: 'ยกเลิก',
      });
      if (result.success) setLocked(false);
    } catch {
      // stay locked; the button lets the user retry
    }
  }, []);

  useEffect(() => {
    (async () => {
      const level = await LocalAuthentication.getEnrolledLevelAsync();
      const hasSecurity = level !== LocalAuthentication.SecurityLevel.NONE;
      setSupported(hasSecurity);
      if (!hasSecurity) setLocked(false);
      else await challenge();
    })();
  }, [challenge]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (!supported) return;
      if (state === 'background') backgroundedAt.current = Date.now();
      if (state === 'active' && backgroundedAt.current) {
        if (Date.now() - backgroundedAt.current > RELOCK_AFTER_MS) {
          setLocked(true);
          challenge();
        }
        backgroundedAt.current = null;
      }
    });
    return () => sub.remove();
  }, [supported, challenge]);

  // No session yet — the login screen is its own gate.
  if (!user || !locked || supported === false) return <>{children}</>;

  return (
    <View style={styles.screen}>
      <Lock color={colors.accentSoft} size={40} />
      <Text style={styles.title}>LexFlow ถูกล็อกไว้</Text>
      <Pressable style={styles.button} onPress={challenge}>
        <Text style={styles.buttonText}>ปลดล็อก</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.lg,
  },
  title: { color: colors.bg, fontSize: 18, fontWeight: '700' },
  button: {
    backgroundColor: colors.accent,
    borderRadius: 10,
    paddingHorizontal: 32,
    paddingVertical: 13,
  },
  buttonText: { color: colors.ink, fontWeight: '700', fontSize: 15 },
});

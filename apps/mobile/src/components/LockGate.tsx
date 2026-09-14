import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Pressable, StyleSheet, Text, View } from 'react-native';
import * as LocalAuthentication from 'expo-local-authentication';
import { Lock } from 'lucide-react-native';
import { useAuth } from '@/api/auth';
import { colors, spacing } from '@/theme';

/** Re-lock after this long in the background — a pocketed phone at court. */
const RELOCK_AFTER_MS = 60 * 1000;

/**
 * Biometric/passcode gate. It challenges in exactly two situations:
 * a cold start that RESTORED a stored session (someone else may hold the
 * phone), and returning from >1 minute in the background while signed in.
 * A session created by typing the password just now is never re-challenged,
 * and no prompt ever appears before login. Devices without enrolled
 * security skip the gate — the OS cannot challenge what does not exist.
 */
export function LockGate({ children }: { children: React.ReactNode }) {
  const { user, restored } = useAuth();
  const [locked, setLocked] = useState(false);
  const backgroundedAt = useRef<number | null>(null);
  const challengedRestore = useRef(false);
  const challenging = useRef(false);

  const challenge = useCallback(async () => {
    if (challenging.current) return;
    challenging.current = true;
    try {
      const level = await LocalAuthentication.getEnrolledLevelAsync();
      if (level === LocalAuthentication.SecurityLevel.NONE) {
        setLocked(false);
        return;
      }
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: 'ปลดล็อก LexFlow',
        cancelLabel: 'ยกเลิก',
      });
      if (result.success) setLocked(false);
    } catch {
      // stay locked; the button lets the user retry
    } finally {
      challenging.current = false;
    }
  }, []);

  // Cold start with a restored session: lock once and challenge.
  useEffect(() => {
    if (user && restored && !challengedRestore.current) {
      challengedRestore.current = true;
      setLocked(true);
      challenge();
    }
    if (!user) {
      setLocked(false);
      challengedRestore.current = false;
    }
  }, [user, restored, challenge]);

  // Re-lock after a long stay in the background, only while signed in.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (!user) return;
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
  }, [user, challenge]);

  if (!user || !locked) return <>{children}</>;

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

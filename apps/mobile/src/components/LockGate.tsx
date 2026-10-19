import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, StyleSheet, View } from 'react-native';
import { Text } from '@/components/AppText';
import * as LocalAuthentication from 'expo-local-authentication';
import { LockKeyhole } from 'lucide-react-native';
import { useAuth } from '@/api/auth';
import { Button } from './Button';
import { InlineError } from './States';
import { colors, radius, shadow, spacing, typeScale } from '@/theme';

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
  const { user, restored, logout } = useAuth();
  const [locked, setLocked] = useState(false);
  const [failed, setFailed] = useState(false);
  const backgroundedAt = useRef<number | null>(null);
  const challengedRestore = useRef(false);
  const challenging = useRef(false);

  const challenge = useCallback(async () => {
    if (challenging.current) return;
    challenging.current = true;
    setFailed(false);
    try {
      const level = await LocalAuthentication.getEnrolledLevelAsync();
      if (level === LocalAuthentication.SecurityLevel.NONE) {
        setLocked(false);
        return;
      }
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: 'ปลดล็อก Samnuan',
        cancelLabel: 'ยกเลิก',
      });
      if (result.success) setLocked(false);
      else setFailed(true);
    } catch {
      // stay locked; the button lets the user retry
      setFailed(true);
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
      <View style={styles.body}>
        <View style={styles.iconTile}><LockKeyhole color={colors.ink} size={30} /></View>
        <Text accessibilityRole="header" style={styles.title}>Samnuan ถูกล็อกไว้</Text>
        <Text style={styles.detail}>ยืนยันตัวตนด้วยสแกนหรือรหัสเครื่องเพื่อกลับไปทำงานต่อ</Text>
        {failed && <InlineError style={styles.failed} message="ยืนยันตัวตนไม่สำเร็จ · แตะปลดล็อกเพื่อลองใหม่" />}
        <View style={styles.actions}>
          <Button title="ปลดล็อก" onPress={challenge} />
          <View style={{ alignItems: 'center' }}><Button title="ออกจากระบบและเข้าสู่ระบบใหม่" variant="link" onPress={logout} /></View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  body: { width: '100%', maxWidth: 360, alignItems: 'center', gap: spacing.md },
  iconTile: { width: 64, height: 64, borderRadius: radius.xl, backgroundColor: colors.raised, borderWidth: 1, borderColor: colors.line,
    alignItems: 'center', justifyContent: 'center', marginBottom: spacing.xs, ...shadow.sm },
  title: { ...typeScale.display, color: colors.ink, textAlign: 'center' },
  detail: { color: colors.muted, fontSize: 15, lineHeight: 24, textAlign: 'center' },
  failed: { alignSelf: 'stretch' },
  actions: { alignSelf: 'stretch', gap: spacing.xs, marginTop: spacing.sm, alignItems: 'stretch' },
});

import React, { useCallback } from 'react';
import { Pressable, StatusBar, StyleSheet, View, type StatusBarProps, type StyleProp, type ViewStyle } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Plus } from 'lucide-react-native';
import { Text } from '@/components/AppText';
import { CHROME_MAX_SCALE, colors, pageContent, radius, shadow, spacing, typeScale } from '@/theme';

/** How far the first card under a masthead rides up onto the navy. */
export const LIFT = 40;

/** Light status-bar text while a navy-topped screen is focused; the stack entry pops on blur, so other screens keep dark. */
export function useLightStatusBar() {
  useFocusEffect(useCallback(() => {
    const entry = StatusBar.pushStackEntry({ barStyle: 'light-content' } as StatusBarProps);
    return () => StatusBar.popStackEntry(entry);
  }, []));
}

/**
 * The navy band at the top of a screen (palette A). It bleeds past the page padding, so it must be the first child
 * inside a `pageContent` container. Put a `liftedCard` straight after it to ride up onto the band.
 * `safeTop` is for screens with no native header: the band then runs under the status bar.
 */
export function Masthead({ title, subtitle, actions, children, safeTop = false, style }: {
  title?: string;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  children?: React.ReactNode;
  safeTop?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const insets = useSafeAreaInsets();
  useLightStatusBar();
  return <View style={[styles.band, { paddingTop: (safeTop ? insets.top : 0) + spacing.lg }, style]}>
    {title || actions ? <View style={styles.head}>
      {title ? <View style={{ flex: 1, minWidth: 0 }}>
        <Text accessibilityRole="header" style={styles.title}>{title}</Text>
        {typeof subtitle === 'string' ? <Text style={styles.subtitle}>{subtitle}</Text> : subtitle}
      </View> : <View style={{ flex: 1 }} />}
      {actions ? <View style={styles.actions}>{actions}</View> : null}
    </View> : null}
    {children}
  </View>;
}

export const mastheadStyles = StyleSheet.create({
  /** 44pt round button on the navy band. */
  roundButton: { width: 44, height: 44, borderRadius: radius.full, backgroundColor: colors.inkRaised, alignItems: 'center', justifyContent: 'center' },
  /** Text sitting on the band. */
  onInk: { color: colors.onInk },
  onInkMuted: { ...typeScale.meta, color: colors.onInkMuted },
  /** The screen's one create action: a marigold pill on the band. */
  pill: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: spacing.xs, paddingHorizontal: spacing.lg, borderRadius: radius.full, backgroundColor: colors.accent },
  pillText: { color: colors.ink, fontWeight: '700', fontSize: 15 },
});

/** Marigold "+ label" pill for the masthead's actions slot. */
export function MastheadPill({ label, a11y, onPress }: { label: string; a11y?: string; onPress: () => void }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={a11y ?? label} onPress={onPress}
    style={({ pressed }) => [mastheadStyles.pill, pressed && { opacity: 0.85 }]}>
    <Plus size={18} color={colors.ink} strokeWidth={2.4} />
    <Text maxFontSizeMultiplier={CHROME_MAX_SCALE} style={mastheadStyles.pillText}>{label}</Text>
  </Pressable>;
}

/** The one card per screen that carries the strong shadow and overlaps the masthead. */
export const liftedCard: ViewStyle = { marginTop: -LIFT, borderRadius: radius.xl, ...shadow.lg };

const styles = StyleSheet.create({
  band: {
    backgroundColor: colors.ink,
    marginHorizontal: -pageContent.paddingHorizontal,
    marginTop: -pageContent.paddingTop,
    paddingHorizontal: spacing.xl,
    paddingBottom: LIFT + spacing.lg,
    gap: spacing.sm,
  },
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  title: { fontSize: 32, lineHeight: 44, fontFamily: 'Anuphan_700Bold', color: colors.onInk },
  subtitle: { ...typeScale.body, color: colors.onInkMuted, marginTop: 2 },
  actions: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center' },
});

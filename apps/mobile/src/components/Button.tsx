import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet } from 'react-native';
import { Text } from '@/components/AppText';
import { colors, radius, shadow, spacing } from '@/theme';

export type ButtonVariant = 'primary' | 'secondary' | 'link' | 'danger';

/**
 * One primary per screen. `secondary` is the bordered quiet action (the old `ghost`, which still works),
 * `link` is for navigation and optional paths, `danger` for reject/delete. `inline` sizes the button to
 * its label instead of the full width; links are always inline.
 * Depth: primary is filled navy on a soft shadow; secondary sits flat on a strong outline; links carry no frame.
 */
export function Button({
  title,
  onPress,
  ghost,
  variant,
  inline = false,
  disabled,
  busy,
  accessibilityHint,
}: {
  title: string;
  onPress: () => void;
  /** Legacy alias for `variant="secondary"`. */
  ghost?: boolean;
  variant?: ButtonVariant;
  inline?: boolean;
  disabled?: boolean;
  busy?: boolean;
  accessibilityHint?: string;
}) {
  const kind: ButtonVariant = variant ?? (ghost ? 'secondary' : 'primary');
  const fg = kind === 'primary' ? colors.bg : kind === 'danger' ? colors.warn : kind === 'link' ? colors.info : colors.ink;
  const off = !!(disabled || busy);
  return (
    <Pressable
      accessibilityRole={kind === 'link' ? 'link' : 'button'}
      accessibilityLabel={title}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: off, busy: !!busy }}
      onPress={onPress}
      disabled={off}
      style={({ pressed }) => [
        styles.button,
        kind === 'primary' && !off && shadow.sm,
        kind === 'secondary' && styles.buttonSecondary,
        kind === 'danger' && styles.buttonDanger,
        kind === 'link' && styles.buttonLink,
        (inline || kind === 'link') && styles.buttonInline,
        kind === 'link' && { paddingHorizontal: spacing.xs },
        off && { opacity: 0.5 },
        pressed && (kind === 'link' ? { opacity: 0.6 }
          : kind === 'primary' ? { backgroundColor: colors.inkPressed, ...shadow.none }
          : kind === 'danger' ? { backgroundColor: colors.warnSoft } : { backgroundColor: colors.soft }),
      ]}
    >
      {busy ? (
        <ActivityIndicator color={fg} />
      ) : (
        <Text style={[styles.buttonText, { color: fg }, kind === 'link' && styles.linkText]}>{title}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    backgroundColor: colors.ink,
    borderRadius: radius.button,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  buttonSecondary: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.lineStrong },
  buttonDanger: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.warn },
  buttonLink: { backgroundColor: 'transparent', paddingVertical: spacing.sm, alignItems: 'flex-start' },
  buttonInline: { alignSelf: 'flex-start', paddingHorizontal: spacing.lg, minHeight: 44 },
  buttonText: { color: colors.bg, fontWeight: '600', fontSize: 15, textAlign: 'center' },
  linkText: { textAlign: 'left' },
});

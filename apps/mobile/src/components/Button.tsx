import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { ChevronRight, LucideIcon } from 'lucide-react-native';
import { Text } from '@/components/AppText';
import { colors, radius, shadow, spacing } from '@/theme';

export type ButtonVariant = 'primary' | 'secondary' | 'tonal' | 'link' | 'danger';

/**
 * One primary per screen. `secondary` is the bordered quiet action (the old `ghost`, which still works),
 * `tonal` a soft filled secondary (empty-state next steps), `link` is for navigation and optional paths,
 * `danger` for reject/delete. `inline` sizes the button to its label instead of the full width; links are
 * always inline. `icon` draws a leading lucide icon in the label colour; `chevron` adds a trailing one to links.
 * Depth: primary is filled navy on a soft shadow; secondary sits flat on a 1.5pt navy outline; links carry no frame.
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
  icon: Icon,
  chevron = false,
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
  icon?: LucideIcon;
  /** Links only: a trailing chevron that says "this goes somewhere". */
  chevron?: boolean;
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
        kind === 'tonal' && styles.buttonTonal,
        kind === 'danger' && styles.buttonDanger,
        kind === 'link' && styles.buttonLink,
        (inline || kind === 'link') && styles.buttonInline,
        kind === 'link' && { paddingHorizontal: spacing.xs },
        off && { opacity: 0.5 },
        pressed && (kind === 'link' ? { opacity: 0.6 }
          : kind === 'primary' ? { backgroundColor: colors.inkPressed, ...shadow.none }
          : kind === 'danger' ? { backgroundColor: colors.warnSoft }
          : kind === 'tonal' ? { backgroundColor: colors.sunken } : { backgroundColor: colors.soft }),
      ]}
    >
      {busy ? (
        <ActivityIndicator color={fg} />
      ) : (
        <View style={[styles.content, kind === 'link' && styles.contentLink]}>
          {Icon ? <Icon size={18} color={fg} /> : null}
          <Text style={[styles.buttonText, { color: fg }, kind === 'link' && styles.linkText]}>{title}</Text>
          {chevron && kind === 'link' ? <ChevronRight size={16} color={fg} /> : null}
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    backgroundColor: colors.ink,
    borderRadius: radius.action,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  // 1.5pt outline; padding drops by the extra half point so heights match the primary.
  buttonSecondary: { backgroundColor: 'transparent', borderWidth: 1.5, borderColor: colors.ink, paddingVertical: spacing.md - 1.5 },
  buttonTonal: { backgroundColor: colors.soft, borderWidth: 1, borderColor: colors.line, paddingVertical: spacing.md - 1 },
  buttonDanger: { backgroundColor: colors.surface, borderWidth: 1.5, borderColor: colors.warn, paddingVertical: spacing.md - 1.5 },
  buttonLink: { backgroundColor: 'transparent', paddingVertical: spacing.sm, alignItems: 'flex-start' },
  buttonInline: { alignSelf: 'flex-start', paddingHorizontal: spacing.lg, minHeight: 44 },
  content: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, maxWidth: '100%' },
  contentLink: { justifyContent: 'flex-start', gap: spacing.xs },
  buttonText: { color: colors.bg, fontWeight: '600', fontSize: 15, textAlign: 'center', flexShrink: 1 },
  linkText: { textAlign: 'left' },
});

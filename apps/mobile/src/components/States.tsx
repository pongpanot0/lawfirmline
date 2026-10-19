import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View, ViewStyle } from 'react-native';
import { AlertCircle, AlertTriangle, Inbox, LucideIcon, RotateCw } from 'lucide-react-native';
import { Text } from '@/components/AppText';
import { Button } from './Button';
import { CHROME_MAX_SCALE, colors, fonts, iconTile, radius, spacing, typeScale } from '@/theme';

/**
 * Loading, error and empty states for every screen. One vocabulary:
 * - InlineError: a field or one section failed. `variant="field"` is the bare icon + message line under an
 *   input; the default is a small warning-tinted notice (optional retry link).
 * - ErrorState: a whole screen/section could not load (warning-tinted card, title row with an outlined retry pill).
 * - LoadingState: centred spinner with a visible, announced Thai label; `inline` for inside a list or card.
 * - EmptyState: names what is missing and, when there is one, offers the next step.
 */

/** Compact problem line. Announced; the optional retry is a 44pt target beside the message. */
export function InlineError({ message, onRetry, retryLabel = 'ลองใหม่', style, variant = 'notice' }: {
  message?: string; onRetry?: () => void; retryLabel?: string; style?: ViewStyle;
  /** `field`: no box, sits directly under an input. */
  variant?: 'notice' | 'field';
}) {
  if (!message) return null;
  const field = variant === 'field';
  return <View accessibilityRole="alert" accessibilityLiveRegion="polite" style={[field ? styles.fieldError : styles.inline, style]}>
    <AlertCircle size={field ? 14 : 16} color={colors.warn} style={field ? styles.fieldErrorIcon : styles.inlineIcon} />
    <Text style={field ? styles.fieldErrorText : styles.inlineText}>{message}</Text>
    {onRetry ? <Pressable accessibilityRole="button" accessibilityLabel={`${retryLabel} · ${message}`} onPress={onRetry}
      hitSlop={{ top: 11, bottom: 11, left: 8, right: 8 }}
      style={({ pressed }) => [styles.inlineRetry, pressed && { opacity: 0.6 }]}>
      <Text style={styles.inlineRetryText}>{retryLabel}</Text>
    </Pressable> : null}
  </View>;
}

/**
 * A failed load says so (never "ไม่มี…") and is announced. The first row carries the warning icon, the
 * bold title (or the message, when there is no title) and a compact outlined retry pill; detail sits below.
 */
export function ErrorState({ title, message, onRetry, retryLabel = 'ลองใหม่', style }: {
  title?: string; message: string; onRetry?: () => void; retryLabel?: string; style?: ViewStyle;
}) {
  return <View accessibilityRole="alert" accessibilityLiveRegion="polite" style={[styles.errorCard, style]}>
    <View style={styles.errorHead}>
      <AlertTriangle size={20} color={colors.warn} style={styles.errorIcon} />
      <Text accessibilityRole={title ? 'header' : undefined} style={styles.errorTitle}>{title ?? message}</Text>
      {onRetry ? <Pressable accessibilityRole="button" accessibilityLabel={retryLabel} accessibilityHint={message} onPress={onRetry}
        hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
        style={({ pressed }) => [styles.retryPill, pressed && { backgroundColor: colors.warnEdge }]}>
        <RotateCw size={14} color={colors.warn} />
        <Text maxFontSizeMultiplier={CHROME_MAX_SCALE} style={styles.retryText}>{retryLabel}</Text>
      </Pressable> : null}
    </View>
    {title ? <Text style={styles.errorDetail}>{message}</Text> : null}
  </View>;
}

/** Spinner with a visible, announced label, so a wait never reads as a blank screen. */
export function LoadingState({ label = 'กำลังโหลด…', inline = false }: { label?: string; inline?: boolean }) {
  return <View style={inline ? styles.loadingInline : styles.loading} accessible accessibilityRole="progressbar"
    accessibilityLabel={label} accessibilityLiveRegion="polite">
    <ActivityIndicator size={inline ? 'small' : 'large'} color={colors.ink} />
    <Text style={inline ? styles.loadingInlineText : styles.loadingText}>{label}</Text>
  </View>;
}

/**
 * Empty list or section. `compact` is the one-line form used inside cards and lists;
 * the default adds a round sunken icon tile above the message and a tonal action for whole-screen empties.
 */
export function EmptyState({ children, title, action, icon: Icon = Inbox, compact = false }: {
  children?: React.ReactNode; title?: string; action?: { title: string; onPress: () => void };
  icon?: LucideIcon; compact?: boolean;
}) {
  return <View style={compact ? styles.emptyCompact : styles.empty}>
    {!compact ? <View style={styles.emptyIcon}><Icon size={24} color={colors.ink} strokeWidth={1.75} /></View> : null}
    {title ? <Text accessibilityRole="header" style={styles.emptyTitle}>{title}</Text> : null}
    {children ? <Text style={styles.emptyText}>{children}</Text> : null}
    {action ? <View style={[{ alignItems: 'center' }, !compact && { marginTop: spacing.sm }]}>
      <Button title={action.title} variant={compact ? 'link' : 'tonal'} inline={!compact} onPress={action.onPress} />
    </View> : null}
  </View>;
}

const styles = StyleSheet.create({
  inline: { flexDirection: 'row', alignItems: 'flex-start', flexWrap: 'wrap', gap: spacing.sm, paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md, borderRadius: radius.md, backgroundColor: colors.warnSoft, borderWidth: 1, borderColor: colors.warnEdge },
  inlineIcon: { marginTop: 3 },
  inlineText: { flex: 1, minWidth: 160, color: colors.warn, fontSize: 14, lineHeight: 22 },
  inlineRetry: { minHeight: 22, justifyContent: 'center' },
  inlineRetryText: { color: colors.ink, fontWeight: '700', fontSize: 14, lineHeight: 22 },
  fieldError: { flexDirection: 'row', alignItems: 'flex-start', flexWrap: 'wrap', gap: 6 },
  fieldErrorIcon: { marginTop: 3 },
  fieldErrorText: { flex: 1, minWidth: 160, color: colors.warn, fontSize: 13, lineHeight: 20, fontWeight: '600' },
  errorCard: { backgroundColor: colors.warnSoft, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.warnEdge,
    padding: spacing.lg, gap: spacing.sm },
  errorHead: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  errorIcon: { marginTop: 4 },
  errorTitle: { flex: 1, minWidth: 0, fontFamily: fonts.bold, fontSize: 16, lineHeight: 26, color: colors.warn },
  errorDetail: { fontSize: 14, lineHeight: 22, color: colors.text, paddingLeft: 20 + spacing.sm },
  retryPill: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 32, paddingHorizontal: spacing.md,
    borderRadius: radius.full, borderWidth: 1, borderColor: colors.warn, backgroundColor: colors.raised, flexShrink: 0 },
  retryText: { color: colors.warn, fontWeight: '600', fontSize: 13, lineHeight: 18 },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md, padding: spacing.xl, minHeight: 160 },
  loadingText: { color: colors.muted, fontSize: 14 },
  loadingInline: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.md, paddingHorizontal: spacing.md,
    minHeight: 48, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.divider, backgroundColor: colors.raised },
  loadingInlineText: { color: colors.muted, fontSize: 14 },
  empty: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xxl, paddingHorizontal: spacing.lg },
  emptyCompact: { alignItems: 'center', gap: spacing.xs, paddingVertical: spacing.xl },
  emptyIcon: { width: iconTile.lg, height: iconTile.lg, borderRadius: radius.full, backgroundColor: colors.sunken,
    alignItems: 'center', justifyContent: 'center', marginBottom: spacing.xs },
  emptyTitle: { ...typeScale.section, color: colors.ink, textAlign: 'center' },
  emptyText: { color: colors.muted, fontSize: 14, lineHeight: 22, textAlign: 'center', maxWidth: 420 },
});

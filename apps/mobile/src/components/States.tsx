import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View, ViewStyle } from 'react-native';
import { AlertCircle, CloudOff, Inbox, LucideIcon } from 'lucide-react-native';
import { Text } from '@/components/AppText';
import { Button } from './Button';
import { colors, radius, shadow, spacing, typeScale } from '@/theme';

/**
 * Loading, error and empty states for every screen. One vocabulary:
 * - InlineError: a field or one section failed (red-tinted line, optional retry link).
 * - ErrorState: a whole screen/section could not load (card with icon and a retry button).
 * - LoadingState: centred spinner with a visible, announced Thai label; `inline` for inside a list or card.
 * - EmptyState: names what is missing and, when there is one, offers the next step.
 */

/** Compact, red-tinted problem line. Announced; the optional retry is a 44pt target beside the message. */
export function InlineError({ message, onRetry, retryLabel = 'ลองใหม่', style }: {
  message?: string; onRetry?: () => void; retryLabel?: string; style?: ViewStyle;
}) {
  if (!message) return null;
  return <View accessibilityRole="alert" accessibilityLiveRegion="polite" style={[styles.inline, style]}>
    <AlertCircle size={16} color={colors.warn} style={styles.inlineIcon} />
    <Text style={styles.inlineText}>{message}</Text>
    {onRetry ? <Pressable accessibilityRole="button" accessibilityLabel={`${retryLabel} · ${message}`} onPress={onRetry}
      hitSlop={{ top: 11, bottom: 11, left: 8, right: 8 }}
      style={({ pressed }) => [styles.inlineRetry, pressed && { opacity: 0.6 }]}>
      <Text style={styles.inlineRetryText}>{retryLabel}</Text>
    </Pressable> : null}
  </View>;
}

/** A failed load says so (never "ไม่มี…"), is announced, and puts the retry right under the message. */
export function ErrorState({ title, message, onRetry, retryLabel = 'ลองใหม่', style }: {
  title?: string; message: string; onRetry?: () => void; retryLabel?: string; style?: ViewStyle;
}) {
  return <View accessibilityRole="alert" accessibilityLiveRegion="polite" style={[styles.errorCard, style]}>
    <View style={styles.errorHead}>
      <View style={styles.errorIcon}><CloudOff size={20} color={colors.warn} /></View>
      <View style={styles.errorBody}>
        {title ? <Text accessibilityRole="header" style={styles.errorTitle}>{title}</Text> : null}
        <Text style={title ? styles.errorDetail : styles.errorMessage}>{message}</Text>
      </View>
    </View>
    {onRetry ? <View style={styles.errorAction}>
      <Button title={retryLabel} variant="secondary" inline onPress={onRetry} accessibilityHint={message} />
    </View> : null}
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
 * the default adds a quiet icon tile above the message for whole-screen empties.
 */
export function EmptyState({ children, title, action, icon: Icon = Inbox, compact = false }: {
  children?: React.ReactNode; title?: string; action?: { title: string; onPress: () => void };
  icon?: LucideIcon; compact?: boolean;
}) {
  return <View style={compact ? styles.emptyCompact : styles.empty}>
    {!compact ? <View style={styles.emptyIcon}><Icon size={22} color={colors.muted} /></View> : null}
    {title ? <Text accessibilityRole="header" style={styles.emptyTitle}>{title}</Text> : null}
    {children ? <Text style={styles.emptyText}>{children}</Text> : null}
    {action ? <View style={{ alignItems: 'center' }}><Button title={action.title} variant="link" onPress={action.onPress} /></View> : null}
  </View>;
}

const styles = StyleSheet.create({
  inline: { flexDirection: 'row', alignItems: 'flex-start', flexWrap: 'wrap', gap: spacing.sm, paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md, borderRadius: radius.md, backgroundColor: colors.warnSoft,
    borderLeftWidth: 3, borderLeftColor: colors.warn },
  inlineIcon: { marginTop: 3 },
  inlineText: { flex: 1, minWidth: 160, color: colors.warn, fontSize: 14, lineHeight: 22 },
  inlineRetry: { minHeight: 22, justifyContent: 'center' },
  inlineRetryText: { color: colors.ink, fontWeight: '700', fontSize: 14, lineHeight: 22 },
  errorCard: { backgroundColor: colors.surface, borderRadius: radius.card, borderWidth: 1, borderColor: colors.line,
    borderTopWidth: 3, borderTopColor: colors.warn, padding: spacing.lg, gap: spacing.md, ...shadow.sm },
  errorHead: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  errorIcon: { width: 40, height: 40, borderRadius: radius.full, backgroundColor: colors.warnSoft, alignItems: 'center', justifyContent: 'center' },
  errorBody: { flex: 1, minWidth: 0, gap: spacing.xs, paddingTop: spacing.xs },
  errorTitle: { ...typeScale.section, color: colors.ink },
  errorMessage: { fontSize: 15, lineHeight: 24, color: colors.ink, fontWeight: '600' },
  errorDetail: { fontSize: 14, lineHeight: 22, color: colors.muted },
  errorAction: { paddingLeft: 40 + spacing.md },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md, padding: spacing.xl, minHeight: 160 },
  loadingText: { color: colors.muted, fontSize: 14 },
  loadingInline: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.md, minHeight: 44 },
  loadingInlineText: { color: colors.muted, fontSize: 14 },
  empty: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xxl, paddingHorizontal: spacing.lg },
  emptyCompact: { alignItems: 'center', gap: spacing.xs, paddingVertical: spacing.xl },
  emptyIcon: { width: 48, height: 48, borderRadius: radius.lg, backgroundColor: colors.sunken, alignItems: 'center', justifyContent: 'center',
    marginBottom: spacing.xs },
  emptyTitle: { ...typeScale.section, color: colors.ink, textAlign: 'center' },
  emptyText: { color: colors.muted, fontSize: 14, lineHeight: 22, textAlign: 'center', maxWidth: 420 },
});

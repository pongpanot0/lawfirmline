import React, { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { ChevronDown, ChevronRight, LucideIcon } from 'lucide-react-native';
import { Text } from '@/components/AppText';
import { colors, fonts, iconTile, radius, shadow, spacing } from '@/theme';

/**
 * Optional detail stays one tap away without burying today's work.
 * `icon` adds a leading 36pt sunken tile with a navy outline icon naming the section.
 * `variant="inset"` is the recessed dashed box for an optional group inside a form card.
 * `variant="plain"` drops the card frame (a hairline above the header only) so callers can put
 * Cards or a FormSection's fields inside without a card-in-a-card.
 */
export function Disclosure({ title, summary, children, defaultOpen = false, open: controlled, onToggle, variant = 'card', icon: Icon }: {
  title: string; summary?: string; children: React.ReactNode;
  /** Start expanded (uncontrolled). */
  defaultOpen?: boolean;
  /** Controlled mode: pass `open` with `onToggle`. */
  open?: boolean; onToggle?: (open: boolean) => void;
  variant?: 'card' | 'plain' | 'inset';
  icon?: LucideIcon;
}) {
  const [inner, setInner] = useState(defaultOpen);
  const open = controlled ?? inner;
  const setOpen = (update: (value: boolean) => boolean) => {
    const next = update(open);
    if (controlled === undefined) setInner(next);
    onToggle?.(next);
  };
  const Chevron = open ? ChevronDown : ChevronRight;
  const plain = variant === 'plain';
  const inset = variant === 'inset';
  return <View style={plain ? styles.plain : inset ? styles.inset : styles.section}>
    <Pressable accessibilityRole="button" accessibilityLabel={title} accessibilityHint={summary ? `${summary} · แตะเพื่อ${open ? 'ซ่อน' : 'ดู'}` : undefined}
      accessibilityState={{ expanded: open }}
      onPress={() => setOpen(value => !value)} style={({ pressed }) => [styles.header, !plain && { borderRadius: inset ? radius.md : radius.card },
        plain && styles.plainHeader, inset && styles.insetHeader, open && !plain && styles.headerOpen, pressed && { backgroundColor: colors.soft }]}>
      {Icon ? <View style={[styles.tile, inset && styles.insetTile]}><Icon size={20} color={colors.ink} strokeWidth={1.75} /></View> : null}
      <View style={styles.text}><Text style={styles.title}>{title}</Text>{summary ? <Text style={styles.summary}>{summary}</Text> : null}</View>
      <Chevron size={20} color={colors.muted} />
    </Pressable>
    {open && <View style={plain ? styles.plainContent : inset ? styles.insetContent : styles.content}>{children}</View>}
  </View>;
}

const styles = StyleSheet.create({
  section: { marginTop: spacing.md, borderRadius: radius.card, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, ...shadow.sm },
  plain: { marginTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.divider },
  header: { minHeight: 64, paddingVertical: spacing.md, paddingHorizontal: spacing.lg, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  headerOpen: { borderBottomLeftRadius: 0, borderBottomRightRadius: 0 },
  plainHeader: { paddingHorizontal: 0, minHeight: 52 },
  // Inside a form card: a recessed, dashed box rather than a card-in-a-card.
  inset: { marginTop: spacing.xs, borderRadius: radius.md, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.lineStrong,
    backgroundColor: colors.bg },
  insetHeader: { minHeight: 56, paddingHorizontal: spacing.md },
  insetTile: { backgroundColor: colors.raised, borderRadius: radius.full, borderWidth: 1, borderColor: colors.line },
  insetContent: { padding: spacing.md, paddingTop: spacing.xs },
  tile: { width: iconTile.sm, height: iconTile.sm, borderRadius: radius.md, backgroundColor: colors.sunken,
    alignItems: 'center', justifyContent: 'center' },
  text: { flex: 1, minWidth: 0, gap: 2 },
  title: { color: colors.ink, fontFamily: fonts.semibold, fontSize: 16, lineHeight: 24 },
  summary: { color: colors.muted, fontSize: 13, lineHeight: 20 },
  content: { padding: spacing.lg, paddingTop: spacing.xs },
  plainContent: { gap: spacing.sm, paddingBottom: spacing.sm },
});

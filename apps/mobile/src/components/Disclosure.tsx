import React, { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { ChevronDown, ChevronRight } from 'lucide-react-native';
import { Text } from '@/components/AppText';
import { colors, fonts, radius, spacing } from '@/theme';

/**
 * Optional detail stays one tap away without burying today's work.
 * `variant="plain"` drops the card frame (a hairline above the header only) so callers can put
 * Cards or a FormSection's fields inside without a card-in-a-card.
 */
export function Disclosure({ title, summary, children, defaultOpen = false, open: controlled, onToggle, variant = 'card' }: {
  title: string; summary?: string; children: React.ReactNode;
  /** Start expanded (uncontrolled). */
  defaultOpen?: boolean;
  /** Controlled mode: pass `open` with `onToggle`. */
  open?: boolean; onToggle?: (open: boolean) => void;
  variant?: 'card' | 'plain';
}) {
  const [inner, setInner] = useState(defaultOpen);
  const open = controlled ?? inner;
  const setOpen = (update: (value: boolean) => boolean) => {
    const next = update(open);
    if (controlled === undefined) setInner(next);
    onToggle?.(next);
  };
  const Icon = open ? ChevronDown : ChevronRight;
  const plain = variant === 'plain';
  return <View style={plain ? styles.plain : styles.section}>
    <Pressable accessibilityRole="button" accessibilityLabel={title} accessibilityHint={summary ? `${summary} · แตะเพื่อ${open ? 'ซ่อน' : 'ดู'}` : undefined}
      accessibilityState={{ expanded: open }}
      onPress={() => setOpen(value => !value)} style={({ pressed }) => [styles.header, plain && styles.plainHeader, pressed && { backgroundColor: colors.soft }]}>
      <View style={styles.text}><Text style={styles.title}>{title}</Text>{summary ? <Text style={styles.summary}>{summary}</Text> : null}</View>
      <Icon size={20} color={colors.info} />
    </Pressable>
    {open && <View style={plain ? styles.plainContent : styles.content}>{children}</View>}
  </View>;
}

const styles = StyleSheet.create({
  section: { marginTop: spacing.md, borderRadius: radius.card, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, overflow: 'hidden' },
  plain: { marginTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.line },
  header: { minHeight: 56, padding: spacing.md, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  plainHeader: { paddingHorizontal: 0, minHeight: 52 },
  text: { flex: 1, minWidth: 0, gap: spacing.xs },
  title: { color: colors.ink, fontFamily: fonts.semibold, fontSize: 15 },
  summary: { color: colors.muted, fontSize: 13 },
  content: { padding: spacing.md, paddingTop: 0 },
  plainContent: { gap: spacing.sm, paddingBottom: spacing.sm },
});

import React, { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { ChevronDown, ChevronRight } from 'lucide-react-native';
import { Text } from '@/components/AppText';
import { colors, fonts, radius, spacing } from '@/theme';

/** Optional detail stays one tap away without burying today's work. */
export function Disclosure({ title, summary, children, defaultOpen = false, open: controlled, onToggle }: {
  title: string; summary?: string; children: React.ReactNode;
  /** Start expanded (uncontrolled). */
  defaultOpen?: boolean;
  /** Controlled mode: pass `open` with `onToggle`. */
  open?: boolean; onToggle?: (open: boolean) => void;
}) {
  const [inner, setInner] = useState(defaultOpen);
  const open = controlled ?? inner;
  const setOpen = (update: (value: boolean) => boolean) => {
    const next = update(open);
    if (controlled === undefined) setInner(next);
    onToggle?.(next);
  };
  const Icon = open ? ChevronDown : ChevronRight;
  return <View style={styles.section}>
    <Pressable accessibilityRole="button" accessibilityLabel={title} accessibilityState={{ expanded: open }}
      onPress={() => setOpen(value => !value)} style={({ pressed }) => [styles.header, pressed && { backgroundColor: colors.infoSoft }]}>
      <View style={styles.text}><Text style={styles.title}>{title}</Text>{summary ? <Text style={styles.summary}>{summary}</Text> : null}</View>
      <Icon size={20} color={colors.info} />
    </Pressable>
    {open && <View style={styles.content}>{children}</View>}
  </View>;
}

const styles = StyleSheet.create({
  section: { marginTop: spacing.md, borderRadius: radius.card, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, overflow: 'hidden' },
  header: { minHeight: 56, padding: spacing.md, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  text: { flex: 1, minWidth: 0, gap: spacing.xs },
  title: { color: colors.ink, fontFamily: fonts.semibold, fontSize: 15 },
  summary: { color: colors.muted, fontSize: 12 },
  content: { padding: spacing.md, paddingTop: 0 },
});

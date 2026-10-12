import React, { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { ChevronDown, ChevronRight } from 'lucide-react-native';
import { Text } from '@/components/AppText';
import { Card, Tag } from './ui';
import { colors, fonts, spacing, TOUCH } from '@/theme';

/** Card + title row + count Tag; when it collapses, the whole header is the 44pt tap target.
 * Children stay mounted while collapsed (typed input survives); `defaultOpen` only applies on first mount. */
export function SectionCard({ title, count, tone, collapsible = false, defaultOpen = true, summary, children }: {
  title: string;
  count?: number;
  tone?: 'due' | 'court' | 'info';
  collapsible?: boolean;
  defaultOpen?: boolean;
  summary?: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(collapsible ? defaultOpen : true);
  const Icon = open ? ChevronDown : ChevronRight;
  const header = <>
    <View style={styles.text}>
      <Text accessibilityRole="header" style={styles.title}>{title}</Text>
      {summary ? <Text style={styles.summary}>{summary}</Text> : null}
    </View>
    {count != null ? <Tag tone={tone ?? 'plain'}>{count}</Tag> : null}
    {collapsible ? <Icon size={20} color={colors.info} /> : null}
  </>;
  return <Card style={styles.card}>
    {collapsible
      ? <Pressable accessibilityRole="button" accessibilityLabel={[title, count != null ? `${count} รายการ` : '', summary ?? ''].filter(Boolean).join(' ')} accessibilityState={{ expanded: open }}
          onPress={() => setOpen((value) => !value)} style={({ pressed }) => [styles.header, pressed && { opacity: 0.7 }]}>{header}</Pressable>
      : <View style={styles.header}>{header}</View>}
    <View style={open ? undefined : styles.hidden}>{children}</View>
  </Card>;
}

const styles = StyleSheet.create({
  card: { marginTop: spacing.md, gap: spacing.sm },
  header: { minHeight: TOUCH, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  text: { flex: 1, minWidth: 0, gap: spacing.xs },
  title: { color: colors.ink, fontFamily: fonts.semibold, fontSize: 15 },
  hidden: { display: 'none' },
  summary: { color: colors.muted, fontSize: 12 },
});

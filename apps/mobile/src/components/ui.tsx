import React from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, StyleProp, TextStyle, View, ViewStyle } from 'react-native';
import { Text, TextInput } from '@/components/AppText';
import { ChevronRight, Search, X } from 'lucide-react-native';
import { colors, fonts, radius, spacing } from '@/theme';

export function Card({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: ViewStyle | ViewStyle[];
}) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function SectionLabel({ children, style }: { children: React.ReactNode; style?: StyleProp<TextStyle> }) {
  return <Text style={[styles.sectionLabel, style]}>{children}</Text>;
}

/** A section's purpose is visible before its controls; counts stay in the list. */
export function PageIntro({ title, detail }: { title: string; detail?: string }) {
  return <View style={styles.intro}>
    <Text accessibilityRole="header" style={styles.introTitle}>{title}</Text>
    {detail ? <Text style={styles.introDetail}>{detail}</Text> : null}
  </View>;
}

export function ActionRow({ title, detail, onPress, destructive = false }: {
  title: string; detail?: string; onPress: () => void; destructive?: boolean;
}) {
  return <Pressable accessibilityRole="button" accessibilityLabel={title} onPress={onPress}
    style={({ pressed }) => [styles.actionRow, pressed && { backgroundColor: colors.soft }]}>
    <View style={{ flex: 1, minWidth: 0 }}>
      <Text style={[styles.actionTitle, destructive && { color: colors.warn }]}>{title}</Text>
      {detail ? <Text style={styles.actionDetail}>{detail}</Text> : null}
    </View>
    <ChevronRight size={18} color={destructive ? colors.warn : colors.faint} />
  </Pressable>;
}

export function SearchBox({ value, onChange, onSearch, onClear, placeholder }: {
  value: string; onChange: (value: string) => void; onSearch: () => void; onClear?: () => void; placeholder: string;
}) {
  return <View style={styles.searchBox}>
    <TextInput accessibilityLabel={placeholder} value={value} onChangeText={onChange}
      placeholder={placeholder} placeholderTextColor={colors.faint} autoCapitalize="none"
      returnKeyType="search" onSubmitEditing={onSearch} style={styles.searchInput} />
    {value ? <Pressable accessibilityRole="button" accessibilityLabel="ล้างคำค้น" onPress={() => { onChange(''); onClear?.(); }}
      style={styles.searchAction}><X size={18} color={colors.muted} /></Pressable> : null}
    <Pressable accessibilityRole="button" accessibilityLabel="ค้นหา" onPress={onSearch} style={styles.searchAction}>
      <Search size={20} color={colors.ink} />
    </Pressable>
  </View>;
}

export function FilterTabs({ items, value, onChange }: {
  items: ReadonlyArray<{ value: string; label: string }>; value: string; onChange: (value: string) => void;
}) {
  return <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm, paddingVertical: spacing.xs }}>
    {items.map(item => <Pressable key={item.value} accessibilityRole="tab" accessibilityState={{ selected: value === item.value }}
      onPress={() => onChange(item.value)} style={[styles.filterTab, value === item.value && { borderColor: colors.ink, backgroundColor: colors.soft }]}>
      <Text style={{ fontSize: 13, color: value === item.value ? colors.ink : colors.muted, fontWeight: '600' }}>{item.label}</Text>
    </Pressable>)}
  </ScrollView>;
}

export type TagTone = 'court' | 'due' | 'ok' | 'info' | 'plain';

const TAG_TONES: Record<TagTone, { bg: string; fg: string }> = {
  court: { bg: colors.accentSoft, fg: colors.accentInk },
  due: { bg: colors.warnSoft, fg: colors.warn },
  ok: { bg: colors.goodSoft, fg: colors.good },
  info: { bg: colors.infoSoft, fg: colors.info },
  plain: { bg: colors.soft, fg: colors.muted },
};

export function Tag({ tone = 'plain', children }: { tone?: TagTone; children: React.ReactNode }) {
  const palette = TAG_TONES[tone];
  return (
    <View style={[styles.tag, { backgroundColor: palette.bg }]}>
      <Text style={[styles.tagText, { color: palette.fg }]}>{children}</Text>
    </View>
  );
}

export function StatCard({
  label,
  value,
  tone,
  hint,
}: {
  label: string;
  value: number | string;
  tone?: 'warn' | 'info' | 'court';
  hint?: string;
}) {
  const palette = TAG_TONES[tone === 'warn' ? 'due' : tone ?? 'info'];
  return (
    <Card style={styles.statCard}>
      <Text style={styles.statLabel}>
        {label}
      </Text>
      <Text style={[styles.statValue, { color: palette.fg }]}>
        {value}
      </Text>
      {hint ? <Text style={styles.statHint}>{hint}</Text> : null}
    </Card>
  );
}

export function Button({
  title,
  onPress,
  ghost,
  disabled,
  busy,
}: {
  title: string;
  onPress: () => void;
  ghost?: boolean;
  disabled?: boolean;
  busy?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled: !!(disabled || busy), busy: !!busy }}
      onPress={onPress}
      disabled={disabled || busy}
      style={({ pressed }) => [
        styles.button,
        ghost && styles.buttonGhost,
        (disabled || busy) && { opacity: 0.5 },
        pressed && { opacity: 0.8 },
      ]}
    >
      {busy ? (
        <ActivityIndicator color={ghost ? colors.ink : colors.bg} />
      ) : (
        <Text style={[styles.buttonText, ghost && { color: colors.ink }]}>{title}</Text>
      )}
    </Pressable>
  );
}

export function Loading() {
  return (
    <View style={styles.center}>
      <ActivityIndicator size="large" color={colors.ink} />
    </View>
  );
}

export function ErrorNote({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <Card style={{ borderColor: colors.warn, backgroundColor: colors.warnSoft }}>
      <Text style={{ color: colors.warn, fontSize: 14 }}>{message}</Text>
      {onRetry ? (
        <Pressable accessibilityRole="button" onPress={onRetry} style={{ marginTop: spacing.sm, minHeight: 44, justifyContent: 'center' }}>
          <Text style={{ color: colors.ink, fontWeight: '600' }}>ลองใหม่</Text>
        </Pressable>
      ) : null}
    </Card>
  );
}

export function EmptyNote({ children }: { children: React.ReactNode }) {
  return <Text style={styles.empty}>{children}</Text>;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: radius.card,
    padding: spacing.md,
  },
  sectionLabel: {
    fontSize: 15,
    fontFamily: fonts.semibold,
    color: colors.ink,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  intro: { gap: spacing.sm, paddingTop: spacing.xs, paddingBottom: spacing.lg, borderBottomWidth: 1, borderBottomColor: colors.line, marginBottom: spacing.md },
  introTitle: { fontSize: 24, lineHeight: 34, fontFamily: fonts.bold, color: colors.ink },
  introDetail: { fontSize: 14, lineHeight: 22, color: colors.muted },
  actionRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 60, paddingVertical: spacing.md },
  actionTitle: { fontSize: 15, fontWeight: '600', color: colors.ink },
  actionDetail: { fontSize: 14, lineHeight: 22, color: colors.muted, marginTop: spacing.xs },
  searchBox: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: colors.line,
    borderRadius: radius.button, backgroundColor: colors.surface, paddingLeft: spacing.md },
  searchInput: { flex: 1, minWidth: 0, minHeight: 48, paddingVertical: spacing.sm, color: colors.text, fontSize: 14 },
  searchAction: { width: 44, minHeight: 48, justifyContent: 'center', alignItems: 'center' },
  filterTab: { minHeight: 44, borderRadius: radius.button, paddingHorizontal: spacing.md, justifyContent: 'center',
    borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface },
  tag: {
    borderRadius: radius.pill,
    paddingHorizontal: 8,
    paddingVertical: 2,
    alignSelf: 'flex-start',
  },
  tagText: { fontSize: 12, lineHeight: 20, fontWeight: '600' },
  statCard: { flex: 1, minWidth: 0, minHeight: 88, justifyContent: 'space-between', gap: spacing.sm },
  statLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.muted,
  },
  statHint: { fontSize: 12, color: colors.faint },
  statValue: {
    fontSize: 24,
    fontFamily: fonts.bold,
    color: colors.ink,
    fontVariant: ['tabular-nums'],
  },
  button: {
    backgroundColor: colors.ink,
    borderRadius: radius.button,
    paddingVertical: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  buttonGhost: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line },
  buttonText: { color: colors.bg, fontWeight: '600', fontSize: 15 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  empty: {
    color: colors.faint,
    fontSize: 14,
    textAlign: 'center',
    paddingVertical: spacing.xl,
  },
});

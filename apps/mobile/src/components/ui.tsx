import React from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, StyleProp, TextStyle, View, ViewStyle } from 'react-native';
import { Text, TextInput } from '@/components/AppText';
import { ChevronRight, Search, X } from 'lucide-react-native';
import { CHROME_MAX_SCALE, colors, fonts, radius, spacing } from '@/theme';

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
  return <Text accessibilityRole="header" style={[styles.sectionLabel, style]}>{children}</Text>;
}

/**
 * A section's purpose is visible before its controls; counts stay in the list.
 * `detailOnly` is for stack screens whose native header already carries the title:
 * it keeps the one explanatory line and drops the repeated heading.
 */
export function PageIntro({ title, detail, detailOnly = false }: { title: string; detail?: string; detailOnly?: boolean }) {
  if (detailOnly) return detail ? <Text style={styles.introDetailOnly}>{detail}</Text> : null;
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
  return <ScrollView horizontal accessibilityRole="tablist" showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm, paddingVertical: spacing.xs }}>
    {items.map(item => <Pressable key={item.value} accessibilityRole="tab" accessibilityState={{ selected: value === item.value }}
      onPress={() => onChange(item.value)} style={[styles.filterTab, value === item.value && { borderColor: colors.ink, backgroundColor: colors.soft }]}>
      <Text maxFontSizeMultiplier={CHROME_MAX_SCALE} style={{ fontSize: 13, color: value === item.value ? colors.ink : colors.muted, fontWeight: '600' }}>{item.label}</Text>
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
      <Text maxFontSizeMultiplier={CHROME_MAX_SCALE} style={[styles.tagText, { color: palette.fg }]}>{children}</Text>
    </View>
  );
}

/** One task-status vocabulary for every list, card and work view. */
export const TASK_STATUS_LABEL: Record<string, string> = {
  TODO: 'ต้องทำ', IN_PROGRESS: 'กำลังทำ', PENDING_REVIEW: 'รอตรวจ', NEEDS_REVISION: 'ส่งกลับแก้ไข', DONE: 'เสร็จแล้ว', ON_HOLD: 'พักไว้',
};
export function taskStatusTone(status: string): TagTone {
  return status === 'NEEDS_REVISION' ? 'due' : status === 'DONE' ? 'ok' : status === 'PENDING_REVIEW' ? 'court' : 'plain';
}

/** Calendar/agenda kinds. DEADLINE rows read "ทั้งวัน" rather than a clock time wherever they are listed. */
export const EVENT_KIND_LABEL: Record<string, { label: string; tone: TagTone }> = {
  COURT_DATE: { label: 'นัดศาล', tone: 'court' },
  CLIENT_MEETING: { label: 'นัดลูกความ', tone: 'info' },
  DEADLINE: { label: 'ครบกำหนด', tone: 'due' },
  TASK: { label: 'งาน', tone: 'plain' },
  OTHER: { label: 'นัดหมาย', tone: 'plain' },
};

/**
 * A count tile. Rule: never repeat a count already shown in the section header right below it.
 * `hideZero` drops the tile at 0; `onPress` makes the whole tile the link to its list.
 */
export function StatCard({
  label,
  value,
  tone,
  hint,
  hideZero = false,
  onPress,
}: {
  label: string;
  value: number | string;
  tone?: 'warn' | 'info' | 'court';
  hint?: string;
  hideZero?: boolean;
  onPress?: () => void;
}) {
  if (hideZero && (value === 0 || value === '0')) return null;
  const color = tone ? TAG_TONES[tone === 'warn' ? 'due' : tone].fg : colors.ink;
  const body = <>
    <View style={styles.statHead}>
      <Text style={styles.statLabel}>{label}</Text>
      {onPress ? <ChevronRight size={16} color={colors.muted} /> : null}
    </View>
    <Text style={[styles.statValue, { color }]}>{value}</Text>
    {hint ? <Text style={styles.statHint}>{hint}</Text> : null}
  </>;
  const a11y = `${label} ${value}${hint ? ` · ${hint}` : ''}`;
  if (onPress) return <Pressable accessibilityRole="button" accessibilityLabel={a11y} onPress={onPress}
    style={({ pressed }) => [styles.card, styles.statCard, pressed && { backgroundColor: colors.soft }]}>{body}</Pressable>;
  return <View accessible accessibilityLabel={a11y} style={[styles.card, styles.statCard]}>{body}</View>;
}

export type ButtonVariant = 'primary' | 'secondary' | 'link' | 'danger';

/**
 * One primary per screen. `secondary` is the bordered quiet action (the old `ghost`, which still works),
 * `link` is for navigation and optional paths, `danger` for reject/delete. `inline` sizes the button to
 * its label instead of the full width; links are always inline.
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
  return (
    <Pressable
      accessibilityRole={kind === 'link' ? 'link' : 'button'}
      accessibilityLabel={title}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: !!(disabled || busy), busy: !!busy }}
      onPress={onPress}
      disabled={disabled || busy}
      style={({ pressed }) => [
        styles.button,
        kind === 'secondary' && styles.buttonSecondary,
        kind === 'danger' && styles.buttonDanger,
        kind === 'link' && styles.buttonLink,
        (inline || kind === 'link') && styles.buttonInline,
        kind === 'link' && { paddingHorizontal: spacing.xs },
        (disabled || busy) && { opacity: 0.5 },
        pressed && (kind === 'link' ? { opacity: 0.6 } : kind === 'primary' ? { opacity: 0.85 } : { backgroundColor: colors.soft }),
      ]}
    >
      {busy ? (
        <ActivityIndicator color={fg} />
      ) : (
        <Text style={[styles.buttonText, { color: fg }, kind === 'link' && { textAlign: 'left' }]}>{title}</Text>
      )}
    </Pressable>
  );
}

/** Spinner with a visible, announced label, so a wait never reads as a blank screen. */
export function Loading({ label = 'กำลังโหลด…' }: { label?: string }) {
  return (
    <View style={styles.center} accessible accessibilityRole="progressbar" accessibilityLabel={label} accessibilityLiveRegion="polite">
      <ActivityIndicator size="large" color={colors.ink} />
      <Text style={styles.loadingText}>{label}</Text>
    </View>
  );
}

/** A failed load says so (never "ไม่มี…"), is announced, and offers the retry beside the message. */
export function ErrorNote({ message, onRetry, retryLabel = 'ลองใหม่' }: { message: string; onRetry?: () => void; retryLabel?: string }) {
  return (
    <View accessibilityRole="alert" accessibilityLiveRegion="polite" style={[styles.card, { borderColor: colors.warn, backgroundColor: colors.warnSoft }]}>
      <Text style={{ color: colors.warn, fontSize: 14, lineHeight: 22 }}>{message}</Text>
      {onRetry ? (
        <Pressable accessibilityRole="button" accessibilityLabel={`${retryLabel} · ${message}`} onPress={onRetry}
          style={({ pressed }) => [{ marginTop: spacing.xs, minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' }, pressed && { opacity: 0.6 }]}>
          <Text style={{ color: colors.ink, fontWeight: '600' }}>{retryLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/** Empty states name what is missing and, when there is one, offer the next step. */
export function EmptyNote({ children, action }: { children: React.ReactNode; action?: { title: string; onPress: () => void } }) {
  if (!action) return <Text style={styles.empty}>{children}</Text>;
  return <View style={styles.emptyWithAction}>
    <Text style={[styles.empty, { paddingVertical: 0 }]}>{children}</Text>
    <View><Button title={action.title} variant="link" onPress={action.onPress} /></View>
  </View>;
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
  introDetailOnly: { fontSize: 14, lineHeight: 22, color: colors.muted, marginBottom: spacing.sm },
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
  statHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  statLabel: {
    flex: 1,
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
  buttonSecondary: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line },
  buttonDanger: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.warn },
  buttonLink: { backgroundColor: 'transparent', paddingVertical: spacing.sm, alignItems: 'flex-start' },
  buttonInline: { alignSelf: 'flex-start', paddingHorizontal: spacing.lg, minHeight: 44 },
  buttonText: { color: colors.bg, fontWeight: '600', fontSize: 15, textAlign: 'center' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md, padding: spacing.xl },
  loadingText: { color: colors.muted, fontSize: 14 },
  emptyWithAction: { alignItems: 'center', gap: spacing.xs, paddingVertical: spacing.xl },
  empty: {
    color: colors.faint,
    fontSize: 14,
    textAlign: 'center',
    paddingVertical: spacing.xl,
  },
});

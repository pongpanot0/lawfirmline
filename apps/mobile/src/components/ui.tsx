import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, StyleProp, TextStyle, View, ViewStyle } from 'react-native';
import { Text, TextInput } from '@/components/AppText';
import { ChevronRight, LucideIcon, Search, X } from 'lucide-react-native';
import { CHROME_MAX_SCALE, colors, control, iconTile, radius, shadow, spacing, typeScale } from '@/theme';
import { EmptyState, ErrorState, InlineError, LoadingState } from './States';

export { Button } from './Button';
export type { ButtonVariant } from './Button';
export { EmptyState, ErrorState, InlineError, LoadingState } from './States';

/**
 * Raised surface on the paper canvas: hairline edge plus a soft navy-tinted shadow.
 * `flat` drops the shadow for cards nested in another surface or rows inside a list card.
 */
export function Card({
  children,
  style,
  flat = false,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  flat?: boolean;
}) {
  return <View style={[styles.card, !flat && shadow.sm, style]}>{children}</View>;
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
    <ChevronRight size={18} color={destructive ? colors.warn : colors.muted} />
  </Pressable>;
}

export function SearchBox({ value, onChange, onSearch, onClear, placeholder }: {
  value: string; onChange: (value: string) => void; onSearch: () => void; onClear?: () => void; placeholder: string;
}) {
  const [focused, setFocused] = useState(false);
  return <View style={[styles.searchBox, focused && { borderColor: colors.ink, borderWidth: control.focusBorderWidth,
    paddingLeft: spacing.md - 1, paddingRight: 3, ...shadow.focus }]}>
    <TextInput accessibilityLabel={placeholder} value={value} onChangeText={onChange}
      placeholder={placeholder} placeholderTextColor={colors.faint} autoCapitalize="none"
      onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
      returnKeyType="search" onSubmitEditing={onSearch} style={styles.searchInput} />
    {value ? <Pressable accessibilityRole="button" accessibilityLabel="ล้างคำค้น" onPress={() => { onChange(''); onClear?.(); }}
      style={styles.searchAction}><X size={18} color={colors.muted} /></Pressable> : null}
    <Pressable accessibilityRole="button" accessibilityLabel="ค้นหา" onPress={onSearch}
      style={({ pressed }) => [styles.searchSubmit, pressed && { backgroundColor: colors.line }]}>
      <Search size={18} color={colors.ink} />
    </Pressable>
  </View>;
}

/** Filter chips: the selected one is a filled navy pill, the rest stay outlined on the surface. */
export function FilterTabs({ items, value, onChange }: {
  items: ReadonlyArray<{ value: string; label: string }>; value: string; onChange: (value: string) => void;
}) {
  return <ScrollView horizontal accessibilityRole="tablist" showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm, paddingVertical: spacing.xs }}>
    {items.map(item => {
      const on = value === item.value;
      return <Pressable key={item.value} accessibilityRole="tab" accessibilityState={{ selected: on }}
        onPress={() => onChange(item.value)}
        style={({ pressed }) => [styles.filterTab, on && styles.filterTabOn, pressed && !on && { backgroundColor: colors.soft }]}>
        <Text maxFontSizeMultiplier={CHROME_MAX_SCALE} style={[styles.filterText, on && styles.filterTextOn]}>{item.label}</Text>
      </Pressable>;
    })}
  </ScrollView>;
}

export type TagTone = 'court' | 'due' | 'ok' | 'info' | 'plain';

/** Tinted chip palettes; every fg/bg pair is ≥ 4.5:1 (WCAG AA for 12pt text). */
export const TAG_TONES: Record<TagTone, { bg: string; fg: string; edge: string }> = {
  court: { bg: colors.accentSoft, fg: colors.accentInk, edge: colors.accentEdge },
  due: { bg: colors.warnSoft, fg: colors.warn, edge: colors.warnEdge },
  ok: { bg: colors.goodSoft, fg: colors.good, edge: colors.goodEdge },
  info: { bg: colors.infoSoft, fg: colors.info, edge: colors.infoEdge },
  plain: { bg: colors.soft, fg: colors.muted, edge: colors.line },
};

/** Status chip: tinted fill, 1pt edge in the same hue, fully rounded; `icon` adds a 12pt leading glyph. */
export function Tag({ tone = 'plain', icon: Icon, children }: { tone?: TagTone; icon?: LucideIcon; children: React.ReactNode }) {
  const palette = TAG_TONES[tone];
  return (
    <View style={[styles.tag, { backgroundColor: palette.bg, borderColor: palette.edge }]}>
      {Icon ? <Icon size={12} color={palette.fg} strokeWidth={2.25} /> : null}
      <Text maxFontSizeMultiplier={CHROME_MAX_SCALE} style={[styles.tagText, { color: palette.fg }]}>{children}</Text>
    </View>
  );
}

/**
 * Leading square tile on list rows (documents, files, list cards): rounded, tinted by meaning.
 * `size` defaults to 40pt; the icon is outline-stroked in the tone's ink.
 */
export function IconTile({ icon: Icon, tone = 'plain', size = iconTile.md }: { icon: LucideIcon; tone?: TagTone | 'ink'; size?: number }) {
  const palette = tone === 'ink' || tone === 'plain' ? { bg: colors.sunken, fg: colors.ink } : TAG_TONES[tone];
  return <View style={[styles.iconTile, { width: size, height: size, backgroundColor: palette.bg }]}>
    <Icon size={Math.round(size / 2)} color={palette.fg} strokeWidth={1.75} />
  </View>;
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
 * The number leads (Anuphan 30 bold); the label sits above it, small and muted.
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
  const zero = value === 0 || value === '0';
  const body = <>
    <View style={styles.statHead}>
      <Text style={styles.statLabel}>{label}</Text>
      {onPress ? <ChevronRight size={16} color={colors.muted} /> : null}
    </View>
    <Text style={[styles.statValue, { color: zero ? colors.muted : color }]}>{value}</Text>
    {hint ? <Text style={styles.statHint}>{hint}</Text> : null}
  </>;
  const a11y = `${label} ${value}${hint ? ` · ${hint}` : ''}`;
  if (onPress) return <Pressable accessibilityRole="button" accessibilityLabel={a11y} onPress={onPress}
    style={({ pressed }) => [styles.card, styles.statCard, shadow.sm, tone && !zero && { borderTopColor: color, borderTopWidth: 3 },
      pressed && { backgroundColor: colors.soft }]}>{body}</Pressable>;
  return <View accessible accessibilityLabel={a11y}
    style={[styles.card, styles.statCard, shadow.sm, tone && !zero && { borderTopColor: color, borderTopWidth: 3 }]}>{body}</View>;
}

/** Legacy name for LoadingState. */
export function Loading({ label = 'กำลังโหลด…' }: { label?: string }) {
  return <LoadingState label={label} />;
}

/**
 * Legacy name: with a retry it is an ErrorState card; without one (a failed save/send) an InlineError line.
 * New code uses ErrorState / InlineError directly.
 */
export function ErrorNote({ message, onRetry, retryLabel = 'ลองใหม่' }: { message: string; onRetry?: () => void; retryLabel?: string }) {
  return onRetry ? <ErrorState message={message} onRetry={onRetry} retryLabel={retryLabel} /> : <InlineError message={message} />;
}

/** Legacy name for the compact EmptyState: names what is missing and, when there is one, offers the next step. */
export function EmptyNote({ children, action }: { children: React.ReactNode; action?: { title: string; onPress: () => void } }) {
  return <EmptyState compact action={action}>{children}</EmptyState>;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: radius.card,
    padding: spacing.lg,
  },
  sectionLabel: {
    ...typeScale.section,
    color: colors.ink,
    marginTop: spacing.xl,
    marginBottom: spacing.sm,
  },
  intro: { gap: spacing.xs, paddingTop: spacing.xs, paddingBottom: spacing.lg, borderBottomWidth: 1, borderBottomColor: colors.line, marginBottom: spacing.md },
  introTitle: { ...typeScale.display, color: colors.ink },
  introDetail: { fontSize: 14, lineHeight: 22, color: colors.muted },
  introDetailOnly: { fontSize: 14, lineHeight: 22, color: colors.muted, marginBottom: spacing.sm },
  actionRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 60, paddingVertical: spacing.md },
  actionTitle: { fontSize: 15, fontWeight: '600', color: colors.ink },
  actionDetail: { fontSize: 14, lineHeight: 22, color: colors.muted, marginTop: spacing.xs },
  searchBox: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderWidth: control.borderWidth, borderColor: colors.lineStrong,
    borderRadius: radius.button, backgroundColor: colors.raised, paddingLeft: spacing.md, paddingRight: 4, minHeight: control.height },
  searchInput: { flex: 1, minWidth: 0, minHeight: 44, paddingVertical: spacing.sm, color: colors.text, fontSize: 15 },
  searchAction: { width: 44, minHeight: 44, justifyContent: 'center', alignItems: 'center' },
  searchSubmit: { width: 44, height: 40, borderRadius: radius.sm, backgroundColor: colors.soft, justifyContent: 'center', alignItems: 'center' },
  filterTab: { minHeight: 44, borderRadius: radius.button, paddingHorizontal: spacing.lg, justifyContent: 'center',
    borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface },
  filterTabOn: { backgroundColor: colors.ink, borderColor: colors.ink, ...shadow.sm },
  filterText: { fontSize: 14, color: colors.muted, fontWeight: '600' },
  filterTextOn: { color: colors.bg },
  tag: {
    borderRadius: radius.full,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 1,
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  tagText: { fontSize: 12, lineHeight: 20, fontWeight: '600' },
  iconTile: { borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  statCard: { flex: 1, minWidth: 0, minHeight: 96, justifyContent: 'space-between', gap: spacing.xs, padding: spacing.md },
  statHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  statLabel: { flex: 1, ...typeScale.overline, color: colors.muted },
  statHint: { fontSize: 12, color: colors.faint },
  statValue: { ...typeScale.stat, color: colors.ink, fontVariant: ['tabular-nums'] },
});

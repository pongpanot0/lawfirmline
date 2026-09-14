import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  ViewStyle,
} from 'react-native';
import { colors, radius, spacing } from '@/theme';

export function Card({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: ViewStyle | ViewStyle[];
}) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function SectionLabel({ children }: { children: React.ReactNode }) {
  return <Text style={styles.sectionLabel}>{children}</Text>;
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
}: {
  label: string;
  value: number | string;
  tone?: 'warn';
}) {
  return (
    <Card style={styles.statCard}>
      <Text style={styles.statLabel} numberOfLines={1}>
        {label}
      </Text>
      <Text style={[styles.statValue, tone === 'warn' && { color: colors.warn }]}>
        {value}
      </Text>
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
    <Card style={{ borderColor: colors.warnSoft }}>
      <Text style={{ color: colors.warn, fontSize: 14 }}>{message}</Text>
      {onRetry ? (
        <Pressable onPress={onRetry} style={{ marginTop: spacing.sm }}>
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
    fontSize: 12,
    fontWeight: '600',
    color: colors.faint,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  tag: {
    borderRadius: radius.pill,
    paddingHorizontal: 8,
    paddingVertical: 2,
    alignSelf: 'flex-start',
  },
  tagText: { fontSize: 11, fontWeight: '600' },
  statCard: { flex: 1, justifyContent: 'space-between', gap: 2 },
  statLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.faint,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  statValue: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.ink,
    fontVariant: ['tabular-nums'],
  },
  button: {
    backgroundColor: colors.ink,
    borderRadius: radius.button,
    paddingVertical: 13,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  buttonGhost: { backgroundColor: colors.soft },
  buttonText: { color: colors.bg, fontWeight: '600', fontSize: 15 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  empty: {
    color: colors.faint,
    fontSize: 14,
    textAlign: 'center',
    paddingVertical: spacing.xl,
  },
});

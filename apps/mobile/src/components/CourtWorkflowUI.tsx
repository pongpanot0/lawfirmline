import React, { type ComponentProps, type ReactNode } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Check } from 'lucide-react-native';
import { Text } from '@/components/AppText';
import { Button, InlineError } from '@/components/ui';
import { useKeyboardHeight } from '@/hooks/useKeyboardHeight';
import { CHROME_MAX_SCALE, colors, radius, shadow, spacing, TOUCH, typeScale } from '@/theme';

export const courtWorkflowStyles = StyleSheet.create({
  card: { marginTop: spacing.lg },
  header: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: spacing.xs },
  title: { ...typeScale.section, color: colors.ink },
  meta: { ...typeScale.meta, color: colors.muted },
  timeline: { marginTop: spacing.sm },
  rowTitle: { ...typeScale.body, fontWeight: '600', color: colors.ink },
});

export function CourtTimelineRow({ children, state, last = false }: {
  children: ReactNode;
  state: 'done' | 'active' | 'upcoming';
  last?: boolean;
}) {
  return (
    <View style={[styles.timelineRow, last && styles.timelineLast]}>
      {!last && <View style={styles.timelineRule} />}
      <View style={[styles.point, state === 'done' && styles.pointDone, state === 'active' && styles.pointActive]}>
        {state === 'done' && <Check size={11} color={colors.onInk} strokeWidth={2.75} />}
        {state === 'active' && <View style={styles.pointCenter} />}
      </View>
      {children}
    </View>
  );
}

type ActionProps = ComponentProps<typeof Button> & { hint: string; centerHint?: boolean };

export function CourtWorkflowAction({ hint, centerHint, ...props }: ActionProps) {
  return (
    <View style={styles.action}>
      <Button {...props} singleLine accessibilityHint={hint} />
      <Text style={[courtWorkflowStyles.meta, centerHint && styles.center]}>{hint}</Text>
    </View>
  );
}

export function CourtWorkflowChoice<Value extends string>({ label, options, value, onChange, disabled }: {
  label: string;
  options: readonly { value: Value; label: string }[];
  value: Value;
  onChange: (value: Value) => void;
  disabled: boolean;
}) {
  return (
    <View style={styles.choice}>
      <Text style={styles.choiceLabel}>{label}</Text>
      <View accessibilityRole="radiogroup" accessibilityLabel={label} style={styles.track}>
        {options.map(option => {
          const selected = option.value === value;
          return (
            <Pressable key={option.value} accessibilityRole="radio" accessibilityLabel={option.label}
              accessibilityState={{ checked: selected, disabled }} disabled={disabled} onPress={() => onChange(option.value)}
              style={({ pressed }) => [styles.choiceOption, selected && styles.choiceSelected, pressed && { opacity: 0.7 }]}>
              <Text maxFontSizeMultiplier={CHROME_MAX_SCALE} numberOfLines={1} adjustsFontSizeToFit
                style={[styles.choiceText, selected && styles.choiceTextSelected]}>{option.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export function CourtWorkflowSheet({ title, subtitle, children, action, error, onClose }: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  action: ActionProps;
  error?: string;
  onClose: () => void;
}) {
  const { bottom } = useSafeAreaInsets();
  const keyboardHeight = useKeyboardHeight();
  const close = () => { if (!action.busy) onClose(); };

  return (
    <Modal visible transparent animationType="slide" onRequestClose={close}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={[styles.backdrop, keyboardHeight > 0 && { paddingBottom: keyboardHeight }]}>
        <Pressable accessibilityRole="button" accessibilityLabel="ปิดแบบฟอร์ม" disabled={action.busy}
          style={StyleSheet.absoluteFill} onPress={close} />
        <View accessibilityViewIsModal onAccessibilityEscape={close} style={[styles.sheet, { paddingBottom: spacing.lg + bottom }]}>
          <View style={styles.handle} />
          <Text accessibilityRole="header" style={styles.sheetTitle}>{title}</Text>
          {subtitle && <Text style={courtWorkflowStyles.meta}>{subtitle}</Text>}
          <ScrollView style={styles.sheetScroll} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag"
            contentContainerStyle={styles.sheetBody}>
            {children}
          </ScrollView>
          <View style={styles.footer}>
            <InlineError variant="field" message={error} />
            <CourtWorkflowAction {...action} centerHint />
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  timelineRow: { position: 'relative', paddingLeft: spacing.xl + spacing.xs, paddingBottom: spacing.md, gap: spacing.xs },
  timelineLast: { paddingBottom: 0 },
  timelineRule: { position: 'absolute', top: 6, bottom: -6, left: 8, width: 2, backgroundColor: colors.line },
  point: {
    position: 'absolute', left: 0, top: 3, width: 18, height: 18, borderRadius: radius.full,
    borderWidth: 2, borderColor: colors.lineStrong, backgroundColor: colors.surface,
    alignItems: 'center', justifyContent: 'center',
  },
  pointDone: { borderColor: colors.good, backgroundColor: colors.good },
  pointActive: { borderColor: colors.ink },
  pointCenter: { width: 7, height: 7, borderRadius: radius.full, backgroundColor: colors.ink },
  action: { gap: spacing.xs },
  center: { textAlign: 'center' },
  choice: { gap: spacing.xs },
  choiceLabel: { ...typeScale.body, fontWeight: '600' },
  track: { flexDirection: 'row', gap: 2, padding: spacing.xs, borderRadius: radius.lg, backgroundColor: colors.sunken },
  choiceOption: { flex: 1, minWidth: 0, minHeight: TOUCH, paddingHorizontal: spacing.xs, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  choiceSelected: { backgroundColor: colors.raised, ...shadow.sm },
  choiceText: { fontSize: 13, fontWeight: '600', color: colors.muted },
  choiceTextSelected: { color: colors.ink },
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: colors.scrim },
  sheet: {
    width: '100%', maxWidth: 760, maxHeight: '90%', alignSelf: 'center',
    paddingTop: spacing.md, paddingHorizontal: spacing.lg,
    borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, backgroundColor: colors.raised, ...shadow.lg,
  },
  handle: { alignSelf: 'center', width: 36, height: 4, borderRadius: radius.full, backgroundColor: colors.line, marginBottom: spacing.md },
  sheetTitle: { ...typeScale.title, color: colors.ink },
  sheetScroll: { flexGrow: 0, flexShrink: 1 },
  sheetBody: { paddingTop: spacing.sm, gap: spacing.sm },
  footer: { borderTopWidth: 1, borderTopColor: colors.divider, marginTop: spacing.lg, paddingTop: spacing.md, gap: spacing.sm },
});

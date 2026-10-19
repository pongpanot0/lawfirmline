import React, { useEffect, useId, useRef } from 'react';
import { InputAccessoryView, Keyboard, Platform, Pressable, ScrollView, StyleSheet, Switch, TextInput as NativeTextInput, TextInputProps, View } from 'react-native';
import { AlertCircle, LucideIcon, Square, SquareCheck } from 'lucide-react-native';
import { KeyboardAccessoryContext, Text } from '@/components/AppText';
import { Card } from './ui';
import { TextArea, TextField } from './Input';
import { InlineError } from './States';
import { useKeyboardHeight } from '@/hooks/useKeyboardHeight';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, spacing, radius, pageContent, shadow, typeScale } from '@/theme';

/** Scrolling form body. `footer` pins its content in a StickyBar under the scroll area (the primary action). */
export function FormPage({ children, footer }: { children: React.ReactNode; footer?: React.ReactNode }) {
  const keyboardHeight = useKeyboardHeight();
  const insets = useSafeAreaInsets();
  const accessoryId = useId();
  const scroll = useRef<ScrollView>(null);
  const revealFocusedInput = () => requestAnimationFrame(() => {
    const input = NativeTextInput.State.currentlyFocusedInput();
    if (input) scroll.current?.getNativeScrollRef()?.measureInWindow((_x, top) => {
      // RN's helper assumes the scroll view starts at the top of the screen; account for our navigation header.
      scroll.current?.scrollResponderScrollNativeHandleToKeyboard(input, top + 16, true);
    });
  });
  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', revealFocusedInput);
    return () => show.remove();
  }, []);
  return <KeyboardAccessoryContext.Provider value={Platform.OS === 'ios' ? accessoryId : undefined}>
    <ScrollView ref={scroll} style={{ flex: 1, backgroundColor: colors.bg }} keyboardShouldPersistTaps="handled"
    onFocus={revealFocusedInput}
    automaticallyAdjustKeyboardInsets keyboardDismissMode="on-drag"
    contentContainerStyle={{ ...pageContent, maxWidth: 760, gap: spacing.sm, paddingBottom: spacing.xl + keyboardHeight }}>{children}</ScrollView>
    {footer ? <StickyBar bottomInset={keyboardHeight ? 0 : insets.bottom}>
      <View style={styles.stickyInner}>{footer}</View>
    </StickyBar> : null}
    {Platform.OS === 'ios' && <InputAccessoryView nativeID={accessoryId}>
      <View style={{ backgroundColor: colors.soft, alignItems: 'flex-end', borderTopWidth: 1, borderColor: colors.line }}>
        <Pressable accessibilityRole="button" accessibilityLabel="เสร็จสิ้นการกรอก" onPress={Keyboard.dismiss} style={{ minHeight: 44, padding: spacing.md }}>
          <Text style={{ color: colors.ink, fontWeight: '700' }}>เสร็จสิ้น</Text>
        </Pressable>
      </View>
    </InputAccessoryView>}
  </KeyboardAccessoryContext.Provider>;
}

export { FieldLabel, fieldA11yLabel } from './FieldLabel';

type PassThrough = Pick<TextInputProps, 'keyboardType' | 'secureTextEntry' | 'maxLength' | 'autoCapitalize' | 'autoComplete'
  | 'returnKeyType' | 'onSubmitEditing' | 'textContentType' | 'autoFocus'>;

/**
 * Legacy name for the Input family: renders TextField (or TextArea with `multiline`).
 * New code imports TextField/TextArea from '@/components/Input'.
 */
export function FormField({ multiline = false, ...props }: {
  label: string; value: string; onChange: (value: string) => void; multiline?: boolean; disabled?: boolean; placeholder?: string;
  required?: boolean; error?: string; hint?: string;
} & PassThrough) {
  return multiline ? <TextArea {...props} /> : <TextField {...props} />;
}

/** Inline validation next to the field it belongs to, instead of a generic alert. Legacy name for InlineError. */
export function FieldError({ message }: { message?: string }) {
  return <InlineError message={message} />;
}

/** Lists what is still missing, right above the save button where the user is looking. */
export function MissingSummary({ items }: { items: string[] }) {
  if (!items.length) return null;
  return <View accessibilityRole="alert" accessibilityLiveRegion="polite" style={styles.missing}>
    <View style={styles.missingHead}>
      <AlertCircle size={18} color={colors.warn} />
      <Text style={{ color: colors.warn, fontWeight: '700', flex: 1 }}>ยังขาดข้อมูลที่ต้องกรอก</Text>
    </View>
    {items.map(item => <Text key={item} style={{ color: colors.warn, paddingLeft: 18 + spacing.sm }}>• {item}</Text>)}
  </View>;
}

/** A form's card: optional 18pt outline icon beside the Anuphan 17 title, then a hairline before the fields. */
export function FormSection({ title, detail, icon: Icon, children }: { title: string; detail?: string; icon?: LucideIcon; children: React.ReactNode }) {
  return <Card style={styles.section}>
    <View style={styles.sectionHead}>
      <View style={styles.sectionTitleRow}>
        {Icon ? <Icon size={18} color={colors.ink} strokeWidth={1.75} style={styles.sectionIcon} /> : null}
        <Text accessibilityRole="header" style={styles.sectionTitle}>{title}</Text>
      </View>
      {detail ? <Text style={styles.sectionDetail}>{detail}</Text> : null}
    </View>
    {children}
  </Card>;
}

/**
 * Sticky bottom action bar for form screens: raised, with a top hairline and an upward soft shadow.
 * Children are usually MissingSummary/InlineError and one full-width primary Button.
 */
export function StickyBar({ children, bottomInset = 0 }: { children: React.ReactNode; bottomInset?: number }) {
  return <View style={[styles.stickyBar, { paddingBottom: spacing.md + bottomInset }]}>{children}</View>;
}

/** On/off setting with the whole row (label included) as the 48pt tap target. */
export function SwitchRow({ label, detail, value, onValueChange, disabled = false }: {
  label: string; detail?: string; value: boolean; onValueChange: (value: boolean) => void; disabled?: boolean;
}) {
  return <Pressable accessibilityRole="switch" accessibilityLabel={label} accessibilityHint={detail}
    accessibilityState={{ checked: value, disabled }} disabled={disabled} onPress={() => onValueChange(!value)}
    style={({ pressed }) => [styles.toggleRow, pressed && { opacity: 0.7 }, disabled && { opacity: 0.5 }]}>
    <View style={styles.toggleText}>
      <Text style={styles.toggleLabel}>{label}</Text>
      {detail ? <Text style={styles.fieldHint}>{detail}</Text> : null}
    </View>
    <Switch accessible={false} importantForAccessibility="no" accessibilityElementsHidden value={value} onValueChange={onValueChange} disabled={disabled}
      trackColor={{ false: colors.line, true: colors.ink }} thumbColor={colors.surface} />
  </Pressable>;
}

/** Checkbox row drawn with the icon set (no ☐/☑ glyphs); the whole row toggles. */
export function CheckRow({ label, detail, checked, onChange, disabled = false }: {
  label: string; detail?: string; checked: boolean; onChange: (checked: boolean) => void; disabled?: boolean;
}) {
  const Icon = checked ? SquareCheck : Square;
  return <Pressable accessibilityRole="checkbox" accessibilityLabel={label} accessibilityHint={detail}
    accessibilityState={{ checked, disabled }} disabled={disabled} onPress={() => onChange(!checked)}
    style={({ pressed }) => [styles.toggleRow, pressed && { opacity: 0.7 }, disabled && { opacity: 0.5 }]}>
    <Icon size={22} color={checked ? colors.ink : colors.muted} />
    <View style={styles.toggleText}>
      <Text style={styles.toggleLabel}>{label}</Text>
      {detail ? <Text style={styles.fieldHint}>{detail}</Text> : null}
    </View>
  </Pressable>;
}

const styles = StyleSheet.create({
  fieldHint: { fontSize: 13, lineHeight: 20, color: colors.muted },
  sectionTitle: { ...typeScale.section, color: colors.ink, flex: 1, minWidth: 0 },
  sectionTitleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  sectionIcon: { marginTop: 4 },
  stickyBar: { backgroundColor: colors.raised, borderTopWidth: 1, borderTopColor: colors.divider, paddingHorizontal: spacing.lg,
    paddingTop: spacing.md, gap: spacing.sm, ...shadow.bar },
  stickyInner: { width: '100%', maxWidth: 760 - spacing.lg * 2, alignSelf: 'center', gap: spacing.sm },
  section: { gap: spacing.sm, marginVertical: spacing.xs, padding: spacing.lg },
  sectionHead: { borderBottomWidth: 1, borderBottomColor: colors.divider, paddingBottom: spacing.md, marginBottom: spacing.xs },
  sectionDetail: { color: colors.muted, fontSize: 14, lineHeight: 22, marginTop: spacing.xs },
  missing: { borderWidth: 1, borderColor: colors.warnEdge, backgroundColor: colors.warnSoft, borderRadius: radius.lg,
    padding: spacing.md, gap: spacing.xs },
  missingHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  toggleRow: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.xs },
  toggleText: { flex: 1, minWidth: 0, gap: 2 },
  toggleLabel: { fontSize: 15, color: colors.text },
});

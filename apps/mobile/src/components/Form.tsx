import React, { useEffect, useId, useRef } from 'react';
import { InputAccessoryView, Keyboard, Platform, Pressable, ScrollView, StyleSheet, Switch, TextInput as NativeTextInput, TextInputProps, View } from 'react-native';
import { Square, SquareCheck } from 'lucide-react-native';
import { KeyboardAccessoryContext, Text, TextInput } from '@/components/AppText';
import { Card } from './ui';
import { useKeyboardHeight } from '@/hooks/useKeyboardHeight';
import { colors, fonts, spacing, radius, pageContent, formLabelSpacing } from '@/theme';

export function FormPage({ children }: { children: React.ReactNode }) {
  const keyboardHeight = useKeyboardHeight();
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
    {Platform.OS === 'ios' && <InputAccessoryView nativeID={accessoryId}>
      <View style={{ backgroundColor: colors.soft, alignItems: 'flex-end', borderTopWidth: 1, borderColor: colors.line }}>
        <Pressable accessibilityRole="button" accessibilityLabel="เสร็จสิ้นการกรอก" onPress={Keyboard.dismiss} style={{ minHeight: 44, padding: spacing.md }}>
          <Text style={{ color: colors.ink, fontWeight: '700' }}>เสร็จสิ้น</Text>
        </Pressable>
      </View>
    </InputAccessoryView>}
  </KeyboardAccessoryContext.Provider>;
}

/** Screen-reader name for a field: the visible label plus its required state. */
export function fieldA11yLabel(label: string, required = false) {
  return required ? `${label} · จำเป็นต้องกรอก` : label;
}

/**
 * The visible label above every input and picker (14/600 ink). Section titles stay larger
 * (FormSection, Anuphan 17), so a field never reads as a heading. `required` adds the shared " *".
 */
export function FieldLabel({ children, required = false, hint }: { children: React.ReactNode; required?: boolean; hint?: string }) {
  return <View style={styles.labelWrap}>
    <Text style={styles.fieldLabel}>{children}{required ? ' *' : ''}</Text>
    {hint ? <Text style={styles.fieldHint}>{hint}</Text> : null}
  </View>;
}

type PassThrough = Pick<TextInputProps, 'keyboardType' | 'secureTextEntry' | 'maxLength' | 'autoCapitalize' | 'autoComplete'
  | 'returnKeyType' | 'onSubmitEditing' | 'textContentType' | 'autoFocus'>;

export function FormField({ label, value, onChange, multiline = false, disabled = false, placeholder, required = false, error, hint, ...input }: {
  label: string; value: string; onChange: (value: string) => void; multiline?: boolean; disabled?: boolean; placeholder?: string;
  /** Adds the shared " *" marker to the visible label and announces the field as required. */
  required?: boolean;
  /** Inline message shown under the input; also outlines it in the warning color. */
  error?: string;
  /** One short helper line under the label (format, limits). */
  hint?: string;
} & PassThrough) {
  return <View style={{ gap: spacing.sm }}>
    <FieldLabel required={required} hint={hint}>{label}</FieldLabel>
    <TextInput {...input} accessibilityLabel={fieldA11yLabel(label, required)} accessibilityHint={error || hint || undefined}
      value={value} onChangeText={onChange} editable={!disabled}
      multiline={multiline} placeholder={placeholder} placeholderTextColor={colors.faint}
      style={{ minHeight: multiline ? 100 : 48, textAlignVertical: multiline ? 'top' : 'center', padding: spacing.md,
        borderWidth: 1, borderColor: error ? colors.warn : colors.line, borderRadius: radius.button,
        backgroundColor: disabled ? colors.soft : colors.surface, color: colors.text, fontSize: 16 }} />
    <FieldError message={error} />
  </View>;
}

/** Inline validation next to the field it belongs to, instead of a generic alert. */
export function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={{ color: colors.warn, fontSize: 14 }}>{message}</Text>;
}

/** Lists what is still missing, right above the save button where the user is looking. */
export function MissingSummary({ items }: { items: string[] }) {
  if (!items.length) return null;
  return <View accessibilityRole="alert" accessibilityLiveRegion="polite"
    style={{ borderWidth: 1, borderColor: colors.warn, backgroundColor: colors.warnSoft, borderRadius: radius.card, padding: spacing.md, gap: spacing.xs }}>
    <Text style={{ color: colors.warn, fontWeight: '700' }}>ยังขาดข้อมูลที่ต้องกรอก</Text>
    {items.map(item => <Text key={item} style={{ color: colors.warn }}>• {item}</Text>)}
  </View>;
}

export function FormSection({ title, detail, children }: { title: string; detail?: string; children: React.ReactNode }) {
  return <Card style={{ gap: spacing.sm, marginVertical: spacing.xs, padding: spacing.lg }}>
    <View style={{ borderBottomWidth: 1, borderBottomColor: colors.line, paddingBottom: spacing.md }}>
      <Text accessibilityRole="header" style={styles.sectionTitle}>{title}</Text>
      {detail ? <Text style={{ color: colors.muted, fontSize: 14, lineHeight: 22, marginTop: spacing.sm }}>{detail}</Text> : null}
    </View>
    {children}
  </Card>;
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
  labelWrap: { ...formLabelSpacing, gap: 2 },
  fieldLabel: { fontSize: 14, lineHeight: 20, fontWeight: '600', color: colors.ink },
  fieldHint: { fontSize: 13, lineHeight: 20, color: colors.muted },
  sectionTitle: { fontSize: 17, lineHeight: 26, fontFamily: fonts.bold, color: colors.ink },
  toggleRow: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.xs },
  toggleText: { flex: 1, minWidth: 0, gap: 2 },
  toggleLabel: { fontSize: 15, color: colors.text },
});

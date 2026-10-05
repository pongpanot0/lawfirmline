import React, { useEffect, useId, useRef } from 'react';
import { InputAccessoryView, Keyboard, Platform, Pressable, ScrollView, TextInput as NativeTextInput, View } from 'react-native';
import { KeyboardAccessoryContext, Text, TextInput } from '@/components/AppText';
import { Card, SectionLabel } from './ui';
import { useKeyboardHeight } from '@/hooks/useKeyboardHeight';
import { colors, spacing, radius, pageContent, formLabelSpacing } from '@/theme';

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

export function FormField({ label, value, onChange, multiline = false, disabled = false, placeholder }: {
  label: string; value: string; onChange: (value: string) => void; multiline?: boolean; disabled?: boolean; placeholder?: string;
}) {
  return <View style={{ gap: spacing.sm }}>
    <SectionLabel style={formLabelSpacing}>{label}</SectionLabel>
    <TextInput accessibilityLabel={label} value={value} onChangeText={onChange} editable={!disabled}
      multiline={multiline} placeholder={placeholder} placeholderTextColor={colors.faint}
      style={{ minHeight: multiline ? 100 : 48, textAlignVertical: multiline ? 'top' : 'center', padding: spacing.md,
        borderWidth: 1, borderColor: colors.line, borderRadius: radius.button, backgroundColor: colors.surface, color: colors.text, fontSize: 16 }} />
  </View>;
}

export function FormSection({ title, detail, children }: { title: string; detail?: string; children: React.ReactNode }) {
  return <Card style={{ gap: spacing.sm, marginVertical: spacing.xs, padding: spacing.lg }}>
    <View style={{ borderBottomWidth: 1, borderBottomColor: colors.line, paddingBottom: spacing.md }}>
      <SectionLabel style={{ marginTop: 0, marginBottom: 0 }}>{title}</SectionLabel>
      {detail ? <Text style={{ color: colors.muted, fontSize: 14, lineHeight: 22, marginTop: spacing.sm }}>{detail}</Text> : null}
    </View>
    {children}
  </Card>;
}

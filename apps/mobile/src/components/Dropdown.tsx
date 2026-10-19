import React, { useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text, TextInput } from '@/components/AppText';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { Check, ChevronDown, X } from 'lucide-react-native';
import { Button } from './Button';
import { FieldLabel, fieldA11yLabel } from './FieldLabel';
import { InlineError as FieldError } from './States';
import { CHROME_MAX_SCALE, colors, control, fonts, radius, shadow, spacing, TOUCH } from '@/theme';
import { useKeyboardHeight } from '@/hooks/useKeyboardHeight';

/**
 * Single choice. `label` names the choice (modal title, and the placeholder when nothing is picked).
 * Pass `fieldLabel` to show a visible label above the field that stays after a value is picked;
 * `required`/`error`/`hint` then render like FormField. `inline` shows up to 4 options as chips
 * instead of opening a modal.
 */
export function Dropdown({ label, value, options, onChange, disabled = false, fieldLabel, required = false, error, hint, placeholder, inline = false }: {
  label: string;
  value: string;
  options: ReadonlyArray<{ value: string; label: string }>;
  onChange: (value: string) => void;
  disabled?: boolean;
  /** Visible label above the field. Opt-in so screens that still render their own SectionLabel do not double up. */
  fieldLabel?: string;
  required?: boolean;
  error?: string;
  hint?: string;
  /** Text shown in the empty field; defaults to `label`. */
  placeholder?: string;
  /** With 4 or fewer options, render them as chips (one tap, no modal). */
  inline?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const keyboardHeight = useKeyboardHeight();
  const name = fieldLabel ?? label;
  const selected = options.find((option) => option.value === value);
  const filtered = options.filter(option => option.label.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()));
  const head = fieldLabel ? <FieldLabel required={required} hint={hint}>{fieldLabel}</FieldLabel> : null;

  if (inline && options.length <= 4) {
    return <View style={styles.group}>
      {head}
      <View accessibilityRole="radiogroup" accessibilityLabel={fieldA11yLabel(name, required)} style={styles.chips}>
        {options.map(option => {
          const on = option.value === value;
          return <Pressable key={option.value} accessibilityRole="radio" accessibilityLabel={option.label}
            accessibilityState={{ checked: on, selected: on, disabled }} disabled={disabled} onPress={() => onChange(option.value)}
            style={({ pressed }) => [styles.chip, on && styles.chipOn, error && !value ? { borderColor: colors.warn } : null,
              pressed && { opacity: 0.7 }, disabled && { opacity: 0.5 }]}>
            {on ? <Check size={16} color={colors.bg} /> : null}
            <Text maxFontSizeMultiplier={CHROME_MAX_SCALE} style={[styles.chipText, on && { color: colors.bg, fontWeight: '600' }]}>{option.label}</Text>
          </Pressable>;
        })}
      </View>
      <FieldError message={error} />
    </View>;
  }

  return <View style={fieldLabel || error ? styles.group : undefined}>
    {head}
    <Pressable accessibilityRole="button" accessibilityLabel={fieldA11yLabel(name, required)} accessibilityHint={error || undefined}
      accessibilityState={{ disabled, expanded: open }}
      accessibilityValue={{ text: selected?.label ?? 'ยังไม่ได้เลือก' }}
      disabled={disabled} onPress={() => { setSearch(''); setOpen(true); }}
      style={({ pressed }) => [styles.field, error ? { borderColor: colors.warn } : null,
        disabled && styles.fieldDisabled, pressed && { borderColor: colors.ink, ...(error ? shadow.focusWarn : shadow.focus) }]}>
      <Text style={{ flex: 1, fontSize: 16, color: selected && !disabled ? colors.text : colors.muted }}>
        {selected?.label ?? placeholder ?? label}
      </Text>
      <ChevronDown size={18} color={colors.muted} />
    </Pressable>
    <FieldError message={error} />
    <Modal visible={open} animationType="slide" supportedOrientations={['portrait', 'portrait-upside-down', 'landscape-left', 'landscape-right']} onRequestClose={() => setOpen(false)}>
      <SafeAreaProvider>
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, paddingBottom: keyboardHeight }}>
        <View style={styles.sheetHead}>
          <Text accessibilityRole="header" style={styles.sheetTitle}>{name}</Text>
          <Pressable accessibilityRole="button" accessibilityLabel={`ปิด${name}`} onPress={() => setOpen(false)} style={styles.close}>
            <X size={22} color={colors.ink} />
          </Pressable>
        </View>
        {options.length > 8 && <TextInput accessibilityLabel={`ค้นหา${name}`} placeholder="ค้นหาในรายการ…" placeholderTextColor={colors.faint}
          value={search} onChangeText={setSearch} style={styles.search} />}
        <ScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
          {filtered.map((option) => {
            const on = value === option.value;
            return <Pressable key={option.value} accessibilityRole="radio" accessibilityLabel={option.label}
              accessibilityState={{ checked: on, selected: on }}
              onPress={() => { onChange(option.value); setOpen(false); }}
              style={({ pressed }) => [styles.option, pressed && { backgroundColor: colors.soft }]}>
              <Text style={{ flex: 1, color: on ? colors.ink : colors.text, fontWeight: on ? '600' : '400' }}>{option.label}</Text>
              {on ? <Check size={20} color={colors.ink} /> : null}
            </Pressable>;
          })}
          {!filtered.length && <Text style={styles.empty}>{options.length ? 'ไม่พบรายการที่ค้นหา' : 'ยังไม่มีตัวเลือก'}</Text>}
        </ScrollView>
        <View style={{ padding: spacing.lg }}><Button title="ยกเลิก" variant="secondary" onPress={() => setOpen(false)} /></View>
        </KeyboardAvoidingView>
      </SafeAreaView>
      </SafeAreaProvider>
    </Modal>
  </View>;
}

const styles = StyleSheet.create({
  group: { gap: spacing.sm },
  field: { minHeight: control.height, padding: spacing.md, borderWidth: control.borderWidth, borderColor: colors.lineStrong, borderRadius: radius.button,
    backgroundColor: colors.raised, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  fieldDisabled: { backgroundColor: colors.sunken, borderColor: colors.line },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: { minHeight: TOUCH, flexDirection: 'row', alignItems: 'center', gap: spacing.xs, paddingHorizontal: spacing.md,
    borderWidth: 1, borderColor: colors.lineStrong, borderRadius: radius.button, backgroundColor: colors.raised },
  chipOn: { borderColor: colors.ink, backgroundColor: colors.ink, ...shadow.sm },
  chipText: { fontSize: 14, color: colors.ink },
  sheetHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingLeft: spacing.lg, paddingRight: spacing.sm, paddingVertical: spacing.sm },
  sheetTitle: { flex: 1, fontSize: 20, lineHeight: 30, fontFamily: fonts.bold, color: colors.ink },
  close: { width: TOUCH, height: TOUCH, alignItems: 'center', justifyContent: 'center' },
  search: { marginHorizontal: spacing.lg, marginBottom: spacing.sm, minHeight: control.height, padding: spacing.md, borderWidth: 1,
    borderColor: colors.lineStrong, borderRadius: radius.button, backgroundColor: colors.raised, color: colors.text },
  option: { padding: spacing.lg, minHeight: 52, borderBottomWidth: 1, borderColor: colors.divider, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  empty: { textAlign: 'center', color: colors.muted, paddingVertical: spacing.xl },
});

import React from 'react';
import { StyleSheet, View, ViewStyle } from 'react-native';
import { Text } from '@/components/AppText';
import { colors, control, formLabelSpacing, shadow } from '@/theme';

/** Screen-reader name for a field: the visible label plus its required state. */
export function fieldA11yLabel(label: string, required = false) {
  return required ? `${label} · จำเป็นต้องกรอก` : label;
}

/**
 * Border state shared by every field frame (text inputs and picker triggers): 1pt strong outline at rest,
 * 2pt navy when focused/pressed, 1.5pt warning when in error (2pt when both). Padding shrinks by the extra
 * border width so the content never shifts between states.
 */
export function fieldEdge({ focused = false, error = false, disabled = false, padH = control.padding, padV = control.padding }: {
  focused?: boolean; error?: boolean; disabled?: boolean; padH?: number; padV?: number;
}): ViewStyle {
  const width = focused ? control.focusBorderWidth : error ? control.errorBorderWidth : control.borderWidth;
  const extra = width - control.borderWidth;
  return {
    borderWidth: width,
    borderColor: disabled ? colors.line : error ? colors.warn : focused ? colors.ink : colors.lineStrong,
    paddingHorizontal: padH - extra,
    paddingVertical: padV - extra,
    ...(focused ? (error ? shadow.focusWarn : shadow.focus) : null),
  };
}

/**
 * The visible label above every input and picker (14/600 ink). Section titles stay larger
 * (FormSection, Anuphan 17), so a field never reads as a heading. `required` adds the shared " *"
 * (in the warning hue, so required fields scan at a glance).
 */
export function FieldLabel({ children, required = false, hint }: { children: React.ReactNode; required?: boolean; hint?: string }) {
  return <View style={styles.labelWrap}>
    <Text style={styles.fieldLabel}>{children}{required ? <Text style={styles.required}> *</Text> : null}</Text>
    {hint ? <Text style={styles.fieldHint}>{hint}</Text> : null}
  </View>;
}

const styles = StyleSheet.create({
  labelWrap: { ...formLabelSpacing, gap: 2 },
  fieldLabel: { fontSize: 14, lineHeight: 20, fontWeight: '600', color: colors.ink },
  required: { fontSize: 14, lineHeight: 20, fontWeight: '700', color: colors.warn },
  fieldHint: { fontSize: 12, lineHeight: 18, color: colors.muted },
});

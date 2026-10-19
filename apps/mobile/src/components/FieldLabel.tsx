import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from '@/components/AppText';
import { colors, formLabelSpacing } from '@/theme';

/** Screen-reader name for a field: the visible label plus its required state. */
export function fieldA11yLabel(label: string, required = false) {
  return required ? `${label} · จำเป็นต้องกรอก` : label;
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
  fieldHint: { fontSize: 13, lineHeight: 20, color: colors.muted },
});

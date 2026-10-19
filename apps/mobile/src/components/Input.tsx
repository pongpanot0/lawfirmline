import React, { forwardRef, useState } from 'react';
import { StyleSheet, TextInput as NativeTextInput, TextInputProps, View } from 'react-native';
import { AlertCircle } from 'lucide-react-native';
import { TextInput } from '@/components/AppText';
import { FieldLabel, fieldA11yLabel, fieldEdge } from './FieldLabel';
import { InlineError } from './States';
import { Dropdown } from './Dropdown';
import { DatePicker } from './DatePicker';
import { colors, control, radius, spacing } from '@/theme';

/**
 * The input family. Every field shares one frame: 48pt single-line height, 8px radius, a strong
 * (3:1) outline, a 2pt navy border (plus a soft ring) when focused, a 1.5pt warning border with a trailing
 * alert icon and an inline message on error, and a sunken fill when disabled. Border changes never shift
 * the text (see fieldEdge). Labels sit 6pt above the frame and stay visible once filled.
 */

type FieldChrome = {
  label: string;
  /** Adds " *" to the visible label and announces the field as required. */
  required?: boolean;
  /** One short helper line under the label (format, limits). */
  hint?: string;
  /** Inline message under the field; also outlines it in the warning colour and becomes the a11y hint. */
  error?: string;
  disabled?: boolean;
};

type NativeProps = Omit<TextInputProps, 'value' | 'onChange' | 'onChangeText' | 'editable' | 'multiline' | 'style'>;

export type TextFieldProps = FieldChrome & NativeProps & {
  value: string;
  onChange: (value: string) => void;
  /** Extra frame styles (e.g. a taller TextArea). */
  inputStyle?: TextInputProps['style'];
};

/** The shared frame styles, exported for custom inputs that must match (search boxes, pickers). */
export function fieldFrame({ focused = false, error = false, disabled = false }: { focused?: boolean; error?: boolean; disabled?: boolean }) {
  return [styles.frame, fieldEdge({ focused, error, disabled }), disabled && styles.frameDisabled];
}

const BaseField = forwardRef<NativeTextInput, TextFieldProps & { multiline?: boolean }>(function BaseField(
  { label, required = false, hint, error, disabled = false, value, onChange, multiline = false, inputStyle, onFocus, onBlur, ...native }, ref) {
  const [focused, setFocused] = useState(false);
  return <View style={styles.group}>
    <FieldLabel required={required} hint={hint}>{label}</FieldLabel>
    <View>
      <TextInput ref={ref} {...native}
        accessibilityLabel={native.accessibilityLabel ?? fieldA11yLabel(label, required)}
        accessibilityHint={error || hint || native.accessibilityHint}
        accessibilityState={{ disabled }}
        value={value} onChangeText={onChange} editable={!disabled} multiline={multiline}
        placeholderTextColor={native.placeholderTextColor ?? colors.faint}
        onFocus={e => { setFocused(true); onFocus?.(e); }}
        onBlur={e => { setFocused(false); onBlur?.(e); }}
        style={[fieldFrame({ focused, error: !!error, disabled }), multiline && styles.multiline, !!error && styles.withIcon, inputStyle]} />
      {error ? <View pointerEvents="none" style={[styles.errorIcon, multiline && styles.errorIconTop]}>
        <AlertCircle size={20} color={colors.warn} />
      </View> : null}
    </View>
    <InlineError variant="field" message={error} />
  </View>;
});

/** Single-line text input. */
export const TextField = forwardRef<NativeTextInput, TextFieldProps>(function TextField(props, ref) {
  return <BaseField ref={ref} {...props} />;
});

/** Multi-line text input; grows from 100pt, text starts top-left. */
export const TextArea = forwardRef<NativeTextInput, TextFieldProps>(function TextArea(props, ref) {
  return <BaseField ref={ref} {...props} multiline />;
});

/**
 * Single choice: the Dropdown look and behaviour (modal list, or chips with `inline`) with the field chrome.
 * `person` shows the picked person's initials avatar at the start of the field (the option label is the name).
 */
export function SelectField({ label, ...props }: FieldChrome & Omit<React.ComponentProps<typeof Dropdown>, 'fieldLabel' | 'label'> & {
  /** Modal title / empty-field text when it should differ from the visible label. */
  sheetTitle?: string;
}) {
  const { sheetTitle, ...rest } = props;
  return <Dropdown {...rest} label={sheetTitle ?? label} fieldLabel={label} />;
}

/** Date input: the DatePicker calendar sheet with the field chrome. */
export function DateField(props: FieldChrome & Omit<React.ComponentProps<typeof DatePicker>, 'label'>) {
  return <DatePicker {...props} />;
}

const styles = StyleSheet.create({
  group: { gap: 6 },
  frame: { minHeight: control.height, borderRadius: radius.button, backgroundColor: colors.raised, color: colors.text, fontSize: 16,
    textAlignVertical: 'center' },
  frameDisabled: { backgroundColor: colors.sunken, color: colors.muted },
  multiline: { minHeight: 100, textAlignVertical: 'top' },
  // Room for the trailing alert icon so typed text never runs under it.
  withIcon: { paddingRight: spacing.md + 20 + spacing.sm },
  errorIcon: { position: 'absolute', right: spacing.md, top: 0, bottom: 0, justifyContent: 'center' },
  errorIconTop: { bottom: undefined, top: spacing.md },
});

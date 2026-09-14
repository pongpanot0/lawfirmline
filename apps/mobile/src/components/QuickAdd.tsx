import React, { useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { Plus } from 'lucide-react-native';
import { colors, radius, spacing, TOUCH } from '@/theme';

/** One-line "type and add" row — the fastest create the phone allows. */
export function QuickAdd({
  placeholder,
  onSubmit,
  busy,
}: {
  placeholder: string;
  onSubmit: (title: string) => void;
  busy?: boolean;
}) {
  const [text, setText] = useState('');

  const submit = () => {
    const title = text.trim();
    if (!title || busy) return;
    onSubmit(title);
    setText('');
  };

  return (
    <View style={styles.row}>
      <TextInput
        style={styles.input}
        placeholder={placeholder}
        placeholderTextColor={colors.faint}
        value={text}
        onChangeText={setText}
        onSubmitEditing={submit}
        returnKeyType="done"
      />
      <Pressable
        style={[styles.button, (!text.trim() || busy) && { opacity: 0.4 }]}
        onPress={submit}
        hitSlop={6}
      >
        <Plus size={20} color={colors.bg} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center' },
  input: {
    flex: 1,
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: radius.button,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    fontSize: 15,
    color: colors.text,
  },
  button: {
    width: TOUCH - 4,
    height: TOUCH - 4,
    borderRadius: radius.button,
    backgroundColor: colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

import React, { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { TextInput } from '@/components/AppText';
import { Plus } from 'lucide-react-native';
import { colors, radius, spacing, TOUCH } from '@/theme';

/** One-line "type and add" row — the fastest create the phone allows. */
export function QuickAdd({
  placeholder,
  onSubmit,
  busy,
}: {
  placeholder: string;
  onSubmit: (title: string) => void | Promise<unknown>;
  busy?: boolean;
}) {
  const [text, setText] = useState('');

  const submit = async () => {
    const title = text.trim();
    if (!title || busy) return;
    try {
      await onSubmit(title);
      setText('');
    } catch {
      // Keep the title for retry; the caller displays the request error.
    }
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
        accessibilityRole="button"
        accessibilityLabel="เพิ่มงาน"
        disabled={!text.trim() || busy}
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
    width: TOUCH,
    height: TOUCH,
    borderRadius: radius.button,
    backgroundColor: colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

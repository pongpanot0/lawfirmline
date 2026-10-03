import React, { useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, View } from 'react-native';
import { Text, TextInput } from '@/components/AppText';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { ChevronDown } from 'lucide-react-native';
import { Button } from './ui';
import { colors, spacing } from '@/theme';
import { useKeyboardHeight } from '@/hooks/useKeyboardHeight';

export function Dropdown({ label, value, options, onChange, disabled = false }: {
  label: string;
  value: string;
  options: ReadonlyArray<{ value: string; label: string }>;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const keyboardHeight = useKeyboardHeight();
  return <>
    <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled, expanded: open }}
      accessibilityValue={{ text: options.find((option) => option.value === value)?.label ?? 'ยังไม่ได้เลือก' }}
      disabled={disabled} onPress={() => { setSearch(''); setOpen(true); }}
      style={{ minHeight: 48, padding: spacing.md, borderWidth: 1, borderColor: colors.line,
        borderRadius: 10, backgroundColor: colors.surface, flexDirection: 'row', alignItems: 'center' }}>
      <Text style={{ flex: 1, color: value ? colors.text : colors.muted }}>
        {options.find((option) => option.value === value)?.label ?? label}
      </Text>
      <ChevronDown size={18} color={colors.muted} />
    </Pressable>
    <Modal visible={open} animationType="slide" supportedOrientations={['portrait', 'portrait-upside-down', 'landscape-left', 'landscape-right']} onRequestClose={() => setOpen(false)}>
      <SafeAreaProvider>
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, paddingBottom: keyboardHeight }}>
        <View style={{ padding: spacing.lg }}><Text style={{ fontSize: 20, fontWeight: '700', color: colors.ink }}>{label}</Text></View>
        {options.length > 8 && <TextInput accessibilityLabel={`ค้นหา${label}`} placeholder="ค้นหาในรายการ…"
          value={search} onChangeText={setSearch} style={{ marginHorizontal: spacing.lg, marginBottom: spacing.sm,
            minHeight: 48, padding: spacing.md, borderWidth: 1, borderColor: colors.line, borderRadius: 10, color: colors.text }} />}
        <ScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
          {options.filter(option => option.label.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase())).map((option) => <Pressable key={option.value} accessibilityRole="button"
            onPress={() => { onChange(option.value); setOpen(false); }}
            style={{ padding: spacing.lg, minHeight: 52, borderBottomWidth: 1, borderColor: colors.line }}>
            <Text style={{ color: value === option.value ? colors.accentInk : colors.text }}>{option.label}</Text>
          </Pressable>)}
        </ScrollView>
        <View style={{ padding: spacing.lg }}><Button title="ยกเลิก" ghost onPress={() => setOpen(false)} /></View>
        </KeyboardAvoidingView>
      </SafeAreaView>
      </SafeAreaProvider>
    </Modal>
  </>;
}

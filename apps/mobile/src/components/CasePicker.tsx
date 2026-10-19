import React, { useEffect, useState } from 'react';
import { FlatList, KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { Text, TextInput } from '@/components/AppText';
import { Check, ChevronDown, X } from 'lucide-react-native';
import { useCases } from '@/api/hooks';
import type { CaseListItem } from '@/api/types';
import { colors, fonts, radius, spacing, TOUCH } from '@/theme';
import { useKeyboardHeight } from '@/hooks/useKeyboardHeight';
import { ErrorNote } from './ui';
import { FieldError, FieldLabel, fieldA11yLabel } from './Form';

export interface CaseRef {
  id: string;
  label: string;
}

/**
 * Mobile stand-in for the web's case <select>: same /cases source, but
 * searchable full-screen — a dropdown of hundreds of cases is unusable
 * with a thumb. `label` renders a visible label above the field.
 */
export function CasePicker({
  value,
  onChange,
  allowNone,
  label,
  required = false,
  error,
  placeholder,
  disabled = false,
}: {
  value: CaseRef | null;
  onChange: (next: CaseRef | null) => void;
  /** Show a "no case" row — for records that may be office-level, like expenses. */
  allowNone?: boolean;
  label?: string;
  required?: boolean;
  error?: string;
  placeholder?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const keyboardHeight = useKeyboardHeight();
  // Wait for a pause in typing before searching, instead of one request per keystroke.
  useEffect(() => {
    const timer = setTimeout(() => setQuery(search.trim()), 300);
    return () => clearTimeout(timer);
  }, [search]);
  const cases = useCases(query);

  const pick = (item: CaseListItem | null) => {
    onChange(item ? { id: item.id, label: `${item.ownRef} · ${item.title}` } : null);
    setOpen(false);
    setSearch('');
  };
  const empty = placeholder ?? (allowNone ? 'ไม่ผูกกับคดี · แตะเพื่อเลือก' : 'แตะเพื่อเลือกคดี');

  return (
    <View style={label || error ? { gap: spacing.sm } : undefined}>
      {label ? <FieldLabel required={required}>{label}</FieldLabel> : null}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={fieldA11yLabel(label ?? 'เลือกคดี', required)}
        accessibilityHint={error || undefined}
        accessibilityValue={{ text: value?.label ?? (allowNone ? 'ไม่ผูกกับคดี' : 'ยังไม่ได้เลือก') }}
        accessibilityState={{ disabled, expanded: open }}
        disabled={disabled}
        style={({ pressed }) => [styles.field, error ? { borderColor: colors.warn } : null, (pressed || disabled) && { backgroundColor: colors.soft }]}
        onPress={() => setOpen(true)}
      >
        <Text style={[styles.fieldText, !value && { color: colors.muted }]} numberOfLines={1}>
          {value?.label ?? empty}
        </Text>
        <ChevronDown size={18} color={colors.muted} />
      </Pressable>
      <FieldError message={error} />

      <Modal visible={open} animationType="slide" supportedOrientations={['portrait', 'portrait-upside-down', 'landscape-left', 'landscape-right']} onRequestClose={() => setOpen(false)}>
        <SafeAreaProvider><SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={[styles.sheet, { paddingBottom: spacing.lg + keyboardHeight }]}>
          <View style={styles.sheetHead}>
            <Text accessibilityRole="header" style={[styles.sheetTitle, { flex: 1 }]}>{label ?? 'เลือกคดี'}</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="ปิดตัวเลือกคดี" onPress={() => setOpen(false)} style={styles.closeButton}>
              <X size={22} color={colors.ink} />
            </Pressable>
          </View>
          <TextInput
            style={styles.search}
            accessibilityLabel="ค้นหาคดี"
            placeholder="ค้นหาเลขคดี ชื่อคดี หรือลูกความ…"
            placeholderTextColor={colors.faint}
            value={search}
            onChangeText={setSearch}
            returnKeyType="search"
            onSubmitEditing={() => setQuery(search.trim())}
            autoFocus
          />
          {cases.isError && <ErrorNote message="โหลดรายชื่อคดีไม่สำเร็จ" onRetry={() => cases.refetch()} />}
          <FlatList
            data={cases.data ?? []}
            keyExtractor={(item) => item.id}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            ListHeaderComponent={
              allowNone ? (
                <Pressable accessibilityRole="radio" accessibilityLabel="ไม่ผูกกับคดี" accessibilityState={{ checked: !value, selected: !value }}
                  style={({ pressed }) => [styles.row, pressed && styles.pressed]} onPress={() => pick(null)}>
                  <Text style={[styles.rowTitle, { flex: 1, color: colors.muted }]}>ไม่ผูกกับคดี</Text>
                  {!value ? <Check size={20} color={colors.ink} /> : null}
                </Pressable>
              ) : null
            }
            ListEmptyComponent={
              cases.isError ? null : <Text style={styles.empty}>
                {cases.isLoading || search.trim() !== query ? 'กำลังค้นหา…' : query ? 'ไม่พบคดีที่ค้นหา' : 'ยังไม่มีคดีที่คุณเปิดดูได้'}
              </Text>
            }
            renderItem={({ item }) => {
              const on = value?.id === item.id;
              return (
                <Pressable accessibilityRole="radio" accessibilityLabel={`${item.ownRef} ${item.title}${item.clientName ? ` · ${item.clientName}` : ''}`}
                  accessibilityState={{ checked: on, selected: on }}
                  style={({ pressed }) => [styles.row, pressed && styles.pressed]} onPress={() => pick(item)}>
                  <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                    <Text style={styles.rowTitle}>
                      {item.ownRef} · {item.title}
                    </Text>
                    {item.clientName ? (
                      <Text style={styles.rowMeta}>
                        {item.clientName}
                      </Text>
                    ) : null}
                  </View>
                  {on ? <Check size={20} color={colors.ink} /> : null}
                </Pressable>
              );
            }}
          />
        </KeyboardAvoidingView>
        </SafeAreaView></SafeAreaProvider>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: radius.button,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    minHeight: 48,
  },
  fieldText: { flex: 1, fontSize: 15, color: colors.text },
  sheet: { flex: 1, backgroundColor: colors.bg, padding: spacing.lg, gap: spacing.sm },
  sheetHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sheetTitle: { fontSize: 20, lineHeight: 30, fontFamily: fonts.bold, color: colors.ink },
  closeButton: {
    width: TOUCH,
    height: TOUCH,
    alignItems: 'center',
    justifyContent: 'center',
  },
  search: {
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: radius.button,
    paddingHorizontal: spacing.md,
    paddingVertical: 11,
    minHeight: 48,
    fontSize: 15,
    color: colors.text,
  },
  row: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: colors.soft,
  },
  pressed: { backgroundColor: colors.soft },
  rowTitle: { fontSize: 15, fontWeight: '600', color: colors.text },
  rowMeta: { fontSize: 13, color: colors.muted },
  empty: { textAlign: 'center', color: colors.muted, paddingVertical: spacing.xl },
});

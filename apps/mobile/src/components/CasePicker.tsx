import React, { useState } from 'react';
import { FlatList, KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { Text, TextInput } from '@/components/AppText';
import { ChevronDown, X } from 'lucide-react-native';
import { useCases } from '@/api/hooks';
import type { CaseListItem } from '@/api/types';
import { colors, radius, spacing, TOUCH } from '@/theme';
import { useKeyboardHeight } from '@/hooks/useKeyboardHeight';

export interface CaseRef {
  id: string;
  label: string;
}

/**
 * Mobile stand-in for the web's case <select>: same /cases source, but
 * searchable full-screen — a dropdown of hundreds of cases is unusable
 * with a thumb.
 */
export function CasePicker({
  value,
  onChange,
  allowNone,
}: {
  value: CaseRef | null;
  onChange: (next: CaseRef | null) => void;
  /** Show a "no case" row — for records that may be office-level, like expenses. */
  allowNone?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const keyboardHeight = useKeyboardHeight();
  const cases = useCases(search);

  const pick = (item: CaseListItem | null) => {
    onChange(item ? { id: item.id, label: `${item.ownRef} · ${item.title}` } : null);
    setOpen(false);
    setSearch('');
  };

  return (
    <>
      <Pressable style={styles.field} onPress={() => setOpen(true)}>
        <Text
          style={[styles.fieldText, !value && { color: colors.faint }]}
          numberOfLines={1}
        >
          {value?.label ?? (allowNone ? 'ไม่ผูกกับคดี (แตะเพื่อเลือก)' : 'แตะเพื่อเลือกคดี')}
        </Text>
        <ChevronDown size={18} color={colors.faint} />
      </Pressable>

      <Modal visible={open} animationType="slide" supportedOrientations={['portrait', 'portrait-upside-down', 'landscape-left', 'landscape-right']} onRequestClose={() => setOpen(false)}>
        <SafeAreaProvider><SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={[styles.sheet, { paddingBottom: spacing.lg + keyboardHeight }]}>
          <View style={styles.sheetHead}>
            <Text style={[styles.sheetTitle, { flex: 1 }]}>เลือกคดี</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="ปิดตัวเลือกคดี" hitSlop={10} onPress={() => setOpen(false)} style={styles.closeButton}>
              <X size={22} color={colors.ink} />
            </Pressable>
          </View>
          <TextInput
            style={styles.search}
            placeholder="ค้นหาเลขคดี ชื่อคดี หรือลูกความ…"
            placeholderTextColor={colors.faint}
            value={search}
            onChangeText={setSearch}
            autoFocus
          />
          <FlatList
            data={cases.data ?? []}
            keyExtractor={(item) => item.id}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            ListHeaderComponent={
              allowNone ? (
                <Pressable style={styles.row} onPress={() => pick(null)}>
                  <Text style={[styles.rowTitle, { color: colors.faint }]}>ไม่ผูกกับคดี</Text>
                </Pressable>
              ) : null
            }
            ListEmptyComponent={
              <Text style={styles.empty}>
                {cases.isLoading ? 'กำลังโหลด…' : 'ไม่พบคดี'}
              </Text>
            }
            renderItem={({ item }) => (
              <Pressable style={styles.row} onPress={() => pick(item)}>
                <Text style={styles.rowTitle}>
                  {item.ownRef} · {item.title}
                </Text>
                {item.clientName ? (
                  <Text style={styles.rowMeta}>
                    {item.clientName}
                  </Text>
                ) : null}
              </Pressable>
            )}
          />
        </KeyboardAvoidingView>
        </SafeAreaView></SafeAreaProvider>
      </Modal>
    </>
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
    minHeight: TOUCH,
  },
  fieldText: { flex: 1, fontSize: 15, color: colors.text },
  sheet: { flex: 1, backgroundColor: colors.bg, padding: spacing.lg },
  sheetHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  sheetTitle: { fontSize: 18, fontWeight: '700', color: colors.ink },
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
    fontSize: 15,
    color: colors.text,
    marginBottom: spacing.sm,
  },
  row: {
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.soft,
    gap: 2,
  },
  rowTitle: { fontSize: 15, fontWeight: '600', color: colors.text },
  rowMeta: { fontSize: 12, color: colors.faint },
  empty: { textAlign: 'center', color: colors.faint, paddingVertical: spacing.xl },
});

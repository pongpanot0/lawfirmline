import React, { useState } from 'react';
import {
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { ChevronDown, X } from 'lucide-react-native';
import { useCases } from '@/api/hooks';
import type { CaseListItem } from '@/api/types';
import { colors, radius, spacing, TOUCH } from '@/theme';

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

      <Modal visible={open} animationType="slide" onRequestClose={() => setOpen(false)}>
        <View style={styles.sheet}>
          <View style={styles.sheetHead}>
            <Text style={styles.sheetTitle}>เลือกคดี</Text>
            <Pressable hitSlop={10} onPress={() => setOpen(false)} style={styles.closeButton}>
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
                <Text style={styles.rowTitle} numberOfLines={1}>
                  {item.ownRef} · {item.title}
                </Text>
                {item.clientName ? (
                  <Text style={styles.rowMeta} numberOfLines={1}>
                    {item.clientName}
                  </Text>
                ) : null}
              </Pressable>
            )}
          />
        </View>
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

import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text, TextInput } from '@/components/AppText';
import { useQueryClient } from '@tanstack/react-query';
import { ChevronRight, UserPlus } from 'lucide-react-native';
import { api } from '@/api/client';
import { useClients } from '@/api/hooks';
import { Button } from './Button';
import { InlineError, LoadingState } from './States';
import { FieldLabel, fieldA11yLabel } from './FieldLabel';
import { fieldFrame } from './Input';
import { colors, control, radius, shadow, spacing } from '@/theme';

export type PickedClient = { id: string; name: string };

const CLIENT_TYPES = [{ value: 'INDIVIDUAL', label: 'บุคคลธรรมดา' }, { value: 'COMPANY', label: 'นิติบุคคล' }] as const;

/**
 * Type to search the firm's clients; nothing is listed before typing. When no client has exactly the typed
 * name, one quiet "สร้างลูกความใหม่" row appears and asks for the client type only after it is tapped.
 * "เปลี่ยนลูกความ" keeps the current client until another is picked ("ใช้ลูกความเดิม" backs out).
 * `allowClear={false}` keeps a chosen client in place: it can be swapped for another, never unset
 * (a case cannot be unlinked from its client by leaving the field empty).
 */
export function ClientPicker({ value, onChange, disabled = false, allowClear = true, label, required = false, error }: {
  value: PickedClient | null;
  onChange: (client: PickedClient | null) => void;
  disabled?: boolean;
  allowClear?: boolean;
  /** Visible label above the field. */
  label?: string;
  required?: boolean;
  error?: string;
}) {
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [changing, setChanging] = useState(false);
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [createError, setCreateError] = useState('');
  const [focused, setFocused] = useState(false);
  const cache = useQueryClient();
  useEffect(() => {
    const timer = setTimeout(() => setQuery(search.trim()), 300);
    return () => clearTimeout(timer);
  }, [search]);
  const clients = useClients(query);
  const head = label ? <FieldLabel required={required}>{label}</FieldLabel> : null;

  if (value && !changing) {
    return <View style={styles.group}>
      {head}
      <View style={styles.picked}>
        <Text accessibilityLabel={`${label ?? 'ลูกความ'} ${value.name}`} style={styles.pickedName}>{value.name}</Text>
        <Button title="เปลี่ยนลูกความ" variant="link" disabled={disabled} onPress={() => { setChanging(true); setSearch(''); setCreating(false); }} />
      </View>
    </View>;
  }
  const pick = (client: PickedClient) => { setChanging(false); setCreating(false); setSearch(''); onChange(client); };

  const create = async (type: (typeof CLIENT_TYPES)[number]['value']) => {
    const name = search.trim();
    if (!name) return;
    setBusy(true); setCreateError('');
    try {
      const created = await api<PickedClient>('/clients', { method: 'POST', body: { name, type, contacts: [{ name, isPrimary: true }] } });
      await cache.invalidateQueries({ queryKey: ['clients'] });
      pick({ id: created.id, name: created.name });
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : 'สร้างลูกความไม่สำเร็จ');
    } finally { setBusy(false); }
  };

  const typed = search.trim();
  const settled = typed === query && !clients.isLoading;
  const rows = typed && settled ? (clients.data ?? []).slice(0, 8) : [];
  const exact = rows.some((c) => c.name.trim().toLowerCase() === typed.toLowerCase());
  return <View style={styles.group}>
    {head}
    <TextInput value={search} onChangeText={text => { setSearch(text); setCreating(false); setCreateError(''); }}
      editable={!disabled && !busy} placeholder="พิมพ์ชื่อเพื่อค้นหา หรือสร้างลูกความใหม่"
      accessibilityLabel={fieldA11yLabel(label ?? 'ค้นหาชื่อลูกความ', required)} accessibilityHint={error || undefined}
      placeholderTextColor={colors.faint} returnKeyType="search" onSubmitEditing={() => setQuery(search.trim())}
      onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
      style={fieldFrame({ focused, error: !!error, disabled: disabled || busy })} />
    <InlineError message={error} />
    {!!typed && !settled && !clients.isError && <LoadingState inline label="กำลังค้นหา…" />}
    {clients.isError && !!typed && <InlineError message="โหลดรายชื่อลูกความไม่สำเร็จ" onRetry={() => clients.refetch()} />}
    {rows.length > 0 && <View style={styles.list}>
      {rows.map((c, index) => (
        <Pressable key={c.id} accessibilityRole="button" accessibilityLabel={`เลือกลูกความ ${c.name}`} disabled={disabled}
          onPress={() => pick({ id: c.id, name: c.name })}
          style={({ pressed }) => [styles.row, index > 0 && styles.rowLine, pressed && { backgroundColor: colors.soft }]}>
          <Text style={{ flex: 1, color: colors.text }}>{c.name}</Text>
          <ChevronRight size={18} color={colors.muted} />
        </Pressable>
      ))}
    </View>}
    {!!typed && settled && !clients.isError && !rows.length && <Text style={styles.note}>ไม่พบลูกความชื่อนี้ · สร้างใหม่ได้ด้านล่าง</Text>}
    {!!typed && settled && !clients.isError && !exact && (creating ? <View style={styles.createBox}>
      <Text style={{ color: colors.ink, fontWeight: '600' }}>{`"${typed}" เป็นลูกความประเภทใด`}</Text>
      <View style={{ flexDirection: 'row', gap: spacing.sm }}>
        {CLIENT_TYPES.map((type) => <View key={type.value} style={{ flex: 1 }}>
          <Button title={type.label} variant="secondary" disabled={disabled || busy} onPress={() => create(type.value)} />
        </View>)}
      </View>
      {busy ? <LoadingState inline label="กำลังสร้างลูกความ…" /> : <Button title="ยกเลิก" variant="link" onPress={() => setCreating(false)} />}
    </View> : <Pressable accessibilityRole="button" accessibilityLabel={`สร้างลูกความใหม่ ${typed}`} disabled={disabled}
      onPress={() => setCreating(true)} style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.soft }]}>
      <UserPlus size={18} color={colors.info} />
      <Text style={{ flex: 1, color: colors.info, fontWeight: '600' }}>{`สร้างลูกความใหม่ "${typed}"`}</Text>
    </Pressable>)}
    <InlineError message={createError} />
    {changing && <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: spacing.lg }}>
      <Button title={`ใช้ลูกความเดิม · ${value?.name ?? ''}`} variant="link" disabled={disabled || busy}
        onPress={() => { setChanging(false); setCreating(false); setSearch(''); }} />
      {allowClear && <Button title="ไม่ระบุลูกความ" variant="link" disabled={disabled || busy}
        onPress={() => { setChanging(false); setCreating(false); setSearch(''); onChange(null); }} />}
    </View>}
  </View>;
}

const styles = StyleSheet.create({
  group: { gap: spacing.sm },
  picked: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: spacing.md, minHeight: control.height,
    paddingHorizontal: spacing.md, borderWidth: control.borderWidth, borderColor: colors.lineStrong, borderRadius: radius.button,
    backgroundColor: colors.raised },
  pickedName: { flex: 1, minWidth: 120, color: colors.ink, fontWeight: '600', fontSize: 16 },
  // Results drop down as a raised popover list under the field.
  list: { borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, backgroundColor: colors.raised, overflow: 'hidden', ...shadow.md },
  row: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.md },
  rowLine: { borderTopWidth: 1, borderTopColor: colors.divider },
  note: { color: colors.muted, fontSize: 14 },
  createBox: { gap: spacing.sm, padding: spacing.md, borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, backgroundColor: colors.surface },
});

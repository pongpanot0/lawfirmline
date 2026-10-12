import React, { useState } from 'react';
import { Pressable, View } from 'react-native';
import { Text, TextInput } from '@/components/AppText';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '@/api/client';
import { useClients } from '@/api/hooks';
import { Button, ErrorNote } from '@/components/ui';
import { colors, radius, spacing } from '@/theme';

export type PickedClient = { id: string; name: string };

const CLIENT_TYPES = [{ value: 'INDIVIDUAL', label: 'บุคคลธรรมดา' }, { value: 'COMPANY', label: 'นิติบุคคล' }] as const;

/**
 * Search the firm's clients; create one from the typed name when nobody matches.
 * `allowClear={false}` keeps a chosen client in place: it can be swapped for another, never unset
 * (a case cannot be unlinked from its client by leaving the field empty).
 */
export function ClientPicker({ value, onChange, disabled = false, allowClear = true }: {
  value: PickedClient | null;
  onChange: (client: PickedClient | null) => void;
  disabled?: boolean;
  allowClear?: boolean;
}) {
  const [search, setSearch] = useState('');
  const [changing, setChanging] = useState(false);
  const [clientType, setClientType] = useState<(typeof CLIENT_TYPES)[number]['value']>('INDIVIDUAL');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const cache = useQueryClient();
  const clients = useClients(search.trim());

  if (value && !changing) {
    return <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
      <Text style={{ flex: 1, color: colors.ink, fontWeight: '600' }}>{value.name}</Text>
      <Button title="เปลี่ยน" ghost disabled={disabled} onPress={() => allowClear ? onChange(null) : setChanging(true)} />
    </View>;
  }
  const pick = (client: PickedClient) => { setChanging(false); setSearch(''); onChange(client); };

  const create = async () => {
    const name = search.trim();
    if (!name) return;
    setBusy(true); setError('');
    try {
      const created = await api<PickedClient>('/clients', { method: 'POST', body: { name, type: clientType, contacts: [{ name, isPrimary: true }] } });
      await cache.invalidateQueries({ queryKey: ['clients'] });
      pick({ id: created.id, name: created.name });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'สร้างลูกความไม่สำเร็จ');
    } finally { setBusy(false); }
  };

  const rows = (clients.data ?? []).slice(0, 8);
  const exact = rows.some((c) => c.name.trim().toLowerCase() === search.trim().toLowerCase());
  return <View style={{ gap: spacing.sm }}>
    <TextInput value={search} onChangeText={setSearch} editable={!disabled && !busy} placeholder="ค้นหาชื่อลูกความ"
      accessibilityLabel="ค้นหาชื่อลูกความ" placeholderTextColor={colors.faint}
      style={{ borderWidth: 1, borderColor: colors.line, borderRadius: radius.button, padding: spacing.md, minHeight: 48 }} />
    {rows.map((c) => (
      <Pressable key={c.id} accessibilityRole="button" disabled={disabled} onPress={() => pick({ id: c.id, name: c.name })}
        style={{ minHeight: 44, justifyContent: 'center', paddingHorizontal: spacing.sm }}>
        <Text>{c.name}</Text>
      </Pressable>
    ))}
    {!!search.trim() && !exact && <>
      <View style={{ flexDirection: 'row', gap: spacing.sm }}>
        {CLIENT_TYPES.map((type) => <View key={type.value} style={{ flex: 1 }}>
          <Button title={type.label} ghost={clientType !== type.value} disabled={disabled || busy} onPress={() => setClientType(type.value)} />
        </View>)}
      </View>
      <Button title={`สร้างลูกความใหม่ "${search.trim()}"`} ghost busy={busy} disabled={disabled} onPress={create} />
    </>}
    {changing && <Button title="ใช้ลูกความเดิม" ghost disabled={disabled || busy} onPress={() => { setChanging(false); setSearch(''); }} />}
    {clients.isError && <ErrorNote message="โหลดรายชื่อลูกความไม่สำเร็จ" onRetry={() => clients.refetch()} />}
    {!!error && <Text style={{ color: colors.warn }}>{error}</Text>}
  </View>;
}

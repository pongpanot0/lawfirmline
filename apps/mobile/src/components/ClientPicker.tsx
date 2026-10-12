import React, { useState } from 'react';
import { Pressable, View } from 'react-native';
import { Text, TextInput } from '@/components/AppText';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '@/api/client';
import { useClients } from '@/api/hooks';
import { Button, ErrorNote } from '@/components/ui';
import { colors, radius, spacing } from '@/theme';

export type PickedClient = { id: string; name: string };

/** Search the firm's clients; create one from the typed name when nobody matches. */
export function ClientPicker({ value, onChange, disabled = false }: {
  value: PickedClient | null;
  onChange: (client: PickedClient | null) => void;
  disabled?: boolean;
}) {
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const cache = useQueryClient();
  const clients = useClients(search.trim());

  if (value) {
    return <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
      <Text style={{ flex: 1, color: colors.ink, fontWeight: '600' }}>{value.name}</Text>
      <Button title="เปลี่ยน" ghost disabled={disabled} onPress={() => onChange(null)} />
    </View>;
  }

  const create = async () => {
    const name = search.trim();
    if (!name) return;
    setBusy(true); setError('');
    try {
      const created = await api<PickedClient>('/clients', { method: 'POST', body: { name, type: 'INDIVIDUAL', contacts: [{ name, isPrimary: true }] } });
      await cache.invalidateQueries({ queryKey: ['clients'] });
      onChange({ id: created.id, name: created.name });
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
      <Pressable key={c.id} accessibilityRole="button" disabled={disabled} onPress={() => onChange({ id: c.id, name: c.name })}
        style={{ minHeight: 44, justifyContent: 'center', paddingHorizontal: spacing.sm }}>
        <Text>{c.name}</Text>
      </Pressable>
    ))}
    {!!search.trim() && !exact && <Button title={`สร้างลูกความใหม่ "${search.trim()}"`} ghost busy={busy} disabled={disabled} onPress={create} />}
    {clients.isError && <ErrorNote message="โหลดรายชื่อลูกความไม่สำเร็จ" onRetry={() => clients.refetch()} />}
    {!!error && <Text style={{ color: colors.warn }}>{error}</Text>}
  </View>;
}

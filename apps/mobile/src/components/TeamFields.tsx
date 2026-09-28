import React from 'react';
import { Pressable, View } from 'react-native';
import { Text, TextInput } from '@/components/AppText';
import { useMembers } from '@/api/hooks';
import { Dropdown } from './Dropdown';
import { ErrorNote, SectionLabel } from './ui';
import { colors, spacing, formLabelSpacing } from '@/theme';

/** Primary first; the remaining selected members are companions/buddies. */
export function TeamFields({ ids, onChange, primaryLabel = 'ผู้รับผิดชอบหลัก', secondaryLabel = 'ผู้ร่วม', disabled = false, max = 10 }: {
  ids: string[]; onChange: (ids: string[]) => void; primaryLabel?: string; secondaryLabel?: string; disabled?: boolean; max?: number;
}) {
  const members = useMembers();
  const [search, setSearch] = React.useState('');
  return <View style={{ gap: spacing.sm }}>
    <SectionLabel style={formLabelSpacing}>{primaryLabel} · 1 คน</SectionLabel>
    <Dropdown label={`เลือก${primaryLabel}`} value={ids[0] ?? ''} disabled={disabled || members.isLoading || members.isError}
      options={(members.data ?? []).map(person => ({ value: person.id, label: `${person.firstName} ${person.lastName}` }))}
      onChange={id => onChange([id, ...ids.slice(1).filter(value => value !== id)])} />
    {members.isError && <ErrorNote message="โหลดรายชื่อไม่สำเร็จ" onRetry={() => members.refetch()} />}
    <SectionLabel style={formLabelSpacing}>{secondaryLabel} · เลือกได้หลายคน</SectionLabel>
    <TextInput value={search} onChangeText={setSearch} placeholder="ค้นหาชื่อในทีม"
      style={{ minHeight: 48, padding: spacing.md, borderWidth: 1, borderColor: colors.line, borderRadius: 10, color: colors.text }} />
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
      {(members.data ?? []).filter(person => person.id !== ids[0] && `${person.firstName} ${person.lastName}`.includes(search.trim())).map(person => {
        const selected = ids.includes(person.id);
        return <Pressable key={person.id} accessibilityRole="checkbox" accessibilityState={{ checked: selected }}
          disabled={disabled || !ids[0] || (!selected && ids.length >= max)}
          onPress={() => onChange(selected ? ids.filter(id => id !== person.id) : [...ids, person.id])}
          style={{ minHeight: 44, padding: spacing.sm, borderWidth: 1, borderRadius: 10,
            borderColor: selected ? colors.ink : colors.line, backgroundColor: selected ? colors.soft : colors.surface }}>
          <Text style={{ color: colors.ink }}>{selected ? '✓ ' : ''}{person.firstName} {person.lastName}</Text>
        </Pressable>;
      })}
    </View>
    <Text style={{ color: colors.muted }}>เลือกแล้ว {ids.length} คน{max === 10 ? ' · สูงสุด 10 คน' : ''}</Text>
  </View>;
}

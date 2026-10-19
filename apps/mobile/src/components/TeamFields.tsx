import React from 'react';
import { Pressable, View } from 'react-native';
import { Text, TextInput } from '@/components/AppText';
import { useMembers } from '@/api/hooks';
import { Dropdown } from './Dropdown';
import { Disclosure } from './Disclosure';
import { FieldError } from './Form';
import { ErrorNote, SectionLabel } from './ui';
import { colors, spacing, formLabelSpacing } from '@/theme';

/**
 * Primary first; the remaining selected members are companions/buddies.
 * Tapping a person while nobody is primary makes them the primary, so "people picked but no primary" cannot happen.
 */
export function TeamFields({ ids, onChange, primaryLabel = 'ผู้รับผิดชอบหลัก', secondaryLabel = 'ผู้ร่วม', disabled = false, max = 10,
  required = false, error, collapseSecondary = false }: {
  ids: string[]; onChange: (ids: string[]) => void; primaryLabel?: string; secondaryLabel?: string; disabled?: boolean; max?: number;
  /** Marks the primary as required with the shared " *". */
  required?: boolean;
  /** Inline message under the primary picker. */
  error?: string;
  /** Fold the companion chips behind a disclosure (opens on its own when companions are already set). */
  collapseSecondary?: boolean;
}) {
  const members = useMembers();
  const [search, setSearch] = React.useState('');
  const primary = ids[0] ?? '';
  const companions = ids.slice(1).filter(Boolean);
  const toggle = (personId: string, selected: boolean) => {
    if (selected) return onChange(ids.filter(id => id !== personId));
    // No primary yet: the first person tapped becomes the primary.
    if (!primary) return onChange([personId, ...companions.filter(id => id !== personId)]);
    onChange([...ids, personId]);
  };
  const chips = <>
    <TextInput value={search} onChangeText={setSearch} placeholder="ค้นหาชื่อในทีม" accessibilityLabel={`ค้นหา${secondaryLabel}`}
      style={{ minHeight: 48, padding: spacing.md, borderWidth: 1, borderColor: colors.line, borderRadius: 10, color: colors.text }} />
    {!primary && <Text style={{ color: colors.muted, fontSize: 14 }}>ยังไม่มี{primaryLabel} · คนแรกที่แตะจะเป็น{primaryLabel}</Text>}
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
      {(members.data ?? []).filter(person => person.id !== primary && `${person.firstName} ${person.lastName}`.includes(search.trim())).map(person => {
        const selected = ids.includes(person.id);
        return <Pressable key={person.id} accessibilityRole="checkbox" accessibilityState={{ checked: selected }}
          disabled={disabled || (!selected && !!primary && ids.length >= max)}
          onPress={() => toggle(person.id, selected)}
          style={{ minHeight: 44, padding: spacing.sm, borderWidth: 1, borderRadius: 10,
            borderColor: selected ? colors.ink : colors.line, backgroundColor: selected ? colors.soft : colors.surface }}>
          <Text style={{ color: colors.ink }}>{selected ? '✓ ' : ''}{person.firstName} {person.lastName}</Text>
        </Pressable>;
      })}
    </View>
    <Text style={{ color: colors.muted }}>เลือกแล้ว {ids.filter(Boolean).length} คน{max === 10 ? ' · สูงสุด 10 คน' : ''}</Text>
  </>;
  return <View style={{ gap: spacing.sm }}>
    <SectionLabel style={formLabelSpacing}>{primaryLabel}{required ? ' *' : ''} · 1 คน</SectionLabel>
    <Dropdown label={`เลือก${primaryLabel}`} value={primary} disabled={disabled || members.isLoading || members.isError}
      options={(members.data ?? []).map(person => ({ value: person.id, label: `${person.firstName} ${person.lastName}` }))}
      onChange={id => onChange([id, ...ids.slice(1).filter(value => value && value !== id)])} />
    <FieldError message={error} />
    {members.isError && <ErrorNote message="โหลดรายชื่อไม่สำเร็จ" onRetry={() => members.refetch()} />}
    {collapseSecondary
      ? <Disclosure title={`${secondaryLabel} · ถ้ามี`} summary={companions.length ? `เลือกแล้ว ${companions.length} คน` : 'เพิ่มคนร่วมทำงานในแฟ้มนี้'}
          defaultOpen={companions.length > 0}>
          <View style={{ gap: spacing.sm }}>{chips}</View>
        </Disclosure>
      : <>
          <SectionLabel style={formLabelSpacing}>{secondaryLabel} · เลือกได้หลายคน</SectionLabel>
          {chips}
        </>}
  </View>;
}

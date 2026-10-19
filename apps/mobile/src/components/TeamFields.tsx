import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Check } from 'lucide-react-native';
import { Text, TextInput } from '@/components/AppText';
import { useMembers } from '@/api/hooks';
import { Dropdown } from './Dropdown';
import { Disclosure } from './Disclosure';
import { FieldLabel } from './FieldLabel';
import { fieldFrame } from './Input';
import { InlineError, LoadingState } from './States';
import { CHROME_MAX_SCALE, colors, radius, spacing, TOUCH } from '@/theme';

/** Unselected people shown before searching; the search reveals everyone else. */
const VISIBLE = 8;

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
  const [focused, setFocused] = React.useState(false);
  const primary = ids[0] ?? '';
  const companions = ids.slice(1).filter(Boolean);
  const full = !!primary && ids.length >= max;
  const toggle = (personId: string, selected: boolean) => {
    if (selected) return onChange(ids.filter(id => id !== personId));
    // No primary yet: the first person tapped becomes the primary.
    if (!primary) return onChange([personId, ...companions.filter(id => id !== personId)]);
    onChange([...ids, personId]);
  };
  const others = (members.data ?? []).filter(person => person.id !== primary);
  const term = search.trim();
  const matches = term ? others.filter(person => `${person.firstName} ${person.lastName}`.includes(term))
    : [...others.filter(person => ids.includes(person.id)), ...others.filter(person => !ids.includes(person.id)).slice(0, VISIBLE)];
  const hidden = term ? 0 : others.length - matches.length;
  const chips = <>
    <TextInput value={search} onChangeText={setSearch} placeholder="ค้นหาชื่อในทีม" placeholderTextColor={colors.faint} accessibilityLabel={`ค้นหา${secondaryLabel}`}
      onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
      editable={!disabled} style={fieldFrame({ focused, disabled })} />
    {!primary && <Text style={styles.note}>ยังไม่มี{primaryLabel} · คนแรกที่แตะจะเป็น{primaryLabel}</Text>}
    {members.isLoading && <LoadingState inline label="กำลังโหลดรายชื่อ…" />}
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
      {matches.map(person => {
        const selected = ids.includes(person.id);
        const blocked = !selected && full;
        return <Pressable key={person.id} accessibilityRole="checkbox" accessibilityLabel={`${person.firstName} ${person.lastName}`}
          accessibilityState={{ checked: selected, disabled: disabled || blocked }}
          disabled={disabled || blocked}
          onPress={() => toggle(person.id, selected)}
          style={({ pressed }) => [styles.chip, selected && styles.chipOn, (blocked || disabled) && { opacity: 0.45 }, pressed && { opacity: 0.7 }]}>
          {selected ? <Check size={16} color={colors.bg} /> : null}
          <Text maxFontSizeMultiplier={CHROME_MAX_SCALE} style={{ color: selected ? colors.bg : colors.ink, fontWeight: selected ? '600' : '400' }}>{person.firstName} {person.lastName}</Text>
        </Pressable>;
      })}
    </View>
    {!!term && !matches.length && !members.isLoading && <Text style={styles.note}>ไม่พบชื่อนี้ในทีม</Text>}
    {hidden > 0 && <Text style={styles.note}>{`อีก ${hidden} คน · พิมพ์ชื่อเพื่อค้นหา`}</Text>}
    <Text style={styles.note}>
      {full ? `ครบ ${max} คนแล้ว · เอาบางคนออกก่อนเพิ่มคนใหม่`
        : `${secondaryLabel} ${companions.length} คน${max < 999 ? ` · รวม${primaryLabel}ไม่เกิน ${max} คน` : ''}`}
    </Text>
  </>;
  return <View style={{ gap: spacing.sm }}>
    <Dropdown label={`เลือก${primaryLabel}`} fieldLabel={`${primaryLabel} · 1 คน`} required={required} error={error}
      placeholder={members.isLoading ? 'กำลังโหลดรายชื่อ…' : `เลือก${primaryLabel}`} value={primary}
      disabled={disabled || members.isLoading || members.isError}
      options={(members.data ?? []).map(person => ({ value: person.id, label: `${person.firstName} ${person.lastName}` }))}
      onChange={id => onChange([id, ...ids.slice(1).filter(value => value && value !== id)])} />
    {members.isError && <InlineError message="โหลดรายชื่อไม่สำเร็จ" onRetry={() => members.refetch()} />}
    {collapseSecondary
      ? <Disclosure title={`${secondaryLabel} · ถ้ามี`} summary={companions.length ? `เลือกแล้ว ${companions.length} คน` : 'เพิ่มคนร่วมทำงานในแฟ้มนี้'}
          defaultOpen={companions.length > 0}>
          <View style={{ gap: spacing.sm }}>{chips}</View>
        </Disclosure>
      : <>
          <FieldLabel>{`${secondaryLabel} · เลือกได้หลายคน`}</FieldLabel>
          {chips}
        </>}
  </View>;
}

const styles = StyleSheet.create({
  note: { color: colors.muted, fontSize: 14 },
  chip: { minHeight: TOUCH, flexDirection: 'row', alignItems: 'center', gap: spacing.xs, paddingHorizontal: spacing.md,
    borderWidth: 1, borderRadius: radius.button, borderColor: colors.line, backgroundColor: colors.surface },
  // Selected people read as filled navy chips, matching the FilterTabs selected state.
  chipOn: { borderColor: colors.ink, backgroundColor: colors.ink },
});

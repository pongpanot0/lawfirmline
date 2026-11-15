import React, { useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronRight, Lock, Shield } from 'lucide-react-native';
import { useQuery } from '@tanstack/react-query';
import type { CustomFieldDefinitionDto, CustomFieldEntity, CustomFieldValue } from '@lawfirm/shared';
import { api } from '@/api/client';
import { Text } from '@/components/AppText';
import { Button, Card, InlineError, LoadingState, Tag } from '@/components/ui';
import { DateField, SelectField, TextArea, TextField } from '@/components/Input';
import { formatMoney, thDate } from '@/format';
import { colors, radius, shadow, spacing, TOUCH, typeScale } from '@/theme';

type Def = CustomFieldDefinitionDto;
const EMPTY = '—';

/** Display text for a stored value, or null when the field is empty. */
function shownValue(def: Def, value: unknown): string | null {
  if (value == null || value === '') return null;
  switch (def.type) {
    case 'BOOLEAN': return value ? 'ใช่' : 'ไม่ใช่';
    case 'SELECT': return def.options.find(o => o.id === value)?.label ?? String(value);
    case 'NUMBER': return formatMoney(value as number);
    case 'DATE': return thDate(String(value));
    default: return String(value);
  }
}

/** One field: label left, value right (long text below), chevron because the row opens the editor. */
function FieldRow({ def, value, first, onPress }: { def: Def; value: unknown; first: boolean; onPress: () => void }) {
  const shown = shownValue(def, value);
  const needed = def.required && shown == null;
  const stacked = def.type === 'LONG_TEXT' && shown != null;
  const valueText = shown ?? (needed ? 'ต้องกรอก' : EMPTY);
  const valueStyle = [styles.value, stacked && styles.valueStacked, shown == null && (needed ? styles.valueNeeded : styles.valueEmpty)];
  return <Pressable accessibilityRole="button"
    accessibilityLabel={`${def.label}${def.isSensitive ? ' ข้อมูลส่วนบุคคล' : ''} ${shown ?? (needed ? 'ยังไม่กรอก จำเป็น' : 'ยังไม่กรอก')}`}
    accessibilityHint="แก้ไขข้อมูลช่องนี้" onPress={onPress}
    style={({ pressed }) => [styles.row, !first && styles.rule, pressed && styles.pressed]}>
    <View style={[styles.rowMain, stacked && styles.rowStacked]}>
      <View style={styles.labelWrap}>
        <Text style={styles.label}>{def.label}</Text>
        {def.isSensitive ? <Shield size={14} color={colors.muted} /> : null}
      </View>
      <Text style={valueStyle} numberOfLines={stacked ? 4 : undefined}>{valueText}</Text>
    </View>
    <ChevronRight size={16} color={colors.muted} />
  </Pressable>;
}

export function CustomFieldsSection({ entityKind, id, values, caseTypeId, onSaved }: { entityKind: CustomFieldEntity; id: string; values?: Record<string, unknown> | null; caseTypeId?: string | null; onSaved: () => void }) {
  const { bottom } = useSafeAreaInsets();
  const defs = useQuery({ queryKey: ['custom-fields', entityKind], queryFn: () => api<Def[]>(`/custom-fields?entityKind=${entityKind}`) });
  const journey = useQuery({ queryKey: ['custom-fields-journey', id], queryFn: () => api<{ infoMissing: string[] }>(`/cases/${id}/journey`), enabled: entityKind === 'CASE' });
  const [edit, setEdit] = useState<Def | null>(null);
  const [draft, setDraft] = useState<CustomFieldValue>(null);
  const [numberText, setNumberText] = useState('');
  const [numberError, setNumberError] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const fields = (defs.data ?? []).filter(d => !d.caseTypeIds.length || (!!caseTypeId && d.caseTypeIds.includes(caseTypeId)));
  const missing = fields.filter(d => d.required && journey.data?.infoMissing.includes(d.label));

  const open = (d: Def) => {
    const current = values?.[d.key];
    setDraft((current as CustomFieldValue | undefined) ?? null);
    setNumberText(current == null ? '' : String(current));
    setNumberError(''); setError(''); setEdit(d);
  };
  const close = () => { if (!busy) setEdit(null); };
  const save = async () => {
    if (!edit) return;
    const numberValue = numberText.trim() ? Number(numberText.replace(/,/g, '')) : null;
    if (edit.type === 'NUMBER' && numberValue !== null && !Number.isFinite(numberValue)) { setNumberError('กรอกเป็นตัวเลข เช่น 2500000'); return; }
    const value = edit.type === 'NUMBER' ? numberValue : draft;
    setBusy(true); setError('');
    try {
      await api(`/${entityKind === 'CASE' ? 'cases' : 'clients'}/${id}/custom-fields`, { method: 'PATCH', body: { values: { [edit.key]: value } } });
      setEdit(null); onSaved(); void journey.refetch();
    } catch (e) { setError(e instanceof Error ? e.message : 'บันทึกไม่สำเร็จ ลองอีกครั้ง'); }
    finally { setBusy(false); }
  };

  const input = (() => {
    if (!edit) return null;
    const common = { label: edit.label, required: edit.required, hint: edit.helpText ?? undefined };
    switch (edit.type) {
      case 'DATE':
        return <DateField {...common} value={String(draft ?? '')} onChange={v => setDraft(v || null)} onClear={() => setDraft(null)} />;
      case 'BOOLEAN':
      case 'SELECT': {
        const options = edit.type === 'BOOLEAN'
          ? [{ value: 'true', label: 'ใช่' }, { value: 'false', label: 'ไม่ใช่' }]
          : edit.options.filter(o => !o.archived || o.id === draft).map(o => ({ value: o.id, label: o.label }));
        return <SelectField {...common} inline options={[{ value: '', label: 'ไม่ระบุ' }, ...options]} value={draft == null ? '' : String(draft)}
          onChange={v => setDraft(v === '' ? null : edit.type === 'BOOLEAN' ? v === 'true' : v)} />;
      }
      case 'NUMBER':
        return <TextField {...common} autoFocus keyboardType="decimal-pad" value={numberText} error={numberError || undefined}
          onChange={v => { setNumberText(v); setNumberError(''); }} />;
      case 'LONG_TEXT':
        return <TextArea {...common} autoFocus maxLength={5000} value={String(draft ?? '')} onChange={v => setDraft(v || null)} />;
      default:
        return <TextField {...common} autoFocus maxLength={500} returnKeyType="done" onSubmitEditing={() => void save()}
          value={String(draft ?? '')} onChange={v => setDraft(v || null)} />;
    }
  })();

  // Unnamed fields come first without a heading; named sections get one.
  const groups = (['FIRM', 'PERSONAL'] as const).map(visibility => {
    const group = fields.filter(d => d.visibility === visibility);
    const sections = [...new Set(group.map(d => d.section ?? ''))].sort((a, b) => (a === '' ? -1 : b === '' ? 1 : 0));
    return { visibility, sections: sections.map(name => ({ name, items: group.filter(d => (d.section ?? '') === name) })) };
  }).filter(g => g.sections.length);

  return <>
    <Card style={styles.card}>
      <View style={styles.head}>
        <Text accessibilityRole="header" style={styles.title}>ข้อมูลเพิ่มเติม</Text>
        {missing.length > 0 ? <Tag tone="due">{`ขาด ${missing.length} ช่อง`}</Tag> : null}
      </View>
      {missing.length > 0 ? <Text style={styles.note}>กรอกช่องที่จำเป็นให้ครบก่อนเลื่อนขั้นคดี</Text> : null}
      {defs.isLoading ? <LoadingState inline label="กำลังโหลดช่องข้อมูล…" /> : null}
      {defs.isError ? <InlineError message="โหลดช่องข้อมูลไม่สำเร็จ" onRetry={() => defs.refetch()} /> : null}
      {journey.isError && entityKind === 'CASE' ? <InlineError message="ตรวจช่องที่จำเป็นไม่สำเร็จ" onRetry={() => journey.refetch()} /> : null}
      {defs.data && !fields.length ? <Text style={styles.note}>ยังไม่มีช่องข้อมูลเพิ่มเติม ตั้งค่าได้ที่เว็บ</Text> : null}
      {groups.map(({ visibility, sections }) => <View key={visibility}>
        {visibility === 'PERSONAL' ? <View style={styles.groupHead}>
          <Lock size={14} color={colors.muted} />
          <Text accessibilityRole="header" style={styles.groupLabel}>ของฉัน · เห็นเฉพาะคุณ</Text>
        </View> : null}
        {sections.map(({ name, items }) => <View key={name || '_'}>
          {name ? <Text accessibilityRole="header" style={[styles.groupLabel, styles.sectionLabel]}>{name}</Text> : null}
          {items.map((d, index) => <FieldRow key={d.id} def={d} value={values?.[d.key]} first={index === 0}onPress={() => open(d)} />)}
        </View>)}
      </View>)}
    </Card>

    <Modal visible={!!edit} transparent animationType="slide" onRequestClose={close}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.backdrop}>
        <Pressable accessibilityRole="button" accessibilityLabel="ปิด" style={StyleSheet.absoluteFill} onPress={close} />
        <View style={[styles.sheet, { paddingBottom: spacing.lg + bottom }]}>
          <View style={styles.handle} />
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: spacing.md }}>
            <Text accessibilityRole="header" style={styles.sheetTitle}>แก้ไขข้อมูล</Text>
            {edit?.isSensitive ? <Tag icon={Shield}>ข้อมูลส่วนบุคคล</Tag> : null}
            {input}
            {error ? <InlineError message={error} /> : null}
          </ScrollView>
          <View style={styles.footer}>
            <View style={{ flex: 1 }}><Button title="ยกเลิก" variant="secondary" disabled={busy} onPress={close} /></View>
            <View style={{ flex: 1 }}><Button title="บันทึก" busy={busy} onPress={() => void save()} /></View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  </>;
}

const styles = StyleSheet.create({
  card: { marginTop: spacing.md },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm, marginBottom: spacing.xs },
  title: { ...typeScale.section, color: colors.ink, flexShrink: 1 },
  note: { ...typeScale.meta, color: colors.muted, marginBottom: spacing.xs },
  groupHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginTop: spacing.lg },
  groupLabel: { ...typeScale.overline, color: colors.muted },
  sectionLabel: { marginTop: spacing.lg },
  row: { minHeight: TOUCH, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.md },
  rule: { borderTopWidth: 1, borderTopColor: colors.divider },
  pressed: { opacity: 0.6 },
  rowMain: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'baseline', gap: spacing.md },
  rowStacked: { flexDirection: 'column', alignItems: 'stretch', gap: spacing.xs },
  labelWrap: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, maxWidth: '45%' },
  label: { ...typeScale.overline, color: colors.muted, flexShrink: 1 },
  value: { color: colors.text, fontSize: 15, lineHeight: 22, flex: 1, textAlign: 'right', fontVariant: ['tabular-nums'] },
  valueStacked: { textAlign: 'left' },
  valueEmpty: { color: colors.muted },
  valueNeeded: { color: colors.warn, fontWeight: '600' },
  backdrop: { flex: 1, backgroundColor: colors.scrim, justifyContent: 'flex-end' },
  sheet: {
    width: '100%', maxWidth: 760, alignSelf: 'center', backgroundColor: colors.raised,
    borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, padding: spacing.lg, maxHeight: '92%', ...shadow.lg,
  },
  handle: { alignSelf: 'center', width: 36, height: 4, borderRadius: 2, backgroundColor: colors.line, marginBottom: spacing.md },
  sheetTitle: { ...typeScale.title, color: colors.ink },
  footer: { flexDirection: 'row', gap: spacing.sm, paddingTop: spacing.md },
});

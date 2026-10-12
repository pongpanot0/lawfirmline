import React, { useRef, useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { CourtLevel, JUDGMENT_OUTCOME_LABELS, SERVICE_METHOD_LABELS, type JudgmentOutcome, type ServiceMethod } from '@lawfirm/shared';
import { Text } from '@/components/AppText';
import { api } from '@/api/client';
import { useRecordProceeding } from '@/api/hooks';
import type { CaseDetail, ProceedingKind } from '@/api/types';
import { bangkokDay } from '@/format';
import {
  LEVEL_TABS, OFFLINE_SAVE, PROCEEDING_LABELS, proceedingBody, proceedingConfirm, proceedingLevel, proceedingMissing, runProceeding,
  type ProceedingDraft,
} from '@/litigation';
import { colors, formLabelSpacing, radius, spacing } from '@/theme';
import { ActionSheet } from './ActionSheet';
import { ThaiDateField } from './ThaiDateField';
import { Button, FilterTabs, SectionLabel } from './ui';

const KINDS = Object.entries(PROCEEDING_LABELS).map(([value, label]) => ({ value, label }));
const METHOD_OPTIONS = Object.entries(SERVICE_METHOD_LABELS).map(([value, label]) => ({ value, label }));
const OUTCOME_OPTIONS = Object.entries(JUDGMENT_OUTCOME_LABELS).map(([value, label]) => ({ value, label }));

/** Big one-tap choices: at court a full-screen picker for two or five options is one tap too many. */
function ChoiceGrid({ options, value, onChange, disabled, tall = false }: {
  options: Array<{ value: string; label: string }>;
  value: string | null;
  onChange: (value: string) => void;
  disabled: boolean;
  tall?: boolean;
}) {
  return <View style={styles.tiles}>
    {options.map((option) => <Pressable key={option.value} accessibilityRole="radio" accessibilityState={{ checked: value === option.value, disabled }}
      accessibilityLabel={option.label} disabled={disabled} onPress={() => onChange(option.value)}
      style={({ pressed }) => [styles.tile, tall && styles.tileTall, value === option.value && styles.tileOn, pressed && { opacity: 0.8 }]}>
      <Text style={[styles.tileText, value === option.value && styles.tileTextOn]}>{option.label}</Text>
    </Pressable>)}
  </View>;
}

/**
 * "บันทึกเหตุการณ์ในศาล": four big choices, the date, the one extra choice the API needs, then a confirmation.
 * The draft survives a failed send (the sheet stays open) and resets only after the server recorded it.
 */
export function RecordCourtEventSheet({ visible, caseId, currentLevel, stageBefore, initialKind = null, initialDay, offline, onClose, onRecorded }: {
  visible: boolean;
  caseId: string;
  currentLevel: string | null | undefined;
  stageBefore: string | null | undefined;
  initialKind?: ProceedingKind | null;
  /** Bangkok day `YYYY-MM-DD`; today when omitted. */
  initialDay?: string;
  offline: boolean;
  onClose: () => void;
  /** After the server recorded it: the D3 result line and the instant just before sending. */
  onRecorded: (text: string, since: string) => void;
}) {
  const client = useQueryClient();
  const record = useRecordProceeding(caseId);
  const level = (currentLevel ?? CourtLevel.TRIAL) as CourtLevel;
  const fresh = (): ProceedingDraft => ({
    kind: initialKind, level, day: initialDay ?? bangkokDay(new Date().toISOString()), method: '', outcome: '',
  });
  const [draft, setDraft] = useState<ProceedingDraft>(fresh);
  const [dayInvalid, setDayInvalid] = useState(false);
  const [resetKey, setResetKey] = useState(0);
  // One record per confirmation: a fast double tap on Save must not stack two alerts and record twice.
  const asking = useRef(false);
  const body = proceedingBody(draft);
  const missing = proceedingMissing(draft, dayInvalid);

  const send = async (kind: ProceedingKind, payload: Record<string, string>) => {
    const since = new Date().toISOString();
    const result = await runProceeding(
      () => record.mutateAsync({ kind, body: payload }),
      () => client.fetchQuery({ queryKey: ['case', caseId], queryFn: () => api<CaseDetail>(`/cases/${caseId}`), staleTime: 0 })
        .then((data) => data.stage),
      stageBefore,
    );
    if (!result.ok) {
      Alert.alert('บันทึกไม่สำเร็จ', result.message);
      return;
    }
    setDraft(fresh());
    setResetKey((key) => key + 1);
    onRecorded(result.text, since);
    onClose();
  };

  const save = () => {
    if (!body || !draft.kind || !draft.day || asking.current || record.isPending) return;
    asking.current = true;
    const kind = draft.kind;
    const detail = kind === 'service' ? SERVICE_METHOD_LABELS[draft.method as ServiceMethod]
      : kind === 'judgment' ? JUDGMENT_OUTCOME_LABELS[draft.outcome as JudgmentOutcome] : undefined;
    const confirm = proceedingConfirm(kind, proceedingLevel(kind, draft.level, level), draft.day, detail);
    Alert.alert(confirm.title, confirm.body, [
      { text: 'กลับไปแก้', style: 'cancel', onPress: () => { asking.current = false; } },
      { text: 'บันทึก', onPress: () => void send(kind, body).finally(() => { asking.current = false; }) },
    ], { cancelable: true, onDismiss: () => { asking.current = false; } });
  };

  // Filing and judgment record on the chosen level; the switch is noise for the other two.
  const showLevel = draft.kind === null || draft.kind === 'filing' || draft.kind === 'judgment';

  return <ActionSheet visible={visible} title="บันทึกเหตุการณ์ในศาล" onClose={onClose}>
    <ChoiceGrid options={KINDS} value={draft.kind} tall disabled={record.isPending}
      onChange={(kind) => setDraft((d) => ({ ...d, kind: kind as ProceedingKind }))} />
    {draft.kind === 'service' ? <>
      <SectionLabel style={formLabelSpacing}>วิธีส่งหมาย</SectionLabel>
      <ChoiceGrid options={METHOD_OPTIONS} value={draft.method} disabled={record.isPending}
        onChange={(method) => setDraft((d) => ({ ...d, method }))} />
    </> : null}
    {draft.kind === 'judgment' ? <>
      <SectionLabel style={formLabelSpacing}>ผลคำพิพากษา</SectionLabel>
      <ChoiceGrid options={OUTCOME_OPTIONS} value={draft.outcome} disabled={record.isPending}
        onChange={(outcome) => setDraft((d) => ({ ...d, outcome }))} />
    </> : null}
    {showLevel ? <>
      <SectionLabel style={formLabelSpacing}>ชั้นศาล</SectionLabel>
      <FilterTabs items={LEVEL_TABS} value={draft.level} onChange={(value) => setDraft((d) => ({ ...d, level: value as CourtLevel }))} />
    </> : null}
    <ThaiDateField label="วันที่เกิดเหตุการณ์" value={draft.day} onInvalidChange={setDayInvalid} resetKey={resetKey}
      onChange={(day) => setDraft((d) => ({ ...d, day }))} disabled={record.isPending} />
    <View style={styles.actions}>
      <Button title={offline ? OFFLINE_SAVE : missing ?? 'บันทึก'} busy={record.isPending}
        disabled={offline || !!missing || !body} onPress={save} />
    </View>
  </ActionSheet>;
}

const styles = StyleSheet.create({
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  tile: {
    flexBasis: '47%', flexGrow: 1, minHeight: 48, padding: spacing.sm, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: colors.line, borderRadius: radius.button, backgroundColor: colors.surface,
  },
  tileTall: { minHeight: 64 },
  tileOn: { borderColor: colors.ink, borderWidth: 2, backgroundColor: colors.accentSoft },
  tileText: { color: colors.ink, fontWeight: '600', fontSize: 15, textAlign: 'center' },
  tileTextOn: { fontWeight: '700' },
  actions: { gap: spacing.sm, marginTop: spacing.md },
});

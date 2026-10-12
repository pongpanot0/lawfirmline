import React, { useRef, useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { CourtLevel, JUDGMENT_OUTCOME_LABELS, SERVICE_METHOD_LABELS } from '@lawfirm/shared';
import { Text } from '@/components/AppText';
import { api } from '@/api/client';
import { useRecordProceeding } from '@/api/hooks';
import type { CaseDetail, ProceedingKind } from '@/api/types';
import { bangkokDay } from '@/format';
import {
  LEVEL_TABS, OFFLINE_SAVE, PROCEEDING_LABELS, proceedingBody, proceedingConfirm, proceedingLevel, runProceeding, type ProceedingDraft,
} from '@/litigation';
import { colors, formLabelSpacing, radius, spacing } from '@/theme';
import { ActionSheet } from './ActionSheet';
import { Dropdown } from './Dropdown';
import { ThaiDateField } from './ThaiDateField';
import { Button, FilterTabs, SectionLabel } from './ui';

const KINDS = Object.keys(PROCEEDING_LABELS) as ProceedingKind[];
const METHOD_OPTIONS = Object.entries(SERVICE_METHOD_LABELS).map(([value, label]) => ({ value, label }));
const OUTCOME_OPTIONS = Object.entries(JUDGMENT_OUTCOME_LABELS).map(([value, label]) => ({ value, label }));

/**
 * "บันทึกเหตุการณ์ในศาล": four big choices, the date, the one extra field the API needs, then a confirmation.
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
    const confirm = proceedingConfirm(kind, proceedingLevel(kind, draft.level, level), draft.day);
    Alert.alert(confirm.title, confirm.body, [
      { text: 'กลับไปแก้', style: 'cancel', onPress: () => { asking.current = false; } },
      { text: 'บันทึก', onPress: () => void send(kind, body).finally(() => { asking.current = false; }) },
    ], { cancelable: true, onDismiss: () => { asking.current = false; } });
  };

  // Filing and judgment record on the chosen level; the switch is noise for the other two.
  const showLevel = draft.kind === null || draft.kind === 'filing' || draft.kind === 'judgment';

  return <ActionSheet visible={visible} title="บันทึกเหตุการณ์ในศาล" onClose={onClose}>
    <View style={styles.tiles}>
      {KINDS.map((kind) => <Pressable key={kind} accessibilityRole="radio" accessibilityState={{ checked: draft.kind === kind }}
        accessibilityLabel={PROCEEDING_LABELS[kind]} disabled={record.isPending} onPress={() => setDraft((d) => ({ ...d, kind }))}
        style={({ pressed }) => [styles.tile, draft.kind === kind && styles.tileOn, pressed && { opacity: 0.8 }]}>
        <Text style={[styles.tileText, draft.kind === kind && styles.tileTextOn]}>{PROCEEDING_LABELS[kind]}</Text>
      </Pressable>)}
    </View>
    {showLevel ? <>
      <SectionLabel style={formLabelSpacing}>ชั้นศาล</SectionLabel>
      <FilterTabs items={LEVEL_TABS} value={draft.level} onChange={(value) => setDraft((d) => ({ ...d, level: value as CourtLevel }))} />
    </> : null}
    <ThaiDateField label="วันที่เกิดเหตุการณ์" value={draft.day} onInvalidChange={setDayInvalid} resetKey={resetKey}
      onChange={(day) => setDraft((d) => ({ ...d, day }))} disabled={record.isPending} />
    {draft.kind === 'service' ? <Dropdown label="วิธีส่งหมาย" value={draft.method} options={METHOD_OPTIONS}
      onChange={(method) => setDraft((d) => ({ ...d, method }))} disabled={record.isPending} /> : null}
    {draft.kind === 'judgment' ? <Dropdown label="ผลคำพิพากษา" value={draft.outcome} options={OUTCOME_OPTIONS}
      onChange={(outcome) => setDraft((d) => ({ ...d, outcome }))} disabled={record.isPending} /> : null}
    <View style={styles.actions}>
      <Button title={offline ? OFFLINE_SAVE : 'บันทึก · ไม่ย้อนกลับเอง'} busy={record.isPending}
        disabled={offline || !body || dayInvalid} onPress={save} />
      <Button title="ปิด" ghost disabled={record.isPending} onPress={onClose} />
    </View>
  </ActionSheet>;
}

const styles = StyleSheet.create({
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  tile: {
    flexBasis: '47%', flexGrow: 1, minHeight: 64, padding: spacing.sm, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: colors.line, borderRadius: radius.button, backgroundColor: colors.surface,
  },
  tileOn: { borderColor: colors.ink, borderWidth: 2, backgroundColor: colors.accentSoft },
  tileText: { color: colors.ink, fontWeight: '600', fontSize: 15, textAlign: 'center' },
  tileTextOn: { fontWeight: '700' },
  actions: { gap: spacing.sm, marginTop: spacing.md },
});

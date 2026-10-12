import React, { useRef, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import { Text } from '@/components/AppText';
import { useDateSuggestions, useDecideSuggestion } from '@/api/hooks';
import type { DateSuggestion } from '@/api/types';
import { deadlineUrgency, legalBasis } from '@/deadline';
import { actionErrorText, isNetworkError } from '@/litigation';
import { thDate, thTime } from '@/format';
import { colors, fonts, radius, spacing } from '@/theme';
import { SectionCard } from './SectionCard';
import { Button, ErrorNote, Loading, UrgencyTag } from './ui';

type Settled = { row: DateSuggestion; text: string; confirmed: boolean };

/**
 * "รอยืนยันวันครบกำหนด": one-tap ✓, ✕ after a confirmation. Nothing moves before the server answers;
 * a handled row then keeps its result line in place while the screen stays open, so nothing vanishes under a thumb.
 */
export function DeadlineConfirmCard({ caseId, leadLawyerId, canAct, offline, highlightSince }: {
  caseId: string;
  leadLawyerId?: string | null;
  canAct: boolean;
  offline: boolean;
  /** Rows created at or after this instant (a court event just recorded on this phone) are marked ใหม่. */
  highlightSince?: string | null;
}) {
  const suggestions = useDateSuggestions(caseId);
  const decide = useDecideSuggestion();
  const inFlight = useRef(new Set<string>());
  const [busy, setBusy] = useState<Record<string, 'confirm' | 'dismiss'>>({});
  const [settled, setSettled] = useState<Record<string, Settled>>({});

  const pending = (suggestions.data ?? []).filter((row) => !settled[row.id]);
  const rows = [...pending, ...Object.values(settled).map((item) => item.row)]
    .sort((a, b) => a.suggestedDate.localeCompare(b.suggestedDate));
  // A persisted list may hold rows already decided elsewhere: no actions until the first fresh answer.
  const stale = !suggestions.isFetchedAfterMount;
  const isOffline = offline || (suggestions.isError && isNetworkError(suggestions.error));

  const run = async (row: DateSuggestion, action: 'confirm' | 'dismiss') => {
    // A second tap while the first request is on its way must not send another one.
    if (inFlight.current.has(row.id)) return;
    inFlight.current.add(row.id);
    setBusy((value) => ({ ...value, [row.id]: action }));
    try {
      await decide.mutateAsync({ suggestion: row, action, leadLawyerId });
      const when = `${thDate(row.suggestedDate)} ${thTime(row.suggestedDate)} น.`;
      setSettled((value) => ({
        ...value,
        [row.id]: {
          row,
          confirmed: action === 'confirm',
          text: action === 'confirm' ? `✓ ยืนยันแล้ว · เพิ่มในปฏิทินคดี ${when}` : 'ไม่ใช้แล้ว · ไม่ได้เพิ่มวันครบกำหนด',
        },
      }));
    } catch (error) {
      // The hook refetches on settle, so a row handled elsewhere (409) disappears after this alert.
      Alert.alert('บันทึกไม่สำเร็จ', actionErrorText(error));
    } finally {
      inFlight.current.delete(row.id);
      setBusy(({ [row.id]: _done, ...rest }) => rest);
    }
  };

  const askDismiss = (row: DateSuggestion) => Alert.alert(
    'ไม่ใช้วันที่ระบบเสนอ?',
    `${row.label} ${thDate(row.suggestedDate)} จะไม่ถูกเพิ่มเป็นวันครบกำหนด ถ้าต้องใช้ภายหลังต้องเพิ่มเอง`,
    [{ text: 'ยกเลิก', style: 'cancel' }, { text: 'ไม่ใช้', style: 'destructive', onPress: () => void run(row, 'dismiss') }],
  );

  if (suggestions.isLoading) return <Loading />;
  if (suggestions.isError && !suggestions.data) return <ErrorNote message="โหลดวันรอยืนยันไม่ได้" onRetry={() => suggestions.refetch()} />;
  if (!rows.length) return null;

  return <SectionCard title="รอยืนยันวันครบกำหนด" count={pending.length || undefined} tone="due">
    {!canAct ? <Text style={styles.muted}>รอผู้รับผิดชอบคดียืนยัน</Text>
      : isOffline ? <Text style={styles.muted}>ออฟไลน์ · ต้องต่อเน็ตเพื่อยืนยันวันครบกำหนด</Text>
      : stale ? <Text style={styles.muted}>กำลังอัปเดต…</Text> : null}
    {rows.map((row) => {
      const done = settled[row.id];
      const urgency = deadlineUrgency(row.suggestedDate, new Date());
      const basis = legalBasis(row.deadlineRule?.label ?? row.label);
      const fresh = !done && !!highlightSince && row.createdAt >= highlightSince;
      return <View key={row.id} style={[styles.row, fresh && styles.fresh, done && (done.confirmed ? styles.confirmed : styles.dismissed)]}>
        <View style={styles.head}>
          <Text style={styles.label}>{fresh ? <Text style={styles.freshTag}>ใหม่ · </Text> : null}{row.label}</Text>
          <UrgencyTag urgency={urgency} />
        </View>
        <Text style={styles.date}>{thDate(row.suggestedDate)} · {thTime(row.suggestedDate)} น.</Text>
        {basis ? <Text style={styles.muted}>{basis}</Text> : null}
        {row.holidayDataIncomplete ? <Text style={styles.holiday}>⚠ ปฏิทินวันหยุดปีนี้ยังไม่ครบ ตรวจวันอีกครั้ง</Text> : null}
        {done ? <Text style={{ color: done.confirmed ? colors.good : colors.muted, fontWeight: '600' }}>{done.text}</Text>
          : canAct ? <View style={styles.actions}>
            <View style={{ flex: 1 }}>
              <Button title="✕ ไม่ใช้" ghost busy={busy[row.id] === 'dismiss'} disabled={isOffline || stale || !!busy[row.id]} onPress={() => askDismiss(row)} />
            </View>
            <View style={{ flex: 1 }}>
              <Button title="✓ ยืนยันวันที่" busy={busy[row.id] === 'confirm'} disabled={isOffline || stale || !!busy[row.id]} onPress={() => void run(row, 'confirm')} />
            </View>
          </View> : null}
      </View>;
    })}
  </SectionCard>;
}

const styles = StyleSheet.create({
  row: { gap: spacing.xs, padding: spacing.sm, borderRadius: radius.card, borderWidth: 1, borderColor: colors.line },
  fresh: { borderColor: colors.info, borderWidth: 2, backgroundColor: colors.infoSoft },
  freshTag: { color: colors.info, fontWeight: '700' },
  confirmed: { borderColor: colors.good, backgroundColor: colors.goodSoft },
  dismissed: { backgroundColor: colors.soft },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  label: { flex: 1, color: colors.ink, fontWeight: '600', fontSize: 15 },
  date: { color: colors.ink, fontFamily: fonts.bold, fontSize: 16 },
  muted: { color: colors.muted, fontSize: 13 },
  holiday: { color: colors.warn, backgroundColor: colors.warnSoft, padding: spacing.sm, borderRadius: radius.pill, fontSize: 13 },
  actions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs },
});

import React, { useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import { Text } from '@/components/AppText';
import { useAuth } from '@/api/auth';
import { ApiError } from '@/api/client';
import { openCaseDocument } from '@/api/files';
import { useCaseReviewRounds, useDecideReviewRound } from '@/api/hooks';
import type { ReviewRoundSummary } from '@/api/types';
import { actionErrorText, canDecideRound } from '@/litigation';
import { thDate } from '@/format';
import { colors, radius, spacing } from '@/theme';
import { ActionSheet } from './ActionSheet';
import { FormField } from './Form';
import { SectionCard } from './SectionCard';
import { Button, Tag } from './ui';

/** "เอกสารรอคุณตรวจ": open the version under review, approve it, or return it with a reason. */
export function ReviewRoundsCard({ caseId, focusRoundId, offline, canAct }: {
  caseId: string;
  focusRoundId?: string;
  offline: boolean;
  /** False on a closed or archived case: the rounds still show, the decisions do not. */
  canAct: boolean;
}) {
  const { user } = useAuth();
  const rounds = useCaseReviewRounds(caseId);
  const decide = useDecideReviewRound();
  const [returning, setReturning] = useState<ReviewRoundSummary | null>(null);
  const [reason, setReason] = useState('');
  const [reasonFor, setReasonFor] = useState<string | null>(null);
  const [status, setStatus] = useState('');
  const [opening, setOpening] = useState<string | null>(null);

  const waiting = (rounds.data ?? []).filter((round) => round.status === 'WAITING_REVIEW');
  const mine = waiting.filter((round) => canDecideRound(round, user?.id));
  if (!mine.length && !status) return null;

  const sender = (round: ReviewRoundSummary) => round.createdByName ?? 'ผู้ส่ง';
  const open = async (round: ReviewRoundSummary) => {
    setOpening(round.id);
    try {
      await openCaseDocument(round.caseId, round.documentId, round.filename, round.version);
    } catch (error) {
      // A download that never reached the server has no HTTP status: that is the offline case.
      Alert.alert('เปิดเอกสารไม่สำเร็จ', error instanceof ApiError ? error.message : 'ต้องต่อเน็ตเพื่อเปิดเอกสาร');
    } finally {
      setOpening(null);
    }
  };
  const approve = (round: ReviewRoundSummary) => Alert.alert(`อนุมัติฉบับที่ ${round.version}?`, 'ผู้ส่งจะได้รับแจ้งว่าอนุมัติแล้ว', [
    { text: 'ยกเลิก', style: 'cancel' },
    {
      text: 'อนุมัติ',
      onPress: async () => {
        try {
          const result = await decide.mutateAsync({ round, action: 'approve' });
          // The sender is told only when the round closes; with other reviewers left it stays open.
          setStatus(result.status === 'APPROVED' ? `อนุมัติแล้ว · แจ้ง ${sender(round)} แล้ว` : 'อนุมัติแล้ว · รอผู้ตรวจคนอื่น');
        } catch (error) {
          Alert.alert('บันทึกไม่สำเร็จ', actionErrorText(error));
        }
      },
    },
  ]);
  const startReturn = (round: ReviewRoundSummary) => {
    // Never carry a reason typed for one document over to another.
    if (reasonFor !== round.id) {
      setReason('');
      setReasonFor(round.id);
    }
    setReturning(round);
  };
  const sendReturn = async () => {
    if (!returning || !reason.trim()) return;
    try {
      await decide.mutateAsync({ round: returning, action: 'return', reason: reason.trim() });
      setStatus(`ส่งกลับแล้ว · แจ้ง ${sender(returning)} พร้อมเหตุผล`);
      setReason('');
      setReasonFor(null);
      setReturning(null);
    } catch (error) {
      // Nothing was recorded: the sheet and the typed reason stay.
      Alert.alert('บันทึกไม่สำเร็จ', actionErrorText(error));
    }
  };

  return <>
    <SectionCard title="เอกสารรอคุณตรวจ" count={mine.length || undefined} tone="court">
      {status ? <Text accessibilityLiveRegion="polite" style={styles.status}>{status}</Text> : null}
      {!canAct && mine.length ? <Text style={styles.muted}>คดีปิดแล้ว · ตรวจเอกสารในคดีนี้ไม่ได้</Text> : null}
      {waiting.map((round) => {
        const waitingFor = round.reviewers.filter((person) => !person.decision).map((person) => person.name ?? 'ผู้ตรวจ').join(', ');
        return <View key={round.id} style={[styles.row, round.id === focusRoundId && styles.focus]}>
          <Text style={styles.title}>{round.filename} · ฉบับที่ {round.version}</Text>
          <Text style={styles.muted}>ส่งโดย {round.createdByName ?? '—'} · {thDate(round.createdAt)}</Text>
          {round.scope ? <Text style={styles.scope}>ขอให้ตรวจ: {round.scope}</Text> : null}
          {round.dueAt ? <Text style={styles.muted}>ขอผลภายใน {thDate(round.dueAt)}</Text> : null}
          <Button title={offline ? 'ต้องต่อเน็ตเพื่อเปิดเอกสาร' : 'เปิดเอกสาร'} ghost disabled={offline || !!opening}
            busy={opening === round.id} onPress={() => void open(round)} />
          {canAct && canDecideRound(round, user?.id) ? <View style={styles.actions}>
            <View style={{ flex: 1 }}>
              <Button title="ส่งกลับแก้" ghost disabled={offline || decide.isPending} onPress={() => startReturn(round)} />
            </View>
            <View style={{ flex: 1 }}>
              <Button title="อนุมัติ" busy={decide.isPending && !returning} disabled={offline || decide.isPending} onPress={() => approve(round)} />
            </View>
          </View> : waitingFor ? <Tag tone="info">รอ {waitingFor} ตรวจ</Tag> : null}
        </View>;
      })}
    </SectionCard>
    <ActionSheet visible={!!returning} title="ส่งกลับแก้" onClose={() => setReturning(null)}
      detail={returning ? `${returning.filename} · ฉบับที่ ${returning.version}` : undefined}>
      <FormField label="เหตุผล (จำเป็น)" value={reason} onChange={setReason} multiline disabled={decide.isPending}
        placeholder="บอกสิ่งที่ต้องแก้ เพื่อให้ผู้ส่งแก้ได้ทันที" />
      <Button title={offline ? 'ต้องต่อเน็ตเพื่อส่งกลับ' : 'ส่งกลับ'} busy={decide.isPending}
        disabled={!reason.trim() || offline} onPress={() => void sendReturn()} />
    </ActionSheet>
  </>;
}

const styles = StyleSheet.create({
  row: { gap: spacing.sm, padding: spacing.sm, borderRadius: radius.card, borderWidth: 1, borderColor: colors.line },
  focus: { borderColor: colors.accent, borderWidth: 2, backgroundColor: colors.accentSoft },
  title: { color: colors.ink, fontWeight: '600', fontSize: 15 },
  muted: { color: colors.muted, fontSize: 13 },
  status: { color: colors.good, fontWeight: '600' },
  scope: { color: colors.ink, fontSize: 14, lineHeight: 21, backgroundColor: colors.soft, padding: spacing.sm, borderRadius: radius.card },
  actions: { flexDirection: 'row', gap: spacing.sm },
});

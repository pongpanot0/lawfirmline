import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { COURT_LEVEL_LABELS } from '@lawfirm/shared';
import { Text } from '@/components/AppText';
import type { CaseDetail } from '@/api/types';
import { deadlineUrgency } from '@/deadline';
import { courtLevelRows, limitationRelevant } from '@/litigation';
import { thDate } from '@/format';
import { colors, fonts, spacing, TOUCH } from '@/theme';
import { SectionCard } from './SectionCard';
import { Tag, UrgencyTag } from './ui';

/** "ศาลและเลขคดี": limitation date and one row per court level, all from the cached case. */
export function CourtNumbersCard({ detail, onEditLimitation }: { detail: CaseDetail; onEditLimitation?: () => void }) {
  const urgency = detail.limitationDeadline && limitationRelevant(detail)
    ? deadlineUrgency(detail.limitationDeadline, new Date())
    : null;
  return <SectionCard title="ศาลและเลขคดี">
    <View style={styles.line}>
      <Text style={styles.label}>อายุความ</Text>
      {detail.limitationDeadline ? <>
        <Text style={[styles.value, { flex: 1 }]}>{thDate(detail.limitationDeadline)}</Text>
        {urgency ? <UrgencyTag urgency={urgency} /> : null}
      </> : <>
        <Text style={[styles.muted, { flex: 1 }]}>ยังไม่ระบุอายุความ</Text>
        {onEditLimitation ? <Pressable accessibilityRole="button" accessibilityLabel="แก้ไขวันครบอายุความ" onPress={onEditLimitation} style={styles.link}>
          <Text style={{ color: colors.info, fontWeight: '600' }}>แก้ไข</Text>
        </Pressable> : null}
      </>}
    </View>
    {courtLevelRows(detail).map((row) => <View key={row.level} style={[styles.level, row.current && styles.current]}>
      <View style={styles.line}>
        <Text style={[styles.levelTitle, !row.reached && styles.muted]}>{COURT_LEVEL_LABELS[row.level]}{row.current ? ' · กำลังพิจารณา' : ''}</Text>
        {row.current ? <Tag tone="court">ชั้นปัจจุบัน</Tag> : null}
      </View>
      {row.reached ? <>
        {row.courtName ? <Text style={styles.value}>{row.courtName}</Text> : null}
        <Text selectable style={styles.numbers}>ดำ {row.black ?? '—'} · แดง {row.red ?? '—'}</Text>
      </> : <Text style={styles.muted}>ยังไม่ถึงชั้นนี้</Text>}
    </View>)}
  </SectionCard>;
}

const styles = StyleSheet.create({
  line: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 32 },
  label: { color: colors.faint, fontSize: 12, fontWeight: '600' },
  value: { color: colors.text, fontSize: 14 },
  muted: { color: colors.muted, fontSize: 13 },
  link: { minHeight: TOUCH, minWidth: TOUCH, justifyContent: 'center', alignItems: 'flex-end' },
  // An invisible rail keeps every level's text aligned; the current level shows it in accent.
  level: { gap: 2, paddingVertical: spacing.sm, paddingLeft: spacing.md, borderLeftWidth: 3, borderLeftColor: colors.surface },
  current: { borderLeftColor: colors.accent },
  levelTitle: { color: colors.ink, fontFamily: fonts.semibold, fontSize: 15 },
  numbers: { color: colors.ink, fontSize: 14, fontVariant: ['tabular-nums'] },
});

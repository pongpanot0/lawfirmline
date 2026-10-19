import React from 'react';
import { View } from 'react-native';
import { AssignmentCandidate } from '@lawfirm/shared';
import { Text } from './AppText';
import { Button, Tag } from './ui';
import { thDate, thTime } from '@/format';
import { colors, spacing } from '@/theme';

/** Same observed workload in the Owner home, assignment form and reassignment sheet. Zero counts are left out. */
export function WorkloadSummary({ candidate, onTask }: { candidate?: AssignmentCandidate; onTask?: (id: string) => void }) {
  if (!candidate) return <Text style={{ color: colors.muted, fontSize: 13 }}>ยังโหลดภาระงานไม่ได้ · ยังสรุปว่าว่างไม่ได้</Text>;
  const counts = ([
    ['เกินกำหนด', candidate.overdue, 'due'],
    ['คิวค้าง', candidate.queue.length, 'plain'],
    ['คิวตรวจ', candidate.reviews.length, 'court'],
    ['งานวันนี้', candidate.today.length, 'plain'],
    ['รอรับงาน', candidate.unaccepted, 'plain'],
    ['เสร็จวันนี้', candidate.done, 'ok'],
  ] as const).filter(([, count]) => count > 0);
  const caveat = candidate.unknownCount ? `${candidate.unknownCount} งานยังไม่มีรายงานในวันที่เลือก · ยังสรุปว่าว่างไม่ได้`
    : !candidate.queue.length ? 'ไม่พบงานค้างในระบบ · ยังสรุปว่าว่างไม่ได้' : 'ตรวจนัดและวันลาก่อนมอบหมาย';
  return <View style={{ gap: spacing.sm }}>
    {counts.length > 0 && <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
      {counts.map(([label, count, tone]) => <Tag key={label} tone={tone}>{`${label} ${count}`}</Tag>)}
    </View>}
    {candidate.member.onLeave && <Text style={{ color: colors.warn }}>ลาวันที่เลือก · ตรวจเงื่อนไขก่อนมอบหมาย</Text>}
    {candidate.queue.filter(t => t.latestUpdate || t.blocker || t.holdReason || t.blockedBy).sort((a, b) => Number(!!(b.blocker || b.holdReason || b.blockedBy)) - Number(!!(a.blocker || a.holdReason || a.blockedBy))).slice(0, 3).map(task => <View key={task.id} style={{ gap: 2 }}>
      {onTask ? <Button title={task.title} variant="link" onPress={() => onTask(task.id)} /> : <Text style={{ color: colors.text, fontSize: 14, fontWeight: '600' }}>{task.title}</Text>}
      {task.latestUpdate && <Text style={{ color: colors.muted, fontSize: 13 }}>{task.latestUpdate.body}{'\n'}อัปเดต {thDate(task.latestUpdate.createdAt)} {thTime(task.latestUpdate.createdAt)} · {task.latestUpdate.authorName}</Text>}
      {(task.blocker || task.holdReason || task.blockedBy) && <Text style={{ color: colors.warn, fontSize: 13 }}>จุดติดขัดล่าสุด: {task.holdReason || task.blocker || `รอ ${task.blockedBy}`}</Text>}
    </View>)}
    {candidate.member.appointments.map(event => <Text key={event.id} style={{ color: colors.muted, fontSize: 13 }}>
      {thTime(event.startAt)}{event.endAt ? `–${thTime(event.endAt)}` : ' · ยังไม่ทราบเวลาสิ้นสุด'} · {event.title}
    </Text>)}
    <Text style={{ color: colors.muted, fontSize: 12 }}>{caveat}</Text>
  </View>;
}

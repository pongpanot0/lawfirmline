import React from 'react';
import { View } from 'react-native';
import { AssignmentCandidate } from '@lawfirm/shared';
import { Text } from './AppText';
import { Button } from './ui';
import { thDate, thTime } from '@/format';
import { colors, spacing } from '@/theme';

/** Same observed workload in the Owner home, assignment form and reassignment sheet. */
export function WorkloadSummary({ candidate, onTask }: { candidate?: AssignmentCandidate; onTask?: (id: string) => void }) {
  if (!candidate) return <Text style={{ color: colors.warn }}>ยังโหลดภาระงานไม่ได้ · ยังสรุปว่าว่างไม่ได้</Text>;
  return <View style={{ gap: spacing.xs }}>
    <Text style={{ color: colors.text }}>คิวค้าง {candidate.queue.length} · เกินกำหนด {candidate.overdue} · คิวตรวจ {candidate.reviews.length}</Text>
    <Text style={{ color: colors.muted, fontSize: 12 }}>งานวันนี้ {candidate.today.length} · เสร็จวันนี้ {candidate.done} · รอรับงาน {candidate.unaccepted}</Text>
    {candidate.queue.filter(t => t.latestUpdate || t.blocker || t.holdReason || t.blockedBy).sort((a, b) => Number(!!(b.blocker || b.holdReason || b.blockedBy)) - Number(!!(a.blocker || a.holdReason || a.blockedBy))).slice(0, 3).map(task => <View key={task.id} style={{ gap: 2 }}>
      {onTask ? <Button title={task.title} ghost onPress={() => onTask(task.id)} /> : <Text style={{ color: colors.text, fontSize: 13 }}>{task.title}</Text>}
      {task.latestUpdate && <Text style={{ color: colors.muted, fontSize: 12 }}>{task.latestUpdate.body}{'\n'}อัปเดต {thDate(task.latestUpdate.createdAt)} {thTime(task.latestUpdate.createdAt)} · {task.latestUpdate.authorName}</Text>}
      {(task.blocker || task.holdReason || task.blockedBy) && <Text style={{ color: colors.warn, fontSize: 12 }}>จุดติดขัดล่าสุด: {task.holdReason || task.blocker || `รอ ${task.blockedBy}`}</Text>}
    </View>)}
    <Text style={{ color: candidate.unknown || !candidate.queue.length ? colors.warn : colors.muted, fontSize: 12 }}>
      {candidate.unknownCount ? `${candidate.unknownCount} งานยังไม่มีรายงานในวันที่เลือก · ยังสรุปว่าว่างไม่ได้`
        : !candidate.queue.length ? 'ไม่พบงานค้างในระบบ · ยังสรุปว่าว่างไม่ได้' : 'งานค้างมีรายงานแล้ว · ตรวจนัดและวันลาก่อนมอบหมาย'}
    </Text>
    {candidate.member.appointments.map(event => <Text key={event.id} style={{ color: colors.muted, fontSize: 12 }}>
      {thTime(event.startAt)}{event.endAt ? `–${thTime(event.endAt)}` : ' · ยังไม่ทราบเวลาสิ้นสุด'} · {event.title}
    </Text>)}
    {candidate.member.onLeave && <Text style={{ color: colors.warn }}>ลาวันที่เลือก · ตรวจเงื่อนไขก่อนมอบหมาย</Text>}
  </View>;
}

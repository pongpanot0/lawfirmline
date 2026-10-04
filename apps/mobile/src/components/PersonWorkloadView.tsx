/* Hallmark · genre: modern-minimal · macrostructure: Workbench · design-system: design.md · designed-as-app */
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { CalendarDays, ChevronRight, FolderOpen, LockKeyhole } from 'lucide-react-native';
import { TASK_WORK_TYPES, type PersonWorkload } from '@lawfirm/shared';
import { Text } from '@/components/AppText';
import { Button, Card, EmptyNote, SectionLabel, StatCard, Tag } from '@/components/ui';
import { initials, thDate, thTime } from '@/format';
import { colors, fonts, spacing } from '@/theme';

const ROLES: Record<string, string> = { OWNER: 'เจ้าของสำนักงาน', SENIOR_LAWYER: 'ทนายอาวุโส', LAWYER: 'ทนายความ', JUNIOR_LAWYER: 'ทนายความ', ASSISTANT: 'ผู้ช่วย', ADMIN: 'ผู้ดูแล', EXTERNAL: 'ผู้รับงานภายนอก' };
const STATUSES: Record<string, string> = { TODO: 'รอเริ่ม', IN_PROGRESS: 'กำลังทำ', NEEDS_REVISION: 'แก้ไขงาน', ON_HOLD: 'พักไว้', PENDING_REVIEW: 'รอตรวจ' };

function DetailRow({ title, subtitle, onPress, children }: { title: string; subtitle?: string; onPress?: () => void; children?: React.ReactNode }) {
  const content = <>
    <View style={styles.rowText}><Text style={styles.rowTitle}>{title}</Text>{subtitle ? <Text style={styles.secondary}>{subtitle}</Text> : null}{children}</View>
    {onPress ? <ChevronRight size={18} color={colors.info} /> : <LockKeyhole size={15} color={colors.muted} />}
  </>;
  return onPress ? <Pressable accessibilityRole="button" accessibilityLabel={`เปิด ${title}`} onPress={onPress}
    style={({ pressed }) => [styles.row, pressed && styles.pressed]}>{content}</Pressable> : <View style={styles.row}>{content}</View>;
}

export function PersonWorkloadView({ person, from, viewerId, owner, onTask, onCase, onEvent, onAssign }: {
  person: PersonWorkload; from: string; viewerId: string; owner: boolean;
  onTask: (id: string) => void; onCase: (id: string) => void; onEvent: (id: string) => void; onAssign?: () => void;
}) {
  const name = `${person.firstName} ${person.lastName}`.trim();
  const workTypes = TASK_WORK_TYPES.filter(type => person.workTypes.includes(type.value));
  const overdue = person.tasks.filter(task => task.overdue).length;
  const blockers = person.tasks.filter(task => task.holdReason);
  // The API redacts inaccessible titles/case fields. Those rows show load without opening private work.
  const canOpenTask = (task: PersonWorkload['tasks'][number]) => owner || person.userId === viewerId || !!task.case;
  return <>
    <Card style={styles.identity}>
      <View style={styles.identityTop}>
        <View style={styles.avatar}><Text style={styles.initials}>{initials(name)}</Text></View>
        <View style={styles.rowText}><Text style={styles.name}>{name}</Text><Text style={styles.role}>{ROLES[person.role] ?? person.role}</Text></View>
      </View>
      <Text style={styles.identityNote}>งานที่รับผิดชอบ · แตะรายการเพื่อดูรายละเอียด</Text>
    </Card>
    <View style={styles.stats}>
      <StatCard label="งานค้าง" value={person.tasks.length} />
      <StatCard label="เกินกำหนด" value={overdue} tone="warn" />
      <StatCard label="รอตรวจ" value={person.reviews.length} tone="court" />
    </View>
    {onAssign && <Button title="มอบหมายงาน" onPress={onAssign} />}

    {!!blockers.length && <>
      <SectionLabel>จุดติดขัด · {blockers.length}</SectionLabel>
      <Card style={{ backgroundColor: colors.warnSoft, borderColor: colors.warnSoft }}>
        {blockers.map(task => <DetailRow key={task.id} title={task.title} onPress={canOpenTask(task) ? () => onTask(task.id) : undefined}>
          <Text style={styles.blocker}>{task.holdReason}</Text>
        </DetailRow>)}
      </Card>
    </>}

    <SectionLabel>งานที่รับผิดชอบ · {person.tasks.length}</SectionLabel>
    <Card>{!person.tasks.length ? <EmptyNote>ไม่มีงานค้างในคิวที่บันทึกไว้</EmptyNote> : person.tasks.map(task => <DetailRow key={task.id} title={task.title}
      subtitle={task.case ? `${task.case.ownRef} · ${task.case.title}` : undefined} onPress={canOpenTask(task) ? () => onTask(task.id) : undefined}>
      <View style={styles.tags}>
        <Tag tone={task.overdue ? 'due' : 'info'}>{task.overdue ? 'เกินกำหนด' : STATUSES[task.status] ?? task.status}</Tag>
        {task.dueDate ? <Text style={styles.secondary}>กำหนด {thDate(task.dueDate)}</Text> : <Text style={styles.secondary}>ยังไม่ระบุกำหนด</Text>}
      </View>
    </DetailRow>)}</Card>

    <SectionLabel>งานรอตรวจ · {person.reviews.length}</SectionLabel>
    <Card>{!person.reviews.length ? <EmptyNote>ไม่มีงานรอตรวจ</EmptyNote> : person.reviews.map(task => <DetailRow key={task.id} title={task.title}
      subtitle={task.dueDate ? `กำหนด ${thDate(task.dueDate)}` : 'ส่งตรวจแล้ว'}
      onPress={owner || person.userId === viewerId || task.title !== 'งานที่คุณไม่มีสิทธิ์ดู' ? () => onTask(task.id) : undefined} />)}</Card>

    <View style={styles.sectionHead}><CalendarDays size={18} color={colors.ink} /><SectionLabel style={styles.sectionTitle}>นัดหมาย 7 วัน</SectionLabel></View>
    <Text style={styles.window}>ตั้งแต่ {thDate(`${from}T12:00:00+07:00`)}</Text>
    <Card>{!person.events.length ? <EmptyNote>ไม่มีนัดในช่วง 7 วันนี้</EmptyNote> : person.events.map(event => <DetailRow key={event.id} title={event.title}
      subtitle={`${thDate(event.startAt)} · ${thTime(event.startAt)}${event.courtName ? ` · ${event.courtName}` : ''}`}
      onPress={owner || person.userId === viewerId || event.title !== 'ติดนัด' ? () => onEvent(event.id) : undefined} />)}</Card>

    <View style={styles.sectionHead}><FolderOpen size={18} color={colors.ink} /><SectionLabel style={styles.sectionTitle}>คดีที่รับผิดชอบ · {person.cases.length}</SectionLabel></View>
    <Card>{!person.cases.length ? <EmptyNote>ไม่มีคดีเปิดที่คุณมีสิทธิ์ดู</EmptyNote> : person.cases.map(item => <DetailRow key={item.id} title={item.title}
      subtitle={item.ownRef} onPress={() => onCase(item.id)}><Tag tone={item.role === 'LEAD' ? 'info' : 'plain'}>{item.role === 'LEAD' ? 'ผู้รับผิดชอบหลัก' : 'ร่วมทำคดี'}</Tag></DetailRow>)}
      {person.hiddenCaseCount > 0 && <Text style={styles.secondary}>อีก {person.hiddenCaseCount} คดีอยู่นอกสิทธิ์การเข้าถึงของคุณ</Text>}
    </Card>

    <SectionLabel>ประเภทงานและวันลา</SectionLabel>
    <Card style={{ gap: spacing.md }}>
      <View style={styles.tags}>{workTypes.length ? workTypes.map(type => <Tag key={type.value} tone="info">{type.label}</Tag>) : <Text style={styles.secondary}>ยังไม่ได้ตั้งประเภทงาน</Text>}</View>
      {person.leaves.length ? person.leaves.map(leave => <View key={leave.id} style={styles.tags}>
        <Tag tone="court">ลาอนุมัติแล้ว</Tag><Text style={styles.secondary}>{thDate(`${leave.startDate}T12:00:00+07:00`)} – {thDate(`${leave.endDate}T12:00:00+07:00`)}</Text>
      </View>) : <Text style={styles.secondary}>ไม่มีวันลาที่อนุมัติไว้ในข้อมูลล่าสุด</Text>}
    </Card>
  </>;
}

const styles = StyleSheet.create({
  identity: { padding: spacing.lg, gap: spacing.md },
  identityTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  avatar: { width: 52, height: 52, borderRadius: 26, backgroundColor: colors.soft, justifyContent: 'center', alignItems: 'center' },
  initials: { fontFamily: fonts.bold, fontSize: 18, color: colors.ink },
  name: { fontFamily: fonts.bold, fontSize: 21, color: colors.ink, flexShrink: 1 },
  role: { color: colors.muted, fontSize: 13, marginTop: spacing.xs },
  identityNote: { color: colors.muted, fontSize: 12 },
  stats: { flexDirection: 'row', gap: spacing.sm, marginVertical: spacing.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 56, paddingVertical: spacing.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  rowText: { flex: 1, minWidth: 0, gap: spacing.xs },
  rowTitle: { color: colors.text, fontFamily: fonts.semibold, fontSize: 15 },
  secondary: { color: colors.muted, fontSize: 12 },
  blocker: { color: colors.warn, fontSize: 13 },
  tags: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.sm },
  pressed: { backgroundColor: colors.infoSoft },
  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.lg, marginBottom: spacing.sm },
  sectionTitle: { marginTop: 0, marginBottom: 0 },
  window: { color: colors.muted, fontSize: 12, marginBottom: spacing.sm },
});

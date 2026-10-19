/* Hallmark · genre: modern-minimal · macrostructure: Workbench · design-system: design.md · designed-as-app */
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { CalendarDays, ChevronRight, FolderOpen, LockKeyhole } from 'lucide-react-native';
import { FIRM_ROLE_LABELS, TASK_WORK_TYPES, type FirmRole, type PersonWorkload } from '@lawfirm/shared';
import { Text } from '@/components/AppText';
import { Button, Card, EmptyState, SectionLabel, Tag, TASK_STATUS_LABEL, taskStatusTone } from '@/components/ui';
import { initials, thDate, thTime } from '@/format';
import { colors, fonts, radius, spacing, typeScale } from '@/theme';

const LEGACY_ROLES: Record<string, string> = { JUNIOR_LAWYER: 'ทนายความ', ADMIN: 'ผู้ดูแล' };

/** A row inside a list card; every row after the first gets a hairline divider above it. */
function DetailRow({ title, subtitle, onPress, children, first = false }: {
  title: string; subtitle?: string; onPress?: () => void; children?: React.ReactNode; first?: boolean;
}) {
  const content = <>
    <View style={styles.rowText}><Text style={styles.rowTitle}>{title}</Text>{subtitle ? <Text style={styles.secondary}>{subtitle}</Text> : null}{children}</View>
    {onPress ? <ChevronRight size={18} color={colors.info} /> : <View accessible accessibilityLabel="ไม่มีสิทธิ์เปิด"><LockKeyhole size={15} color={colors.muted} /></View>}
  </>;
  return onPress ? <Pressable accessibilityRole="button" accessibilityLabel={`เปิด ${title}`} onPress={onPress}
    style={({ pressed }) => [styles.row, !first && styles.rowLine, pressed && styles.pressed]}>{content}</Pressable>
    : <View style={[styles.row, !first && styles.rowLine]}>{content}</View>;
}

function SectionHead({ icon: Icon, children }: { icon: typeof CalendarDays; children: React.ReactNode }) {
  return <View style={styles.sectionHead}>
    <View style={styles.sectionIcon}><Icon size={16} color={colors.info} /></View>
    <SectionLabel style={styles.sectionTitle}>{children}</SectionLabel>
  </View>;
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
        <View style={styles.rowText}><Text style={styles.name}>{name}</Text><Text style={styles.role}>{FIRM_ROLE_LABELS[person.role as FirmRole]?.th ?? LEGACY_ROLES[person.role] ?? person.role}</Text></View>
      </View>
      {/* Queue and review counts already head their sections below; only overdue earns a line up here. */}
      {overdue > 0 && <Tag tone="due">{`เกินกำหนด ${overdue} งาน`}</Tag>}
    </Card>
    {onAssign && <View style={{ marginTop: spacing.md }}><Button title="มอบหมายงาน" onPress={onAssign} /></View>}

    {!!blockers.length && <>
      <SectionLabel>จุดติดขัด · {blockers.length}</SectionLabel>
      <Card style={[styles.listCard, styles.blockerCard]}>
        {blockers.map((task, index) => <DetailRow key={task.id} first={index === 0} title={task.title} onPress={canOpenTask(task) ? () => onTask(task.id) : undefined}>
          <Text style={styles.blocker}>{task.holdReason}</Text>
        </DetailRow>)}
      </Card>
    </>}

    <SectionLabel>งานที่รับผิดชอบ · {person.tasks.length}</SectionLabel>
    <Card style={styles.listCard}>{!person.tasks.length ? <EmptyState compact>ไม่มีงานค้างในคิวที่บันทึกไว้</EmptyState> : person.tasks.map((task, index) => <DetailRow key={task.id} first={index === 0} title={task.title}
      subtitle={task.case ? `${task.case.ownRef} · ${task.case.title}` : undefined} onPress={canOpenTask(task) ? () => onTask(task.id) : undefined}>
      <View style={styles.tags}>
        <Tag tone={task.overdue ? 'due' : taskStatusTone(task.status)}>{task.overdue ? 'เกินกำหนด' : TASK_STATUS_LABEL[task.status] ?? task.status}</Tag>
        {task.dueDate ? <Text style={styles.secondary}>กำหนด {thDate(task.dueDate)}</Text> : <Text style={styles.secondary}>ยังไม่ระบุกำหนด</Text>}
      </View>
    </DetailRow>)}</Card>

    <SectionLabel>งานรอตรวจ · {person.reviews.length}</SectionLabel>
    <Card style={styles.listCard}>{!person.reviews.length ? <EmptyState compact>ไม่มีงานรอตรวจ</EmptyState> : person.reviews.map((task, index) => <DetailRow key={task.id} first={index === 0} title={task.title}
      subtitle={task.dueDate ? `กำหนด ${thDate(task.dueDate)}` : 'ส่งตรวจแล้ว'}
      onPress={owner || person.userId === viewerId || task.title !== 'งานที่คุณไม่มีสิทธิ์ดู' ? () => onTask(task.id) : undefined} />)}</Card>

    <SectionHead icon={CalendarDays}>นัดหมาย 7 วัน</SectionHead>
    <Text style={styles.window}>ตั้งแต่ {thDate(`${from}T12:00:00+07:00`)}</Text>
    <Card style={styles.listCard}>{!person.events.length ? <EmptyState compact>ไม่มีนัดในช่วง 7 วันนี้</EmptyState> : person.events.map((event, index) => <DetailRow key={event.id} first={index === 0} title={event.title}
      subtitle={`${thDate(event.startAt)} · ${thTime(event.startAt)}${event.courtName ? ` · ${event.courtName}` : ''}`}
      onPress={owner || person.userId === viewerId || event.title !== 'ติดนัด' ? () => onEvent(event.id) : undefined} />)}</Card>

    <SectionHead icon={FolderOpen}>คดีที่รับผิดชอบ · {person.cases.length}</SectionHead>
    <Card style={styles.listCard}>{!person.cases.length ? <EmptyState compact>ไม่มีคดีเปิดที่คุณมีสิทธิ์ดู</EmptyState> : person.cases.map((item, index) => <DetailRow key={item.id} first={index === 0} title={item.title}
      subtitle={item.ownRef} onPress={() => onCase(item.id)}><Tag tone={item.role === 'LEAD' ? 'info' : 'plain'}>{item.role === 'LEAD' ? 'ผู้รับผิดชอบหลัก' : 'ร่วมทำคดี'}</Tag></DetailRow>)}
      {person.hiddenCaseCount > 0 && <Text style={[styles.secondary, styles.hiddenNote]}>อีก {person.hiddenCaseCount} คดีอยู่นอกสิทธิ์การเข้าถึงของคุณ</Text>}
    </Card>

    <SectionLabel>ประเภทงานและวันลา</SectionLabel>
    <Card style={{ gap: spacing.md }}>
      <View style={styles.tags}>{workTypes.length ? workTypes.map(type => <Tag key={type.value} tone="info">{type.label}</Tag>) : <Text style={styles.secondary}>ยังไม่ได้ตั้งประเภทงาน</Text>}</View>
      {person.leaves.length ? person.leaves.map(leave => <View key={leave.id} style={styles.tags}>
        <Tag tone="plain">ลาอนุมัติแล้ว</Tag><Text style={styles.secondary}>{thDate(`${leave.startDate}T12:00:00+07:00`)} – {thDate(`${leave.endDate}T12:00:00+07:00`)}</Text>
      </View>) : <Text style={styles.secondary}>ไม่มีวันลาที่อนุมัติไว้ในข้อมูลล่าสุด</Text>}
    </Card>
  </>;
}

const styles = StyleSheet.create({
  identity: { padding: spacing.lg, gap: spacing.md },
  identityTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  avatar: { width: 56, height: 56, borderRadius: radius.full, backgroundColor: colors.infoSoft, justifyContent: 'center', alignItems: 'center' },
  initials: { fontFamily: fonts.bold, fontSize: 19, color: colors.info },
  name: { ...typeScale.title, color: colors.ink, flexShrink: 1 },
  role: { color: colors.muted, fontSize: 14, marginTop: 2 },
  // List cards: rows carry their own 12pt vertical padding, so the card only pads the sides.
  listCard: { paddingVertical: spacing.xs },
  blockerCard: { borderLeftWidth: 3, borderLeftColor: colors.warn },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 56, paddingVertical: spacing.md },
  rowLine: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.divider },
  rowText: { flex: 1, minWidth: 0, gap: spacing.xs },
  rowTitle: { color: colors.text, fontFamily: fonts.semibold, fontSize: 15 },
  secondary: { color: colors.muted, fontSize: 13 },
  hiddenNote: { paddingVertical: spacing.md, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.divider },
  blocker: { color: colors.warn, fontSize: 13 },
  tags: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.sm },
  pressed: { backgroundColor: colors.infoSoft },
  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.xl, marginBottom: spacing.sm },
  sectionIcon: { width: 28, height: 28, borderRadius: radius.md, backgroundColor: colors.infoSoft, alignItems: 'center', justifyContent: 'center' },
  sectionTitle: { marginTop: 0, marginBottom: 0 },
  window: { color: colors.muted, fontSize: 12, marginBottom: spacing.sm },
});

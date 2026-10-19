import React, { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text, TextInput } from '@/components/AppText';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, ExternalLink } from 'lucide-react-native';
import { EXPENSE_CATEGORIES } from '@lawfirm/shared';
import { useAuth } from '@/api/auth';
import { api } from '@/api/client';
import { draftScope, saveDraft } from '@/api/drafts';
import { useCourtDay, useSaveCourtDay, useCompleteCourtDay } from '@/api/hooks';
import type { CourtDayResponse, CourtDayState } from '@/api/types';
import { openCaseDocument } from '@/api/files';
import { Button, Card, EmptyState, ErrorState, InlineError, LoadingState, SectionLabel, Tag } from '@/components/ui';
import { CheckRow, FieldLabel, MissingSummary, SwitchRow } from '@/components/Form';
import { DateField, SelectField, TextArea, TextField, fieldFrame } from '@/components/Input';
import { bangkokDay, formatMoney, formatMoneyInput, thDateLong, thTime } from '@/format';
import { expenseError } from '@/workflow';
import { CHROME_MAX_SCALE, colors, radius, shadow, spacing, formLabelSpacing, pageContent, TOUCH, typeScale } from '@/theme';
import { useKeyboardHeight } from '@/hooks/useKeyboardHeight';

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  title: { ...typeScale.display, color: colors.ink },
  meta: { color: colors.muted, fontSize: 15, lineHeight: 22 },
  when: { color: colors.accentInk, fontSize: 15, lineHeight: 22, fontWeight: '600' },
  /** Sunken track; the current phase is a raised pill. */
  track: { flexDirection: 'row', gap: 2, padding: spacing.xs, borderRadius: radius.lg, backgroundColor: colors.sunken, marginVertical: spacing.sm },
  phase: { flex: 1, minHeight: TOUCH, borderRadius: radius.md, justifyContent: 'center', padding: spacing.sm },
  phaseOn: { backgroundColor: colors.raised, ...shadow.sm },
  phaseText: { color: colors.muted, fontWeight: '600', textAlign: 'center', fontSize: 14 },
  phaseTextOn: { color: colors.ink, fontWeight: '700' },
  teamRow: { flexDirection: 'row', gap: spacing.md, paddingVertical: spacing.sm },
  teamRule: { borderTopWidth: 1, borderTopColor: colors.divider },
  teamLabel: { ...typeScale.overline, color: colors.muted, width: 40, paddingTop: 2 },
  teamValue: { flex: 1, minWidth: 0, color: colors.text, fontSize: 15, lineHeight: 22 },
  listCard: { paddingVertical: spacing.xs },
  docRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  rule: { borderTopWidth: 1, borderTopColor: colors.divider },
  reviewCard: { gap: spacing.sm, borderColor: colors.ink, ...shadow.md },
  reviewTitle: { ...typeScale.section, color: colors.ink },
  reviewLine: { color: colors.text, fontSize: 15, lineHeight: 22, paddingVertical: spacing.xs, borderTopWidth: 1, borderTopColor: colors.divider },
  status: { color: colors.muted, fontSize: 14, lineHeight: 22 },
});

type Draft = { version: number; eventUpdatedAt: string; state: CourtDayState };
type Document = { id: string; filename: string; version: number };
const PHASES = ['ก่อนไป', 'ที่ศาล', 'เติมที่สำนักงาน'] as const;
const PREP = [
  { id: '00000000-0000-4000-8000-000000000001', title: 'ตรวจเอกสารที่ต้องใช้', done: false },
  { id: '00000000-0000-4000-8000-000000000002', title: 'ยืนยันทีมที่ไปด้วย', done: false },
  { id: '00000000-0000-4000-8000-000000000003', title: 'ตรวจสถานที่และเวลาเดินทาง', done: false },
];
const FIELD_NAME = {
  outcome: 'ผลนัด', nextTitle: 'ชื่อนัดครั้งหน้า', nextAt: 'วันและเวลานัดครั้งหน้า', taskTitle: 'งานที่ต้องทำต่อ',
  expenseCategory: 'เบิกค่าอะไร', amount: 'ยอดเงิน (บาท)',
} as const;

export default function CourtDayScreen() {
  const { eventId } = useLocalSearchParams<{ eventId: string }>();
  const { user } = useAuth();
  const router = useRouter();
  const keyboardHeight = useKeyboardHeight();
  const client = useQueryClient();
  const court = useCourtDay(eventId);
  const save = useSaveCourtDay(eventId);
  const complete = useCompleteCourtDay(eventId);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [phase, setPhase] = useState(0);
  const [localStatus, setLocalStatus] = useState('');
  const [readError, setReadError] = useState('');
  const [readAttempt, setReadAttempt] = useState(0);
  const [opening, setOpening] = useState('');
  const [triedConfirm, setTriedConfirm] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [timeError, setTimeError] = useState('');
  const [submitError, setSubmitError] = useState('');
  const [timeFocused, setTimeFocused] = useState(false);
  const key =user ? `${draftScope(user)}court:${eventId}` : '';
  const documents = useQuery({
    queryKey: ['case-documents', court.data?.event.caseId],
    queryFn: () => api<Document[]>(`/cases/${court.data!.event.caseId}/documents`),
    enabled: !!court.data && phase === 0,
  });
  useEffect(() => {
    if (!court.data || draft || !key) return;
    let active = true;
    const data = court.data;
    AsyncStorage.getItem(key).then((value) => {
      if (!active) return;
      const state = data.workspace.state;
      const initial: Draft = { version: data.workspace.version, eventUpdatedAt: data.event.updatedAt,
        state: { ...state, ...(data.workspace.version === 0 ? { checklist: PREP, clientDraft: false } : {}) } };
      setDraft(value && !data.workspace.completedAt ? JSON.parse(value) : initial);
      setReadError('');
    }).catch(() => { if (active) setReadError('อ่านร่างในเครื่องไม่สำเร็จ กรุณาลองใหม่เพื่อรักษาร่างเดิม'); });
    return () => { active = false; };
  }, [court.data, draft, key, readAttempt]);
  useEffect(() => {
    if (!draft || !key || court.data?.workspace.completedAt) return;
    let active = true;
    setLocalStatus('กำลังเก็บร่างในเครื่อง…');
    saveDraft(key, draft).then(() => { if (active) setLocalStatus('เก็บร่างในเครื่องแล้ว · ยังไม่ยืนยันผล'); })
      .catch(() => { if (active) setLocalStatus('เก็บร่างในเครื่องไม่สำเร็จ กรุณาบันทึกอีกครั้ง'); });
    return () => { active = false; };
  }, [draft, key, court.data?.workspace.completedAt]);
  const back = <Pressable accessibilityRole="button" accessibilityLabel="กลับ" onPress={() => router.back()}
    style={({ pressed }) => [{ width: TOUCH, height: TOUCH, alignItems: 'center', justifyContent: 'center', marginLeft: -spacing.md }, pressed && { opacity: 0.6 }]}>
    <ChevronLeft size={26} color={colors.ink} />
  </Pressable>;
  if (!court.data) return court.isLoading ? <View style={styles.screen}><LoadingState label="กำลังโหลดนัด…" /></View> : <SafeAreaView style={[styles.screen, { padding: spacing.lg, gap: spacing.md }]}>
    {back}
    <ErrorState message="ยังโหลดนัดนี้ไม่ได้ กรุณาต่ออินเทอร์เน็ตและลองใหม่" onRetry={() => court.refetch()} />
  </SafeAreaView>;
  if (readError) return <SafeAreaView style={[styles.screen, { padding: spacing.lg, gap: spacing.md }]}>
    {back}
    <ErrorState message={readError} onRetry={() => setReadAttempt(readAttempt + 1)} />
  </SafeAreaView>;
  if (!draft) return <View style={styles.screen}><LoadingState label="กำลังเปิดร่าง…" /></View>;
  const { event, workspace } = court.data;
  const state = draft.state;
  const done = !!workspace.completedAt;
  const busy = save.isPending || complete.isPending;
  // CourtDayService already authorizes senior lawyers through the existing case access filter.
  const writer = ['OWNER', 'SENIOR_LAWYER', 'OFFICE_MANAGER', 'LAWYER'].includes(user?.firmRole ?? '');
  const editable = writer && !done && !busy;
  const stale = workspace.version !== draft.version || event.updatedAt !== draft.eventUpdatedAt;
  const change = (next: Partial<CourtDayState>) => {
    setDraft({ ...draft, state: { ...state, ...next } });
    setReviewing(false);
    setSubmitError('');
  };
  const expenseMessage = state.expense ? expenseError(state.expenseCategory ?? '', state.outcome, state.amount, true) : null;
  const amountProblem = !!expenseMessage && expenseMessage.startsWith('ใส่จำนวนเงิน');
  const problems: Partial<Record<keyof typeof FIELD_NAME, string>> = {
    outcome: state.outcome.trim() ? undefined : 'ใส่ผลนัดก่อนยืนยัน',
    nextTitle: state.nextHearing && !state.nextTitle.trim() ? 'ใส่ชื่อนัดครั้งหน้า' : undefined,
    nextAt: state.nextHearing && (!state.nextAt || new Date(state.nextAt) <= new Date(event.startAt)) ? 'เลือกวันและเวลาที่อยู่หลังนัดนี้' : undefined,
    taskTitle: state.followUp && !state.taskTitle.trim() ? 'ใส่ชื่องานที่ต้องทำต่อ' : undefined,
    expenseCategory: expenseMessage && !amountProblem ? expenseMessage : undefined,
    amount: amountProblem ? expenseMessage! : undefined,
  };
  const missing = (Object.keys(FIELD_NAME) as Array<keyof typeof FIELD_NAME>).filter((field) => problems[field]);
  const shown = (field: keyof typeof FIELD_NAME) => (triedConfirm ? problems[field] : undefined);
  const sync = async () => {
    await saveDraft(key, draft);
    const result = await save.mutateAsync({ version: draft.version, state });
    const next = { ...draft, version: result.version };
    setDraft(next);
    await saveDraft(key, next);
    client.setQueryData<CourtDayResponse>(['court-day', eventId], (data) => data ? { ...data, workspace: result } : data);
    return next;
  };
  const record = async () => {
    setSubmitError('');
    try {
      const latest = await sync();
      const result = await complete.mutateAsync({ version: latest.version, eventUpdatedAt: latest.eventUpdatedAt });
      client.setQueryData<CourtDayResponse>(['court-day', eventId], (data) => data ? { ...data, workspace: result } : data);
      setDraft({ ...latest, version: result.version });
      setReviewing(false);
      await AsyncStorage.removeItem(key);
      Alert.alert('ยืนยันผลนัดแล้ว', 'บันทึกผลและรายการที่เลือกไว้ในระบบแล้ว');
    } catch (error) { setSubmitError(`ยืนยันไม่สำเร็จ · ${error instanceof Error ? error.message : 'ลองใหม่อีกครั้ง'}`); }
  };
  const review = () => {
    setTriedConfirm(true);
    if (missing.length || timeError) return;
    setReviewing(true);
  };
  const summary = [`ผล: ${state.outcome}`,
    state.nextHearing ? `เพิ่มนัด: ${state.nextTitle} · ${state.nextAt ? `${thDateLong(state.nextAt)} ${thTime(state.nextAt)}` : ''}` : '',
    state.followUp ? `เพิ่มงานให้ฉัน: ${state.taskTitle}${state.taskDue ? ` · ${thDateLong(state.taskDue)}` : ''}` : '',
    state.expense ? `ค่าใช้จ่าย: ${state.expenseCategory} ${formatMoney(state.amount)} บาท · ยังไม่ส่งเบิก` : '',
    state.clientDraft ? 'สร้างร่างรายงานลูกความ · ยังไม่ส่ง' : '',
  ].filter(Boolean);
  const reload = () => Alert.alert('ใช้ข้อมูลล่าสุด?', 'ร่างที่แก้ในหน้านี้จะถูกแทนด้วยข้อมูลล่าสุดในระบบ', [
    { text: 'ยกเลิก', style: 'cancel' }, { text: 'โหลดล่าสุด', onPress: async () => {
      const result = await court.refetch();
      if (!result.data || result.error) return Alert.alert('โหลดไม่สำเร็จ', 'เก็บร่างเดิมไว้แล้ว');
      setDraft({ version: result.data.workspace.version, eventUpdatedAt: result.data.event.updatedAt, state: result.data.workspace.state });
    } },
  ]);
  const nextAtField = (value: string, onChange: (value: string) => void, error?: string) => <View style={{ gap: spacing.sm }}>
    {editable ? <DateField label="วันนัดครั้งหน้า" required error={error} minDate={bangkokDay(event.startAt)} value={value ? bangkokDay(value) : ''}
      onChange={(day) => onChange(new Date(`${day}T${value ? thTime(value) : '09:00'}:00+07:00`).toISOString())} />
      : <Text style={{ color: colors.muted }}>{value ? thDateLong(value) : 'ไม่ระบุวันที่'}</Text>}
    <FieldLabel required hint="แบบ 24 ชั่วโมง เช่น 09:00">เวลา</FieldLabel>
    <TextInput key={value} accessibilityLabel="เวลานัดครั้งหน้า · จำเป็นต้องกรอก" accessibilityHint={timeError || undefined}
      style={fieldFrame({ focused: timeFocused, error: !!timeError, disabled: !editable })} placeholder="09:00" placeholderTextColor={colors.faint} maxLength={5}
      defaultValue={value ? thTime(value) : '09:00'} editable={editable} keyboardType="numbers-and-punctuation"
      onFocus={() => setTimeFocused(true)} onBlur={() => setTimeFocused(false)}
      onEndEditing={({ nativeEvent }) => {
        if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(nativeEvent.text)) return setTimeError('กรอกเวลาแบบ 09:00');
        setTimeError('');
        onChange(new Date(`${value ? bangkokDay(value) : bangkokDay(event.startAt)}T${nativeEvent.text}:00+07:00`).toISOString());
      }} />
    <InlineError message={timeError || undefined} />
  </View>;
  const isPicked = (id: string) => state.documents.some((item) => item.id === id);
  const lead = event.assignee ? `${event.assignee.firstName} ${event.assignee.lastName}` : 'ยังไม่ระบุ';
  const others = event.assignees?.filter((person) => person.userId !== event.assigneeId).map((person) => `${person.user.firstName} ${person.user.lastName}`) ?? [];
  const savedToServer = workspace.version > 0 && !stale && JSON.stringify(workspace.state) === JSON.stringify(state);
  return <SafeAreaView style={styles.screen}>
    <ScrollView automaticallyAdjustKeyboardInsets keyboardDismissMode="on-drag" keyboardShouldPersistTaps="handled"
      contentContainerStyle={{ ...pageContent, paddingTop: spacing.sm, gap: spacing.sm, paddingBottom: spacing.xl + keyboardHeight }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: spacing.xs }}>
        {back}
        <View style={{ flex: 1, minWidth: 0, gap: spacing.xs, paddingTop: spacing.xs }}>
          <Text accessibilityRole="header" style={styles.title}>{event.title}</Text>
          <Text style={styles.when}>{thDateLong(event.startAt)} · {thTime(event.startAt)}</Text>
          <Text style={styles.meta}>{[event.case?.ownRef, event.courtName ?? event.case?.courtName].filter(Boolean).join(' · ')}</Text>
          {done && <View style={{ alignSelf: 'flex-start' }}><Tag tone="ok">ยืนยันผลแล้ว</Tag></View>}
        </View>
      </View>
      <View accessibilityRole="tablist" style={styles.track}>
        {PHASES.map((label, index) => <Pressable key={label} accessibilityRole="tab" accessibilityState={{ selected: phase === index }}
          onPress={() => setPhase(index)}
          style={({ pressed }) => [styles.phase, phase === index ? styles.phaseOn : pressed && { backgroundColor: colors.soft }]}>
          <Text maxFontSizeMultiplier={CHROME_MAX_SCALE} style={[styles.phaseText, phase === index && styles.phaseTextOn]}>{label}</Text>
        </Pressable>)}
      </View>
      {court.isError && <InlineError message="โหลดข้อมูลล่าสุดไม่ได้ แสดงข้อมูลที่เก็บไว้" onRetry={() => court.refetch()} />}
      {stale && !done && <>
        <InlineError message="มีข้อมูลใหม่ในระบบ ร่างในเครื่องยังอยู่ กรุณาตรวจข้อมูลล่าสุดก่อนบันทึก" />
        <Button title="โหลดข้อมูลล่าสุด" variant="secondary" onPress={reload} disabled={busy} />
      </>}
      {phase === 0 ? <>
        <SectionLabel style={formLabelSpacing}>ใครไปด้วย</SectionLabel>
        <Card style={styles.listCard}>
          <View style={styles.teamRow}><Text style={styles.teamLabel}>หลัก:</Text><Text style={[styles.teamValue, { fontWeight: '600' }]}>{lead}</Text></View>
          <View style={[styles.teamRow, styles.teamRule]}><Text style={styles.teamLabel}>ร่วม:</Text><Text style={[styles.teamValue, !others.length && { color: colors.muted }]}>{others.join(', ') || 'ไม่มี'}</Text></View>
          <View style={styles.teamRule}><Button title="จัดทีมที่ไปด้วย" variant="link" onPress={() => router.push(`/event/${eventId}/team`)} disabled={busy} /></View>
        </Card>
        <SectionLabel style={formLabelSpacing}>เตรียมก่อนเดินทาง</SectionLabel>
        {state.checklist.length > 0 && <Card style={styles.listCard}>
          {state.checklist.map((item, index) => <View key={item.id} style={index > 0 && styles.rule}><CheckRow label={item.title} checked={item.done} disabled={!editable}
            onChange={() => change({ checklist: state.checklist.map((row) => row.id === item.id ? { ...row, done: !row.done } : row) })} /></View>)}
        </Card>}
        <SectionLabel style={formLabelSpacing}>เอกสารคดี · เลือกฉบับที่จะใช้</SectionLabel>
        {documents.isLoading && <LoadingState inline label="กำลังโหลดเอกสาร…" />}
        {documents.isError && <InlineError message="โหลดเอกสารไม่ได้" onRetry={() => documents.refetch()} />}
        {!!documents.data?.length && <Card style={styles.listCard}>
        {documents.data.map((doc, index) => <View key={doc.id} style={[styles.docRow, index > 0 && styles.rule]}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <CheckRow label={doc.filename} detail={`ฉบับ ${doc.version}`} checked={isPicked(doc.id)} disabled={!editable}
              onChange={() => change({ documents: isPicked(doc.id) ? state.documents.filter((item) => item.id !== doc.id) : [...state.documents, { id: doc.id, version: doc.version }] })} />
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel={`เปิดเอกสาร ${doc.filename}`} accessibilityState={{ busy: opening === doc.id, disabled: !!opening }}
            disabled={!!opening} onPress={async () => {
              setOpening(doc.id);
              try { await openCaseDocument(event.caseId, doc.id, doc.filename); }
              catch (error) { Alert.alert('เปิดไม่ได้', error instanceof Error ? error.message : 'ลองใหม่'); }
              finally { setOpening(''); }
            }} style={({ pressed }) => [{ width: TOUCH, height: TOUCH, alignItems: 'center', justifyContent: 'center' }, (pressed || opening === doc.id) && { opacity: 0.5 }]}>
            <ExternalLink size={20} color={colors.info} />
          </Pressable>
        </View>)}
        </Card>}
        {!documents.isLoading && !documents.isError && !documents.data?.length && <EmptyState compact>ยังไม่มีเอกสารในคดี</EmptyState>}
        <Button title="เปิดแฟ้มคดี · เอกสารทั้งหมด" variant="link" onPress={() => router.push(`/case/${event.caseId}?section=documents`)} />
      </> : <Text style={styles.status}>ไปด้วย: {lead}{others.length ? ` และอีก ${others.length} คน` : ''}</Text>}
      {phase !== 0 && <>
        <TextArea label={phase === 1 ? 'จดสั้นที่ศาล' : 'บันทึกรายละเอียด'} disabled={!editable} maxLength={10000}
          placeholder="จดสิ่งสำคัญไว้ก่อน เช่น ศาลสั่งอะไร ต้องส่งเอกสารอะไร" value={state.notes} onChange={(notes) => change({ notes })} />
        <TextArea label="ผลนัด" required hint="เติมภายหลังได้ · ต้องกรอกก่อนยืนยันผล" disabled={!editable} maxLength={10000}
          placeholder="ผลที่เกิดขึ้นในนัดนี้" value={state.outcome} onChange={(outcome) => change({ outcome })} error={shown('outcome')} />
        <Button title="เก็บใบเสร็จ / ค่าใช้จ่ายของคดีนี้" variant="link" disabled={busy}
          onPress={() => router.push({ pathname: '/expenses/new', params: { caseId: event.caseId, caseLabel: event.case?.ownRef, eventId } })} />
      </>}
      {phase === 2 && <>
        <SectionLabel style={formLabelSpacing}>สิ่งที่สร้างต่อเมื่อยืนยันผล</SectionLabel>
        <SwitchRow label="มีนัดครั้งหน้า" value={state.nextHearing} onValueChange={(nextHearing) => change({ nextHearing })} disabled={!editable} />
        {state.nextHearing && <>
          <TextField label="ชื่อนัดครั้งหน้า" required value={state.nextTitle} maxLength={200} disabled={!editable}
            onChange={(nextTitle) => change({ nextTitle })} error={shown('nextTitle')} />
          {nextAtField(state.nextAt, (nextAt) => change({ nextAt }), shown('nextAt'))}
        </>}
        <SwitchRow label="สร้างงานที่ต้องทำต่อให้ฉัน" value={state.followUp} onValueChange={(followUp) => change({ followUp })} disabled={!editable} />
        {state.followUp && <>
          <TextField label="งานที่ต้องทำต่อ" required maxLength={200} disabled={!editable} value={state.taskTitle}
            onChange={(taskTitle) => change({ taskTitle })} error={shown('taskTitle')} />
          {editable ? <DateField label="กำหนดส่ง · ถ้ามี" value={state.taskDue ? bangkokDay(state.taskDue) : ''}
            onChange={(day) => change({ taskDue: new Date(`${day}T${state.taskDue ? thTime(state.taskDue) : '09:00'}:00+07:00`).toISOString() })} onClear={() => change({ taskDue: '' })} />
            : <Text style={styles.status}>กำหนดส่ง: {state.taskDue ? thDateLong(state.taskDue) : 'ไม่ระบุ'}</Text>}
        </>}
        {/* Expenses are recorded through "เก็บใบเสร็จ"; this switch only lets older drafts that turned it on keep or drop it. */}
        {state.expense && <>
          <SwitchRow label="บันทึกค่าใช้จ่ายพร้อมผลนัด" value={state.expense} onValueChange={(expense) => change({ expense })} disabled={!editable} />
          <SelectField label="เบิกค่าอะไร" required value={state.expenseCategory ?? ''} options={EXPENSE_CATEGORIES.map((value) => ({ value, label: value }))}
            onChange={(expenseCategory) => change({ expenseCategory })} disabled={!editable} error={shown('expenseCategory')} />
          <TextField label="ยอดเงิน (บาท)" required value={formatMoneyInput(state.amount) ?? state.amount} disabled={!editable} keyboardType="decimal-pad"
            error={shown('amount')} onChange={(amount) => {
              const formatted = formatMoneyInput(amount);
              if (formatted !== null) change({ amount: formatted.replace(/,/g, '') });
            }} />
        </>}
        <SwitchRow label="สร้างร่างรายงานลูกความ" detail="ยังไม่ส่ง · ตรวจก่อนส่งได้" value={state.clientDraft} disabled={!editable}
          onValueChange={(clientDraft) => change({ clientDraft, draftRecipientKind: 'CLIENT', draftCustomerId: '' })} />
        {writer && !done && !reviewing && <>
          {triedConfirm && <MissingSummary items={missing.map((field) => FIELD_NAME[field])} />}
          <Button title="ตรวจทานและยืนยันผลนัด" onPress={review} busy={busy} disabled={stale || court.isError || court.isFetching} />
        </>}
        {writer && !done && reviewing && <Card style={styles.reviewCard}>
          <Text accessibilityRole="header" style={styles.reviewTitle}>ตรวจทานก่อนยืนยันผลนัด</Text>
          <View>{summary.map((line) => <Text key={line} style={styles.reviewLine}>{line}</Text>)}</View>
          <Button title="ยืนยันผลนัด" onPress={record} busy={busy} disabled={stale || court.isError || court.isFetching} />
          <Button title="กลับไปแก้" variant="secondary" onPress={() => setReviewing(false)} disabled={busy} />
        </Card>}
        <InlineError message={submitError || undefined} />
      </>}
      {!done && <View style={{ gap: spacing.xs, marginTop: spacing.md }}>
        {!savedToServer && localStatus.includes('ไม่สำเร็จ')
          ? <InlineError message={localStatus} />
          : <Text accessibilityLiveRegion="polite" style={styles.status}>
            {savedToServer ? 'บันทึกร่างเข้าระบบแล้ว · ยังไม่ยืนยันผล' : localStatus}
          </Text>}
        {writer && <Button title="บันทึกร่างเข้าระบบ · ยังไม่ยืนยันผล" variant="secondary"
          onPress={() => { setSubmitError(''); sync().catch((error) => setSubmitError(`บันทึกไม่สำเร็จ · ${error instanceof Error ? error.message : 'ลองใหม่อีกครั้ง'}`)); }}
          busy={save.isPending && !complete.isPending} disabled={busy || stale || court.isError || court.isFetching} />}
        {phase !== 2 && submitError ? <InlineError message={submitError} /> : null}
      </View>}
    </ScrollView>
  </SafeAreaView>;
}

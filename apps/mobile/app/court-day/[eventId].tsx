import React, { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, Switch, View } from 'react-native';
import { Text, TextInput } from '@/components/AppText';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { EXPENSE_CATEGORIES } from '@lawfirm/shared';
import { useAuth } from '@/api/auth';
import { api } from '@/api/client';
import { draftScope, saveDraft } from '@/api/drafts';
import { useCourtDay, useSaveCourtDay, useCompleteCourtDay } from '@/api/hooks';
import type { CourtDayResponse, CourtDayState } from '@/api/types';
import { openCaseDocument } from '@/api/files';
import { Button, ErrorNote, Loading, SectionLabel, Tag } from '@/components/ui';
import { DatePicker } from '@/components/DatePicker';
import { Dropdown } from '@/components/Dropdown';
import { bangkokDay, formatMoney, formatMoneyInput, thDateLong, thTime } from '@/format';
import { expenseError } from '@/workflow';
import { colors, spacing, formLabelSpacing, pageContent } from '@/theme';
import { useKeyboardHeight } from '@/hooks/useKeyboardHeight';

type Draft = { version: number; eventUpdatedAt: string; state: CourtDayState };
type Document = { id: string; filename: string; version: number };
const PHASES = ['ก่อนไป', 'ที่ศาล', 'เติมที่สำนักงาน'] as const;
const PREP = [
  { id: '00000000-0000-4000-8000-000000000001', title: 'ตรวจเอกสารที่ต้องใช้', done: false },
  { id: '00000000-0000-4000-8000-000000000002', title: 'ยืนยันทีมที่ไปด้วย', done: false },
  { id: '00000000-0000-4000-8000-000000000003', title: 'ตรวจสถานที่และเวลาเดินทาง', done: false },
];

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
  const key = user ? `${draftScope(user)}court:${eventId}` : '';
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
  if (!court.data) return court.isLoading ? <Loading /> : <SafeAreaView style={{ flex: 1, padding: spacing.lg }}>
    <ErrorNote message="ยังโหลดนัดนี้ไม่ได้ กรุณาต่ออินเทอร์เน็ตและลองใหม่" onRetry={() => court.refetch()} />
    <Button title="กลับ" ghost onPress={() => router.back()} />
  </SafeAreaView>;
  if (readError) return <SafeAreaView style={{ padding: spacing.lg }}><ErrorNote message={readError} onRetry={() => setReadAttempt(readAttempt + 1)} /></SafeAreaView>;
  if (!draft) return <Loading />;
  const { event, workspace } = court.data;
  const state = draft.state;
  const done = !!workspace.completedAt;
  const busy = save.isPending || complete.isPending;
  // CourtDayService already authorizes senior lawyers through the existing case access filter.
  const writer = ['OWNER', 'SENIOR_LAWYER', 'LAWYER'].includes(user?.firmRole ?? '');
  const editable = writer && !done && !busy;
  const stale = workspace.version !== draft.version || event.updatedAt !== draft.eventUpdatedAt;
  const change = (next: Partial<CourtDayState>) => setDraft({ ...draft, state: { ...state, ...next } });
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
    try {
      const latest = await sync();
      const result = await complete.mutateAsync({ version: latest.version, eventUpdatedAt: latest.eventUpdatedAt });
      client.setQueryData<CourtDayResponse>(['court-day', eventId], (data) => data ? { ...data, workspace: result } : data);
      setDraft({ ...latest, version: result.version });
      await AsyncStorage.removeItem(key);
      Alert.alert('ยืนยันผลนัดแล้ว', 'บันทึกผลและรายการที่เลือกไว้ในระบบแล้ว');
    } catch (error) { Alert.alert('ยืนยันไม่สำเร็จ', error instanceof Error ? error.message : 'ลองใหม่อีกครั้ง'); }
  };
  const review = () => {
    if (!state.outcome.trim()) return Alert.alert('กรอกผลนัด', 'ระบุผลนัดก่อนยืนยัน');
    if (state.nextHearing && (!state.nextTitle.trim() || !state.nextAt || new Date(state.nextAt) <= new Date(event.startAt))) return Alert.alert('ตรวจนัดครั้งหน้า', 'ระบุชื่อ วัน และเวลาที่อยู่หลังนัดนี้');
    if (state.followUp && !state.taskTitle.trim()) return Alert.alert('ตรวจงานต่อ', 'ระบุชื่องานที่ต้องทำต่อ');
    if (state.expense) { const error = expenseError(state.expenseCategory ?? '', state.outcome, state.amount, true); if (error) return Alert.alert('ตรวจค่าใช้จ่าย', error); }
    const summary = [`ผล: ${state.outcome}`,
      state.nextHearing ? `เพิ่มนัด: ${state.nextTitle} · ${thDateLong(state.nextAt)} ${thTime(state.nextAt)}` : '',
      state.followUp ? `เพิ่มงานให้ฉัน: ${state.taskTitle}${state.taskDue ? ` · ${thDateLong(state.taskDue)}` : ''}` : '',
      state.expense ? `ค่าใช้จ่าย: ${state.expenseCategory} ${formatMoney(state.amount)} บาท · ยังไม่ส่งเบิก` : '',
      state.clientDraft ? 'สร้างร่างรายงานลูกความ · ยังไม่ส่ง' : '',
    ].filter(Boolean).join('\n\n');
    Alert.alert('ตรวจทานก่อนยืนยันผลนัด', summary, [{ text: 'กลับไปแก้', style: 'cancel' }, { text: 'ยืนยันผลนัด', onPress: record }]);
  };
  const reload = () => Alert.alert('ใช้ข้อมูลล่าสุด?', 'ร่างที่แก้ในหน้านี้จะถูกแทนด้วยข้อมูลล่าสุดในระบบ', [
    { text: 'ยกเลิก', style: 'cancel' }, { text: 'โหลดล่าสุด', onPress: async () => {
      const result = await court.refetch();
      if (!result.data || result.error) return Alert.alert('โหลดไม่สำเร็จ', 'เก็บร่างเดิมไว้แล้ว');
      setDraft({ version: result.data.workspace.version, eventUpdatedAt: result.data.event.updatedAt, state: result.data.workspace.state });
    } },
  ]);
  const input = { minHeight: 48, padding: spacing.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: 10, color: colors.text };
  const timestamp = (value: string, onChange: (value: string) => void, time = true) => <View style={{ gap: spacing.sm }}>
    {editable ? <DatePicker value={value ? bangkokDay(value) : ''} onChange={(day) => onChange(new Date(`${day}T${value ? thTime(value) : '09:00'}:00+07:00`).toISOString())} /> : <Text style={{ color: colors.muted }}>{value ? thDateLong(value) : 'ไม่ระบุวันที่'}</Text>}
    {time && <TextInput key={value} accessibilityLabel="เวลานัดครั้งหน้า" style={input} placeholder="เวลา เช่น 09:00" maxLength={5}
      defaultValue={value ? thTime(value) : '09:00'} editable={editable} keyboardType="numbers-and-punctuation"
      onEndEditing={({ nativeEvent }) => {
        if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(nativeEvent.text)) return Alert.alert('ตรวจเวลา', 'กรอกเวลาแบบ 09:00');
        onChange(new Date(`${value ? bangkokDay(value) : bangkokDay(event.startAt)}T${nativeEvent.text}:00+07:00`).toISOString());
      }} />}
  </View>;
  const toggle = (label: string, value: boolean, onChange: (value: boolean) => void) => <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginVertical: spacing.sm }}>
    <Text style={{ color: colors.text, flex: 1 }}>{label}</Text><Switch accessibilityLabel={label} value={value} onValueChange={onChange} disabled={!editable} />
  </View>;
  return <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
    <ScrollView automaticallyAdjustKeyboardInsets keyboardDismissMode="on-drag" keyboardShouldPersistTaps="handled" contentContainerStyle={{ ...pageContent, paddingBottom: spacing.xl + keyboardHeight }}>
      <View style={{ paddingBottom: spacing.md, gap: spacing.sm }}>
        <Button title="กลับ" ghost onPress={() => router.back()} />
        <Text style={{ fontSize: 20, fontWeight: '700', color: colors.ink }}>{event.title}</Text>
        <Text style={{ color: colors.muted }}>{event.case?.ownRef} · {event.courtName ?? event.case?.courtName} · {thTime(event.startAt)}</Text>
        <Text style={{ color: colors.muted }}>{thDateLong(event.startAt)}</Text>
        {done && <Tag tone="ok">ยืนยันผลแล้ว</Tag>}
        <View style={{ flexDirection: 'row', gap: spacing.sm }}>
          {PHASES.map((label, index) => <Pressable key={label} accessibilityRole="tab" accessibilityState={{ selected: phase === index }}
            onPress={() => setPhase(index)} style={{ flex: 1, minHeight: 44, backgroundColor: phase === index ? colors.ink : colors.soft, borderRadius: 10, justifyContent: 'center', padding: spacing.sm }}>
            <Text style={{ color: phase === index ? colors.surface : colors.ink, textAlign: 'center' }}>{label}</Text>
          </Pressable>)}
        </View>
      </View>
      <View style={{ gap: spacing.sm }}>
        {court.isError && <ErrorNote message="โหลดข้อมูลล่าสุดไม่ได้ แสดงข้อมูลที่เก็บไว้" onRetry={() => court.refetch()} />}
        {stale && !done && <><ErrorNote message="มีข้อมูลใหม่ในระบบ ร่างในเครื่องยังอยู่ กรุณาตรวจข้อมูลล่าสุดก่อนบันทึก" /><Button title="โหลดข้อมูลล่าสุด" ghost onPress={reload} disabled={busy} /></>}
        <SectionLabel style={formLabelSpacing}>ใครไปด้วย</SectionLabel>
        <Text style={{ color: colors.ink }}>หลัก: {event.assignee ? `${event.assignee.firstName} ${event.assignee.lastName}` : 'ยังไม่ระบุ'}</Text>
        <Text style={{ color: colors.muted }}>ร่วม: {event.assignees?.filter((person) => person.userId !== event.assigneeId).map((person) => `${person.user.firstName} ${person.user.lastName}`).join(', ') || 'ไม่มี'}</Text>
        <Button title="ดู / จัดทีมที่ไปด้วย" ghost onPress={() => router.push(`/event/${eventId}/team`)} disabled={busy} />
        {phase === 0 && <>
          <SectionLabel style={formLabelSpacing}>เตรียมก่อนเดินทาง</SectionLabel>
          {state.checklist.map((item) => <Pressable key={item.id} accessibilityRole="checkbox" accessibilityState={{ checked: item.done, disabled: !editable }}
            disabled={!editable} onPress={() => change({ checklist: state.checklist.map((row) => row.id === item.id ? { ...row, done: !row.done } : row) })}
            style={{ minHeight: 48, justifyContent: 'center', backgroundColor: colors.surface, padding: spacing.md, borderRadius: 10 }}>
            <Text style={{ color: colors.ink }}>{item.done ? '✓' : '○'} {item.title}</Text>
          </Pressable>)}
          <SectionLabel style={formLabelSpacing}>เอกสารคดี · เลือกฉบับที่จะใช้</SectionLabel>
          {documents.isError && <ErrorNote message="โหลดเอกสารไม่ได้" onRetry={() => documents.refetch()} />}
          {documents.data?.map((doc) => <View key={doc.id} style={{ padding: spacing.md, backgroundColor: colors.surface, borderRadius: 10, gap: spacing.sm }}>
            <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: state.documents.some((item) => item.id === doc.id) }} disabled={!editable}
              onPress={() => change({ documents: state.documents.some((item) => item.id === doc.id) ? state.documents.filter((item) => item.id !== doc.id) : [...state.documents, { id: doc.id, version: doc.version }] })} style={{ minHeight: 44 }}>
              <Text style={{ color: colors.ink }}>{state.documents.some((item) => item.id === doc.id) ? '✓ ' : '○ '}{doc.filename} · ฉบับ {doc.version}</Text>
            </Pressable>
            <Button title="เปิดเอกสาร" ghost disabled={!!opening} busy={opening === doc.id} onPress={async () => {
              setOpening(doc.id);
              try { await openCaseDocument(event.caseId, doc.id, doc.filename); }
              catch (error) { Alert.alert('เปิดไม่ได้', error instanceof Error ? error.message : 'ลองใหม่'); }
              finally { setOpening(''); }
            }} />
          </View>)}
          {!documents.isLoading && !documents.isError && !documents.data?.length && <Text style={{ color: colors.muted }}>ยังไม่มีเอกสารในคดี</Text>}
          <Button title="ดูแฟ้มคดี / เอกสารทั้งหมด" ghost onPress={() => router.push(`/case/${event.caseId}?section=documents`)} />
        </>}
        {phase !== 0 && <>
          <SectionLabel style={formLabelSpacing}>{phase === 1 ? 'จดสั้นที่ศาล' : 'บันทึกรายละเอียด'}</SectionLabel>
          <TextInput accessibilityLabel="บันทึกระหว่างนัด" style={[input, { minHeight: phase === 1 ? 100 : 160, textAlignVertical: 'top' }]} multiline editable={editable}
            placeholder="จดสิ่งสำคัญไว้ก่อน เช่น ศาลสั่งอะไร ต้องส่งเอกสารอะไร" maxLength={10000} value={state.notes} onChangeText={(notes) => change({ notes })} />
          <SectionLabel style={formLabelSpacing}>ผลนัด · เติมภายหลังได้</SectionLabel>
          <TextInput accessibilityLabel="ผลนัด" style={[input, { minHeight: 100, textAlignVertical: 'top' }]} multiline editable={editable}
            placeholder="ผลที่เกิดขึ้นในนัดนี้" maxLength={10000} value={state.outcome} onChangeText={(outcome) => change({ outcome })} />
          <Button title="เก็บใบเสร็จ / ค่าใช้จ่ายของคดีนี้" ghost onPress={() => router.push({ pathname: '/expenses/new', params: { caseId: event.caseId, caseLabel: event.case?.ownRef, eventId } })} disabled={busy} />
        </>}
        {phase === 2 && <>
          {toggle('มีนัดครั้งหน้า', state.nextHearing, (nextHearing) => change({ nextHearing }))}
          {state.nextHearing && <>
            <TextInput style={input} accessibilityLabel="ชื่อนัดครั้งหน้า" placeholder="ชื่อนัดครั้งหน้า" value={state.nextTitle} maxLength={200} editable={editable} onChangeText={(nextTitle) => change({ nextTitle })} />
            {timestamp(state.nextAt, (nextAt) => change({ nextAt }))}
          </>}
          {toggle('สร้างงานที่ต้องทำต่อให้ฉัน', state.followUp, (followUp) => change({ followUp }))}
          {state.followUp && <>
            <TextInput style={input} accessibilityLabel="งานที่ต้องทำต่อ" placeholder="งานที่ต้องทำต่อ" maxLength={200} editable={editable} value={state.taskTitle} onChangeText={(taskTitle) => change({ taskTitle })} />
            <SectionLabel style={formLabelSpacing}>กำหนดส่ง · ไม่บังคับ</SectionLabel>
            {timestamp(state.taskDue, (taskDue) => change({ taskDue }), false)}
          </>}
          {state.expense && <>
            {toggle('บันทึกค่าใช้จ่ายพร้อมผลนัด', state.expense, (expense) => change({ expense }))}
            <Dropdown label="เบิกค่าอะไร" value={state.expenseCategory ?? ''} options={EXPENSE_CATEGORIES.map((value) => ({ value, label: value }))}
              onChange={(expenseCategory) => change({ expenseCategory })} disabled={!editable} />
            <TextInput style={input} accessibilityLabel="ยอดค่าใช้จ่าย" value={formatMoneyInput(state.amount) ?? state.amount} editable={editable} keyboardType="decimal-pad" onChangeText={(amount) => {
              const formatted = formatMoneyInput(amount);
              if (formatted !== null) change({ amount: formatted.replace(/,/g, '') });
            }} />
          </>}
          {toggle('สร้างร่างรายงานลูกความ · ยังไม่ส่ง', state.clientDraft, (clientDraft) => change({ clientDraft, draftRecipientKind: 'CLIENT', draftCustomerId: '' }))}
          {writer && !done && <Button title="ตรวจทานและยืนยันผลนัด" onPress={review} busy={busy} disabled={stale || court.isError || court.isFetching} />}
        </>}
        {!done && <>
          <Text style={{ color: localStatus.includes('ไม่สำเร็จ') ? colors.warn : colors.muted }}>{workspace.version > 0 && !stale && JSON.stringify(workspace.state) === JSON.stringify(state) ? 'บันทึกร่างเข้าระบบแล้ว · ยังไม่ยืนยันผล' : localStatus}</Text>
          <Button title="เก็บร่างในเครื่อง" ghost onPress={() => saveDraft(key, draft).then(() => setLocalStatus('เก็บร่างในเครื่องแล้ว · เติมต่อภายหลังได้')).catch(() => setLocalStatus('เก็บร่างในเครื่องไม่สำเร็จ'))} disabled={busy} />
          {writer && <Button title="บันทึกร่างเข้าระบบ · ยังไม่ยืนยันผล" onPress={() => sync().catch((error) => Alert.alert('บันทึกไม่สำเร็จ', error.message))}
            busy={busy} disabled={stale || court.isError || court.isFetching} />}
        </>}
      </View>
    </ScrollView>
  </SafeAreaView>;
}

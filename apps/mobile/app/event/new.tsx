import React, { useEffect, useRef, useState } from 'react';
import { Alert, Pressable, StyleSheet } from 'react-native';
import { Text, TextInput } from '@/components/AppText';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/api/auth';
import { api } from '@/api/client';
import { useCreateEvent, useEvent, useCase, useCourts, useLeaves } from '@/api/hooks';
import { Dropdown } from '@/components/Dropdown';
import { TeamFields } from '@/components/TeamFields';
import { FormField, FormPage } from '@/components/Form';
import { CasePicker, CaseRef } from '@/components/CasePicker';
import { DatePicker } from '@/components/DatePicker';
import { Button, Card, ErrorNote, Loading, SectionLabel } from '@/components/ui';
import { bangkokDay, thDate, thTime } from '@/format';
import { leaveFlagsForDate, leaveWarning } from '@/lib/leave-flags';
import { colors, radius, spacing } from '@/theme';

// Same options as the web's event-type <select> (CalendarEventDialog).
const EVENT_TYPES = [
  { value: 'COURT_DATE', label: 'นัดศาล' },
  { value: 'CLIENT_MEETING', label: 'นัดลูกความ' },
  { value: 'DEADLINE', label: 'ครบกำหนด' },
  { value: 'OTHER', label: 'อื่นๆ' },
] as const;

interface ReschedulePreview { fingerprint: string; oldAt: string; newAt: string;
  impacts: Array<{ id: string; title: string; oldAt: string; newAt: string | null }> }

export default function NewEventScreen() {
  const router = useRouter();
  const { date, caseId, id } = useLocalSearchParams<{ date?: string; caseId?: string; id?: string }>();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const createEvent = useCreateEvent();
  const current = useEvent(id ?? '');
  const initialCase = useCase(caseId ?? '');
  const courts = useCourts();

  const [caseRef, setCaseRef] = useState<CaseRef | null>(null);
  const [title, setTitle] = useState('');
  const [type, setType] = useState<string>('COURT_DATE');
  const [courtName, setCourtName] = useState('');
  const [day, setDay] = useState(date || bangkokDay(new Date().toISOString()));
  const [time, setTime] = useState('09:00');
  const [ids, setIds] = useState<string[]>(user ? [user.id] : []);
  const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState('');
  const [preview, setPreview] = useState<ReschedulePreview | null>(null);
  const seeded = useRef<string | null>(null);
  const previewStart = `${day}T${time.trim()}:00+07:00`;
  const moving = !!id && !!current.data && new Date(previewStart).getTime() !== new Date(current.data.startAt).getTime();
  useEffect(() => { setPreview(null); }, [day, time]);
  const leaves = useLeaves(day, day);
  const flags = leaveFlagsForDate(leaves.data ?? [], day);
  useEffect(() => {
    if (!initialCase.data || id || seeded.current === initialCase.data.id) return;
    seeded.current = initialCase.data.id;
    setCaseRef({ id: initialCase.data.id, label: `${initialCase.data.ownRef} · ${initialCase.data.title}` });
    setCourtName(initialCase.data.courtName ?? '');
  }, [initialCase.data, id]);
  useEffect(() => {
    if (!current.data || seeded.current === current.data.id) return;
    seeded.current = current.data.id;
    const event = current.data;
    setTitle(event.title); setType(event.type); setCourtName(event.courtName ?? '');
    setDay(bangkokDay(event.startAt)); setTime(thTime(event.startAt));
    setCaseRef({ id: event.caseId, label: event.case ? `${event.case.ownRef} · ${event.case.title}` : event.caseId });
    setIds([...new Set([...(event.assigneeId ? [event.assigneeId] : []), ...(event.assignees ?? []).map(person => person.userId)])]);
  }, [current.data]);

  const submit = () => {
    if (!caseRef) {
      Alert.alert('เลือกคดี', 'นัดหมายต้องผูกกับคดี');
      return;
    }
    if (!title.trim()) {
      Alert.alert('กรอกไม่ครบ', 'ใส่ชื่อนัดหมายก่อนบันทึก');
      return;
    }
    if (!ids.length) return Alert.alert('เลือกผู้รับผิดชอบ', 'เลือกคนหลักและคนที่ไปด้วยก่อนบันทึก');
    if (type === 'COURT_DATE' && !courtName) return Alert.alert('เลือกศาล', 'เลือกศาลจากรายการ');
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time.trim())) return Alert.alert('เวลาไม่ถูกต้อง', 'ใช้รูปแบบเวลา เช่น 09:00');
    const startAt = new Date(`${day}T${time.trim() || '09:00'}:00+07:00`);
    if (Number.isNaN(startAt.getTime())) {
      Alert.alert('เวลาไม่ถูกต้อง', 'ใช้รูปแบบเวลา เช่น 09:00');
      return;
    }
    const body = {
        caseId: caseRef.id,
        title: title.trim(),
        startAt: startAt.toISOString(),
        type,
        courtName: type === 'COURT_DATE' ? courtName.trim() : '',
        assigneeIds: ids,
      };
    const save = async () => {
      setBusy(true);
      let rescheduled = false;
      try {
        if (id) {
          if (moving) {
            if (!reason.trim()) return Alert.alert('ระบุเหตุผล', 'ใส่เหตุผลการเลื่อนนัดก่อนตรวจผลกระทบ');
            if (!preview) {
              setPreview(await api<ReschedulePreview>(`/calendar/events/${id}/reschedule-preview`, { method: 'POST', body: { startAt: body.startAt } }));
              return;
            }
            if (preview.newAt !== body.startAt) { setPreview(null); return; }
            await api(`/calendar/events/${id}/reschedule`, { method: 'POST', body: {
              startAt: body.startAt, fingerprint: preview.fingerprint, reason: reason.trim(),
            } });
            rescheduled = true;
            setPreview(null);
            await queryClient.invalidateQueries({ queryKey: ['event', id] });
          }
          const { caseId: _caseId, startAt: _startAt, ...update } = body;
          await api(`/calendar/events/${id}`, { method: 'PATCH', body: update });
        } else await createEvent.mutateAsync(body);
        for (const key of [['calendar'], ['event', id], ['my-day'], ['workload'], ['case-events', caseRef.id]])
          await queryClient.invalidateQueries({ queryKey: key });
        router.back();
      } catch (error) { setPreview(null); Alert.alert(rescheduled ? 'เลื่อนนัดแล้ว แต่รายละเอียดอื่นยังบันทึกไม่ครบ' : 'บันทึกไม่สำเร็จ', error instanceof Error ? error.message : 'ลองใหม่อีกครั้ง'); }
      finally { setBusy(false); }
    };
    const warnings = ids.flatMap(personId => flags.get(personId) ? [leaveWarning('ผู้ร่วมที่เลือก', day, flags.get(personId)?.kind)] : []);
    if (warnings.length) Alert.alert('มีวันลาตรงกับนัด', warnings.join('\n'), [{ text: 'กลับไปตรวจทีม', style: 'cancel' }, { text: 'ยืนยันบันทึก', onPress: save }]);
    else save();
  };

  if (id && current.isLoading) return <Loading />;
  if (id && (current.isError || !current.data)) return <ErrorNote message="โหลดนัดไม่สำเร็จ" onRetry={() => current.refetch()} />;

  return (
    <>
      <Stack.Screen options={{ title: id ? 'แก้ไขนัดหมาย' : 'เพิ่มนัดหมาย' }} />
      <View style={styles.screen}>
        <FormPage>
          <SectionLabel>คดี</SectionLabel>
          {id ? <Text style={{ color: colors.text }}>{caseRef?.label}</Text> : <CasePicker value={caseRef} onChange={setCaseRef} />}

          <SectionLabel>ชื่อนัดหมาย</SectionLabel>
          <TextInput
            style={styles.input}
            placeholder="เช่น นัดสืบพยานโจทก์"
            placeholderTextColor={colors.faint}
            value={title}
            onChangeText={setTitle}
          />

          <SectionLabel>ประเภท</SectionLabel>
          <View style={styles.chips}>
            {EVENT_TYPES.map((option) => (
              <Pressable
                key={option.value}
                onPress={() => setType(option.value)}
                style={[styles.chip, type === option.value && styles.chipOn]}
              >
                <Text
                  style={[styles.chipText, type === option.value && styles.chipTextOn]}
                >
                  {option.label}
                </Text>
              </Pressable>
            ))}
          </View>

          {type === 'COURT_DATE' ? (
            <>
              <SectionLabel>ศาล</SectionLabel>
              <Dropdown label="เลือกศาล" value={courtName} onChange={setCourtName} disabled={busy || courts.isLoading}
                options={[...(courtName && !courts.data?.some(item => item.name === courtName) ? [{ value: courtName, label: courtName }] : []),
                  ...(courts.data ?? []).map(item => ({ value: item.name, label: item.name }))]} />
              {courts.isError && <ErrorNote message="โหลดรายชื่อศาลไม่สำเร็จ" onRetry={() => courts.refetch()} />}
            </>
          ) : null}

          <SectionLabel>วันที่</SectionLabel>
          <DatePicker value={day} onChange={setDay} />

          <SectionLabel>เวลา</SectionLabel>
          <View style={styles.chips}>
            {['09:00', '10:00', '13:30', '14:00'].map((preset) => (
              <Pressable
                key={preset}
                onPress={() => setTime(preset)}
                style={[styles.chip, time === preset && styles.chipOn]}
              >
                <Text style={[styles.chipText, time === preset && styles.chipTextOn]}>
                  {preset}
                </Text>
              </Pressable>
            ))}
            <TextInput
              style={[styles.input, styles.timeInput]}
              placeholder="อื่นๆ 00:00"
              placeholderTextColor={colors.faint}
              keyboardType="numbers-and-punctuation"
              value={time}
              onChangeText={setTime}
            />
          </View>

          <TeamFields ids={ids} onChange={setIds} primaryLabel="คนหลัก" secondaryLabel="คนที่ไปด้วย" disabled={busy} />
          {leaves.isError && <ErrorNote message="ยังตรวจสอบวันลาไม่ได้" onRetry={() => leaves.refetch()} />}
          {moving && <FormField label="เหตุผลการเลื่อนนัด" value={reason} onChange={setReason} disabled={busy} />}
          {preview && <Card style={{ marginTop: spacing.md }}>
            <Text style={{ color: colors.ink, fontWeight: '700' }}>ตรวจผลกระทบก่อนยืนยันเลื่อนนัด</Text>
            <Text style={{ color: colors.text }}>เดิม {thDate(preview.oldAt)} {thTime(preview.oldAt)}</Text>
            <Text style={{ color: colors.text }}>ใหม่ {thDate(preview.newAt)} {thTime(preview.newAt)}</Text>
            {!preview.impacts.length && <Text style={{ color: colors.muted }}>ไม่มีงานหรือกำหนดที่ผูกกับนัดนี้</Text>}
            {preview.impacts.map(item => <View key={item.id} style={{ marginTop: spacing.sm }}>
              <Text style={{ color: colors.text }}>{item.title}</Text>
              <Text style={{ color: colors.muted }}>{thDate(item.oldAt)} → {item.newAt ? thDate(item.newAt) : 'ต้องตรวจเพิ่มเติม'}</Text>
            </View>)}
            <Button title="ยกเลิกการยืนยัน" ghost disabled={busy} onPress={() => setPreview(null)} />
          </Card>}
          <View style={{ marginTop: spacing.xl }}>
            <Button title={preview ? 'ยืนยันเลื่อนนัดและบันทึก' : moving ? 'ตรวจผลกระทบการเลื่อนนัด' : 'บันทึกนัดหมาย'} onPress={submit} busy={busy} />
          </View>
        </FormPage>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  input: {
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: radius.button,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    fontSize: 15,
    color: colors.text,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  chipOn: { backgroundColor: colors.ink, borderColor: colors.ink },
  chipText: { fontSize: 13, color: colors.muted, fontWeight: '600' },
  chipTextOn: { color: colors.bg },
  timeInput: { width: 110, paddingVertical: 8 },
});

import React, { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { COURT_EVENT_KIND_LABELS, CourtEventKind } from '@lawfirm/shared';
import { Text } from '@/components/AppText';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/api/auth';
import { api } from '@/api/client';
import { useCreateEvent, useEvent, useCase, useCourts, useLeaves, useMembers } from '@/api/hooks';
import { Dropdown } from '@/components/Dropdown';
import { TeamFields } from '@/components/TeamFields';
import { CheckRow, FieldLabel, FormPage, FormSection, MissingSummary, fieldA11yLabel } from '@/components/Form';
import { TextField } from '@/components/Input';
import { CasePicker, CaseRef } from '@/components/CasePicker';
import { DatePicker } from '@/components/DatePicker';
import { Button, Card, ErrorState, InlineError, LoadingState } from '@/components/ui';
import { bangkokDay, thDate, thTime } from '@/format';
import { leaveFlagsForDate, leaveWarning } from '@/lib/leave-flags';
import { CHROME_MAX_SCALE, colors, radius, shadow, spacing, typeScale } from '@/theme';

// Same options as the web's event-type <select> (CalendarEventDialog).
const EVENT_TYPES = [
  { value: 'COURT_DATE', label: 'นัดศาล' },
  { value: 'CLIENT_MEETING', label: 'นัดลูกความ' },
  { value: 'DEADLINE', label: 'ครบกำหนด' },
  { value: 'OTHER', label: 'อื่นๆ' },
] as const;
const TIME_PRESETS = ['09:00', '10:00', '13:30', '14:00'];
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

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
  const members = useMembers();

  const [caseRef, setCaseRef] = useState<CaseRef | null>(null);
  const [title, setTitle] = useState('');
  const [type, setType] = useState<string>('COURT_DATE');
  const [courtName, setCourtName] = useState('');
  const [courtEventKind, setCourtEventKind] = useState<CourtEventKind | ''>('');
  const [day, setDay] = useState(date || bangkokDay(new Date().toISOString()));
  const [time, setTime] = useState('09:00');
  const [customTime, setCustomTime] = useState(false);
  const [ids, setIds] = useState<string[]>(user ? [user.id] : []);
  const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState('');
  const [preview, setPreview] = useState<ReschedulePreview | null>(null);
  const [triedSave, setTriedSave] = useState(false);
  const [leaveAck, setLeaveAck] = useState(false);
  const [saveError, setSaveError] = useState('');
  const seeded = useRef<string | null>(null);
  const timeOk = TIME_PATTERN.test(time.trim());
  const previewStart = `${day}T${time.trim()}:00+07:00`;
  const moving = !!id && !!current.data && timeOk && new Date(previewStart).getTime() !== new Date(current.data.startAt).getTime();
  useEffect(() => { setPreview(null); }, [day, time]);
  const leaves = useLeaves(day, day);
  const flags = leaveFlagsForDate(leaves.data ?? [], day);
  const nameOf = (personId: string) => {
    const person = members.data?.find(item => item.id === personId);
    return person ? `${person.firstName} ${person.lastName}` : 'ผู้ร่วมที่เลือก';
  };
  // Shown inline under the team; one tick confirms it instead of an alert on every save tap.
  const warnings = ids.flatMap(personId => flags.get(personId)
    ? [leaveWarning(nameOf(personId), day, flags.get(personId)?.kind)] : []);
  const warningKey = warnings.join('|');
  useEffect(() => { setLeaveAck(false); }, [warningKey]);
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
    setCourtEventKind(event.courtEventKind ?? '');
    const at = thTime(event.startAt);
    setDay(bangkokDay(event.startAt)); setTime(at); setCustomTime(!TIME_PRESETS.includes(at));
    setCaseRef({ id: event.caseId, label: event.case ? `${event.case.ownRef} · ${event.case.title}` : event.caseId });
    setIds([...new Set([...(event.assigneeId ? [event.assigneeId] : []), ...(event.assignees ?? []).map(person => person.userId)])]);
  }, [current.data]);

  const problems = {
    case: !caseRef ? 'เลือกคดีที่นัดนี้ผูกอยู่' : undefined,
    title: !title.trim() ? 'ใส่ชื่อนัดหมาย' : undefined,
    court: type === 'COURT_DATE' && !courtName ? 'เลือกศาลจากรายการ' : undefined,
    time: !timeOk ? 'ใช้รูปแบบเวลา ชั่วโมง:นาที เช่น 09:00' : undefined,
    reason: moving && !reason.trim() ? 'ใส่เหตุผลก่อนตรวจผลกระทบ' : undefined,
    team: !ids.length ? 'เลือกคนหลักก่อนบันทึก' : undefined,
    leave: warnings.length && !leaveAck ? 'ยืนยันว่าตรวจวันลาแล้วก่อนบันทึก' : undefined,
  };
  const shown = (key: keyof typeof problems) => triedSave ? problems[key] : undefined;
  const missing = triedSave ? ([
    ['case', 'คดี'], ['title', 'ชื่อนัดหมาย'], ['court', 'ศาล'], ['time', 'เวลา'], ['reason', 'เหตุผลการเลื่อนนัด'], ['team', 'คนหลัก'], ['leave', 'ยืนยันวันลา'],
  ] as const).filter(([key]) => problems[key]).map(([, label]) => label) : [];

  const submit = async () => {
    setTriedSave(true);
    setSaveError('');
    if (Object.values(problems).some(Boolean) || !caseRef) return;
    const startAt = new Date(`${day}T${time.trim()}:00+07:00`);
    if (Number.isNaN(startAt.getTime())) return;
    const body = {
        caseId: caseRef.id,
        title: title.trim(),
        startAt: startAt.toISOString(),
        type,
        courtName: type === 'COURT_DATE' ? courtName.trim() : '',
        courtEventKind: type === 'COURT_DATE' ? courtEventKind || null : null,
        assigneeIds: ids,
      };
    setBusy(true);
    let rescheduled = false;
    try {
      if (id) {
        if (moving) {
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
    } catch (error) {
      setPreview(null);
      setSaveError(`${rescheduled ? 'เลื่อนนัดแล้ว แต่รายละเอียดอื่นยังบันทึกไม่ครบ' : 'บันทึกไม่สำเร็จ'} · ${error instanceof Error ? error.message : 'ลองใหม่อีกครั้ง'}`);
    }
    finally { setBusy(false); }
  };

  if (id && current.isLoading) return <LoadingState label="กำลังโหลดนัดหมาย…" />;
  if (id && (current.isError || !current.data)) return <View style={styles.statePage}><ErrorState message="โหลดนัดไม่สำเร็จ" onRetry={() => current.refetch()} /></View>;

  const courtOptions = [...(courtName && !courts.data?.some(item => item.name === courtName) ? [{ value: courtName, label: courtName }] : []),
    ...(courts.data ?? []).map(item => ({ value: item.name, label: item.name }))];

  return (
    <>
      <Stack.Screen options={{ title: id ? 'แก้ไขนัดหมาย' : 'เพิ่มนัดหมาย' }} />
      <View style={styles.screen}>
        <FormPage>
          <FormSection title="รายละเอียดนัดหมาย">
          {id ? <View style={{ gap: spacing.xs }}>
            <FieldLabel>คดี</FieldLabel>
            <Text style={{ color: colors.text }}>{caseRef?.label}</Text>
          </View> : <CasePicker label="คดี" required error={shown('case')} value={caseRef} onChange={setCaseRef} disabled={busy} />}

          <TextField label="ชื่อนัดหมาย" required error={shown('title')} placeholder="เช่น นัดสืบพยานโจทก์"
            value={title} onChange={setTitle} disabled={busy} />

          <Dropdown inline label="ประเภท" fieldLabel="ประเภท" value={type} options={EVENT_TYPES} onChange={setType} disabled={busy} />

          {type === 'COURT_DATE' ? (
            <>
              <Dropdown label="เลือกศาล" fieldLabel="ศาล" required error={shown('court')} value={courtName} onChange={setCourtName}
                placeholder={courts.isLoading ? 'กำลังโหลดรายชื่อศาล…' : 'เลือกศาล'} disabled={busy || courts.isLoading}
                options={courtOptions} />
              {courts.isError && <InlineError message="โหลดรายชื่อศาลไม่สำเร็จ" onRetry={() => courts.refetch()} />}
              <Dropdown label="ชนิดนัดศาล" fieldLabel="ชนิดนัด · ถ้ามี" value={courtEventKind} onChange={value => setCourtEventKind(value as CourtEventKind | '')} disabled={busy}
                options={[{ value: '', label: 'ไม่ระบุ' }, ...Object.values(CourtEventKind).map(kind => ({ value: kind, label: COURT_EVENT_KIND_LABELS[kind] }))]} />
            </>
          ) : null}
          </FormSection>
          <FormSection title="วันและเวลา">
          <DatePicker label="วันที่" required value={day} onChange={setDay} disabled={busy} />

          <FieldLabel required>เวลา</FieldLabel>
          <View accessibilityRole="radiogroup" accessibilityLabel={fieldA11yLabel('เวลา', true)} style={styles.chips}>
            {TIME_PRESETS.map((preset) => {
              const on = !customTime && time === preset;
              return <Pressable key={preset} accessibilityRole="radio" accessibilityLabel={`เวลา ${preset}`} accessibilityState={{ checked: on, disabled: busy }}
                disabled={busy} onPress={() => { setCustomTime(false); setTime(preset); }}
                style={({ pressed }) => [styles.chip, on && styles.chipOn, pressed && { opacity: 0.7 }]}>
                <Text maxFontSizeMultiplier={CHROME_MAX_SCALE} style={[styles.chipText, on && styles.chipTextOn]}>{preset}</Text>
              </Pressable>;
            })}
            <Pressable accessibilityRole="radio" accessibilityLabel="เวลาอื่น" accessibilityState={{ checked: customTime, disabled: busy }}
              disabled={busy} onPress={() => setCustomTime(true)}
              style={({ pressed }) => [styles.chip, customTime && styles.chipOn, pressed && { opacity: 0.7 }]}>
              <Text maxFontSizeMultiplier={CHROME_MAX_SCALE} style={[styles.chipText, customTime && styles.chipTextOn]}>เวลาอื่น</Text>
            </Pressable>
          </View>
          {customTime ? <TextField label="ระบุเวลา" hint="ชั่วโมง:นาที แบบ 24 ชั่วโมง เช่น 15:30" placeholder="00:00" keyboardType="numbers-and-punctuation"
            maxLength={5} value={time} onChange={setTime} error={shown('time')} disabled={busy} autoFocus />
            : <InlineError message={shown('time')} />}

          {/* Rescheduling: the reason sits with the new date and time it explains. */}
          {moving && <TextField label="เหตุผลการเลื่อนนัด" required error={shown('reason')} value={reason} onChange={setReason} disabled={busy} />}
          </FormSection>
          <FormSection title="ทีมที่ไปด้วย" detail="เลือกคนหลักและผู้ร่วม ตรวจวันลาก่อนยืนยันนัด">
          <TeamFields ids={ids} onChange={setIds} primaryLabel="คนหลัก" secondaryLabel="คนที่ไปด้วย" disabled={busy}
            required error={shown('team')} />
          {leaves.isError && <InlineError message="ยังตรวจสอบวันลาไม่ได้" onRetry={() => leaves.refetch()} />}
          {warnings.length > 0 && <View accessibilityRole="alert" style={styles.leaveBox}>
            <Text style={{ color: colors.warn, fontWeight: '700' }}>มีวันลาตรงกับนัด</Text>
            {warnings.map(line => <Text key={line} style={{ color: colors.warn }}>{line}</Text>)}
            <CheckRow label="ตรวจแล้ว · ยืนยันบันทึกทีมนี้" checked={leaveAck} onChange={setLeaveAck} disabled={busy} />
            <InlineError message={shown('leave')} />
          </View>}
          </FormSection>
          {preview && <Card style={{ marginTop: spacing.md, gap: spacing.xs, borderTopWidth: 3, borderTopColor: colors.ink }}>
            <Text accessibilityRole="header" style={{ ...typeScale.section, color: colors.ink, marginBottom: spacing.xs }}>ตรวจผลกระทบก่อนยืนยันเลื่อนนัด</Text>
            <Text style={{ color: colors.muted }}>เดิม {thDate(preview.oldAt)} {thTime(preview.oldAt)}</Text>
            <Text style={{ color: colors.ink, fontWeight: '700' }}>ใหม่ {thDate(preview.newAt)} {thTime(preview.newAt)}</Text>
            {!preview.impacts.length && <Text style={{ color: colors.muted }}>ไม่มีงานหรือกำหนดที่ผูกกับนัดนี้</Text>}
            {preview.impacts.map(item => <View key={item.id} style={styles.impactRow}>
              <Text style={{ color: colors.text }}>{item.title}</Text>
              <Text style={{ color: colors.muted }}>{thDate(item.oldAt)} → {item.newAt ? thDate(item.newAt) : 'ต้องตรวจเพิ่มเติม'}</Text>
            </View>)}
            <Button title="ยกเลิกการยืนยัน" variant="link" disabled={busy} onPress={() => setPreview(null)} />
          </Card>}
          <View style={{ marginTop: spacing.lg, gap: spacing.sm }}>
            <MissingSummary items={missing} />
            <InlineError message={saveError || undefined} />
            <Button title={preview ? 'ยืนยันเลื่อนนัดและบันทึก' : moving ? 'ตรวจผลกระทบการเลื่อนนัด' : 'บันทึกนัดหมาย'} onPress={() => void submit()} busy={busy} />
          </View>
        </FormPage>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    minHeight: 44,
    justifyContent: 'center',
    borderRadius: radius.button,
    borderWidth: 1,
    borderColor: colors.lineStrong,
    backgroundColor: colors.raised,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  chipOn: { backgroundColor: colors.ink, borderColor: colors.ink, ...shadow.sm },
  chipText: { fontSize: 14, color: colors.ink, fontWeight: '600', fontVariant: ['tabular-nums'] },
  chipTextOn: { color: colors.bg },
  leaveBox: { gap: spacing.xs, padding: spacing.md, borderRadius: radius.md, borderLeftWidth: 3, borderLeftColor: colors.warn, backgroundColor: colors.warnSoft },
  impactRow: { marginTop: spacing.sm, paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.divider },
  statePage: { flex: 1, backgroundColor: colors.bg, padding: spacing.lg },
});

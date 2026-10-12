import React, { useEffect, useRef, useState } from 'react';
import { Alert, TextInput as NativeTextInput } from 'react-native';
import { Text } from '@/components/AppText';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { COURT_LEVEL_LABELS, CourtLevel, PARTICIPANT_SIDE_LABELS, PARTY_ROLE_LABELS, PartyRole, type ParticipantSide, hasFirmCapability } from '@lawfirm/shared';
import { useAuth } from '@/api/auth';
import { ApiError, api } from '@/api/client';
import { useCase, useCourts } from '@/api/hooks';
import type { CaseDetail } from '@/api/types';
import { uploadCaseDocument } from '@/api/files';
import { Attachments, AttachmentFile } from '@/components/Attachments';
import { TeamFields } from '@/components/TeamFields';
import { ClientPicker, PickedClient } from '@/components/ClientPicker';
import { Dropdown } from '@/components/Dropdown';
import { FormPage, FormField, FormSection } from '@/components/Form';
import { Disclosure } from '@/components/Disclosure';
import { Button, Card, ErrorNote, Loading, PageIntro, SectionLabel } from '@/components/ui';
import { colors, formLabelSpacing } from '@/theme';
import { ThaiDateField } from '@/components/ThaiDateField';
import { bangkokDay } from '@/format';
import { limitationBody, THAI_DATE_PARTIAL } from '@/thai-date';

export default function CaseFormScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { user } = useAuth();
  const canReassign = hasFirmCapability(user?.firmRole, 'reassignCaseLead');
  const router = useRouter();
  const client = useQueryClient();
  const current = useCase(id ?? '');
  const courts = useCourts();
  const types = useQuery({ queryKey: ['case-types'], queryFn: () => api<Array<{ id: string; name: string }>>('/case-types?activeOnly=true') });
  const [title, setTitle] = useState('');
  const [pickedClient, setPickedClient] = useState<PickedClient | null>(null);
  const [partyRole, setPartyRole] = useState('');
  const [opponents, setOpponents] = useState<string[]>(['']);
  const [conflict, setConflict] = useState<Array<{ name: string; side?: string; ownRef?: string; caseTitle?: string }> | null>(null);
  const [overrideReason, setOverrideReason] = useState('');
  // A new name deserves a fresh conflict check: drop the old matches and the reason written for them.
  const resetConflict = () => { setConflict(null); setOverrideReason(''); };
  const [description, setDescription] = useState('');
  const [courtName, setCourtName] = useState('');
  const [courtLevel, setCourtLevel] = useState<string>('TRIAL');
  const [caseTypeId, setCaseTypeId] = useState('');
  const [status, setStatus] = useState('OPEN');
  // Bangkok day or null. A half-typed entry never lands here: ThaiDateField keeps it and reports invalid.
  const [limitation, setLimitation] = useState<string | null>(null);
  const [limitationInvalid, setLimitationInvalid] = useState(false);
  const limitationRef = useRef<NativeTextInput>(null);
  const storedLimitation = current.data?.limitationDeadline ? bangkokDay(current.data.limitationDeadline) : null;
  const [ids, setIds] = useState<string[]>(user ? [user.id] : []);
  const [files, setFiles] = useState<AttachmentFile[]>([]);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const seeded = useRef<string | null>(null);
  useEffect(() => {
    if (!current.data || seeded.current === current.data.id) return;
    seeded.current = current.data.id;
    const data = current.data;
    setTitle(data.title);
    setPickedClient(data.client ? { id: data.client.id, name: data.client.name } : null); setPartyRole(data.partyRole ?? '');
    setDescription(data.description ?? ''); setCourtName(data.courtName ?? ''); setCourtLevel(data.courtLevel ?? 'TRIAL');
    setCaseTypeId(data.caseTypeId ?? '');
    setStatus(data.status);
    setLimitation(data.limitationDeadline ? bangkokDay(data.limitationDeadline) : null);
    const lead = data.leadLawyerId ?? data.leadLawyer?.id;
    setIds([...(lead ? [lead] : []), ...(data.assignments ?? []).filter(item => item.assignmentType === 'BUDDY' && item.userId !== lead).map(item => item.userId)]);
  }, [current.data]);
  // The API refuses a court-level change that also edits the court in the same save.
  const levelSwitching = !!id && !!current.data && courtLevel !== (current.data.courtLevel ?? 'TRIAL');
  const save = async () => {
    if (!title.trim() || !ids[0]) return Alert.alert('กรอกไม่ครบ', 'ใส่ชื่อคดีและเลือกคนรับผิดชอบหลัก');
    if (limitationInvalid) {
      // The field's own warning may not show yet (it waits for blur), so say it here.
      Alert.alert('ตรวจวันครบอายุความ', THAI_DATE_PARTIAL);
      limitationRef.current?.focus();
      return;
    }
    setBusy(true); setError('');
    try {
      let target = savedId;
      if (!target) {
        const body = { title: title.trim(),
          // The registered name is only sent for a client the case does not already have; a typed name stays as is.
          ...(pickedClient ? { clientId: pickedClient.id, ...(pickedClient.id !== current.data?.client?.id ? { clientName: pickedClient.name } : {}) } : {}),
          partyRole: partyRole || (id ? null : undefined),
          ...(!id ? { opponents: opponents.map(name => name.trim()).filter(Boolean).map(name => ({ name })) } : {}),
          ...(!id && overrideReason.trim() ? { conflictOverrideReason: overrideReason.trim() } : {}),
          description: description.trim(), ...(levelSwitching ? {} : { courtName: courtName || undefined }), courtLevel, caseTypeId: caseTypeId || undefined,
          ...limitationBody(!!id, limitation, storedLimitation),
          ...(id && status !== current.data?.status ? { status } : {}) };
        const saved = await api<CaseDetail>(id ? `/cases/${id}` : '/cases', { method: id ? 'PATCH' : 'POST',
          body: { ...body, ...(!id || canReassign ? { leadLawyerId: ids[0] } : {}), ...(!id ? { buddyIds: ids.slice(1) } : {}) } });
        target = saved.id; setSavedId(target);
      }
      if (id && canReassign) await api(`/cases/${target}/assignments`, { method: 'PUT', body: { buddyIds: ids.slice(1) } });
      for (const file of files) {
        await uploadCaseDocument(target, file.uri, file.name, file.mimeType);
        setFiles(previous => previous.filter(item => item.uri !== file.uri));
      }
      await client.invalidateQueries({ queryKey: ['cases'] });
      await client.invalidateQueries({ queryKey: ['case', target] });
      await client.invalidateQueries({ queryKey: ['case-documents', target] });
      await client.invalidateQueries({ queryKey: ['workload'] });
      router.replace(`/case/${target}`);
    } catch (e) {
      const conflictBody = e instanceof ApiError && e.status === 409 ? (e.body as { code?: string; matches?: typeof conflict }) : null;
      if (conflictBody?.code === 'CONFLICT_FOUND') { setConflict(conflictBody.matches ?? []); return; }
      setError(e instanceof Error ? e.message : 'บันทึกไม่สำเร็จ');
    } finally { setBusy(false); }
  };
  if (id && current.isLoading) return <Loading />;
  if (id && (!current.data || current.isError)) return <ErrorNote message="โหลดคดีไม่สำเร็จ" onRetry={() => current.refetch()} />;
  return <FormPage>
    <Stack.Screen options={{ title: id ? 'แก้ไขคดี' : 'รับเคสใหม่' }} />
    <PageIntro title={id ? 'รายละเอียดคดี' : 'เริ่มแฟ้มคดีใหม่'} detail="กรอกชื่อคดีและเลือกคนหลักก่อน ข้อมูลศาลและไฟล์เติมเพิ่มได้" />
    <FormSection title="ข้อมูลคดี">
    <FormField label="ชื่อคดี" value={title} onChange={setTitle} disabled={busy || !!savedId} />
    <SectionLabel style={formLabelSpacing}>ลูกความ</SectionLabel>
    <ClientPicker value={pickedClient} onChange={client => { setPickedClient(client); resetConflict(); }} disabled={busy || !!savedId}
      allowClear={!(id && current.data?.client)} />
    <Dropdown label="เราเป็น" value={partyRole} onChange={setPartyRole} disabled={busy || !!savedId}
      options={[{ value: '', label: 'ยังไม่ระบุ' }, ...Object.values(PartyRole).map(role => ({ value: role, label: PARTY_ROLE_LABELS[role] }))]} />
    {!id && <>
      <SectionLabel style={formLabelSpacing}>คู่ความฝ่ายตรงข้าม</SectionLabel>
      {opponents.map((name, index) => <FormField key={index} label={`รายที่ ${index + 1}`} value={name} disabled={busy || !!savedId}
        onChange={next => { setOpponents(rows => rows.map((row, i) => i === index ? next : row)); resetConflict(); }} placeholder="ชื่อบุคคลหรือบริษัท" />)}
      <Button title="เพิ่มคู่ความ" ghost disabled={busy || !!savedId} onPress={() => setOpponents(rows => [...rows, ''])} />
    </>}
    {id && <Dropdown label="สถานะคดี" value={status} onChange={setStatus}
      disabled={busy || !!savedId || ['CLOSED', 'ARCHIVED'].includes(current.data?.status ?? '')}
      options={[{ value: 'OPEN', label: 'เปิดคดี' }, { value: 'DRAFTING', label: 'ร่างเอกสาร' },
        { value: 'COURT_DATE', label: 'รอนัดศาล' }, { value: 'IN_PROGRESS', label: 'กำลังดำเนินการ' },
        { value: 'PENDING', label: 'รอดำเนินการ' }]} />}
    <SectionLabel style={formLabelSpacing}>ประเภทคดี</SectionLabel>
    <Dropdown label="เลือกประเภทคดี" value={caseTypeId} onChange={setCaseTypeId} disabled={busy || !!savedId}
      options={[{ value: '', label: 'ยังไม่ระบุ' }, ...(types.data ?? []).map(item => ({ value: item.id, label: item.name }))]} />
    {types.isError && <ErrorNote message="โหลดประเภทคดีไม่ได้" onRetry={() => types.refetch()} />}
    <ThaiDateField ref={limitationRef} label="วันครบอายุความ" value={limitation} onChange={setLimitation}
      onInvalidChange={setLimitationInvalid} clearable hint="ว่างได้ ถ้ายังไม่ทราบ" disabled={busy || !!savedId}
      clearConfirm={storedLimitation ? { title: 'ลบวันครบอายุความ?', body: 'คดีนี้จะไม่มีการเตือนอายุความอีก' } : undefined} />
    {!!storedLimitation && limitation === null && <>
      <Text style={{ color: colors.warn }}>จะลบเมื่อกดบันทึก</Text>
      <Button title="คืนค่าเดิม" ghost disabled={busy || !!savedId} onPress={() => setLimitation(storedLimitation)} />
    </>}
    </FormSection>
    <FormSection title="ผู้รับผิดชอบ" detail="คนหลักดูแลคดี คนรองร่วมทำงานในแฟ้มนี้">
    <TeamFields ids={ids} onChange={setIds} primaryLabel="คนหลัก" secondaryLabel="คนรอง"
      max={999} disabled={busy || !!savedId || (!!id && !canReassign)} />
    </FormSection>
    <Disclosure title="ศาลและรายละเอียดเพิ่มเติม" summary="เลือกศาล ชั้นศาล และบันทึกรายละเอียด">
    <SectionLabel style={formLabelSpacing}>ศาล</SectionLabel>
    <Dropdown label="เลือกศาล" value={courtName} onChange={setCourtName} disabled={busy || !!savedId || levelSwitching}
      options={[{ value: '', label: 'ยังไม่ระบุศาล' },
        ...(courtName && !courts.data?.some(item => item.name === courtName) ? [{ value: courtName, label: courtName }] : []),
        ...(courts.data ?? []).map(item => ({ value: item.name, label: item.name }))]} />
    {levelSwitching && <Text style={{ color: colors.info }}>เปลี่ยนระดับศาลแล้วบันทึกก่อน แล้วจึงแก้เลขคดีของศาลชั้นนั้น</Text>}
    {courts.isError && <ErrorNote message="โหลดรายชื่อศาลไม่ได้" onRetry={() => courts.refetch()} />}
    <Dropdown label="ชั้นศาล" value={courtLevel} onChange={setCourtLevel} disabled={busy || !!savedId}
      options={Object.entries(COURT_LEVEL_LABELS).map(([value, label]) => ({ value: value as CourtLevel, label }))} />
    <FormField label="รายละเอียด · เติมทีหลังได้" value={description} onChange={setDescription} multiline disabled={busy || !!savedId} />
    </Disclosure>
    <FormSection title="ไฟล์คดี" detail="แนบตอนนี้หรือเพิ่มหลังบันทึกคดีก็ได้">
    <Attachments files={files} onChange={setFiles} disabled={busy} />
    </FormSection>
    {!!savedId && <Text style={{ color: colors.info }}>คดีบันทึกแล้ว · ส่งไฟล์ที่เหลือต่อได้โดยไม่สร้างคดีซ้ำ</Text>}
    {!!error && <Text style={{ color: colors.warn }}>{error}</Text>}
    {conflict && <Card>
      <Text style={{ color: colors.warn, fontWeight: '700' }}>พบชื่อที่อาจขัดกัน</Text>
      {conflict.map((m, i) => <Text key={i} style={{ marginTop: 4 }}>{m.name}{m.side ? ` — ${PARTICIPANT_SIDE_LABELS[m.side as ParticipantSide] ?? m.side}` : ''}{m.ownRef ? ` ในคดี ${m.ownRef}` : ''}</Text>)}
      <FormField label="เหตุผลที่เปิดต่อ (อย่างน้อย 10 ตัวอักษร)" value={overrideReason} onChange={setOverrideReason} multiline disabled={busy} />
    </Card>}
    <Button title={savedId ? 'ส่งไฟล์ที่เหลือ / เปิดคดี' : id ? 'บันทึกคดี' : 'บันทึกเคส'} busy={busy}
      disabled={!!conflict && overrideReason.trim().length < 10} onPress={save} />
  </FormPage>;
}

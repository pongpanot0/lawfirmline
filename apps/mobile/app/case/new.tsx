import React, { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { X } from 'lucide-react-native';
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
import { SelectField, TextArea, TextField } from '@/components/Input';
import { FormPage, FormSection, MissingSummary } from '@/components/Form';
import { Disclosure } from '@/components/Disclosure';
import { Button, Card, ErrorState, InlineError, LoadingState, PageIntro } from '@/components/ui';
import { colors, spacing, TOUCH, typeScale } from '@/theme';

const styles = StyleSheet.create({
  remove: { width: TOUCH, height: 48, alignItems: 'center', justifyContent: 'center' },
  conflict: { gap: spacing.sm, borderTopWidth: 3, borderTopColor: colors.warn },
  conflictTitle: { ...typeScale.section, color: colors.warn },
  conflictRow: { paddingVertical: spacing.sm, borderTopWidth: 1, borderTopColor: colors.divider, color: colors.text },
  saved: { color: colors.info, fontWeight: '600' },
});

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
  const [ids, setIds] = useState<string[]>(user ? [user.id] : []);
  const [files, setFiles] = useState<AttachmentFile[]>([]);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  // Inline validation only appears after the first save attempt, then updates live as fields are filled.
  const [triedSave, setTriedSave] = useState(false);
  const seeded = useRef<string | null>(null);
  // The signed-in user may arrive after the first render; seed them as the default primary for a new case.
  useEffect(() => { if (!id && user && !ids.filter(Boolean).length) setIds([user.id]); }, [id, user?.id]);
  useEffect(() => {
    if (!current.data || seeded.current === current.data.id) return;
    seeded.current = current.data.id;
    const data = current.data;
    setTitle(data.title);
    setPickedClient(data.client ? { id: data.client.id, name: data.client.name } : null); setPartyRole(data.partyRole ?? '');
    setDescription(data.description ?? ''); setCourtName(data.courtName ?? ''); setCourtLevel(data.courtLevel ?? 'TRIAL');
    setCaseTypeId(data.caseTypeId ?? '');
    setStatus(data.status);
    const lead = data.leadLawyerId ?? data.leadLawyer?.id;
    setIds([...(lead ? [lead] : []), ...(data.assignments ?? []).filter(item => item.assignmentType === 'BUDDY' && item.userId !== lead).map(item => item.userId)]);
  }, [current.data]);
  // The API refuses a court-level change that also edits the court in the same save.
  const levelSwitching = !!id && !!current.data && courtLevel !== (current.data.courtLevel ?? 'TRIAL');
  const titleMissing = !title.trim();
  // A blank slot never counts as the primary; the first chosen person is.
  const team = ids.filter(Boolean);
  const primaryMissing = !team[0];
  const missing = [...(titleMissing ? ['ชื่อคดี'] : []), ...(primaryMissing ? ['คนรับผิดชอบหลัก'] : [])];
  const partySummary = [
    partyRole ? `เราเป็น${PARTY_ROLE_LABELS[partyRole as PartyRole] ?? ''}` : null,
    opponents.some(name => name.trim()) ? `คู่ความ ${opponents.filter(name => name.trim()).length} ราย` : null,
  ].filter(Boolean).join(' · ');
  const courtSummary = [
    caseTypeId ? types.data?.find(item => item.id === caseTypeId)?.name ?? 'ระบุประเภทแล้ว' : null,
    courtName || null,
    courtName || courtLevel !== 'TRIAL' ? COURT_LEVEL_LABELS[courtLevel as CourtLevel] : null,
  ].filter(Boolean).join(' · ');
  const detailSummary = [
    description.trim() ? 'มีรายละเอียด' : null,
    files.length ? `ไฟล์ ${files.length} ไฟล์` : null,
  ].filter(Boolean).join(' · ');
  const save = async () => {
    if (titleMissing || primaryMissing) { setTriedSave(true); return; }
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
          ...(id && status !== current.data?.status ? { status } : {}) };
        const saved = await api<CaseDetail>(id ? `/cases/${id}` : '/cases', { method: id ? 'PATCH' : 'POST',
          body: { ...body, ...(!id || canReassign ? { leadLawyerId: team[0] } : {}), ...(!id ? { buddyIds: team.slice(1) } : {}) } });
        target = saved.id; setSavedId(target);
      }
      if (id && canReassign) await api(`/cases/${target}/assignments`, { method: 'PUT', body: { buddyIds: team.slice(1) } });
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
  if (id && current.isLoading) return <View style={{ flex: 1, backgroundColor: colors.bg }}><LoadingState label="กำลังโหลดคดี…" /></View>;
  if (id && (!current.data || current.isError)) return <FormPage><ErrorState message="โหลดคดีไม่สำเร็จ" onRetry={() => current.refetch()} /></FormPage>;
  const locked = busy || !!savedId;
  const closedCase = ['CLOSED', 'ARCHIVED'].includes(current.data?.status ?? '');
  const reasonShortBy = Math.max(0, 10 - overrideReason.trim().length);
  const lastOpponentEmpty = !opponents[opponents.length - 1]?.trim();
  const removeOpponent = (index: number) => {
    setOpponents(rows => rows.length > 1 ? rows.filter((_, i) => i !== index) : ['']);
    resetConflict();
  };
  return <FormPage>
    <Stack.Screen options={{ title: id ? 'แก้ไขคดี' : 'รับเคสใหม่' }} />
    <PageIntro detailOnly title={id ? 'แก้ไขคดี' : 'รับเคสใหม่'} detail="กรอกช่องที่มี * ก็บันทึกได้ ข้อมูลอื่นเติมทีหลังได้" />
    <FormSection title="ข้อมูลหลัก">
    <TextField label="ชื่อคดี" required value={title} onChange={setTitle} disabled={locked}
      error={triedSave && titleMissing ? 'ใส่ชื่อคดี' : undefined} />
    <TeamFields ids={ids} onChange={setIds} primaryLabel="คนรับผิดชอบหลัก" secondaryLabel="คนรอง" required collapseSecondary={!id}
      error={triedSave && primaryMissing ? 'เลือกคนรับผิดชอบหลัก 1 คน' : undefined}
      max={999} disabled={locked || (!!id && !canReassign)} />
    <ClientPicker label="ลูกความ" value={pickedClient} onChange={client => { setPickedClient(client); resetConflict(); }} disabled={locked}
      allowClear={!(id && current.data?.client)} />
    {id && <SelectField label="สถานะคดี" value={status} onChange={setStatus}
      hint={closedCase ? 'คดีปิดแล้ว · เปิดคดีอีกครั้งจากหน้าคดี' : undefined}
      disabled={locked || closedCase}
      options={[{ value: 'OPEN', label: 'เปิดคดี' }, { value: 'DRAFTING', label: 'ร่างเอกสาร' },
        { value: 'COURT_DATE', label: 'รอนัดศาล' }, { value: 'IN_PROGRESS', label: 'กำลังดำเนินการ' },
        { value: 'PENDING', label: 'รอดำเนินการ' }]} />}
    </FormSection>
    <Disclosure title="คู่ความ · ถ้ามี" summary={partySummary || 'ฝ่ายของเรา และคู่ความฝ่ายตรงข้าม'}>
      <SelectField label="เราเป็นฝ่าย" value={partyRole} onChange={setPartyRole} disabled={locked}
        options={[{ value: '', label: 'ยังไม่ระบุ' }, ...Object.values(PartyRole).map(role => ({ value: role, label: PARTY_ROLE_LABELS[role] }))]} />
      {!id && <View style={{ gap: spacing.sm, marginTop: spacing.sm }}>
        {opponents.map((name, index) => <View key={index} style={{ flexDirection: 'row', alignItems: 'flex-end', gap: spacing.xs }}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <TextField label={`คู่ความฝ่ายตรงข้าม รายที่ ${index + 1}`} value={name} disabled={locked}
              onChange={next => { setOpponents(rows => rows.map((row, i) => i === index ? next : row)); resetConflict(); }} placeholder="ชื่อบุคคลหรือบริษัท" />
          </View>
          {(opponents.length > 1 || !!name.trim()) && <Pressable accessibilityRole="button" accessibilityLabel={`ลบคู่ความรายที่ ${index + 1}`} disabled={locked}
            onPress={() => removeOpponent(index)} style={({ pressed }) => [styles.remove, pressed && { opacity: 0.6 }]}>
            <X size={20} color={colors.muted} />
          </Pressable>}
        </View>)}
        <Button title="+ เพิ่มคู่ความอีกราย" variant="link" disabled={locked || lastOpponentEmpty} onPress={() => setOpponents(rows => [...rows, ''])}
          accessibilityHint={lastOpponentEmpty ? 'กรอกชื่อคู่ความรายล่าสุดก่อน' : undefined} />
      </View>}
    </Disclosure>
    <Disclosure title="ศาลและประเภทคดี · ถ้ามี" summary={courtSummary || 'ประเภทคดี ศาล และชั้นศาล'}>
      <SelectField label="ประเภทคดี" value={caseTypeId} onChange={setCaseTypeId} disabled={locked || types.isLoading}
        placeholder={types.isLoading ? 'กำลังโหลด…' : undefined}
        options={[{ value: '', label: 'ยังไม่ระบุ' }, ...(types.data ?? []).map(item => ({ value: item.id, label: item.name }))]} />
      {types.isError && <InlineError message="โหลดประเภทคดีไม่ได้" onRetry={() => types.refetch()} />}
      <SelectField label="ศาล" value={courtName} onChange={setCourtName} disabled={locked || levelSwitching || courts.isLoading}
        placeholder={courts.isLoading ? 'กำลังโหลด…' : undefined}
        hint={levelSwitching ? 'เปลี่ยนชั้นศาลแล้วบันทึกก่อน แล้วจึงแก้ศาลและเลขคดีของศาลชั้นนั้น' : undefined}
        options={[{ value: '', label: 'ยังไม่ระบุศาล' },
          ...(courtName && !courts.data?.some(item => item.name === courtName) ? [{ value: courtName, label: courtName }] : []),
          ...(courts.data ?? []).map(item => ({ value: item.name, label: item.name }))]} />
      {courts.isError && <InlineError message="โหลดรายชื่อศาลไม่ได้" onRetry={() => courts.refetch()} />}
      <SelectField label="ชั้นศาล" value={courtLevel} onChange={setCourtLevel} disabled={locked}
        options={Object.entries(COURT_LEVEL_LABELS).map(([value, label]) => ({ value: value as CourtLevel, label }))} />
    </Disclosure>
    <Disclosure title="รายละเอียดและไฟล์ · ถ้ามี" summary={detailSummary || 'รายละเอียดคดี และไฟล์ที่ได้รับ'}>
      <TextArea label="รายละเอียด" hint="เติมทีหลังได้" value={description} onChange={setDescription} disabled={locked} />
      <Attachments files={files} onChange={setFiles} disabled={busy} />
    </Disclosure>
    {!!savedId && <Text style={styles.saved}>คดีบันทึกแล้ว · ส่งไฟล์ที่เหลือต่อได้โดยไม่สร้างคดีซ้ำ</Text>}
    <InlineError message={error || undefined} />
    {conflict && <Card style={styles.conflict}>
      <Text accessibilityRole="alert" style={styles.conflictTitle}>พบชื่อที่อาจขัดกัน</Text>
      <View>
        {conflict.map((m, i) => <Text key={i} style={styles.conflictRow}>{m.name}{m.side ? ` — ${PARTICIPANT_SIDE_LABELS[m.side as ParticipantSide] ?? m.side}` : ''}{m.ownRef ? ` ในคดี ${m.ownRef}` : ''}</Text>)}
      </View>
      <TextArea label="เหตุผลที่เปิดต่อ" required value={overrideReason} onChange={setOverrideReason} disabled={busy}
        hint={reasonShortBy ? `อย่างน้อย 10 ตัวอักษร · อีก ${reasonShortBy} ตัวอักษร` : 'ครบแล้ว · บันทึกต่อได้'} />
    </Card>}
    {triedSave && !savedId && <MissingSummary items={missing} />}
    <Button title={savedId ? 'ส่งไฟล์ที่เหลือ / เปิดคดี' : id ? 'บันทึกคดี' : 'บันทึกเคส'} busy={busy}
      disabled={!!conflict && reasonShortBy > 0} onPress={save} />
  </FormPage>;
}

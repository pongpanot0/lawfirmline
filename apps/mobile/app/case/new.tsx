import React, { useEffect, useRef, useState } from 'react';
import { Alert } from 'react-native';
import { Text } from '@/components/AppText';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { COURT_LEVEL_LABELS, CourtLevel } from '@lawfirm/shared';
import { useAuth } from '@/api/auth';
import { api } from '@/api/client';
import { useCase, useCourts } from '@/api/hooks';
import type { CaseDetail } from '@/api/types';
import { uploadCaseDocument } from '@/api/files';
import { Attachments, AttachmentFile } from '@/components/Attachments';
import { TeamFields } from '@/components/TeamFields';
import { Dropdown } from '@/components/Dropdown';
import { FormPage, FormField, FormSection } from '@/components/Form';
import { Disclosure } from '@/components/Disclosure';
import { Button, ErrorNote, Loading, PageIntro, SectionLabel } from '@/components/ui';
import { colors, formLabelSpacing } from '@/theme';

export default function CaseFormScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { user } = useAuth();
  const router = useRouter();
  const client = useQueryClient();
  const current = useCase(id ?? '');
  const courts = useCourts();
  const types = useQuery({ queryKey: ['case-types'], queryFn: () => api<Array<{ id: string; name: string }>>('/case-types?activeOnly=true') });
  const [title, setTitle] = useState('');
  const [clientName, setClientName] = useState('');
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
  const seeded = useRef<string | null>(null);
  useEffect(() => {
    if (!current.data || seeded.current === current.data.id) return;
    seeded.current = current.data.id;
    const data = current.data;
    setTitle(data.title); setClientName(data.clientName ?? data.client?.name ?? '');
    setDescription(data.description ?? ''); setCourtName(data.courtName ?? ''); setCourtLevel(data.courtLevel);
    setCaseTypeId(data.caseTypeId ?? '');
    setStatus(data.status);
    const lead = data.leadLawyerId ?? data.leadLawyer?.id;
    setIds([...(lead ? [lead] : []), ...(data.assignments ?? []).filter(item => item.assignmentType === 'BUDDY' && item.userId !== lead).map(item => item.userId)]);
  }, [current.data]);
  const save = async () => {
    if (!title.trim() || !ids[0]) return Alert.alert('กรอกไม่ครบ', 'ใส่ชื่อคดีและเลือกคนรับผิดชอบหลัก');
    setBusy(true); setError('');
    try {
      let target = savedId;
      if (!target) {
        const body = { title: title.trim(), clientName: clientName.trim() || undefined,
          description: description.trim(), courtName: courtName || undefined, courtLevel, caseTypeId: caseTypeId || undefined,
          ...(id && status !== current.data?.status ? { status } : {}) };
        const saved = await api<CaseDetail>(id ? `/cases/${id}` : '/cases', { method: id ? 'PATCH' : 'POST',
          body: { ...body, ...(!id || user?.firmRole === 'OWNER' ? { leadLawyerId: ids[0] } : {}), ...(!id ? { buddyIds: ids.slice(1) } : {}) } });
        target = saved.id; setSavedId(target);
      }
      if (id && user?.firmRole === 'OWNER') await api(`/cases/${target}/assignments`, { method: 'PUT', body: { buddyIds: ids.slice(1) } });
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
    <FormField label="ชื่อลูกความ" value={clientName} onChange={setClientName} disabled={busy || !!savedId} />
    {id && <Dropdown label="สถานะคดี" value={status} onChange={setStatus}
      disabled={busy || !!savedId || ['CLOSED', 'ARCHIVED'].includes(current.data?.status ?? '')}
      options={[{ value: 'OPEN', label: 'เปิดคดี' }, { value: 'DRAFTING', label: 'ร่างเอกสาร' },
        { value: 'COURT_DATE', label: 'รอนัดศาล' }, { value: 'IN_PROGRESS', label: 'กำลังดำเนินการ' },
        { value: 'PENDING', label: 'รอดำเนินการ' },
        ...(['CLOSED', 'ARCHIVED'].includes(status) ? [{ value: status, label: status === 'CLOSED' ? 'ปิดคดีแล้ว' : 'เก็บเข้าคลังแล้ว' }] : [])]} />}
    <SectionLabel style={formLabelSpacing}>ประเภทคดี</SectionLabel>
    <Dropdown label="เลือกประเภทคดี" value={caseTypeId} onChange={setCaseTypeId} disabled={busy || !!savedId}
      options={[{ value: '', label: 'ยังไม่ระบุ' }, ...(types.data ?? []).map(item => ({ value: item.id, label: item.name }))]} />
    {types.isError && <ErrorNote message="โหลดประเภทคดีไม่ได้" onRetry={() => types.refetch()} />}
    </FormSection>
    <FormSection title="ผู้รับผิดชอบ" detail="คนหลักดูแลคดี คนรองร่วมทำงานในแฟ้มนี้">
    <TeamFields ids={ids} onChange={setIds} primaryLabel="คนหลัก" secondaryLabel="คนรอง"
      max={999} disabled={busy || !!savedId || (!!id && user?.firmRole !== 'OWNER')} />
    </FormSection>
    <Disclosure title="ศาลและรายละเอียดเพิ่มเติม" summary="เลือกศาล ชั้นศาล และบันทึกรายละเอียด">
    <SectionLabel style={formLabelSpacing}>ศาล</SectionLabel>
    <Dropdown label="เลือกศาล" value={courtName} onChange={setCourtName} disabled={busy || !!savedId}
      options={[{ value: '', label: 'ยังไม่ระบุศาล' },
        ...(courtName && !courts.data?.some(item => item.name === courtName) ? [{ value: courtName, label: courtName }] : []),
        ...(courts.data ?? []).map(item => ({ value: item.name, label: item.name }))]} />
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
    <Button title={savedId ? 'ส่งไฟล์ที่เหลือ / เปิดคดี' : id ? 'บันทึกคดี' : 'บันทึกเคส'} busy={busy} onPress={save} />
  </FormPage>;
}

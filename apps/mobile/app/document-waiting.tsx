import React, { useState } from 'react';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api/client';
import { useAuth } from '@/api/auth';
import { taskDraftScope } from '@/api/drafts';
import { useTaskDraft } from '@/hooks/useTaskDraft';
import { Text } from '@/components/AppText';
import { CasePicker, CaseRef } from '@/components/CasePicker';
import { FormField, FormPage } from '@/components/Form';
import { DatePicker } from '@/components/DatePicker';
import { Button, Card, EmptyNote, ErrorNote, Loading, SectionLabel, Tag } from '@/components/ui';
import { bangkokDay } from '@/format';
import { colors, spacing } from '@/theme';

type Request = { id: string; name: string; status: string; requestedFrom: string | null; note: string | null;
  dueDate: string | null; receivedAt: string | null; case: { id: string; ownRef: string; title: string } };

export default function DocumentWaiting() {
  const { caseId } = useLocalSearchParams<{ caseId?: string }>();
  const { user } = useAuth();
  const router = useRouter();
  const client = useQueryClient();
  const query = useQuery({ queryKey: ['document-requests', caseId ?? 'all'],
    queryFn: () => api<Request[]>(caseId ? `/cases/${caseId}/document-requests` : '/document-requests') });
  const [showClosed, setShowClosed] = useState(false);
  const [adding, setAdding] = useState(false);
  const [editId, setEditId] = useState('');
  const [selectedCase, setSelectedCase] = useState<CaseRef | null>(caseId ? { id: caseId, label: 'คดีที่เปิดอยู่' } : null);
  const [name, setName] = useState('');
  const [requestedFrom, setRequestedFrom] = useState('');
  const [note, setNote] = useState('');
  const [date, setDate] = useState(bangkokDay(new Date().toISOString()));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [files] = useState<never[]>([]);
  const value = { files, editId, selectedCase, name, requestedFrom, note, date };
  const draft = useTaskDraft(user ? `${taskDraftScope(user)}document-waiting:${caseId ?? 'all'}` : null, value, saved => {
    for (const [v, set] of [[saved.editId, setEditId], [saved.name, setName], [saved.requestedFrom, setRequestedFrom], [saved.note, setNote], [saved.date, setDate]] as const) if (typeof v === 'string') set(v);
    if (saved.selectedCase && typeof saved.selectedCase.id === 'string') setSelectedCase(saved.selectedCase);
    setAdding(true);
  }, !!(name.trim() || requestedFrom.trim() || note.trim()), { name: name || 'รายการรอเอกสาร', route: `/document-waiting${caseId ? `?caseId=${caseId}` : ''}` });
  const perform = async (action: () => Promise<unknown>) => {
    setBusy(true); setError('');
    try { await action(); await client.invalidateQueries({ queryKey: ['document-requests'] }); }
    catch (e) { setError(e instanceof Error ? e.message : 'บันทึกไม่ได้ ข้อมูลที่กรอกยังอยู่'); }
    finally { setBusy(false); }
  };
  const waiting = (query.data ?? []).filter(row => row.status !== 'RECEIVED' && row.status !== 'NOT_APPLICABLE');
  const rows = showClosed ? query.data ?? [] : waiting;
  if (!draft.ready) return draft.error ? <ErrorNote message={draft.error} onRetry={draft.retry} /> : <Loading />;
  return <FormPage>
    <Stack.Screen options={{ title: 'รอเอกสารจากภายนอก' }} />
    <Text style={{ color: colors.ink, fontWeight: '700' }}>ยังรอ {waiting.length} รายการ</Text>
    <Button title={showClosed ? 'แสดงเฉพาะที่ยังรอ' : 'ดูทั้งหมดรวมที่ได้รับแล้ว'} ghost onPress={() => setShowClosed(!showClosed)} />
    <Button title={adding ? 'ย่อแบบฟอร์ม · ร่างยังอยู่' : 'เพิ่มรายการเอกสารที่รอ'} ghost disabled={busy} onPress={() => { draft.resume(); setAdding(!adding); }} />
    {adding && <Card style={{ gap: spacing.md }}>
      {!caseId && (busy || !!editId ? <Text>{selectedCase?.label}</Text> : <CasePicker value={selectedCase} onChange={setSelectedCase} />)}
      <FormField label="เอกสารที่รอ" value={name} onChange={setName} disabled={busy} />
      <FormField label="รอจากใคร · ชื่อคนหรือหน่วยงาน" value={requestedFrom} onChange={setRequestedFrom} disabled={busy} />
      <SectionLabel>วันติดตามครั้งถัดไป</SectionLabel><DatePicker value={date} onChange={setDate} />
      <FormField label="บันทึกการติดตาม · เติมทีหลังได้" value={note} onChange={setNote} multiline disabled={busy} />
      <Button title={editId ? 'บันทึกการติดตาม' : 'เพิ่มรายการรอเอกสาร'} busy={busy} onPress={() => perform(async () => {
        if (!selectedCase || !name.trim() || !requestedFrom.trim()) throw new Error('เลือกคดี ระบุเอกสาร และคนที่รอให้ครบ');
        await draft.persist();
        await api(`/cases/${selectedCase.id}/document-requests${editId ? `/${editId}` : ''}`, { method: editId ? 'PATCH' : 'POST',
          body: { name: name.trim(), requestedFrom: requestedFrom.trim(), note, dueDate: `${date}T23:59:59+07:00` } });
        await draft.clear(); setAdding(false); setEditId(''); setName(''); setRequestedFrom(''); setNote('');
      })} />
    </Card>}
    {!!draft.error && <ErrorNote message={draft.error} onRetry={draft.retry} />}
    {!!error && <ErrorNote message={error} />}
    {query.isLoading && <Loading />}
    {query.isError && <ErrorNote message="โหลดรายการรอเอกสารไม่ได้" onRetry={() => query.refetch()} />}
    {query.data && rows.length === 0 && <EmptyNote>{showClosed ? 'ยังไม่มีรายการ' : 'ไม่มีเอกสารที่ยังรอในคดีที่คุณเข้าถึงได้'}</EmptyNote>}
    {rows.map(row => <Card key={row.id} style={{ gap: spacing.sm }}>
      <Tag tone={row.status === 'RECEIVED' ? 'ok' : row.status === 'NOT_APPLICABLE' ? 'plain' : 'due'}>{row.status === 'RECEIVED' ? 'ได้รับแล้ว' : row.status === 'NOT_APPLICABLE' ? 'ไม่ต้องใช้แล้ว' : 'ยังรอเอกสาร'}</Tag>
      <Text style={{ fontWeight: '700', color: colors.ink }}>{row.name}</Text>
      <Text>รอจาก {row.requestedFrom || 'ยังไม่ระบุ · กดแก้วันติดตามเพื่อเติม'} · {row.case.ownRef}</Text>
      <Text style={{ color: row.dueDate && bangkokDay(row.dueDate) < bangkokDay(new Date().toISOString()) ? colors.warn : colors.faint }}>ติดตาม {row.dueDate ? bangkokDay(row.dueDate) : 'ยังไม่ลงวัน'}</Text>
      {!!row.note && <Text>{row.note}</Text>}
      {!!row.receivedAt && <Text>ได้รับเมื่อ {bangkokDay(row.receivedAt)}</Text>}
      {row.status !== 'RECEIVED' && row.status !== 'NOT_APPLICABLE' ? <>
        <Button title={`ได้รับ ${row.name} แล้ว`} disabled={busy} onPress={() => perform(() => api(`/cases/${row.case.id}/document-requests/${row.id}`, { method: 'PATCH', body: { status: 'RECEIVED' } }))} />
        <Button title="แก้ข้อมูล / วันติดตาม" ghost disabled={busy || adding || !!name.trim()} onPress={() => { draft.resume(); setEditId(row.id); setSelectedCase({ id: row.case.id, label: row.case.ownRef }); setName(row.name); setRequestedFrom(row.requestedFrom ?? ''); setNote(row.note ?? ''); setDate(row.dueDate ? bangkokDay(row.dueDate) : bangkokDay(new Date().toISOString())); setAdding(true); }} />
      </> : <Button title="กลับเป็นรายการที่ยังรอ" ghost disabled={busy} onPress={() => perform(() => api(`/cases/${row.case.id}/document-requests/${row.id}`, { method: 'PATCH', body: { status: 'REQUESTED' } }))} />}
      <Button title="เปิดคดี / แนบเอกสารที่ได้รับ" ghost onPress={() => router.push({ pathname: '/case/[id]', params: { id: row.case.id, section: 'documents' } })} />
    </Card>)}
  </FormPage>;
}

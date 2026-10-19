import React, { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, ChevronRight, FileText } from 'lucide-react-native';
import { api } from '@/api/client';
import { useAuth } from '@/api/auth';
import { taskDraftScope } from '@/api/drafts';
import { useTaskDraft } from '@/hooks/useTaskDraft';
import { Text } from '@/components/AppText';
import { CasePicker, CaseRef } from '@/components/CasePicker';
import { FormPage, FormSection, MissingSummary } from '@/components/Form';
import { DateField, TextArea, TextField } from '@/components/Input';
import { Button, Card, EmptyState, ErrorState, FilterTabs, InlineError, LoadingState, PageIntro, Tag } from '@/components/ui';
import { bangkokDay, thDate } from '@/format';
import { CHROME_MAX_SCALE, colors, radius, spacing, TOUCH } from '@/theme';

type Request = { id: string; name: string; status: string; requestedFrom: string | null; note: string | null;
  dueDate: string | null; receivedAt: string | null; case: { id: string; ownRef: string; title: string } };

const isOpen = (row: Request) => row.status !== 'RECEIVED' && row.status !== 'NOT_APPLICABLE';

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
  const [triedSave, setTriedSave] = useState(false);
  const [blockedNote, setBlockedNote] = useState('');
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
  const waiting = (query.data ?? []).filter(isOpen);
  const rows = showClosed ? query.data ?? [] : waiting;
  if (!draft.ready) return draft.error ? <FormPage><ErrorState message={draft.error} onRetry={draft.retry} /></FormPage>
    : <View style={{ flex: 1, backgroundColor: colors.bg }}><LoadingState label="กำลังเปิดร่าง…" /></View>;

  const problems = {
    case: !selectedCase ? 'เลือกคดี' : '',
    name: !name.trim() ? 'ใส่ชื่อเอกสารที่รอ' : '',
    from: !requestedFrom.trim() ? 'ใส่ชื่อคนหรือหน่วยงานที่รอเอกสาร' : '',
  };
  const missing = [problems.case && 'คดี', problems.name && 'เอกสารที่รอ', problems.from && 'รอจากใคร'].filter(Boolean) as string[];
  const editBlocked = adding || !!name.trim();
  const today = bangkokDay(new Date().toISOString());
  const save = () => {
    setTriedSave(true);
    if (missing.length) return;
    void perform(async () => {
      await draft.persist();
      await api(`/cases/${selectedCase!.id}/document-requests${editId ? `/${editId}` : ''}`, { method: editId ? 'PATCH' : 'POST',
        body: { name: name.trim(), requestedFrom: requestedFrom.trim(), note, dueDate: `${date}T23:59:59+07:00` } });
      await draft.clear(); setAdding(false); setEditId(''); setName(''); setRequestedFrom(''); setNote(''); setTriedSave(false);
    });
  };
  const startEdit = (row: Request) => {
    if (editBlocked) { setBlockedNote('บันทึกหรือล้างรายการที่กรอกค้างก่อน แล้วจึงแก้รายการอื่น'); return; }
    setBlockedNote(''); draft.resume(); setEditId(row.id); setSelectedCase({ id: row.case.id, label: row.case.ownRef }); setName(row.name);
    setRequestedFrom(row.requestedFrom ?? ''); setNote(row.note ?? ''); setDate(row.dueDate ? bangkokDay(row.dueDate) : today); setTriedSave(false); setAdding(true);
  };
  const openCase = (row: Request) => router.push({ pathname: '/case/[id]', params: { id: row.case.id, section: 'documents' } });
  const setStatus = (row: Request, status: 'RECEIVED' | 'REQUESTED') =>
    perform(() => api(`/cases/${row.case.id}/document-requests/${row.id}`, { method: 'PATCH', body: { status } }));

  return <FormPage>
    <Stack.Screen options={{ title: 'รอเอกสารจากภายนอก' }} />
    <PageIntro detailOnly title="รอเอกสารจากภายนอก" detail="เอกสารจากลูกความและหน่วยงานภายนอก · แตะรายการเพื่อแก้วันติดตาม" />
    {adding ? <FormSection title={editId ? 'แก้รายการติดตาม' : 'รายการเอกสารใหม่'}>
      {!caseId && (busy || !!editId ? <Text style={styles.caseLabel}>{selectedCase?.label}</Text>
        : <CasePicker label="คดี" required value={selectedCase} onChange={setSelectedCase} error={triedSave ? problems.case || undefined : undefined} />)}
      <TextField label="เอกสารที่รอ" required value={name} onChange={setName} disabled={busy} error={triedSave ? problems.name || undefined : undefined} />
      <TextField label="รอจากใคร" required hint="ชื่อคนหรือหน่วยงาน" value={requestedFrom} onChange={setRequestedFrom} disabled={busy}
        error={triedSave ? problems.from || undefined : undefined} />
      <DateField label="วันติดตามครั้งถัดไป" value={date} onChange={setDate} />
      <TextArea label="บันทึกการติดตาม · เติมทีหลังได้" value={note} onChange={setNote} disabled={busy} />
      {triedSave && <MissingSummary items={missing} />}
      <Button title={editId ? 'บันทึกการติดตาม' : 'เพิ่มรายการรอเอกสาร'} busy={busy} onPress={save} />
      <Button title="ย่อแบบฟอร์ม · ร่างยังอยู่" variant="link" disabled={busy} onPress={() => setAdding(false)} />
    </FormSection>
      : <Button title="เพิ่มรายการเอกสารที่รอ" disabled={busy} onPress={() => { draft.resume(); setBlockedNote(''); setAdding(true); }} />}
    {!!draft.error && <InlineError message={draft.error} onRetry={draft.retry} />}
    <InlineError message={error || undefined} />
    <InlineError message={blockedNote || undefined} />
    <FilterTabs value={showClosed ? 'all' : 'open'} onChange={v => setShowClosed(v === 'all')}
      items={[{ value: 'open', label: query.data ? `ยังรอ ${waiting.length}` : 'ยังรอ' }, { value: 'all', label: 'ทั้งหมด' }]} />
    {query.isLoading && <LoadingState label="กำลังโหลดรายการ…" />}
    {query.isError && <ErrorState message="โหลดรายการรอเอกสารไม่ได้" onRetry={() => query.refetch()} />}
    {query.data && !query.isError && rows.length === 0 && <EmptyState compact>{showClosed ? 'ยังไม่มีรายการ'
      : caseId ? 'คดีนี้ไม่มีเอกสารที่ยังรอ' : 'ไม่มีเอกสารที่ยังรอในคดีที่คุณเข้าถึงได้'}</EmptyState>}
    {rows.length > 0 && <Card style={{ paddingVertical: 0 }}>
      {rows.map((row, index) => {
        const open = isOpen(row);
        const overdue = open && !!row.dueDate && bangkokDay(row.dueDate) < today;
        const tint = overdue ? colors.warnSoft : open ? colors.infoSoft : row.status === 'RECEIVED' ? colors.goodSoft : colors.soft;
        const ink = overdue ? colors.warn : open ? colors.info : row.status === 'RECEIVED' ? colors.good : colors.muted;
        return <View key={row.id} style={[styles.row, index > 0 && styles.rowLine]}>
          <Pressable accessibilityRole="button" accessibilityLabel={`${row.name} · ${row.case.ownRef}`}
            accessibilityHint={open ? 'แก้ข้อมูลและวันติดตาม' : 'เปิดเอกสารในคดี'}
            onPress={() => (open ? startEdit(row) : openCase(row))} disabled={busy}
            style={({ pressed }) => [styles.body, pressed && { opacity: 0.6 }]}>
            <View style={[styles.tile, { backgroundColor: tint }]}><FileText size={18} color={ink} /></View>
            <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
              <Text style={styles.name}>{row.name}</Text>
              <Text style={styles.meta}>รอจาก {row.requestedFrom || '— ยังไม่ระบุ'} · {row.case.ownRef}</Text>
              {open
                ? <Text style={[styles.meta, overdue && { color: colors.warn }]}>{row.dueDate ? `ติดตาม ${thDate(row.dueDate)}${overdue ? ' · เลยกำหนด' : ''}` : 'ยังไม่ลงวันติดตาม'}</Text>
                : <View style={{ alignSelf: 'flex-start', marginTop: 2 }}>
                    <Tag tone={row.status === 'RECEIVED' ? 'ok' : 'plain'}>{row.status === 'RECEIVED' ? `ได้รับแล้ว${row.receivedAt ? ` ${thDate(row.receivedAt)}` : ''}` : 'ไม่ต้องใช้แล้ว'}</Tag>
                  </View>}
              {!!row.note && <Text style={styles.meta} numberOfLines={2}>{row.note}</Text>}
            </View>
            <ChevronRight size={18} color={colors.faint} />
          </Pressable>
          <View style={styles.actions}>
            {open
              ? <Pressable accessibilityRole="button" accessibilityLabel={`ได้รับ ${row.name} แล้ว`} disabled={busy}
                  onPress={() => setStatus(row, 'RECEIVED')} style={({ pressed }) => [styles.check, pressed && { backgroundColor: colors.soft }, busy && { opacity: 0.5 }]}>
                  <Check size={16} color={colors.good} />
                  <Text maxFontSizeMultiplier={CHROME_MAX_SCALE} style={{ color: colors.good, fontWeight: '600', fontSize: 13 }}>ได้รับแล้ว</Text>
                </Pressable>
              : <Button title="กลับเป็นรายการที่ยังรอ" variant="link" disabled={busy} onPress={() => setStatus(row, 'REQUESTED')} />}
            {open && <Button title="เปิดคดี · แนบเอกสาร" variant="link" onPress={() => openCase(row)} />}
          </View>
        </View>;
      })}
    </Card>}
  </FormPage>;
}

const styles = StyleSheet.create({
  row: { paddingVertical: spacing.md, gap: spacing.xs },
  rowLine: { borderTopWidth: 1, borderTopColor: colors.divider },
  body: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: TOUCH },
  tile: { width: 36, height: 36, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', alignSelf: 'flex-start', marginTop: 2 },
  name: { fontWeight: '700', color: colors.ink, fontSize: 15, lineHeight: 22 },
  caseLabel: { color: colors.ink, fontWeight: '600', fontSize: 15, lineHeight: 22 },
  meta: { color: colors.muted, fontSize: 13, lineHeight: 20 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.md, paddingLeft: 36 + spacing.md },
  check: { minHeight: TOUCH, flexDirection: 'row', alignItems: 'center', gap: spacing.xs, paddingHorizontal: spacing.md,
    borderWidth: 1, borderColor: colors.good, borderRadius: radius.button },
});

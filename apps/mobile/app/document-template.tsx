import React, { useState } from 'react';
import { Alert } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api/client';
import { useAuth } from '@/api/auth';
import { taskDraftScope } from '@/api/drafts';
import { useTaskDraft } from '@/hooks/useTaskDraft';
import { useCase } from '@/api/hooks';
import { Text } from '@/components/AppText';
import { FormField, FormPage } from '@/components/Form';
import { Dropdown } from '@/components/Dropdown';
import { Button, EmptyNote, ErrorNote, Loading } from '@/components/ui';
import { colors } from '@/theme';

type Template = { id: string; name: string };
type Rendered = { name: string; content: string; missingFields: string[] };

export default function DocumentTemplate() {
  const { caseId } = useLocalSearchParams<{ caseId?: string }>();
  const { user } = useAuth();
  const router = useRouter();
  const client = useQueryClient();
  const legalCase = useCase(caseId ?? '');
  const templates = useQuery({ queryKey: ['document-templates', legalCase.data?.caseTypeId], enabled: !!caseId && !!legalCase.data,
    queryFn: () => api<Template[]>(`/document-templates${legalCase.data?.caseTypeId ? `?caseTypeId=${legalCase.data.caseTypeId}` : ''}`) });
  const [templateId, setTemplateId] = useState('');
  const [content, setContent] = useState('');
  const [name, setName] = useState('');
  const [reviewed, setReviewed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [files] = useState<never[]>([]);
  const value = { files, templateId, content, name };
  const draft = useTaskDraft(user && caseId ? `${taskDraftScope(user)}template:${caseId}` : null, value, saved => {
    if (typeof saved.templateId === 'string') setTemplateId(saved.templateId);
    if (typeof saved.content === 'string') setContent(saved.content);
    if (typeof saved.name === 'string') setName(saved.name);
  }, !!content, { name: name || 'ร่างเอกสาร', route: `/document-template?caseId=${caseId}` });
  const select = async (id: string) => {
    setBusy(true); setError('');
    try {
      const rendered = await api<Rendered>(`/cases/${caseId}/document-templates/${id}/render`);
      if (!rendered) throw new Error('ไม่พบแบบเอกสารนี้ กรุณาโหลดรายการใหม่');
      await draft.persist({ files, templateId: id, content: rendered.content, name: rendered.name });
      setTemplateId(id); setName(rendered.name); setContent(rendered.content); setReviewed(false);
    } catch (e) { setError(e instanceof Error ? e.message : 'โหลดร่างไม่ได้'); }
    finally { setBusy(false); }
  };
  if (!caseId) return <EmptyNote>เปิดจากเอกสารในคดีที่ต้องการ</EmptyNote>;
  if (!draft.ready) return draft.error ? <ErrorNote message={draft.error} onRetry={draft.retry} /> : <Loading />;
  return <FormPage>
    <Stack.Screen options={{ title: 'สร้างเอกสารจากแบบ' }} />
    <Text>{legalCase.data?.ownRef} · {legalCase.data?.title}</Text>
    {legalCase.isError && <ErrorNote message="โหลดข้อมูลคดีไม่ได้" onRetry={() => legalCase.refetch()} />}
    {templates.isLoading && <Loading />}
    {templates.isError && <ErrorNote message="โหลดแบบเอกสารไม่ได้" onRetry={() => templates.refetch()} />}
    {templates.data?.length === 0 && <EmptyNote>ยังไม่มีแบบเอกสารสำหรับคดีนี้ ให้ Owner เพิ่มแบบในเมนูแบบเอกสารบนเว็บ</EmptyNote>}
    <Dropdown label="เลือกแบบเอกสาร" value={templateId} options={(templates.data ?? []).map(t => ({ value: t.id, label: t.name }))} disabled={busy || templates.isError || templates.isLoading}
      onChange={id => { if (content.trim()) Alert.alert('เปลี่ยนแบบเอกสาร', 'ข้อความในร่างจะถูกแทนด้วยแบบที่เลือก', [{ text: 'กลับ', style: 'cancel' }, { text: 'เปลี่ยนแบบ', onPress: () => void select(id) }]); else void select(id); }} />
    {!!content && <>
      <Text style={{ color: colors.faint }}>ข้อมูลคดีและลูกความเติมแล้ว ตรวจข้อความและแทนช่อง {'{{ข้อมูล}}'} ที่ยังขาด ร่างจะบันทึกในคดีเพื่อเปิดตรวจต่อ</Text>
      <FormField label="ตรวจและแก้ร่างเอกสาร" value={content} onChange={text => { setContent(text); setReviewed(false); }} multiline disabled={busy} />
      <Button title={reviewed ? 'ตรวจร่างแล้ว' : 'ฉันตรวจร่างและเติมข้อมูลครบแล้ว'} ghost disabled={busy || /\{\{[^{}]+\}\}/.test(content)} onPress={() => setReviewed(true)} />
      <Button title="สร้างไฟล์ DOCX เก็บในคดี" busy={busy} disabled={!reviewed} onPress={async () => {
        setBusy(true); setError('');
        try {
          await draft.persist();
          await api(`/cases/${caseId}/document-templates/${templateId}/generate`, { method: 'POST', body: { content } });
          await draft.clear(); await client.invalidateQueries({ queryKey: ['case-documents', caseId] });
          router.replace({ pathname: '/case/[id]', params: { id: caseId, section: 'documents' } });
          Alert.alert('สร้างร่างเอกสารแล้ว', 'เปิดไฟล์จากรายการเอกสารในคดีเพื่อตรวจต่อก่อนส่ง');
        } catch (e) { setError(e instanceof Error ? e.message : 'สร้างไฟล์ไม่สำเร็จ ร่างยังอยู่'); }
        finally { setBusy(false); }
      }} />
    </>}
    {!!draft.message && <Text>{draft.message}</Text>}
    {!!draft.error && <ErrorNote message={draft.error} onRetry={draft.retry} />}
    {!!error && <ErrorNote message={error} />}
  </FormPage>;
}

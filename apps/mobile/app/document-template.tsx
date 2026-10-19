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
import { FormField, FormPage, FormSection } from '@/components/Form';
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
      setTemplateId(id); setName(rendered.name); setContent(rendered.content);
    } catch (e) { setError(e instanceof Error ? e.message : 'โหลดร่างไม่ได้'); }
    finally { setBusy(false); }
  };
  if (!caseId) return <FormPage><EmptyNote action={{ title: 'กลับ', onPress: () => router.back() }}>เปิดจากแท็บเอกสารในคดีที่ต้องการ</EmptyNote></FormPage>;
  if (!draft.ready) return draft.error ? <FormPage><ErrorNote message={draft.error} onRetry={draft.retry} /></FormPage> : <Loading label="กำลังเปิดร่าง…" />;
  // Placeholders still in the text block the file; name them instead of silently disabling the button.
  const blanks = [...new Set([...content.matchAll(/\{\{\s*([^{}]+?)\s*\}\}/g)].map(match => match[1]))];
  const caseLoading = legalCase.isLoading;
  return <FormPage>
    <Stack.Screen options={{ title: 'สร้างเอกสารจากแบบ' }} />
    <FormSection title="แบบเอกสารของคดี">
    {caseLoading ? <Text style={{ color: colors.muted }}>กำลังโหลดคดี…</Text>
      : legalCase.data ? <Text>{legalCase.data.ownRef} · {legalCase.data.title}</Text> : null}
    {legalCase.isError && <ErrorNote message="โหลดข้อมูลคดีไม่ได้" onRetry={() => legalCase.refetch()} />}
    {templates.isError && <ErrorNote message="โหลดแบบเอกสารไม่ได้" onRetry={() => templates.refetch()} />}
    {templates.data?.length === 0 && <EmptyNote>ยังไม่มีแบบเอกสารสำหรับคดีนี้ ให้ Owner เพิ่มแบบในเมนูแบบเอกสารบนเว็บ</EmptyNote>}
    <Dropdown label="แบบเอกสาร" fieldLabel="แบบเอกสาร" required value={templateId} options={(templates.data ?? []).map(t => ({ value: t.id, label: t.name }))}
      placeholder={caseLoading || templates.isLoading ? 'กำลังโหลด…' : 'เลือกแบบเอกสาร'}
      disabled={busy || caseLoading || !legalCase.data || templates.isError || templates.isLoading || !templates.data?.length}
      onChange={id => { if (content.trim()) Alert.alert('เปลี่ยนแบบเอกสาร', 'ข้อความในร่างจะถูกแทนด้วยแบบที่เลือก', [{ text: 'กลับ', style: 'cancel' }, { text: 'เปลี่ยนแบบ', onPress: () => void select(id) }]); else void select(id); }} />
    </FormSection>
    {!!content && <FormSection title="ตรวจร่างก่อนสร้างไฟล์">
      <Text style={{ color: colors.muted, fontSize: 14, lineHeight: 22 }}>ข้อมูลคดีและลูกความเติมแล้ว ตรวจข้อความและแทนช่อง {'{{ข้อมูล}}'} ที่ยังขาด ไฟล์จะเก็บในคดีเพื่อเปิดตรวจต่อ</Text>
      <FormField label="ร่างเอกสาร" value={content} onChange={setContent} multiline disabled={busy}
        error={blanks.length ? `ยังต้องเติม: ${blanks.join(', ')}` : undefined} />
      <Button title="สร้างไฟล์ DOCX เก็บในคดี" busy={busy} disabled={blanks.length > 0}
        accessibilityHint={blanks.length ? `ยังต้องเติม ${blanks.join(', ')}` : 'กดเมื่อตรวจร่างแล้ว'} onPress={async () => {
        setBusy(true); setError('');
        try {
          await draft.persist();
          await api(`/cases/${caseId}/document-templates/${templateId}/generate`, { method: 'POST', body: { content } });
          await draft.clear(); await client.invalidateQueries({ queryKey: ['case-documents', caseId] });
          // The new file appears at the top of the case's documents tab; no dialog over the next screen.
          router.replace({ pathname: '/case/[id]', params: { id: caseId, section: 'documents' } });
        } catch (e) { setError(e instanceof Error ? e.message : 'สร้างไฟล์ไม่สำเร็จ ร่างยังอยู่'); }
        finally { setBusy(false); }
      }} />
    </FormSection>}
    {!!draft.message && <Text style={{ color: colors.muted }}>{draft.message}</Text>}
    {!!draft.error && <ErrorNote message={draft.error} onRetry={draft.retry} />}
    {!!error && <ErrorNote message={error} />}
  </FormPage>;
}

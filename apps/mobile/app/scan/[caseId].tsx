import React, { useEffect, useRef, useState } from 'react';
import { Alert } from 'react-native';
import { Stack, useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { uploadCaseDocument } from '@/api/files';
import { Attachments, AttachmentFile } from '@/components/Attachments';
import { FormPage, FormSection } from '@/components/Form';
import { Button, InlineError } from '@/components/ui';

export default function CaseFilesScreen() {
  const { caseId } = useLocalSearchParams<{ caseId: string }>();
  const router = useRouter();
  const navigation = useNavigation();
  const client = useQueryClient();
  const [files, setFiles] = useState<AttachmentFile[]>([]);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState('');
  const finished = useRef(false);
  // Picked files live only on this screen: leaving with unsent files asks first.
  useEffect(() => navigation.addListener('beforeRemove', (e) => {
    if (finished.current || !files.length) return;
    e.preventDefault();
    Alert.alert('ทิ้งไฟล์ที่ยังไม่ส่ง?', `ยังไม่ได้ส่ง ${files.length} ไฟล์เข้าคดี`, [
      { text: 'อยู่ต่อ', style: 'cancel' },
      { text: 'ทิ้ง', style: 'destructive', onPress: () => navigation.dispatch(e.data.action) },
    ]);
  }), [navigation, files.length]);
  const upload = async () => {
    setBusy(true); setFailure('');
    const total = files.length;
    let sent = 0;
    let current = '';
    try {
      for (const file of files) {
        current = file.name;
        await uploadCaseDocument(caseId, file.uri, file.name, file.mimeType);
        sent += 1;
        setFiles(previous => previous.filter(item => item.uri !== file.uri));
      }
      await client.invalidateQueries({ queryKey: ['case-documents', caseId] });
      finished.current = true;
      router.back();
    } catch (error) {
      setFailure(`ส่งแล้ว ${sent}/${total} · "${current}" ไม่สำเร็จ${error instanceof Error && error.message ? ` (${error.message})` : ''}`);
      if (sent) void client.invalidateQueries({ queryKey: ['case-documents', caseId] });
    } finally { setBusy(false); }
  };
  return <FormPage>
    <Stack.Screen options={{ title: 'แนบเอกสารเข้าคดี' }} />
    <FormSection title="เอกสารเข้าคดี" detail="ถ่ายรูปหรือแนบไฟล์ที่มีอยู่ เก็บไฟล์ต้นฉบับเข้าคดี">
      <Attachments files={files} onChange={(next) => { setFiles(next); setFailure(''); }} disabled={busy} />
    </FormSection>
    <InlineError message={failure || undefined} onRetry={busy ? undefined : upload} retryLabel="ส่งไฟล์ที่เหลือ" />
    {files.length > 0 && <Button title={`ส่ง ${files.length} ไฟล์เข้าคดี`} busy={busy} onPress={upload} />}
  </FormPage>;
}

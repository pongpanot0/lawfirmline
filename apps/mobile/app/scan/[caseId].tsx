import React, { useState } from 'react';
import { Alert } from 'react-native';
import { Text } from '@/components/AppText';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { uploadCaseDocument } from '@/api/files';
import { Attachments, AttachmentFile } from '@/components/Attachments';
import { FormPage } from '@/components/Form';
import { Button } from '@/components/ui';
import { colors } from '@/theme';

export default function CaseFilesScreen() {
  const { caseId } = useLocalSearchParams<{ caseId: string }>();
  const router = useRouter();
  const client = useQueryClient();
  const [files, setFiles] = useState<AttachmentFile[]>([]);
  const [busy, setBusy] = useState(false);
  const upload = async () => {
    setBusy(true);
    try {
      for (const file of files) {
        await uploadCaseDocument(caseId, file.uri, file.name, file.mimeType);
        setFiles(previous => previous.filter(item => item.uri !== file.uri));
      }
      await client.invalidateQueries({ queryKey: ['case-documents', caseId] });
      router.back();
    } catch (error) {
      Alert.alert('ส่งไฟล์ไม่ครบ', error instanceof Error ? error.message : 'ส่งไฟล์ที่เหลือต่อได้');
    } finally { setBusy(false); }
  };
  return <FormPage>
    <Stack.Screen options={{ title: 'ถ่ายรูป / แนบไฟล์คดี' }} />
    <Text style={{ color: colors.muted }}>ถ่ายรูปเอกสารหรือแนบไฟล์ที่มีอยู่ · เก็บไฟล์ต้นฉบับเข้าคดี</Text>
    <Attachments files={files} onChange={setFiles} disabled={busy} />
    <Button title={`เพิ่มไฟล์เข้าคดี (${files.length})`} busy={busy} disabled={!files.length} onPress={upload} />
  </FormPage>;
}

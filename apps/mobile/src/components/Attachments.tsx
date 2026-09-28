import React from 'react';
import { Alert, Pressable, View } from 'react-native';
import { Text } from '@/components/AppText';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { Button } from './ui';
import { colors, spacing } from '@/theme';

export interface AttachmentFile { uri: string; name: string; mimeType: string; size?: number }

export function Attachments({ files, onChange, disabled = false }: {
  files: AttachmentFile[]; onChange: (files: AttachmentFile[]) => void; disabled?: boolean;
}) {
  const add = (next: AttachmentFile[]) => {
    if (next.some(file => (file.size ?? 0) > 30 * 1024 * 1024)) {
      Alert.alert('ไฟล์ใหญ่เกินไป', 'แนบไฟล์ละไม่เกิน 30 MB'); return;
    }
    onChange([...files, ...next.filter(file => !files.some(old => old.uri === file.uri))]);
  };
  const pick = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({ multiple: true, copyToCacheDirectory: true,
        type: ['application/pdf', 'image/*', 'text/plain',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'] });
      if (!result.canceled) add(result.assets.map(file => ({ uri: file.uri, name: file.name, mimeType: file.mimeType ?? 'application/octet-stream', size: file.size })));
    } catch (error) { Alert.alert('เปิดไฟล์ไม่ได้', error instanceof Error ? error.message : 'ลองใหม่อีกครั้ง'); }
  };
  const photo = async (camera: boolean) => {
    try {
      if (camera && !(await ImagePicker.requestCameraPermissionsAsync()).granted) {
        Alert.alert('อนุญาตกล้องก่อน', 'เปิดสิทธิ์กล้องให้ Samnuan ในตั้งค่าของโทรศัพท์'); return;
      }
      const result = camera ? await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.85 })
        : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsMultipleSelection: true, quality: 0.85 });
      if (!result.canceled) add(result.assets.map((file, index) => ({ uri: file.uri,
        name: file.fileName ?? `photo-${Date.now()}-${index}.jpg`, mimeType: file.mimeType ?? 'image/jpeg', size: file.fileSize })));
    } catch (error) { Alert.alert('ถ่ายหรือเลือกรูปไม่ได้', error instanceof Error ? error.message : 'ลองใหม่อีกครั้ง'); }
  };
  return <View style={{ gap: spacing.sm }}>
    <Button title="แนบไฟล์" ghost disabled={disabled} onPress={pick} />
    <View style={{ flexDirection: 'row', gap: spacing.sm }}>
      <View style={{ flex: 1 }}><Button title="ถ่ายรูป" ghost disabled={disabled} onPress={() => photo(true)} /></View>
      <View style={{ flex: 1 }}><Button title="เลือกรูป" ghost disabled={disabled} onPress={() => photo(false)} /></View>
    </View>
    {files.map(file => <View key={file.uri} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
      <Text style={{ flex: 1, color: colors.text }}>{file.name}</Text>
      <Pressable accessibilityRole="button" accessibilityLabel={`เอาไฟล์ ${file.name} ออก`} disabled={disabled}
        onPress={() => onChange(files.filter(item => item.uri !== file.uri))} style={{ minHeight: 44, justifyContent: 'center' }}>
        <Text style={{ color: colors.warn }}>เอาออก</Text>
      </Pressable>
    </View>)}
    {!files.length && <Text style={{ color: colors.muted }}>ยังไม่มีไฟล์แนบ · เพิ่มทีหลังได้</Text>}
  </View>;
}

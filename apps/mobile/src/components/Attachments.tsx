import React, { useState } from 'react';
import { ActionSheetIOS, Alert, Linking, Platform, Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/components/AppText';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { Camera, FileText, Images, Paperclip, X } from 'lucide-react-native';
import { Button } from './Button';
import { InlineError } from './States';
import { colors, radius, shadow, spacing, TOUCH } from '@/theme';

export interface AttachmentFile { uri: string; name: string; mimeType: string; size?: number }

const MAX_BYTES = 30 * 1024 * 1024;

function describe(file: AttachmentFile) {
  const kind = file.mimeType.startsWith('image/') ? 'รูป' : file.mimeType === 'application/pdf' ? 'PDF'
    : file.name.includes('.') ? file.name.split('.').pop()!.toUpperCase() : 'ไฟล์';
  if (!file.size) return kind;
  const mb = file.size / (1024 * 1024);
  return `${kind} · ${mb >= 1 ? `${mb.toFixed(1)} MB` : `${Math.max(1, Math.round(file.size / 1024))} KB`}`;
}

/**
 * One "แนบไฟล์หรือรูป" action that offers camera, photo library or files (native action sheet on iOS,
 * an inline choice elsewhere). A file over 30 MB is skipped on its own; the rest of the batch is kept.
 */
export function Attachments({ files, onChange, disabled = false, title = 'แนบไฟล์หรือรูป' }: {
  files: AttachmentFile[]; onChange: (files: AttachmentFile[]) => void; disabled?: boolean;
  /** Button label; defaults to "แนบไฟล์หรือรูป". */
  title?: string;
}) {
  const [choosing, setChoosing] = useState(false);
  const [skipped, setSkipped] = useState<string[]>([]);
  const add = (next: AttachmentFile[]) => {
    const tooBig = next.filter(file => (file.size ?? 0) > MAX_BYTES);
    setSkipped(tooBig.map(file => file.name));
    const fits = next.filter(file => (file.size ?? 0) <= MAX_BYTES);
    onChange([...files, ...fits.filter(file => !files.some(old => old.uri === file.uri))]);
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
        Alert.alert('อนุญาตกล้องก่อน', 'เปิดสิทธิ์กล้องให้ Samnuan ในตั้งค่าของโทรศัพท์', [
          { text: 'ไว้ทีหลัง', style: 'cancel' }, { text: 'เปิดตั้งค่า', onPress: () => { Linking.openSettings().catch(() => {}); } },
        ]); return;
      }
      const result = camera ? await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.85 })
        : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsMultipleSelection: true, quality: 0.85 });
      if (!result.canceled) add(result.assets.map((file, index) => ({ uri: file.uri,
        name: file.fileName ?? `photo-${Date.now()}-${index}.jpg`, mimeType: file.mimeType ?? 'image/jpeg', size: file.fileSize })));
    } catch (error) { Alert.alert('ถ่ายหรือเลือกรูปไม่ได้', error instanceof Error ? error.message : 'ลองใหม่อีกครั้ง'); }
  };
  const choices = [
    { label: 'ถ่ายรูป', Icon: Camera, run: () => photo(true) },
    { label: 'เลือกรูป', Icon: Images, run: () => photo(false) },
    { label: 'เลือกไฟล์', Icon: FileText, run: pick },
  ];
  const open = () => {
    setSkipped([]);
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions({ title, options: [...choices.map(c => c.label), 'ยกเลิก'], cancelButtonIndex: choices.length },
        index => { if (index < choices.length) choices[index].run(); });
    } else setChoosing(value => !value);
  };
  return <View style={{ gap: spacing.sm }}>
    {files.map(file => <View key={file.uri} style={styles.file}>
      <View style={styles.fileIcon}><Paperclip size={16} color={colors.info} /></View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ color: colors.text }} numberOfLines={2}>{file.name}</Text>
        <Text style={styles.meta}>{describe(file)}</Text>
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel={`เอาไฟล์ ${file.name} ออก`} disabled={disabled}
        onPress={() => onChange(files.filter(item => item.uri !== file.uri))} style={styles.remove}>
        <X size={18} color={colors.warn} />
      </Pressable>
    </View>)}
    <Button title={files.length ? 'แนบเพิ่ม' : title} variant="secondary" disabled={disabled} onPress={open}
      accessibilityHint="ถ่ายรูป เลือกรูป หรือเลือกไฟล์ ไฟล์ละไม่เกิน 30 MB" />
    {choosing && Platform.OS !== 'ios' && <View accessibilityRole="menu" style={styles.choices}>
      {choices.map(({ label, Icon, run }) => <Pressable key={label} accessibilityRole="menuitem" accessibilityLabel={label} disabled={disabled}
        onPress={() => { setChoosing(false); run(); }} style={({ pressed }) => [styles.choice, pressed && { backgroundColor: colors.soft }]}>
        <Icon size={18} color={colors.ink} />
        <Text style={{ color: colors.ink, fontWeight: '600' }}>{label}</Text>
      </Pressable>)}
    </View>}
    {skipped.map(name => <InlineError key={name} message={`"${name}" ใหญ่เกิน 30 MB · ไม่ได้แนบไฟล์นี้`} />)}
  </View>;
}

const styles = StyleSheet.create({
  file: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingLeft: spacing.md, paddingVertical: spacing.sm, minHeight: 56,
    borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, backgroundColor: colors.surface, ...shadow.sm },
  fileIcon: { width: 36, height: 36, borderRadius: radius.md, backgroundColor: colors.infoSoft, alignItems: 'center', justifyContent: 'center' },
  meta: { color: colors.muted, fontSize: 12, lineHeight: 18 },
  remove: { width: TOUCH, height: TOUCH, alignItems: 'center', justifyContent: 'center' },
  choices: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  choice: { flexGrow: 1, minHeight: TOUCH, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs,
    paddingHorizontal: spacing.md, borderWidth: 1, borderColor: colors.lineStrong, borderRadius: radius.button, backgroundColor: colors.surface },
});

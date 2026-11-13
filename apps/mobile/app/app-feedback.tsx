import React, { useState } from 'react';
import { Alert, Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { Bug, Camera, Info, Lightbulb, MessageSquare, X } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text, TextInput } from '@/components/AppText';
import { Button, InlineError } from '@/components/ui';
import { submitAppFeedback } from '@/api/app-feedback';
import { colors, radius, spacing, typeScale } from '@/theme';

const kinds = [
  { value: 'BUG', label: 'แจ้งปัญหา', Icon: Bug },
  { value: 'SUGGESTION', label: 'เสนอแนะ', Icon: Lightbulb },
  { value: 'OTHER', label: 'อื่นๆ', Icon: MessageSquare },
] as const;

export default function AppFeedbackScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [kind, setKind] = useState<(typeof kinds)[number]['value']>('BUG');
  const [message, setMessage] = useState('');
  const [screenshot, setScreenshot] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);

  async function pickImage() {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        setError('กรุณาเปิดสิทธิ์เข้าถึงรูปภาพ' +
          'ในการตั้งค่าของอุปกรณ์');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1 });
      if (!result.canceled) {
        const asset = result.assets[0];
        if (asset.fileSize && asset.fileSize > 10 * 1024 * 1024) {
          setError('ภาพต้องมีขนาดไม่เกิน 10 MB');
          return;
        }
        setScreenshot(asset);
        setError('');
      }
    } catch {
      setError('เลือกรูปภาพไม่ได้ กรุณาลองอีกครั้ง');
    }
  }

  async function send() {
    if (!message.trim() || sending) return;
    setSending(true);
    setError('');
    try {
      await submitAppFeedback({
        kind,
        message: message.trim(),
        route: '/more',
        screenshot: screenshot ? {
          uri: screenshot.uri,
          name: screenshot.fileName ?? 'screenshot.jpg',
          type: screenshot.mimeType ?? 'image/jpeg',
        } : undefined,
      });
      router.back();
      Alert.alert('ได้รับแล้ว ขอบคุณครับ');
    } catch (err) {
      setError(err instanceof Error ? err.message :
        'ส่งความเห็นไม่สำเร็จ กรุณาลองอีกครั้ง');
    } finally {
      setSending(false);
    }
  }

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
        <Text style={styles.intro}>
          บอกเราหน่อยว่าแอปเป็นยังไงบ้าง ทีม Samnuan
          อ่านทุกข้อความ
        </Text>
        <Text style={styles.label}>เรื่องที่อยากบอก</Text>
        <View style={styles.segment}>
          {kinds.map(({ value, label, Icon }) => (
            <Pressable
              key={value}
              accessibilityRole="button"
              accessibilityLabel={label}
              accessibilityState={{ selected: kind === value }}
              onPress={() => setKind(value)}
              style={[styles.segmentItem, kind === value && styles.segmentSelected]}
            >
              <Icon size={18} color={kind === value ? colors.surface : colors.ink} />
              <Text style={[styles.segmentText, kind === value && styles.segmentTextSelected]}>{label}</Text>
            </Pressable>
          ))}
        </View>
        <View style={styles.labelRow}>
          <Text style={styles.label}>รายละเอียด <Text style={styles.required}>*</Text></Text>
          <Text style={styles.muted}>{message.length} / 500</Text>
        </View>
        <TextInput
          accessibilityLabel="รายละเอียด"
          multiline
          maxLength={500}
          value={message}
          onChangeText={setMessage}
          placeholder={'เล่าว่าเกิดอะไรขึ้น อยู่หน้าไหน ' +
            'และกำลังทำอะไรอยู่'}
          placeholderTextColor={colors.muted}
          textAlignVertical="top"
          style={styles.input}
        />
        <Pressable accessibilityRole="button" accessibilityLabel="แนบภาพหน้าจอ" onPress={pickImage} style={styles.attach}>
          <Camera size={20} color={colors.ink} />
          <Text style={styles.attachText}>แนบภาพหน้าจอ (ถ้ามี)</Text>
          <Text style={styles.muted}>1 รูป</Text>
        </Pressable>
        {screenshot ? (
          <View style={styles.preview}>
            <Image source={{ uri: screenshot.uri }} style={styles.thumbnail} />
            <View style={styles.previewText}>
              <Text numberOfLines={1}>{screenshot.fileName ?? 'ภาพหน้าจอ'}</Text>
              {screenshot.fileSize ? <Text style={styles.muted}>{Math.round(screenshot.fileSize / 1024)} KB</Text> : null}
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel="ลบภาพหน้าจอ" onPress={() => setScreenshot(null)}>
              <X size={24} color={colors.ink} />
            </Pressable>
          </View>
        ) : null}
        <View style={styles.info}>
          <Info size={20} color={colors.accentInk} />
          <Text style={styles.infoText}>
            ระบบแนบชื่อหน้า อุปกรณ์ และเวอร์ชันแอปให้อัตโนมัติ
          </Text>
        </View>
        {error ? <InlineError message={error} /> : null}
      </ScrollView>
      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, spacing.lg) }]}>
        <Button title={sending ? 'กำลังส่ง…' : 'ส่งความเห็น'} disabled={!message.trim() || sending} onPress={send} />
        <Text style={styles.hint}>ทีมงานได้รับทันที</Text>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg, gap: spacing.md },
  intro: { ...typeScale.body, color: colors.muted, marginBottom: spacing.md },
  label: { ...typeScale.section, color: colors.ink },
  labelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.md },
  required: { color: colors.accentInk },
  muted: { ...typeScale.meta, color: colors.muted },
  segment: { flexDirection: 'row', backgroundColor: colors.sunken, borderRadius: radius.md, padding: spacing.xs },
  segmentItem: { flex: 1, minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4 },
  segmentSelected: { backgroundColor: colors.ink, borderRadius: radius.md },
  segmentText: { color: colors.ink, fontSize: 14 },
  segmentTextSelected: { color: colors.surface, fontWeight: '600' },
  input: {
    minHeight: 168, backgroundColor: colors.raised, borderWidth: 1, borderColor: colors.lineStrong,
    borderRadius: radius.md, padding: spacing.md, color: colors.ink, fontSize: 16,
  },
  attach: {
    minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md,
    backgroundColor: colors.surface, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.lineStrong,
    borderRadius: radius.md, marginTop: spacing.sm,
  },
  attachText: { flex: 1, color: colors.ink, fontWeight: '600' },
  preview: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md, backgroundColor: colors.surface,
    borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, padding: spacing.md,
  },
  thumbnail: { width: 64, height: 64, borderRadius: radius.sm },
  previewText: { flex: 1 },
  info: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md, borderWidth: 1, borderColor: colors.line,
    borderRadius: radius.md, padding: spacing.md, marginTop: spacing.sm,
  },
  infoText: { flex: 1, color: colors.muted },
  footer: { padding: spacing.lg, borderTopWidth: 1, borderColor: colors.line, backgroundColor: colors.bg },
  hint: { ...typeScale.meta, color: colors.muted, textAlign: 'center', marginTop: spacing.sm },
});

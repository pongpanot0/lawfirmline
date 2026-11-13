import React, { useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Send } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text, TextInput } from '@/components/AppText';
import { Button, InlineError } from '@/components/ui';
import { submitAppFeedback } from '@/api/app-feedback';
import { colors, radius, spacing, typeScale } from '@/theme';

const faces = [
  { face: '😞', label: 'ใช้ยาก', prompt: 'ตรงไหนที่ใช้ยาก หรือติดขัดอะไร?' },
  { face: '😐', label: 'พอใช้', prompt: 'อะไรที่ควรดีกว่านี้?' },
  { face: '😊', label: 'ใช้ง่าย', prompt: 'ชอบตรงไหน?' },
];

export function PageFeedbackSheet({ route, onClose }: { route: string; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const [rating, setRating] = useState<number | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);

  async function send() {
    if (!rating || sending) return;
    setSending(true);
    setError('');
    try {
      await submitAppFeedback({ kind: 'RATING', rating, message: message.trim(), route });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message :
        'ส่งความเห็นไม่สำเร็จ กรุณาลองอีกครั้ง');
    } finally {
      setSending(false);
    }
  }

  return (
    <Modal transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.backdrop} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, spacing.lg) }]}>
          <ScrollView keyboardShouldPersistTaps="handled" bounces={false}>
            <View style={styles.handle} />
            <View style={styles.heading}>
              <Text accessibilityRole="header" style={styles.title}>หน้านี้ใช้งานเป็นยังไงบ้าง?</Text>
              <Pressable accessibilityRole="button" accessibilityLabel="ข้าม" onPress={onClose} style={styles.skip}>
                <Text style={styles.muted}>ข้าม</Text>
              </Pressable>
            </View>
            <View style={styles.faces}>
              {faces.map((item, index) => (
                <Pressable
                  key={item.label}
                  accessibilityRole="button"
                  accessibilityLabel={`${item.face} ${item.label}`}
                  accessibilityState={{ selected: rating === index + 1 }}
                  onPress={() => setRating(index + 1)}
                  style={[styles.face, rating === index + 1 && styles.selected]}
                >
                  <Text style={styles.emoji}>{item.face}</Text>
                  <Text style={styles.faceLabel}>{item.label}</Text>
                </Pressable>
              ))}
            </View>
            {rating ? (
              <>
                <View style={styles.promptRow}>
                  <Text style={styles.prompt}>{faces[rating - 1].prompt} <Text style={styles.muted}>(ไม่บังคับ)</Text></Text>
                  <Text style={styles.muted}>{message.length} / 500</Text>
                </View>
                <TextInput
                  accessibilityLabel={faces[rating - 1].prompt}
                  multiline
                  maxLength={500}
                  value={message}
                  onChangeText={setMessage}
                  placeholder="เช่น อยากเห็นวันนัดถัดไปก่อนอย่างอื่น"
                  placeholderTextColor={colors.muted}
                  textAlignVertical="top"
                  style={styles.input}
                />
              </>
            ) : null}
            {error ? <InlineError message={error} /> : null}
            <View style={styles.submit}>
              <Button title="ส่งความเห็น" icon={Send} disabled={!rating || sending} busy={sending} onPress={send} />
              <Text style={styles.hint}>
                ส่งแค่หน้ายิ้มก็ได้ ใช้เวลาไม่ถึงวินาที
              </Text>
            </View>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: colors.scrim },
  sheet: {
    maxHeight: '90%', backgroundColor: colors.surface, borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl, paddingHorizontal: spacing.lg,
  },
  handle: { width: 40, height: 4, borderRadius: radius.full, backgroundColor: colors.line, alignSelf: 'center', margin: spacing.lg },
  heading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  title: { ...typeScale.title, flex: 1, color: colors.ink },
  skip: { minHeight: 44, justifyContent: 'center', paddingHorizontal: spacing.sm },
  muted: { ...typeScale.meta, color: colors.muted },
  faces: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.lg },
  face: {
    flex: 1, minHeight: 80, alignItems: 'center', justifyContent: 'center', gap: spacing.xs,
    borderWidth: 1, borderColor: colors.line, borderRadius: radius.md,
  },
  selected: { borderWidth: 2, borderColor: colors.ink, backgroundColor: colors.soft },
  emoji: { fontSize: 28 },
  faceLabel: { color: colors.ink, fontWeight: '600' },
  promptRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.lg },
  prompt: { flex: 1, color: colors.ink },
  input: {
    minHeight: 96, borderWidth: 1, borderColor: colors.lineStrong, borderRadius: radius.md,
    backgroundColor: colors.raised, padding: spacing.md, marginTop: spacing.sm, color: colors.ink,
  },
  submit: { marginTop: spacing.xl },
  hint: { ...typeScale.meta, textAlign: 'center', color: colors.muted, marginTop: spacing.sm },
});

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, KeyboardAvoidingView, Linking, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Stack, useFocusEffect, useRouter } from 'expo-router';
import { RecordingPresets, requestRecordingPermissionsAsync, setAudioModeAsync, useAudioRecorder, useAudioRecorderState } from 'expo-audio';
import { File } from 'expo-file-system';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronRight, Mic, Square } from 'lucide-react-native';
import type { SecretaryCard } from '@lawfirm/shared';
import { useSecretaryChat, useTranscribe } from '@/api/hooks';
import { openCaseDocument } from '@/api/files';
import { Text, TextInput } from '@/components/AppText';
import { Button, Card, EmptyState, InlineError, LoadingState } from '@/components/ui';
import { secretaryCardPath, type SecretaryMessage } from '@/lib/secretary';
import { colors, pageContent, radius, spacing, typeScale } from '@/theme';

type ChatMessage = SecretaryMessage & { cards?: SecretaryCard[] };
type VoiceState = 'idle' | 'starting' | 'recording' | 'stopping' | 'transcribing';

export default function SecretaryScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const chat = useSecretaryChat();
  const transcribe = useTranscribe();
  const list = useRef<ScrollView>(null);
  const focused = useRef(false);
  const appActive = useRef(AppState.currentState === 'active');
  const recording = useRef(false);
  const voiceLock = useRef(false);
  const sending = useRef(false);
  const voiceSession = useRef(0);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [voice, setVoice] = useState<VoiceState>('idle');
  const [error, setError] = useState('');
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [openingDocument, setOpeningDocument] = useState(false);
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY, status => {
    if ((status.hasError || status.isFinished) && recording.current) {
      recording.current = false;
      voiceSession.current += 1;
      setVoice('idle');
      setError('การบันทึกเสียงถูกขัดจังหวะ กรุณาแตะไมค์เพื่อพูดใหม่');
      void setAudioModeAsync({ allowsRecording: false }).catch(() => undefined);
      try { if (status.url) { const file = new File(status.url); if (file.exists) file.delete(); } } catch { /* Temporary cache only. */ }
    }
  });
  const recorderState = useAudioRecorderState(recorder);
  const busy = chat.isPending || openingDocument || voice !== 'idle';

  const discardRecording = useCallback(async () => {
    voiceSession.current += 1;
    if (!recording.current || voiceLock.current) return;
    voiceLock.current = true;
    recording.current = false;
    setVoice('stopping');
    try { await recorder.stop(); }
    catch { /* A system interruption may already have stopped the recorder. */ }
    finally {
      try { if (recorder.uri) { const file = new File(recorder.uri); if (file.exists) file.delete(); } } catch { /* Temporary cache only. */ }
      await setAudioModeAsync({ allowsRecording: false }).catch(() => undefined);
      voiceLock.current = false;
      setVoice('idle');
    }
  }, [recorder]);

  useFocusEffect(useCallback(() => {
    focused.current = true;
    return () => { focused.current = false; void discardRecording(); };
  }, [discardRecording]));
  useEffect(() => {
    const subscription = AppState.addEventListener('change', state => {
      appActive.current = state === 'active';
      if (state !== 'active') void discardRecording();
    });
    return () => subscription.remove();
  }, [discardRecording]);

  async function send(content: string) {
    const text = content.trim();
    if (!text || sending.current) return;
    sending.current = true;
    setError('');
    const history = messages;
    const next: ChatMessage[] = [...history, { role: 'user', content: text }];
    setMessages(next);
    setInput('');
    try {
      const result = await chat.mutateAsync(next);
      setMessages([...next, { role: 'assistant', content: result.reply, cards: result.cards }]);
    } catch (cause) {
      setMessages(history);
      setInput(text);
      setError(cause instanceof Error ? cause.message : 'ส่งคำถามไม่สำเร็จ กรุณาลองใหม่');
    } finally { sending.current = false; }
  }

  async function toggleRecording() {
    if (voiceLock.current || sending.current || openingDocument) return;
    voiceLock.current = true;
    setError('');
    const session = voiceSession.current;
    const canContinue = () => session === voiceSession.current && focused.current && appActive.current;
    try {
      if (recording.current) {
        setVoice('transcribing');
        recording.current = false;
        await recorder.stop();
        await setAudioModeAsync({ allowsRecording: false });
        const uri = recorder.uri;
        if (!uri) throw new Error('ไม่พบเสียงที่บันทึก กรุณาลองพูดใหม่');
        if (!canContinue()) return;
        const result = await transcribe.mutateAsync(uri);
        if (!canContinue()) return;
        const text = result.text.trim();
        if (!text) throw new Error('ไม่พบคำพูดในเสียง กรุณาลองพูดใหม่');
        setInput(text);
        await send(text);
      } else {
        setVoice('starting');
        const permission = await requestRecordingPermissionsAsync();
        setPermissionDenied(!permission.granted);
        if (!permission.granted) throw new Error('ยังไม่ได้อนุญาตไมโครโฟน · เปิดสิทธิ์ในการตั้งค่า หรือพิมพ์คำถามได้เลย');
        if (!canContinue()) return;
        await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
        await recorder.prepareToRecordAsync();
        if (!canContinue()) { await recorder.stop(); return; }
        recorder.record();
        recording.current = true;
        setVoice('recording');
      }
    } catch (cause) {
      recording.current = false;
      setError(cause instanceof Error ? cause.message : 'บันทึกเสียงไม่สำเร็จ กรุณาลองใหม่');
    } finally {
      voiceLock.current = false;
      if (!recording.current) {
        try { if (recorder.uri) { const file = new File(recorder.uri); if (file.exists) file.delete(); } } catch { /* Temporary cache only. */ }
        await setAudioModeAsync({ allowsRecording: false }).catch(() => undefined);
        setVoice('idle');
      }
    }
  }

  async function openCard(card: SecretaryCard) {
    if (busy) return;
    const path = secretaryCardPath(card);
    if (path) { router.push(path as never); return; }
    if (card.type !== 'document' || !card.caseId) return;
    setOpeningDocument(true);
    setError('');
    try { await openCaseDocument(card.caseId, card.id, card.filename); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'เปิดเอกสารไม่สำเร็จ'); }
    finally { setOpeningDocument(false); }
  }

  const voiceBusy = voice === 'starting' || voice === 'stopping' || voice === 'transcribing';
  const voiceLabel = voice === 'recording' ? `แตะหยุดและส่ง · ${Math.floor(recorderState.durationMillis / 1000)} วินาที`
    : voice === 'starting' ? 'กำลังเตรียมไมโครโฟน…' : voice === 'stopping' ? 'กำลังหยุดบันทึก…'
      : voice === 'transcribing' ? 'กำลังถอดเสียงและส่ง…' : 'แตะเพื่อพูด';
  return <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    keyboardVerticalOffset={insets.top + 56}>
    <Stack.Screen options={{ title: 'เลขา' }} />
    <ScrollView ref={list} keyboardShouldPersistTaps="handled" contentContainerStyle={[pageContent, { gap: spacing.md, flexGrow: 1 }]}
      onContentSizeChange={() => list.current?.scrollToEnd({ animated: true })}>
      {!messages.length ? <EmptyState icon={Mic}>ถามเรื่องคดี เอกสาร หรือนัดหมาย · แตะไมค์เพื่อพูด หรือพิมพ์คำถามด้านล่าง</EmptyState> : null}
      {messages.map((message, index) => <View key={index} style={[styles.message, message.role === 'user' && styles.userMessage]}>
        <Text style={styles.speaker}>{message.role === 'user' ? 'คุณ' : 'เลขา'}</Text>
        <Text selectable style={styles.body} accessibilityLiveRegion={message.role === 'assistant' ? 'polite' : undefined}>{message.content}</Text>
        {message.cards?.map(card => {
          const linked = card.type !== 'document' || !!card.caseId;
          const title = card.type === 'document' ? card.filename : card.title;
          const label = card.type === 'case' ? 'คดี' : card.type === 'intake' ? 'เรื่องรับใหม่' : card.type === 'event' ? 'นัดหมาย' : 'เอกสาร';
          const body = <Card flat style={styles.card}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.speaker}>{label}{card.type === 'case' && card.ownRef ? ` · ${card.ownRef}` : ''}</Text>
              <Text style={styles.body}>{title}</Text>
              {!linked ? <Text style={styles.speaker}>ยังไม่มีคดีที่เชื่อมโยงให้เปิดเอกสาร</Text> : null}
            </View>{linked ? <ChevronRight size={20} color={colors.muted} /> : null}
          </Card>;
          return linked ? <Pressable key={`${card.type}:${card.id}`} accessibilityRole="button" accessibilityLabel={`เปิด${label} ${title}`}
            disabled={busy} accessibilityState={{ disabled: busy }} onPress={() => void openCard(card)}
            style={({ pressed }) => pressed && { opacity: 0.7 }}>{body}</Pressable>
            : <View key={`${card.type}:${card.id}`}>{body}</View>;
        })}
      </View>)}
      {chat.isPending ? <LoadingState inline label="เลขากำลังค้นข้อมูล…" /> : null}
      {openingDocument ? <LoadingState inline label="กำลังเปิดเอกสาร…" /> : null}
    </ScrollView>
    <View style={[styles.composer, { paddingBottom: Platform.OS === 'ios' ? Math.max(insets.bottom, spacing.md) : spacing.md }]}>
      {error ? <InlineError message={error} /> : null}
      {permissionDenied ? <Button variant="link" title="เปิดการตั้งค่าไมโครโฟน" onPress={() => {
        Linking.openSettings().catch(() => setError('เปิดการตั้งค่าไม่ได้ กรุณาเปิดสิทธิ์ไมโครโฟนในการตั้งค่าอุปกรณ์'));
      }} /> : null}
      <Pressable accessibilityRole="button" accessibilityLabel={voiceLabel}
        accessibilityHint="แตะหนึ่งครั้งเพื่อเริ่ม พูดคำถาม แล้วแตะอีกครั้งเพื่อหยุด ถอดเสียงและส่งอัตโนมัติ"
        accessibilityState={{ disabled: voiceBusy || chat.isPending || openingDocument, busy: voiceBusy }}
        disabled={voiceBusy || chat.isPending || openingDocument} onPress={() => void toggleRecording()}
        style={({ pressed }) => [styles.mic, voice === 'recording' && { backgroundColor: colors.warn },
          (voiceBusy || chat.isPending || openingDocument) && { opacity: 0.5 }, pressed && { opacity: 0.7 }]}>
        {voice === 'recording' ? <Square size={28} color={colors.surface} /> : <Mic size={28} color={colors.surface} />}
        <Text style={styles.micLabel}>{voiceLabel}</Text>
      </Pressable>
      <View style={styles.inputRow}>
        <TextInput accessibilityLabel="คำถามถึงเลขา" placeholder="ถามเลขา…" placeholderTextColor={colors.muted}
          value={input} onChangeText={setInput} editable={!busy} multiline style={styles.input} />
        <Button title="ส่ง" inline disabled={busy || !input.trim()} onPress={() => void send(input)} />
      </View>
    </View>
  </KeyboardAvoidingView>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  message: { padding: spacing.lg, borderRadius: radius.card, backgroundColor: colors.surface, gap: spacing.sm },
  userMessage: { backgroundColor: colors.infoSoft, marginLeft: spacing.xl },
  speaker: { ...typeScale.meta, color: colors.muted },
  body: { ...typeScale.body, color: colors.text },
  card: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 56 },
  composer: { padding: spacing.lg, gap: spacing.sm, borderTopWidth: 1, borderTopColor: colors.line, backgroundColor: colors.surface },
  mic: { minHeight: 72, flexDirection: 'row', gap: spacing.md, alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.ink, borderRadius: radius.card, padding: spacing.lg },
  micLabel: { ...typeScale.section, color: colors.surface, flexShrink: 1 },
  inputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm },
  input: { flex: 1, minHeight: 48, maxHeight: 120, borderWidth: 1, borderColor: colors.lineStrong,
    borderRadius: radius.md, padding: spacing.md, ...typeScale.body, color: colors.text },
});

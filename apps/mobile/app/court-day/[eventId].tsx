import React, { useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowLeft, Check, WifiOff } from 'lucide-react-native';
import { useCourtDay, useSaveCourtDay } from '@/api/hooks';
import type { CourtDayState } from '@/api/types';
import { Loading, Tag } from '@/components/ui';
import { thDateLong, thTime } from '@/format';
import { useKeyboardHeight } from '@/hooks/useKeyboardHeight';
import { colors, radius, spacing, TOUCH } from '@/theme';

/**
 * The one screen built for standing in a court hallway: dark, high contrast,
 * readable offline from the persisted query cache. Checklist ticks and notes
 * edit locally and save in one tap.
 */
export default function CourtDayScreen() {
  const { eventId } = useLocalSearchParams<{ eventId: string }>();
  const router = useRouter();
  const courtDay = useCourtDay(eventId);
  const save = useSaveCourtDay(eventId);

  const [draft, setDraft] = useState<CourtDayState | null>(null);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const keyboardHeight = useKeyboardHeight();

  // Adopt the server state once; afterwards the draft is the source of truth
  // until saved, so a background refetch never clobbers typing.
  useEffect(() => {
    if (courtDay.data && !draft) setDraft(courtDay.data.workspace.state);
  }, [courtDay.data, draft]);

  if (courtDay.isLoading || !draft) return <Loading />;

  const data = courtDay.data;
  if (!data) {
    return (
      <SafeAreaView style={styles.screen}>
        <View style={styles.center}>
          <WifiOff color={colors.nightMuted} size={32} />
          <Text style={styles.offlineText}>
            ยังไม่เคยโหลดนัดนี้ — ต้องต่ออินเทอร์เน็ตครั้งแรกก่อนขึ้นศาล
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  const { event, workspace } = data;
  const completed = !!workspace.completedAt;

  const submit = () => {
    save.mutate(
      { version: workspace.version, state: draft },
      { onSuccess: () => setSavedAt(new Date()) },
    );
  };

  const toggleChecklist = (itemId: string) => {
    setDraft((current) =>
      current
        ? {
            ...current,
            checklist: current.checklist.map((item) =>
              item.id === itemId ? { ...item, done: !item.done } : item,
            ),
          }
        : current,
    );
  };

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} hitSlop={10} style={styles.backButton}>
            <ArrowLeft color={colors.nightBright} size={22} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerTitle}>Court Day</Text>
            <Text style={styles.headerSub} numberOfLines={1}>
              {event.courtName ?? event.case?.courtName ?? ''}
            </Text>
          </View>
          {completed ? <Tag tone="ok">บันทึกผลแล้ว</Tag> : <Tag tone="court">พร้อม offline</Tag>}
        </View>

        <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 24 + keyboardHeight, gap: spacing.md }}>
          <View style={styles.card}>
            <Text style={styles.label}>คดี</Text>
            <Text style={styles.ref}>{event.case?.ownRef ?? ''}</Text>
            <Text style={styles.textMain} numberOfLines={2}>
              {event.case?.title ?? ''}
            </Text>
            <View style={styles.divider} />
            <Text style={styles.textMuted}>
              {event.title} · {thDateLong(event.startAt)} {thTime(event.startAt)}
            </Text>
          </View>

          {draft.checklist.length > 0 ? (
            <View style={styles.card}>
              <Text style={styles.label}>เช็กลิสต์ ({draft.checklist.filter((i) => i.done).length}/{draft.checklist.length})</Text>
              {draft.checklist.map((item) => (
                <Pressable
                  key={item.id}
                  style={styles.checkRow}
                  onPress={() => !completed && toggleChecklist(item.id)}
                >
                  <View style={[styles.checkbox, item.done && styles.checkboxDone]}>
                    {item.done ? <Check size={13} color="#fff" strokeWidth={3} /> : null}
                  </View>
                  <Text style={[styles.textMain, item.done && styles.doneText]}>{item.title}</Text>
                </Pressable>
              ))}
            </View>
          ) : null}

          <View style={styles.card}>
            <Text style={styles.label}>บันทึกระหว่างนัด</Text>
            <TextInput
              style={styles.input}
              multiline
              editable={!completed}
              placeholder="จดสิ่งที่เกิดขึ้นในนัดนี้…"
              placeholderTextColor={colors.nightMuted}
              value={draft.notes}
              onChangeText={(notes) => setDraft({ ...draft, notes })}
            />
          </View>

          <View style={styles.card}>
            <Text style={styles.label}>ผลนัด</Text>
            <TextInput
              style={styles.input}
              multiline
              editable={!completed}
              placeholder="เช่น สืบพยานโจทก์ปาก 1 เสร็จ ศาลนัดสืบพยานจำเลยต่อ…"
              placeholderTextColor={colors.nightMuted}
              value={draft.outcome}
              onChangeText={(outcome) => setDraft({ ...draft, outcome })}
            />
          </View>

          {!completed ? (
            <Pressable
              style={({ pressed }) => [styles.saveButton, pressed && { opacity: 0.85 }]}
              onPress={submit}
              disabled={save.isPending}
            >
              <Text style={styles.saveText}>
                {save.isPending ? 'กำลังบันทึก…' : 'บันทึก'}
              </Text>
            </Pressable>
          ) : null}
          {savedAt ? (
            <Text style={styles.savedNote}>บันทึกแล้ว {thTime(savedAt)}</Text>
          ) : null}
          {save.isError ? (
            <Text style={styles.errorNote}>
              บันทึกไม่สำเร็จ (อาจไม่มีสัญญาณ) — ข้อความยังอยู่ในเครื่อง ลองกดบันทึกอีกครั้ง
            </Text>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.night },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md, padding: spacing.xl },
  offlineText: { color: colors.nightMuted, textAlign: 'center', fontSize: 14 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  backButton: { width: TOUCH, height: TOUCH, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { color: colors.nightBright, fontWeight: '700', fontSize: 17 },
  headerSub: { color: colors.nightMuted, fontSize: 12 },
  card: {
    backgroundColor: colors.nightCard,
    borderColor: colors.nightLine,
    borderWidth: 1,
    borderRadius: radius.card,
    padding: spacing.md,
  },
  label: {
    color: colors.nightMuted,
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 6,
  },
  ref: { color: colors.nightBright, fontWeight: '700', fontSize: 16 },
  textMain: { color: colors.nightText, fontSize: 14, flex: 1 },
  textMuted: { color: colors.nightMuted, fontSize: 13 },
  divider: { height: 1, backgroundColor: colors.nightLine, marginVertical: spacing.sm },
  checkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: 9,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: colors.nightMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxDone: { backgroundColor: colors.good, borderColor: colors.good },
  doneText: { color: colors.nightMuted, textDecorationLine: 'line-through' },
  input: {
    color: colors.nightBright,
    fontSize: 15,
    minHeight: 72,
    textAlignVertical: 'top',
  },
  saveButton: {
    backgroundColor: '#C99B45',
    borderRadius: radius.button,
    paddingVertical: 14,
    alignItems: 'center',
    minHeight: 48,
  },
  saveText: { color: colors.night, fontWeight: '700', fontSize: 16 },
  savedNote: { color: colors.good, textAlign: 'center', fontSize: 13 },
  errorNote: { color: '#E07A63', textAlign: 'center', fontSize: 13 },
});

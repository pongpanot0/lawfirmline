import React, { useState } from 'react';
import { Alert, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '@/components/AppText';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FileText } from 'lucide-react-native';
import { api } from '@/api/client';
import { openEmailAttachment } from '@/api/files';
import type { EmailThreadDetail, EmailThreadItem } from '@/api/types';
import { Button, Card, ErrorState, LoadingState, Tag } from '@/components/ui';
import { Disclosure } from '@/components/Disclosure';
import { emailThreadsKey } from '@/components/CaseEmailTab';
import { splitQuotedText } from '@lawfirm/shared';
import { thDate, thTime } from '@/format';
import { colors, radius, spacing, pageContent, TOUCH, typeScale } from '@/theme';

type Message = EmailThreadDetail['messages'][number];

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  subject: { ...typeScale.title, color: colors.ink },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  avatar: { width: 40, height: 40, borderRadius: radius.full, backgroundColor: colors.infoSoft, alignItems: 'center', justifyContent: 'center' },
  avatarOut: { backgroundColor: colors.soft },
  avatarText: { ...typeScale.section, color: colors.info },
  sender: { fontWeight: '700', fontSize: 15, lineHeight: 22, color: colors.text },
  when: { ...typeScale.meta, color: colors.muted },
  body: { color: colors.text, fontSize: 15, lineHeight: 24 },
  quoted: { color: colors.muted, fontSize: 14, lineHeight: 22, borderLeftWidth: 2, borderLeftColor: colors.divider, paddingLeft: spacing.sm },
  attachment: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderTopWidth: 1, borderTopColor: colors.divider },
  fileTile: { width: 32, height: 32, borderRadius: radius.md, backgroundColor: colors.infoSoft, alignItems: 'center', justifyContent: 'center' },
});

export default function EmailThreadScreen() {
  const { id, threadId } = useLocalSearchParams<{ id: string; threadId: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [opening, setOpening] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const [showRecipients, setShowRecipients] = useState<Record<string, boolean>>({});
  const [showQuoted, setShowQuoted] = useState<Record<string, boolean>>({});
  const [dismissedHere, setDismissedHere] = useState(false);
  const key = ['case-email-thread', id, threadId];
  const thread = useQuery({ queryKey: key, queryFn: () => api<EmailThreadDetail>(`/cases/${id}/email/threads/${threadId}`), enabled: !!id && !!threadId });
  // Awaiting state lives on the list item, so reuse the list query.
  const list = useQuery({ queryKey: emailThreadsKey(id), queryFn: () => api<EmailThreadItem[]>(`/cases/${id}/email/threads`), enabled: !!id });
  const awaiting = !!list.data?.find((t) => t.id === threadId)?.awaitingReplySince;
  const dismiss = useMutation({
    mutationFn: (dismissed: boolean) => api(`/cases/${id}/email/threads/${threadId}/reply-dismiss`, { method: dismissed ? 'POST' : 'DELETE' }),
    onSuccess: (_result, dismissed) => { setDismissedHere(dismissed); return queryClient.invalidateQueries({ queryKey: emailThreadsKey(id) }); },
    onError: (e) => Alert.alert('บันทึกไม่สำเร็จ', e instanceof Error ? e.message : 'ลองใหม่อีกครั้ง'),
  });

  // One file at a time: each save copies the file; stop at the first failure and say how far it got.
  // Success needs no dialog: the row's "ในเอกสารคดีแล้ว" tag updates after the refetch.
  const saveToCase = async (savingKey: string, ids: string[]) => {
    setSaving(savingKey);
    let saved = 0;
    try {
      for (const attachmentId of ids) {
        await api(`/cases/${id}/email/attachments/${attachmentId}/save-to-documents`, { method: 'POST' });
        saved += 1;
      }
    } catch (e) {
      Alert.alert('บันทึกไม่สำเร็จ', `${ids.length > 1 ? `บันทึกได้ ${saved} จาก ${ids.length} ไฟล์\n` : ''}${e instanceof Error ? e.message : 'ลองใหม่อีกครั้ง'}`);
    } finally {
      setSaving(null);
      thread.refetch();
    }
  };

  if (thread.isLoading) return <View style={styles.screen}><LoadingState label="กำลังโหลดอีเมล…" /></View>;
  if (thread.isError || !thread.data) return <View style={[styles.screen, { padding: spacing.lg }]}><ErrorState message="โหลดอีเมลไม่สำเร็จ" onRetry={() => thread.refetch()} /></View>;
  const messages = [...thread.data.messages].sort((a, b) => a.receivedAt.localeCompare(b.receivedAt));
  const latest = messages[messages.length - 1];
  const older = messages.slice(0, -1);
  const compose = (messageId: string, all: boolean) =>
    router.push({ pathname: '/case/[id]/email/compose', params: { id, threadId, replyTo: messageId, ...(all ? { replyAll: '1' } : {}) } });

  const renderMessage = (m: Message, isLatest: boolean) => {
    const hasMore = m.toAddresses.length + m.ccAddresses.length > 0;
    const unsaved = m.attachments.filter((a) => !a.savedDocumentId);
    const sender = m.fromName || m.fromAddress || '—';
    const body = splitQuotedText(m.bodyText ?? '');
    return <Card key={m.id} style={{ gap: spacing.sm }}>
      <View style={styles.head}>
        <View style={[styles.avatar, m.direction === 'OUTBOUND' && styles.avatarOut]} accessible={false} importantForAccessibility="no-hide-descendants">
          <Text style={[styles.avatarText, m.direction === 'OUTBOUND' && { color: colors.muted }]}>{sender.trim().replace(/^[เแโใไ]/, '').charAt(0).toUpperCase() || '—'}</Text>
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.sender} numberOfLines={2}>{sender}</Text>
          <Text style={styles.when}>{thDate(m.receivedAt)} {thTime(m.receivedAt)}</Text>
        </View>
        {m.direction === 'OUTBOUND' && <Tag tone="info">ส่งออก</Tag>}
      </View>
      {hasMore && <Pressable accessibilityRole="button" accessibilityState={{ expanded: !!showRecipients[m.id] }}
        onPress={() => setShowRecipients((s) => ({ ...s, [m.id]: !s[m.id] }))} style={{ minHeight: TOUCH, justifyContent: 'center', alignSelf: 'flex-start' }}>
        <Text style={{ color: colors.info, fontSize: 13 }}>{showRecipients[m.id] ? 'ซ่อนผู้รับ' : `ถึง ${m.toAddresses.length} คน${m.ccAddresses.length ? ` · สำเนา ${m.ccAddresses.length}` : ''} · ดูผู้รับ`}</Text>
      </Pressable>}
      {showRecipients[m.id] && <View>
        <Text style={{ color: colors.muted, fontSize: 13 }}>ถึง: {m.toAddresses.join(', ') || '—'}</Text>
        {m.ccAddresses.length > 0 && <Text style={{ color: colors.muted, fontSize: 13 }}>สำเนา: {m.ccAddresses.join(', ')}</Text>}
      </View>}
      <Text style={styles.body} selectable>{body.main || '(ไม่มีข้อความ)'}</Text>
      {body.quoted && <Pressable accessibilityRole="button" accessibilityState={{ expanded: !!showQuoted[m.id] }}
        onPress={() => setShowQuoted((s) => ({ ...s, [m.id]: !s[m.id] }))} style={{ minHeight: TOUCH, justifyContent: 'center', alignSelf: 'flex-start' }}>
        <Text style={{ color: colors.info, fontSize: 13 }}>{showQuoted[m.id] ? 'ซ่อนข้อความก่อนหน้า' : 'แสดงข้อความก่อนหน้า'}</Text>
      </Pressable>}
      {body.quoted && showQuoted[m.id] && <Text style={styles.quoted} selectable>{body.quoted}</Text>}
      {m.attachments.map((a) => <View key={a.id} style={styles.attachment}>
        <Pressable accessibilityRole="button" accessibilityLabel={`เปิดไฟล์แนบ ${a.filename}`} accessibilityState={{ busy: opening === a.id }} disabled={opening === a.id}
          onPress={async () => {
            setOpening(a.id);
            try { await openEmailAttachment(a.id, a.filename); }
            catch (e) { Alert.alert('เปิดไฟล์ไม่สำเร็จ', e instanceof Error ? e.message : 'ลองใหม่อีกครั้ง'); }
            finally { setOpening(null); }
          }}
          style={({ pressed }) => [{ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 48 }, pressed && { opacity: 0.6 }]}>
          <View style={styles.fileTile}><FileText size={16} color={colors.info} /></View>
          <Text style={{ flex: 1, color: colors.info }} numberOfLines={2}>{opening === a.id ? 'กำลังดาวน์โหลด…' : a.filename}</Text>
        </Pressable>
        {a.savedDocumentId
          ? <Tag tone="ok">ในเอกสารคดีแล้ว</Tag>
          : <Pressable accessibilityRole="button" accessibilityLabel={`บันทึก ${a.filename} เข้าเอกสารคดี`} accessibilityState={{ busy: saving === a.id, disabled: saving !== null }}
              disabled={saving !== null} onPress={() => saveToCase(a.id, [a.id])}
              style={({ pressed }) => [{ minHeight: TOUCH, justifyContent: 'center', paddingHorizontal: spacing.sm, opacity: saving !== null ? 0.5 : 1 }, pressed && { opacity: 0.6 }]}>
              <Text style={{ color: colors.info, fontWeight: '600', fontSize: 13 }}>{saving === a.id ? 'กำลังบันทึก…' : 'บันทึกเข้าคดี'}</Text>
            </Pressable>}
      </View>)}
      {unsaved.length > 1 && <Button title={`บันทึกไฟล์แนบทั้งหมดเข้าคดี (${unsaved.length})`} variant="link" busy={saving === `all-${m.id}`}
        disabled={saving !== null} onPress={() => saveToCase(`all-${m.id}`, unsaved.map((a) => a.id))} />}
      {isLatest && <View style={{ gap: spacing.xs, marginTop: spacing.xs }}>
        <Button title="ตอบกลับ" onPress={() => compose(m.id, false)} />
        {m.toAddresses.length + m.ccAddresses.length > 1 && <Button title="ตอบทั้งหมด" variant="secondary" onPress={() => compose(m.id, true)} />}
      </View>}
    </Card>;
  };

  return <>
    <Stack.Screen options={{ title: 'อีเมล' }} />
    <ScrollView style={styles.screen} contentContainerStyle={{ ...pageContent, gap: spacing.md }}
      refreshControl={<RefreshControl refreshing={thread.isRefetching} onRefresh={() => { thread.refetch(); list.refetch(); }} />}>
      <Text accessibilityRole="header" style={styles.subject}>{thread.data.subject || '(ไม่มีหัวเรื่อง)'}</Text>
      {awaiting && latest && <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.sm }}>
        <Tag tone="due">รอตอบ</Tag>
        <Button title="ไม่ต้องตอบ" variant="link" busy={dismiss.isPending} disabled={dismiss.isPending} onPress={() => dismiss.mutate(true)} />
      </View>}
      {!awaiting && dismissedHere && <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.sm }}>
        <Text style={{ color: colors.muted }}>ทำเครื่องหมายว่าไม่ต้องตอบแล้ว</Text>
        <Button title="เลิกทำ" variant="link" busy={dismiss.isPending} disabled={dismiss.isPending} onPress={() => dismiss.mutate(false)} />
      </View>}
      {older.length > 0 && <Disclosure variant="plain" title={`ข้อความก่อนหน้า ${older.length} ฉบับ`}>
        {older.map((m) => renderMessage(m, false))}
      </Disclosure>}
      {latest && renderMessage(latest, true)}
    </ScrollView>
  </>;
}

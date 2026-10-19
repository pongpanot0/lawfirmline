import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/components/AppText';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Mail, Paperclip } from 'lucide-react-native';
import { api } from '@/api/client';
import type { EmailThreadItem } from '@/api/types';
import { Button, Card, EmptyState, ErrorState, InlineError, LoadingState, Tag } from '@/components/ui';
import { timeAgo } from '@/format';
import { colors, radius, spacing } from '@/theme';

export const emailThreadsKey = (caseId: string) => ['case-email-threads', caseId];

/** Email tab of the case screen: thread list + the one primary action, compose. */
export function CaseEmailTab({ caseId }: { caseId: string }) {
  const router = useRouter();
  const threads = useQuery({
    queryKey: emailThreadsKey(caseId),
    queryFn: () => api<EmailThreadItem[]>(`/cases/${caseId}/email/threads`),
    enabled: !!caseId,
  });
  return <>
    <Button title="เขียนอีเมล" onPress={() => router.push(`/case/${caseId}/email/compose`)} />
    {threads.isError && !threads.data && <View style={styles.gap}><ErrorState message="โหลดอีเมลไม่สำเร็จ" onRetry={() => threads.refetch()} /></View>}
    {threads.isError && !!threads.data && <View style={styles.gap}><InlineError message="โหลดอีเมลไม่สำเร็จ" onRetry={() => threads.refetch()} /></View>}
    {!(threads.isError && !threads.data) && <Card style={styles.list}>
      {threads.isLoading ? <LoadingState inline label="กำลังโหลดอีเมล…" />
        : (threads.data?.length ?? 0) === 0 ? <EmptyState compact>ยังไม่มีอีเมลในคดีนี้ · ผูกโฟลเดอร์ Outlook ได้ที่เว็บ</EmptyState>
        : threads.data!.map((t, i) => <Pressable key={t.id} accessibilityRole="button" accessibilityLabel={`เปิดอีเมล ${t.subject}`}
            onPress={() => router.push(`/case/${caseId}/email/${t.id}`)}
            style={({ pressed }) => [styles.row, i > 0 && styles.rowLine, pressed && { backgroundColor: colors.soft }]}>
            <View style={[styles.icon, t.awaitingReplySince ? { backgroundColor: colors.warnSoft } : null]}>
              <Mail size={18} color={t.awaitingReplySince ? colors.warn : colors.info} />
            </View>
            <View style={styles.body}>
              <Text style={styles.subject} numberOfLines={2}>{t.subject || '(ไม่มีหัวเรื่อง)'}</Text>
              <Text style={styles.from} numberOfLines={1}>{t.fromName || t.fromAddress || '—'}</Text>
              <View style={styles.meta}>
                <Text style={styles.metaText}>{timeAgo(t.lastMessageAt)}</Text>
                {t.attachmentCount > 0 && <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
                  <Paperclip size={12} color={colors.faint} /><Text style={styles.metaText}>{t.attachmentCount}</Text></View>}
                {t.awaitingReplySince && <Tag tone="due">รอตอบ</Tag>}
              </View>
            </View>
          </Pressable>)}
    </Card>}
  </>;
}

const styles = StyleSheet.create({
  gap: { marginTop: spacing.md },
  list: { marginTop: spacing.md, paddingVertical: spacing.xs },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md, minHeight: 56, paddingVertical: spacing.md },
  rowLine: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.divider },
  icon: { width: 36, height: 36, borderRadius: radius.md, backgroundColor: colors.infoSoft, alignItems: 'center', justifyContent: 'center' },
  body: { flex: 1, minWidth: 0, gap: 2 },
  subject: { color: colors.text, fontWeight: '600', fontSize: 15, lineHeight: 22 },
  from: { color: colors.muted, fontSize: 13 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap', marginTop: 2 },
  metaText: { color: colors.faint, fontSize: 12 },
});

import React from 'react';
import { Pressable, View } from 'react-native';
import { Text } from '@/components/AppText';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Paperclip } from 'lucide-react-native';
import { api } from '@/api/client';
import type { EmailThreadItem } from '@/api/types';
import { Button, Card, EmptyNote, ErrorNote, Tag } from '@/components/ui';
import { timeAgo } from '@/format';
import { colors, spacing } from '@/theme';

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
    {threads.isError && <ErrorNote message="โหลดอีเมลไม่สำเร็จ" onRetry={() => threads.refetch()} />}
    <Card style={{ marginTop: spacing.md }}>
      {threads.isLoading ? <EmptyNote>กำลังโหลด…</EmptyNote>
        : threads.isError && !threads.data ? null
        : (threads.data?.length ?? 0) === 0 ? <EmptyNote>ยังไม่มีอีเมลในคดีนี้ — ผูก folder Outlook ได้ที่เว็บ</EmptyNote>
        : threads.data!.map((t, i) => <View key={t.id}>
          {i > 0 && <View style={{ height: 1, backgroundColor: colors.soft, marginVertical: 6 }} />}
          <Pressable accessibilityRole="button" accessibilityLabel={`เปิดอีเมล ${t.subject}`}
            onPress={() => router.push(`/case/${caseId}/email/${t.id}`)}
            style={({ pressed }) => [{ minHeight: 56, paddingVertical: spacing.sm, gap: 2 }, pressed && { opacity: 0.7 }]}>
            <Text style={{ color: colors.text, fontWeight: '600', fontSize: 15 }} numberOfLines={2}>{t.subject || '(ไม่มีหัวเรื่อง)'}</Text>
            <Text style={{ color: colors.muted, fontSize: 13 }} numberOfLines={1}>{t.fromName || t.fromAddress || '—'}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' }}>
              <Text style={{ color: colors.faint, fontSize: 12 }}>{timeAgo(t.lastMessageAt)}</Text>
              {t.attachmentCount > 0 && <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
                <Paperclip size={12} color={colors.faint} /><Text style={{ color: colors.faint, fontSize: 12 }}>{t.attachmentCount}</Text></View>}
              {t.awaitingReplySince && <Tag tone="due">รอตอบ</Tag>}
            </View>
          </Pressable>
        </View>)}
    </Card>
  </>;
}

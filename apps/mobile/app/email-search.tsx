import React, { useState } from 'react';
import { Keyboard, Pressable, View } from 'react-native';
import { Text } from '@/components/AppText';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Paperclip } from 'lucide-react-native';
import { api } from '@/api/client';
import { FormField, FormPage, FormSection } from '@/components/Form';
import { Button, Card, EmptyNote, ErrorNote, PageIntro, Tag } from '@/components/ui';
import { thDate, thTime } from '@/format';
import { colors, spacing } from '@/theme';

interface EmailSearchResult {
  id: string; subject: string; fromName: string | null; fromAddress: string | null; lastMessageAt: string;
  intakeId: string | null; case: { id: string; ownRef: string; title: string } | null;
  messageCount: number; attachmentCount: number; excerpt: string;
}

const MAX_RESULTS = 50;

export default function EmailSearchScreen() {
  const router = useRouter();
  const [text, setText] = useState('');
  const [query, setQuery] = useState('');
  const results = useQuery({ queryKey: ['email-search', query], enabled: query.length >= 2, retry: false,
    queryFn: () => api<EmailSearchResult[]>(`/email/search?q=${encodeURIComponent(query)}`) });
  const tooShort = text.trim().length < 2;

  return <FormPage>
    <PageIntro title="ค้นหาอีเมล" detail="ค้นจากทุกคดีที่คุณเข้าถึงได้" />
    <FormSection title="คำที่ต้องการค้น">
      <FormField label="ชื่อลูกความ อีเมล หัวเรื่อง เลขคดี ข้อความ หรือชื่อไฟล์แนบ" value={text} onChange={setText} placeholder="เช่น สมชาย, สัญญาเช่า" />
      <Button title="ค้นหาอีเมล" disabled={tooShort} onPress={() => {
        Keyboard.dismiss();
        const next = text.trim(); if (next === query) void results.refetch(); else setQuery(next);
      }} />
      {tooShort && !!text.trim() && <Text style={{ color: colors.muted, fontSize: 13 }}>พิมพ์อย่างน้อย 2 ตัวอักษร</Text>}
    </FormSection>
    {!query && <EmptyNote>ผลลัพธ์แสดงอีเมลล่าสุดก่อน แตะเพื่อเปิดอ่านและตอบกลับ</EmptyNote>}
    {results.isLoading && !!query && <Text style={{ color: colors.muted }}>กำลังค้นหา…</Text>}
    {results.isError && <ErrorNote message="ค้นอีเมลไม่สำเร็จ" onRetry={() => results.refetch()} />}
    {results.data && !results.data.length && <EmptyNote>ไม่พบอีเมลที่มีคำว่า "{query}" · ลองคำอื่น เช่น ชื่อบริษัท</EmptyNote>}
    {results.data?.length === MAX_RESULTS && <Text style={{ color: colors.muted, fontSize: 13 }}>แสดง {MAX_RESULTS} ฉบับล่าสุด · พิมพ์ให้เจาะจงขึ้นเพื่อหาอีเมลที่เก่ากว่า</Text>}
    {results.data?.map((r) => {
      const caseId = r.case?.id;
      return <Pressable key={r.id} accessibilityRole="button" disabled={!caseId}
        accessibilityLabel={`อีเมล ${r.subject || 'ไม่มีหัวเรื่อง'} จาก ${r.fromName || r.fromAddress || 'ไม่ทราบผู้ส่ง'}`}
        onPress={() => caseId && router.push({ pathname: '/case/[id]/email/[threadId]', params: { id: caseId, threadId: r.id } })}>
        <Card style={{ gap: spacing.xs }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
            <Text style={{ flex: 1, color: colors.ink, fontWeight: '700' }} numberOfLines={2}>{r.subject || '(ไม่มีหัวเรื่อง)'}</Text>
            {r.attachmentCount > 0 && <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
              <Paperclip size={14} color={colors.muted} /><Text style={{ color: colors.muted, fontSize: 12 }}>{r.attachmentCount}</Text>
            </View>}
          </View>
          <Text style={{ color: colors.muted, fontSize: 13 }} numberOfLines={1}>
            {r.fromName || r.fromAddress || '—'} · {thDate(r.lastMessageAt)} {thTime(r.lastMessageAt)}{r.messageCount > 1 ? ` · ${r.messageCount} ฉบับ` : ''}
          </Text>
          {!!r.excerpt && <Text style={{ color: colors.text, fontSize: 13 }} numberOfLines={2}>{r.excerpt}</Text>}
          <View style={{ flexDirection: 'row' }}>
            {r.case
              ? <Tag tone="info">{`${r.case.ownRef} · ${r.case.title}`}</Tag>
              : <Tag>{r.intakeId ? 'รับเรื่องแล้ว · เปิดดูที่เว็บ' : 'ยังไม่ผูกคดี · เปิดดูที่เว็บ'}</Tag>}
          </View>
        </Card>
      </Pressable>;
    })}
  </FormPage>;
}

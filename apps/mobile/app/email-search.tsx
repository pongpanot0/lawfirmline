import React, { useState } from 'react';
import { Keyboard, Pressable, View } from 'react-native';
import { Text } from '@/components/AppText';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { ChevronRight, Paperclip } from 'lucide-react-native';
import { api } from '@/api/client';
import { FormPage } from '@/components/Form';
import { Card, EmptyNote, ErrorNote, Loading, PageIntro, SearchBox, Tag } from '@/components/ui';
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
  const [triedShort, setTriedShort] = useState(false);
  const search = () => {
    if (tooShort) { setTriedShort(true); return; }
    setTriedShort(false);
    Keyboard.dismiss();
    const next = text.trim(); if (next === query) void results.refetch(); else setQuery(next);
  };

  return <FormPage>
    <PageIntro detailOnly title="ค้นหาอีเมล" detail="ค้นจากทุกคดีที่คุณเข้าถึงได้ · อีเมลล่าสุดขึ้นก่อน" />
    <SearchBox value={text} onChange={(v) => { setText(v); setTriedShort(false); }} onSearch={search} onClear={() => setQuery('')}
      placeholder="ชื่อลูกความ อีเมล เลขคดี หรือชื่อไฟล์" />
    {(!query || triedShort) && <Text accessibilityLiveRegion="polite" style={{ color: triedShort ? colors.warn : colors.muted, fontSize: 13 }}>พิมพ์อย่างน้อย 2 ตัวอักษรเพื่อค้นหา</Text>}
    {results.isLoading && !!query && <Loading label="กำลังค้นหา…" />}
    {results.isError && <ErrorNote message="ค้นอีเมลไม่สำเร็จ" onRetry={() => results.refetch()} />}
    {results.data && !results.data.length && <EmptyNote>ไม่พบอีเมลที่มีคำว่า "{query}" · ลองคำอื่น เช่น ชื่อบริษัท</EmptyNote>}
    {results.data?.length === MAX_RESULTS && <Text style={{ color: colors.muted, fontSize: 13 }}>แสดง {MAX_RESULTS} ฉบับล่าสุด · พิมพ์ให้เจาะจงขึ้นเพื่อหาอีเมลที่เก่ากว่า</Text>}
    {results.data?.map((r) => {
      const caseId = r.case?.id;
      const body = <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
        <View style={{ flex: 1, minWidth: 0, gap: spacing.xs }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
            <Text style={{ flex: 1, color: caseId ? colors.ink : colors.muted, fontWeight: '700' }} numberOfLines={2}>{r.subject || '(ไม่มีหัวเรื่อง)'}</Text>
            {r.attachmentCount > 0 && <View accessibilityLabel={`ไฟล์แนบ ${r.attachmentCount} ไฟล์`} style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
              <Paperclip size={14} color={colors.muted} /><Text style={{ color: colors.muted, fontSize: 12 }}>{r.attachmentCount}</Text>
            </View>}
          </View>
          <Text style={{ color: colors.muted, fontSize: 13 }} numberOfLines={1}>
            {r.fromName || r.fromAddress || '—'} · {thDate(r.lastMessageAt)} {thTime(r.lastMessageAt)}{r.messageCount > 1 ? ` · ${r.messageCount} ฉบับ` : ''}
          </Text>
          {!!r.excerpt && <Text style={{ color: caseId ? colors.text : colors.muted, fontSize: 13 }} numberOfLines={2}>{r.excerpt}</Text>}
          <View style={{ flexDirection: 'row' }}>
            {r.case
              ? <Tag tone="info">{`${r.case.ownRef} · ${r.case.title}`}</Tag>
              : <Tag>{r.intakeId ? 'รับเรื่องแล้ว · เปิดดูที่เว็บ' : 'ยังไม่ผูกคดี · เปิดดูที่เว็บ'}</Tag>}
          </View>
        </View>
        {caseId ? <ChevronRight size={18} color={colors.faint} /> : null}
      </View>;
      const label = `อีเมล ${r.subject || 'ไม่มีหัวเรื่อง'} จาก ${r.fromName || r.fromAddress || 'ไม่ทราบผู้ส่ง'}`;
      // Unlinked threads open only on the web, so they render as plain, dimmed rows.
      if (!caseId) return <View key={r.id} accessible accessibilityLabel={`${label} · ยังไม่ผูกคดี เปิดดูที่เว็บ`}><Card style={{ backgroundColor: colors.bg }}>{body}</Card></View>;
      return <Pressable key={r.id} accessibilityRole="button" accessibilityLabel={label}
        onPress={() => router.push({ pathname: '/case/[id]/email/[threadId]', params: { id: caseId, threadId: r.id } })}
        style={({ pressed }) => pressed && { opacity: 0.7 }}>
        <Card>{body}</Card>
      </Pressable>;
    })}
  </FormPage>;
}

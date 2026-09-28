import React, { useEffect, useState } from 'react';
import { Alert, Image, Keyboard, View } from 'react-native';
import { Text } from '@/components/AppText';
import { useRouter } from 'expo-router';
import { useInfiniteQuery } from '@tanstack/react-query';
import { api, API_URL, getTokens } from '@/api/client';
import { openCaseDocument, openTaskAttachment } from '@/api/files';
import { FormField, FormPage } from '@/components/Form';
import { Button, Card, EmptyNote, ErrorNote } from '@/components/ui';
import { thDate } from '@/format';
import { colors, spacing } from '@/theme';

interface FileResult { id: string; filename: string; mimeType: string; size: number | null; updatedAt: string;
  source: 'CASE' | 'TASK'; case: { id: string; ownRef: string; title: string } | null;
  task: { id: string; title: string } | null }
interface FilePage { items: FileResult[]; nextOffset: number | null }

export default function FileSearchScreen() {
  const router = useRouter();
  const [text, setText] = useState('');
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [headers, setHeaders] = useState<Record<string, string>>({});
  const [opening, setOpening] = useState<string | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);
  const files = useInfiniteQuery({ queryKey: ['file-search', query], enabled: !!query, retry: false,
    initialPageParam: 0,
    queryFn: ({ pageParam }) => api<FilePage>(`/documents/files?q=${encodeURIComponent(query)}&offset=${pageParam}`),
    getNextPageParam: page => page.nextOffset ?? undefined });
  useEffect(() => {
    getTokens().then(tokens => setHeaders(tokens.accessToken ? { Authorization: `Bearer ${tokens.accessToken}` } : {})).catch(() => setHeaders({}));
  }, [files.dataUpdatedAt]);
  const rows = [...new Map((files.data?.pages.flatMap(page => page.items) ?? []).map(file => [`${file.source}:${file.id}`, file])).values()];
  return <FormPage>
    <FormField label="ค้นชื่อไฟล์ในคดีและงานที่คุณเข้าถึงได้" value={text} onChange={setText} placeholder="พิมพ์ชื่อไฟล์บางส่วน…" />
    <Button title="ค้นหาไฟล์" disabled={!text.trim()} onPress={() => {
      Keyboard.dismiss();
      const next = text.trim(); if (next === query) void files.refetch(); else setQuery(next);
      setExpanded(null);
    }} />
    {!query && <EmptyNote>ค้นจากชื่อไฟล์ แล้วเลือกดูตัวอย่างหรือเปิดไฟล์ต้นฉบับ</EmptyNote>}
    {files.isLoading && !!query && <Text style={{ color: colors.muted }}>กำลังค้นหา…</Text>}
    {files.isError && <ErrorNote message="ค้นไฟล์ไม่สำเร็จ" onRetry={() => files.refetch()} />}
    {files.data && <Text style={{ color: colors.muted }}>แสดง {rows.length} ไฟล์{files.hasNextPage ? ' · ยังมีผลค้นหาเพิ่มเติม' : ''}</Text>}
    {files.data && !rows.length && <EmptyNote>ไม่พบชื่อไฟล์ที่ตรงกัน · ลองชื่อสั้นลง</EmptyNote>}
    {rows.map(file => <Card key={`${file.source}:${file.id}`}>
      <Text style={{ color: colors.ink, fontWeight: '700' }}>{file.filename}</Text>
      <Text style={{ color: colors.muted, marginVertical: spacing.sm }}>{file.case ? `${file.case.ownRef} · ${file.case.title}` : 'งานทั่วไป'}{file.task ? ` · งาน: ${file.task.title}` : ''}</Text>
      <Button title={expanded === file.id ? 'ย่อตัวอย่าง' : 'ดูตัวอย่าง / รายละเอียด'} ghost onPress={() => { setImageError(null); setExpanded(expanded === file.id ? null : file.id); }} />
      {expanded === file.id && <View style={{ gap: spacing.sm, marginTop: spacing.sm }}>
        <Text style={{ color: colors.muted }}>{file.mimeType}{file.size != null ? ` · ${(file.size / 1024).toFixed(0)} KB` : ''} · {thDate(file.updatedAt)}</Text>
        {file.mimeType.startsWith('image/') && !!headers.Authorization && <Image accessibilityLabel={`ตัวอย่าง ${file.filename}`}
          source={{ uri: `${API_URL}${file.task ? `/tasks/${file.task.id}/attachments/${file.id}/download` : `/cases/${file.case!.id}/documents/${file.id}/download`}`, headers }} onError={() => setImageError(file.id)} resizeMode="contain" style={{ width: '100%', height: 200 }} />}
        {imageError === file.id && <Text style={{ color: colors.warn }}>ตัวอย่างรูปโหลดไม่ได้ · ลองเปิดไฟล์ต้นฉบับ</Text>}
        <Button title="เปิดไฟล์ต้นฉบับ" busy={opening === file.id} onPress={async () => {
          setOpening(file.id);
          try {
            if (file.task) await openTaskAttachment(file.task.id, file.id, file.filename);
            else if (file.case) await openCaseDocument(file.case.id, file.id, file.filename);
          }
          catch (e) { Alert.alert('เปิดไฟล์ไม่ได้', e instanceof Error ? e.message : 'ลองใหม่อีกครั้ง'); }
          finally { setOpening(null); }
        }} />
        {file.task && <Button title="เปิดงานที่แนบไฟล์" ghost onPress={() => router.push(`/task/new?id=${file.task!.id}`)} />}
        {file.case && <Button title="เข้าแฟ้มคดี" ghost onPress={() => router.push(`/case/${file.case!.id}?section=documents`)} />}
      </View>}
    </Card>)}
    {files.hasNextPage && <Button title="ดูผลค้นหาเพิ่มเติม" ghost busy={files.isFetchingNextPage} onPress={() => { void files.fetchNextPage(); }} />}
  </FormPage>;
}

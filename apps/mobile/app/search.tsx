import React, { useEffect, useState } from 'react';
import { Image, Keyboard, Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/components/AppText';
import { useRouter } from 'expo-router';
import { useInfiniteQuery } from '@tanstack/react-query';
import { FileText } from 'lucide-react-native';
import { api, API_URL, getTokens } from '@/api/client';
import { openCaseDocument, openTaskAttachment } from '@/api/files';
import { FormPage } from '@/components/Form';
import { Button, Card, EmptyNote, ErrorNote, Loading, PageIntro, SearchBox } from '@/components/ui';
import { thDate } from '@/format';
import { colors, spacing, TOUCH } from '@/theme';

interface FileResult { id: string; filename: string; mimeType: string; size: number | null; updatedAt: string;
  source: 'CASE' | 'TASK'; case: { id: string; ownRef: string; title: string } | null;
  task: { id: string; title: string } | null }
interface FilePage { items: FileResult[]; nextOffset: number | null }

function kindLabel(mime: string) {
  if (mime === 'application/pdf') return 'PDF';
  if (mime.startsWith('image/')) return 'รูปภาพ';
  if (mime.includes('wordprocessingml') || mime === 'application/msword') return 'Word';
  if (mime.includes('spreadsheetml') || mime === 'application/vnd.ms-excel') return 'Excel';
  if (mime.startsWith('text/')) return 'ข้อความ';
  return 'ไฟล์';
}

export default function FileSearchScreen() {
  const router = useRouter();
  const [text, setText] = useState('');
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [headers, setHeaders] = useState<Record<string, string>>({});
  const [opening, setOpening] = useState<string | null>(null);
  const [openError, setOpenError] = useState<string | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);
  const files = useInfiniteQuery({ queryKey: ['file-search', query], enabled: !!query, retry: false,
    initialPageParam: 0,
    queryFn: ({ pageParam }) => api<FilePage>(`/documents/files?q=${encodeURIComponent(query)}&offset=${pageParam}`),
    getNextPageParam: page => page.nextOffset ?? undefined });
  useEffect(() => {
    getTokens().then(tokens => setHeaders(tokens.accessToken ? { Authorization: `Bearer ${tokens.accessToken}` } : {})).catch(() => setHeaders({}));
  }, [files.dataUpdatedAt]);
  const rows = [...new Map((files.data?.pages.flatMap(page => page.items) ?? []).map(file => [`${file.source}:${file.id}`, file])).values()];
  const search = () => {
    const next = text.trim();
    if (!next) return;
    Keyboard.dismiss();
    if (next === query) void files.refetch(); else setQuery(next);
    setExpanded(null); setOpenError(null);
  };
  const open = async (file: FileResult) => {
    setOpening(file.id); setOpenError(null);
    try {
      if (file.task) await openTaskAttachment(file.task.id, file.id, file.filename);
      else if (file.case) await openCaseDocument(file.case.id, file.id, file.filename);
    } catch { setOpenError(file.id); }
    finally { setOpening(null); }
  };
  return <FormPage>
    <PageIntro detailOnly title="ค้นหาไฟล์" detail="ค้นชื่อไฟล์ในคดีและงานที่คุณมีสิทธิ์เข้าถึง · แตะไฟล์เพื่อเปิด" />
    <SearchBox value={text} onChange={setText} onSearch={search} onClear={() => { setQuery(''); setExpanded(null); }} placeholder="พิมพ์ชื่อไฟล์บางส่วน" />
    {files.isLoading && !!query && <Loading label="กำลังค้นหา…" />}
    {files.isError && <ErrorNote message="ค้นไฟล์ไม่สำเร็จ" onRetry={() => files.refetch()} />}
    {files.data && !!rows.length && <Text style={{ color: colors.muted }}>พบ {rows.length} ไฟล์{files.hasNextPage ? ' · ยังมีผลค้นหาเพิ่มเติม' : ''}</Text>}
    {files.data && !rows.length && <EmptyNote>ไม่พบชื่อไฟล์ที่ตรงกัน · ลองชื่อสั้นลง</EmptyNote>}
    {rows.length > 0 && <Card style={{ paddingVertical: 0 }}>
      {rows.map((file, index) => {
        const key = `${file.source}:${file.id}`;
        const isOpen = expanded === key;
        return <View key={key} style={[styles.row, index > 0 && styles.rowLine]}>
          <Pressable accessibilityRole="button" accessibilityLabel={`เปิด ${file.filename}`} accessibilityState={{ busy: opening === file.id }}
            disabled={!!opening} onPress={() => open(file)} style={({ pressed }) => [styles.body, pressed && { opacity: 0.6 }]}>
            <FileText size={18} color={colors.muted} />
            <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
              <Text style={{ color: colors.ink, fontWeight: '700' }} numberOfLines={2}>{file.filename}</Text>
              <Text style={styles.meta} numberOfLines={2}>
                {opening === file.id ? 'กำลังเปิด…' : `${kindLabel(file.mimeType)} · ${file.case ? `${file.case.ownRef} · ${file.case.title}` : 'งานทั่วไป'}${file.task ? ` · งาน: ${file.task.title}` : ''}`}
              </Text>
            </View>
          </Pressable>
          {openError === file.id && <Text accessibilityRole="alert" style={{ color: colors.warn, fontSize: 13 }}>เปิดไฟล์ไม่ได้ · ลองใหม่อีกครั้ง</Text>}
          <View style={styles.links}>
            <Button title={isOpen ? 'ซ่อนรายละเอียด' : 'รายละเอียด'} variant="link" onPress={() => { setImageError(null); setExpanded(isOpen ? null : key); }} />
            {file.task
              ? <Button title="เปิดงาน" variant="link" onPress={() => router.push(`/task/new?id=${file.task!.id}`)} />
              : file.case ? <Button title="เข้าแฟ้มคดี" variant="link" onPress={() => router.push(`/case/${file.case!.id}?section=documents`)} /> : null}
          </View>
          {isOpen && <View style={{ gap: spacing.sm, paddingBottom: spacing.sm }}>
            <Text style={styles.meta}>{kindLabel(file.mimeType)}{file.size != null ? ` · ${(file.size / 1024).toFixed(0)} KB` : ''} · แก้ล่าสุด {thDate(file.updatedAt)}</Text>
            {file.mimeType.startsWith('image/') && !!headers.Authorization && <Image accessibilityLabel={`ตัวอย่าง ${file.filename}`}
              source={{ uri: `${API_URL}${file.task ? `/tasks/${file.task.id}/attachments/${file.id}/download` : `/cases/${file.case!.id}/documents/${file.id}/download`}`, headers }} onError={() => setImageError(file.id)} resizeMode="contain" style={{ width: '100%', height: 200 }} />}
            {imageError === file.id && <Text style={{ color: colors.warn }}>ตัวอย่างรูปโหลดไม่ได้ · แตะชื่อไฟล์เพื่อเปิดต้นฉบับ</Text>}
          </View>}
        </View>;
      })}
    </Card>}
    {files.hasNextPage && <Button title="ดูผลค้นหาเพิ่มเติม" variant="secondary" busy={files.isFetchingNextPage} onPress={() => { void files.fetchNextPage(); }} />}
  </FormPage>;
}

const styles = StyleSheet.create({
  row: { paddingTop: spacing.sm },
  rowLine: { borderTopWidth: 1, borderTopColor: colors.line },
  body: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: TOUCH },
  meta: { color: colors.muted, fontSize: 13, lineHeight: 20 },
  links: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
});

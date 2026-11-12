'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { mailDateGroup } from '@/lib/journey-mail';
import { ArrowLeft, Mail, Paperclip } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { api, ApiError, EmailThreadListItem } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge, type BadgeProps } from '@/components/ui/badge';
import { PageHeader } from '@/components/samnuan/PageHeader';
import { getPageGuide } from '@/components/guide/page-guides';
import { EmptyState, PageLoading } from '@/components/ui/misc';
import { LoadFailed } from '@/components/ui/LoadFailed';
import { SearchHint } from '@/components/guide/SearchHint';
import { confirmDialog } from '@/lib/confirm-dialog';

const STATUS_LABELS: Record<string, string> = {
  PENDING_INTAKE: 'รอรับเรื่อง',
  LINKED: 'รับเรื่องแล้ว',
  ARCHIVED: 'เก็บถาวร',
};

const STATUS_VARIANT: Record<string, BadgeProps['variant']> = {
  PENDING_INTAKE: 'warning',
  LINKED: 'success',
  ARCHIVED: 'muted',
};

function formatDateTime(date: string) {
  return new Date(date).toLocaleString('th-TH', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function EmailIntakeList() {
  const pathname = usePathname();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('ALL');
  const { token } = useAuth();
  const [threads, setThreads] = useState<EmailThreadListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [linkingId, setLinkingId] = useState<string | null>(null);
  const [linkError, setLinkError] = useState('');
  const attach = async (threadId: string, intakeId: string) => {
    if (!token) return;
    setLinkingId(threadId);
    setLinkError('');
    try {
      await api.attachThreadToIntake(token, threadId, intakeId);
      setReloadKey((key) => key + 1);
      window.dispatchEvent(new CustomEvent('email-intake-thread-changed', { detail: threadId }));
    } catch (error) {
      setLinkError(error instanceof ApiError ? error.message : 'รวมเข้าเรื่องเดิมไม่สำเร็จ ลองใหม่อีกครั้ง');
    } finally { setLinkingId(null); }
  };

  useEffect(() => {
    const refreshList = () => setReloadKey((key) => key + 1);
    window.addEventListener('email-intake-changed', refreshList);
    return () => window.removeEventListener('email-intake-changed', refreshList);
  }, []);

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    setLoadError(false);
    api
      .getEmailThreads(token)
      .then(setThreads)
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false));
  }, [token, reloadKey]);

  const visibleThreads = threads.filter((thread) => (filter === 'ALL' || thread.status === filter) && [thread.subject, thread.fromName, thread.fromAddress, thread.bodyExcerpt].some((value) => value?.toLowerCase().includes(search.toLowerCase())));

  // On a thread, the queue is one click away: back to the full list (not a dropdown).
  if (pathname !== '/email-intake') return <Link href="/email-intake" className="flex min-h-11 w-fit items-center gap-2 rounded-lg border bg-card px-3 text-sm font-medium shadow-sm hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
    <ArrowLeft className="h-4 w-4" aria-hidden />กลับไปรายการอีเมล{threads.length > 0 && <span className="text-muted-foreground">({threads.length})</span>}
  </Link>;

  return (
    <div>
      <PageHeader title="รับเรื่องจากอีเมล" description="เลือกอีเมลเพื่อตรวจและรับเรื่อง" />
      <Card className="mb-3"><CardContent className="p-3">
      <div className="mb-2 flex flex-wrap items-center gap-2"><input aria-label="ค้นหาอีเมล" aria-describedby="email-intake-search-hint" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="ค้นหาอีเมล" className="min-h-11 min-w-0 flex-1 rounded-md border bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" /><SearchHint id="email-intake-search-hint">{getPageGuide('/email-intake')?.searchHint}</SearchHint></div>
      <div className="flex flex-wrap gap-1">{[['ALL', 'ทั้งหมด'], ['PENDING_INTAKE', 'รอรับเรื่อง'], ['LINKED', 'รับเรื่องแล้ว']].map(([value, label]) => <Button key={value} size="sm" className="min-h-11" variant={filter === value ? 'default' : 'ghost'} onClick={() => setFilter(value)}>{label}</Button>)}</div></CardContent></Card>

      {linkError && <p role="alert" className="mb-4 text-sm text-destructive">{linkError}</p>}
      <Card>
        <CardContent className="p-0">
          {loadError ? (
            <div className="p-4">
              <LoadFailed onRetry={() => setReloadKey((k) => k + 1)} />
            </div>
          ) : loading ? (
            <div className="p-4">
              <PageLoading variant="list" title="กำลังโหลดอีเมล" lines={3} />
            </div>
          ) : threads.length === 0 ? (
            <EmptyState icon={Mail} title="ยังไม่มีอีเมลรอรับเรื่อง" description="เมื่อมีอีเมลใหม่เข้ามา รายการจะแสดงที่นี่" />
          ) : visibleThreads.length === 0 ? (
            <EmptyState icon={Mail} title="ไม่พบอีเมล" description="ลองเปลี่ยนคำค้นหรือเลือกสถานะอื่น" />
          ) : (
            <div className="divide-y">
              {['วันนี้', 'เมื่อวาน', 'สัปดาห์นี้', 'เก่ากว่า'].map((group) => {
                const items = visibleThreads.filter((thread) => mailDateGroup(new Date(thread.lastMessageAt)) === group);
                if (!items.length) return null;
                return <section key={group}><h2 className="bg-muted px-4 py-1 text-xs text-muted-foreground">{group}</h2>{items.map((thread) => <div key={thread.id} className={`border-l-2 px-4 py-3 hover:bg-muted/50 ${pathname === `/email-intake/${thread.id}` ? 'border-primary bg-primary/5' : 'border-transparent'}`}>
                  <Link href={`/email-intake/${thread.id}`} className="block min-w-0">
                    <div className="flex justify-between gap-2 text-sm"><strong className="truncate">{thread.fromName ?? thread.fromAddress}</strong><span className="shrink-0 text-xs text-muted-foreground">{group === 'วันนี้' ? new Date(thread.lastMessageAt).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }) : group === 'เมื่อวาน' ? group : formatDateTime(thread.lastMessageAt)}</span></div>
                    <div className="flex items-center gap-2"><span className="min-w-0 flex-1 truncate text-sm">{thread.subject}</span>{thread.attachmentCount > 0 && <Paperclip className="h-3.5 w-3.5 shrink-0" aria-label="ไฟล์แนบ" />}<Badge variant={STATUS_VARIANT[thread.status] ?? 'muted'}>{STATUS_LABELS[thread.status] ?? thread.status}</Badge></div>
                    <p className="truncate text-xs text-muted-foreground">{thread.bodyExcerpt}</p>
                  </Link>
                  {thread.suggestedIntake && <div className="mt-2 flex flex-wrap items-center gap-2"><Badge variant="muted" className="max-w-full whitespace-normal break-words">น่าจะเป็นเรื่องเดิม: {thread.suggestedIntake.title ?? 'ไม่มีชื่อเรื่อง'}</Badge><Button size="sm" variant="outline" disabled={linkingId !== null} onClick={async () => { if (await confirmDialog(`รวมอีเมลนี้เข้ากับเรื่อง "${thread.suggestedIntake!.title ?? 'เรื่องเดิม'}"?`)) attach(thread.id, thread.suggestedIntake!.id); }}>{linkingId === thread.id ? 'กำลังรวม…' : 'รวม'}</Button></div>}
                </div>)}</section>;
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

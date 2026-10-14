'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Mail, Paperclip, Search } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { api, type EmailSearchResult } from '@/lib/api';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { EmptyState, PageLoading } from '@/components/ui/misc';
import { LoadFailed } from '@/components/ui/LoadFailed';
import { formatDateTime } from '@/lib/utils';

const MIN_QUERY = 2;

function resultHref(r: EmailSearchResult) {
  if (r.case) return `/cases/${r.case.id}?tab=email&thread=${r.id}`;
  return `/email-intake/${r.id}`;
}

export default function EmailSearchPage() {
  const { token } = useAuth();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<EmailSearchResult[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [retryKey, setRetryKey] = useState(0);
  const requestNo = useRef(0);

  // Keep the query in the URL so "back" from an email returns to the same results.
  useEffect(() => {
    setQuery(new URLSearchParams(window.location.search).get('q') ?? '');
  }, []);

  useEffect(() => {
    const q = query.trim();
    const url = q ? `?q=${encodeURIComponent(q)}` : window.location.pathname;
    window.history.replaceState(null, '', url);
    if (!token || q.length < MIN_QUERY) {
      setResults(null);
      setLoading(false);
      setFailed(false);
      return;
    }
    const mine = ++requestNo.current;
    setLoading(true);
    setFailed(false);
    const timer = setTimeout(() => {
      api
        .searchEmails(token, q)
        .then((rows) => mine === requestNo.current && setResults(rows))
        .catch(() => mine === requestNo.current && setFailed(true))
        .finally(() => mine === requestNo.current && setLoading(false));
    }, 350);
    return () => clearTimeout(timer);
  }, [token, query, retryKey]);

  const q = query.trim();

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">ค้นหาอีเมล</h1>
        <p className="text-sm text-muted-foreground">
          ค้นจากทุกคดีที่คุณเข้าถึงได้ — พิมพ์ชื่อลูกความ อีเมล หัวเรื่อง เลขคดี ข้อความในอีเมล หรือชื่อไฟล์แนบ
        </p>
      </div>

      <div className="relative mb-4">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          autoFocus
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="เช่น สมชาย, abc@company.co.th, สัญญาเช่า"
          className="h-11 pl-9 text-base"
          aria-label="ค้นหาอีเมล"
        />
      </div>

      <Card>
        <CardContent className="p-0">
          {q.length < MIN_QUERY ? (
            <EmptyState icon={Search} title="พิมพ์อย่างน้อย 2 ตัวอักษรเพื่อค้นหา" description="ผลลัพธ์จะแสดงอีเมลล่าสุดก่อน สูงสุด 50 รายการ" />
          ) : failed ? (
            <div className="p-4">
              <LoadFailed onRetry={() => setRetryKey((k) => k + 1)} />
            </div>
          ) : loading && results === null ? (
            <div className="p-4">
              <PageLoading title="กำลังค้นหา" lines={3} />
            </div>
          ) : results && results.length === 0 ? (
            <EmptyState icon={Mail} title={`ไม่พบอีเมลที่มีคำว่า "${q}"`} description="ลองคำอื่น เช่น ชื่อบริษัท หรือส่วนหนึ่งของอีเมลผู้ส่ง" />
          ) : (
            <div className={loading ? 'divide-y opacity-60' : 'divide-y'}>
              {results?.length === 50 && (
                <p className="px-4 py-2 text-xs text-muted-foreground">แสดง 50 รายการล่าสุด — พิมพ์คำให้เจาะจงขึ้นเพื่อหาอีเมลที่เก่ากว่า</p>
              )}
              {results?.map((r) => (
                <Link key={r.id} href={resultHref(r)} className="flex items-start gap-4 px-4 py-3 hover:bg-muted/50">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate font-medium">{r.subject || '(ไม่มีหัวเรื่อง)'}</p>
                      {r.attachmentCount > 0 && (
                        <span className="inline-flex shrink-0 items-center gap-0.5 text-xs text-muted-foreground">
                          <Paperclip className="h-3 w-3" />
                          {r.attachmentCount}
                        </span>
                      )}
                    </div>
                    <p className="truncate text-xs text-muted-foreground">
                      {r.fromName ?? r.fromAddress ?? '—'} · {formatDateTime(r.lastMessageAt)}
                      {r.messageCount > 1 && ` · ${r.messageCount} ฉบับ`}
                    </p>
                    {r.excerpt && <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{r.excerpt}</p>}
                  </div>
                  <span
                    className={`max-w-[40%] shrink-0 truncate rounded-full px-2.5 py-0.5 text-xs font-medium ${
                      r.case ? 'bg-blue-100 text-blue-700' : 'bg-muted text-foreground'
                    }`}
                    title={r.case ? `${r.case.ownRef} · ${r.case.title}` : undefined}
                  >
                    {r.case ? `${r.case.ownRef} · ${r.case.title}` : r.intakeId ? 'รับเรื่องแล้ว' : 'ยังไม่ผูกคดี'}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Mail, Paperclip } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { api, EmailThreadListItem } from '@/lib/api';
import { Card, CardContent } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/misc';
import { LoadFailed } from '@/components/ui/LoadFailed';

const STATUS_LABELS: Record<string, string> = {
  PENDING_INTAKE: 'รอรับเรื่อง',
  LINKED: 'รับเรื่องแล้ว',
  ARCHIVED: 'เก็บถาวร',
};

const STATUS_VARIANT: Record<string, string> = {
  PENDING_INTAKE: 'bg-amber-100 text-amber-700',
  LINKED: 'bg-green-100 text-green-700',
  ARCHIVED: 'bg-gray-100 text-gray-700',
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

export default function EmailIntakePage() {
  const { token } = useAuth();
  const router = useRouter();
  const [threads, setThreads] = useState<EmailThreadListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

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

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">รับเรื่องจากอีเมล</h1>
        <p className="text-sm text-muted-foreground">
          อีเมลจากลูกค้าที่ระบบเตรียมข้อมูลไว้แล้ว รอทนายตรวจและยืนยันก่อนรับเข้าพิจารณา
        </p>
      </div>

      <Card>
        <CardContent className="p-0">
          {loadError ? (
            <div className="p-4">
              <LoadFailed onRetry={() => setReloadKey((k) => k + 1)} />
            </div>
          ) : loading ? (
            <p className="p-8 text-center text-muted-foreground">กำลังโหลด...</p>
          ) : threads.length === 0 ? (
            <EmptyState icon={Mail} title="ยังไม่มีอีเมลรอรับเรื่อง" description="เมื่อมีอีเมลใหม่เข้ามา รายการจะแสดงที่นี่" />
          ) : (
            <div className="divide-y">
              {threads.map((thread) => (
                <div
                  key={thread.id}
                  className="flex cursor-pointer items-start gap-4 px-4 py-3 hover:bg-muted/50"
                  onClick={() => router.push(`/email-intake/${thread.id}`)}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate font-medium">{thread.subject}</p>
                      {thread.attachmentCount > 0 && (
                        <span className="inline-flex shrink-0 items-center gap-0.5 text-xs text-muted-foreground">
                          <Paperclip className="h-3 w-3" />
                          {thread.attachmentCount}
                        </span>
                      )}
                    </div>
                    <p className="truncate text-xs text-muted-foreground">
                      {thread.fromName ?? thread.fromAddress} · {formatDateTime(thread.lastMessageAt)}
                    </p>
                    <p className="mt-1 truncate text-xs text-muted-foreground">{thread.bodyExcerpt}</p>
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${
                      STATUS_VARIANT[thread.status] ?? 'bg-gray-100 text-gray-700'
                    }`}
                  >
                    {STATUS_LABELS[thread.status] ?? thread.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

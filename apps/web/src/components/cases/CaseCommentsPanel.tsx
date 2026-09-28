'use client';

import { useEffect, useRef, useState } from 'react';
import { Trash2, AtSign } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { api, ApiError, CaseCommentEntry } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { useDashboardT } from '@/components/landing/LocaleProvider';
import { InlineEmptyState, PageLoading } from '@/components/ui/misc';

const TIME = new Intl.DateTimeFormat('th-TH', {
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Asia/Bangkok',
});

const DAY = new Intl.DateTimeFormat('th-TH', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'Asia/Bangkok',
});

interface CaseTeamMember {
  id: string;
  firstName: string;
  lastName: string;
}

export function CaseCommentsPanel({
  caseId,
  teamMembers,
}: {
  caseId: string;
  teamMembers?: CaseTeamMember[];
}) {
  const d = useDashboardT();
  const { token, user } = useAuth();
  const [comments, setComments] = useState<CaseCommentEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [mentionedUserIds, setMentionedUserIds] = useState<string[]>([]);
  const bottomRef = useRef<HTMLDivElement>(null);

  const load = () => {
    if (!token || !caseId) return;
    api
      .getCaseComments(token, caseId)
      .then(setComments)
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, [token, caseId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [comments.length]);

  const handleSend = async () => {
    if (!token || !caseId || !body.trim()) return;
    setSending(true);
    setError('');
    try {
      await api.createCaseComment(token, caseId, body.trim(), mentionedUserIds.length > 0 ? mentionedUserIds : undefined);
      setBody('');
      setMentionedUserIds([]);
      load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'ส่งความคิดเห็นไม่สำเร็จ');
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      void handleSend();
    }
  };

  const handleDelete = async (commentId: string) => {
    if (!token || !caseId) return;
    try {
      await api.deleteCaseComment(token, caseId, commentId);
      load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'ลบความคิดเห็นไม่สำเร็จ');
    }
  };

  if (loading) return <PageLoading title={d.common.loading} lines={3} />;

  let lastDay = '';

  return (
    <div className="rounded-xl border bg-card shadow-soft">
      <div className="border-b px-5 py-4">
        <h2 className="font-semibold text-foreground">ความเห็นภายในทีม</h2>
        <p className="text-sm text-muted-foreground">
          ความเห็นและข้อสังเกตภายในทีมงาน — ไม่แสดงให้ลูกความเห็น
        </p>
      </div>

      <div className="max-h-[50vh] space-y-1 overflow-y-auto px-5 py-4">
        {comments.length === 0 && (
          <InlineEmptyState
            title="ยังไม่มีความเห็น"
            description="ความเห็นจากทีมงานจะแสดงตรงนี้"
          />
        )}
        {comments.map((c) => {
          const day = DAY.format(new Date(c.createdAt));
          const newDay = day !== lastDay;
          lastDay = day;
          const initials = `${c.authorFirstName[0]}${c.authorLastName[0]}`.toUpperCase();
          const isAuthor = user?.id === c.authorId;

          return (
            <div key={c.id}>
              {newDay && (
                <div className="my-3 flex items-center gap-3">
                  <div className="h-px flex-1 bg-border" />
                  <span className="text-xs text-muted-foreground">{day}</span>
                  <div className="h-px flex-1 bg-border" />
                </div>
              )}
              <div className="flex gap-3 rounded-lg px-2 py-2 hover:bg-muted/50">
                <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/20 text-xs font-semibold text-primary">
                  {initials}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <div className="flex items-baseline gap-2">
                      <span className="text-sm font-medium text-foreground">
                        {c.authorFirstName} {c.authorLastName}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {TIME.format(new Date(c.createdAt))}
                      </span>
                    </div>
                    {isAuthor && (
                      <button
                        type="button"
                        onClick={() => handleDelete(c.id)}
                        className="rounded p-1 hover:bg-destructive/20"
                        aria-label="ลบ"
                      >
                        <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
                      </button>
                    )}
                  </div>
                  <p className="whitespace-pre-wrap text-sm text-foreground">{c.body}</p>
                </div>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {error && <p className="px-5 pb-2 text-sm text-destructive">{error}</p>}

      <div className="border-t p-4">
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={handleKeyDown}
          rows={3}
          className="w-full rounded-lg border border-input bg-card px-3 py-2 text-sm shadow-soft transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          placeholder="พิมพ์ความเห็น (⌘+Enter เพื่อส่ง)..."
        />
        <div className="mt-2 flex justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setBody('');
              setMentionedUserIds([]);
            }}
          >
            ยกเลิก
          </Button>
          <Button
            type="button"
            onClick={handleSend}
            disabled={sending || !body.trim()}
          >
            {sending ? 'กำลังส่ง...' : 'ส่ง'}
          </Button>
        </div>
      </div>
    </div>
  );
}

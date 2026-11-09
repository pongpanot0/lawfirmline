'use client';

import { useState } from 'react';
import Link from 'next/link';
import { CheckCircle2, ClipboardCheck, ExternalLink, Plus } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { api, ApiError, type MentionTaskSuggestion } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ThaiDateInput } from '@/components/ui/ThaiDateInput';
import { formatDate } from '@/lib/utils';
import { senderInitials } from '@lawfirm/shared';

type Draft = { title: string; dueDate: string; dateIncomplete: boolean };

/**
 * "สั่งงานในอีเมลนี้": each @mention in the email becomes a pre-filled task row.
 * The lawyer checks the title/due date and presses สร้างงาน — nothing is created on its own.
 */
export function EmailMentionTasks({
  caseId,
  messageId,
  suggestions,
  onCreated,
}: {
  caseId: string;
  messageId: string;
  suggestions: MentionTaskSuggestion[];
  onCreated: () => void;
}) {
  const { token } = useAuth();
  const [drafts, setDrafts] = useState<Record<string, Draft>>(() =>
    Object.fromEntries(suggestions.map((s) => [s.assigneeId, { title: s.title, dueDate: s.dueDate ?? '', dateIncomplete: false }])),
  );
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const pending = suggestions.filter((s) => !s.taskId);
  const draftOf = (s: MentionTaskSuggestion): Draft => drafts[s.assigneeId] ?? { title: s.title, dueDate: s.dueDate ?? '', dateIncomplete: false };
  const setDraft = (id: string, patch: Partial<Draft>) =>
    setDrafts((prev) => ({ ...prev, [id]: { ...(prev[id] ?? { title: '', dueDate: '', dateIncomplete: false }), ...patch } }));
  const invalid = (s: MentionTaskSuggestion) => !draftOf(s).title.trim() || draftOf(s).dateIncomplete;

  // One at a time on purpose: a refused assignment stops the batch and says whose task failed.
  const create = async (rows: MentionTaskSuggestion[], key: string) => {
    if (!token || !rows.length) return;
    setBusy(key);
    setError(null);
    try {
      for (const s of rows) {
        const draft = draftOf(s);
        try {
          await api.createMentionTask(token, caseId, messageId, {
            assigneeId: s.assigneeId,
            title: draft.title.trim(),
            dueDate: draft.dueDate || undefined,
          });
        } catch (e) {
          setError(`สร้างงานของ ${s.assigneeName} ไม่สำเร็จ: ${e instanceof ApiError ? e.message : 'ลองใหม่อีกครั้ง'}`);
          return;
        }
      }
    } finally {
      setBusy(null);
      onCreated();
    }
  };

  return (
    <section aria-label="สั่งงานในอีเมลนี้" className="space-y-2 rounded-lg border bg-muted/30 p-3">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-2">
        <ClipboardCheck aria-hidden className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-semibold">สั่งงานในอีเมลนี้ ({suggestions.length})</h3>
        <span className="text-xs text-muted-foreground">ระบบอ่านจาก @ชื่อ — ตรวจแล้วกดสร้างงาน</span>
        {pending.length > 1 && (
          <Button
            size="sm"
            className="ml-auto"
            disabled={busy !== null || pending.some(invalid)}
            onClick={() => create(pending, 'all')}
          >
            <Plus aria-hidden className="h-4 w-4" /> สร้างทั้ง {pending.length} งาน
          </Button>
        )}
      </div>

      <ul className="space-y-2">
        {suggestions.map((s) => {
          const draft = draftOf(s);
          const inputId = `mention-${messageId}-${s.assigneeId}`;
          return (
            // Stacked on purpose: the case email column is narrow even on desktop.
            <li key={s.assigneeId} className="space-y-2 rounded-lg border bg-card p-2.5">
              <div className="flex min-w-0 items-center gap-2">
                <span aria-hidden className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold">
                  {senderInitials(s.assigneeName, s.email)}
                </span>
                <span className="min-w-0 truncate text-sm font-medium">{s.assigneeName}</span>
              </div>

              {s.taskId ? (
                <>
                  <p className="text-sm" title={s.text}>{s.title}</p>
                  <div className="flex flex-wrap items-center gap-3 text-xs">
                    {s.dueDate && <span className="rounded-md bg-muted px-2 py-1">ครบ {formatDate(s.dueDate)}</span>}
                    <span className="inline-flex items-center gap-1 text-success">
                      <CheckCircle2 aria-hidden className="h-4 w-4" /> สร้างงานแล้ว
                    </span>
                    <Link href={`/todos?task=${s.taskId}`} className="inline-flex min-h-11 items-center gap-1 text-primary hover:underline sm:min-h-0">
                      เปิดงาน <ExternalLink aria-hidden className="h-3.5 w-3.5" />
                    </Link>
                  </div>
                </>
              ) : (
                <>
                  <label htmlFor={inputId} className="sr-only">ชื่องานของ {s.assigneeName}</label>
                  <Input
                    id={inputId}
                    value={draft.title}
                    maxLength={200}
                    title={s.text}
                    onChange={(e) => setDraft(s.assigneeId, { title: e.target.value })}
                  />
                  <div className="flex flex-wrap items-end gap-2">
                    <div className="min-w-0" role="group" aria-label={`วันครบกำหนดของ ${s.assigneeName}`}>
                      <span className="mb-1 block text-xs text-muted-foreground">ครบกำหนด (ไม่ใส่ก็ได้)</span>
                      <ThaiDateInput
                        value={draft.dueDate}
                        onChange={(value) => setDraft(s.assigneeId, { dueDate: value })}
                        onIncompleteChange={(incomplete) => setDraft(s.assigneeId, { dateIncomplete: incomplete })}
                      />
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="ml-auto"
                      disabled={busy !== null || invalid(s)}
                      onClick={() => create([s], s.assigneeId)}
                    >
                      {busy === s.assigneeId ? 'กำลังสร้าง…' : 'สร้างงาน'}
                    </Button>
                  </div>
                </>
              )}
            </li>
          );
        })}
      </ul>

      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    </section>
  );
}

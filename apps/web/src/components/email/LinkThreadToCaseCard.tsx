'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Link2 } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { api, ApiError, type CaseListItem, type ThreadCaseSuggestion } from '@/lib/api';
import { OTHER_CASE, THREAD_REASON_LABELS } from '@/lib/case-email';
import { caseTabHref } from '@/lib/case-tabs';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

/** "ผูกกับคดี": suggestions are shown, never pre-selected — the person picks and confirms. */
export function LinkThreadToCaseCard({
  threadId,
  linkedCase,
  onChanged,
}: {
  threadId: string;
  linkedCase: { id: string; ownRef: string; title: string } | null;
  onChanged: () => void;
}) {
  const { token } = useAuth();
  const [open, setOpen] = useState(false);
  const [suggestions, setSuggestions] = useState<ThreadCaseSuggestion[] | null>(null);
  const [cases, setCases] = useState<CaseListItem[]>([]);
  const [chosenId, setChosenId] = useState('');
  const [otherRef, setOtherRef] = useState('');
  const [busy, setBusy] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [error, setError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!open || !token) return;
    let active = true;
    setLoadError('');
    setSuggestions(null);
    Promise.all([api.getThreadCaseSuggestions(token, threadId), api.getCases(token).catch(() => [] as CaseListItem[])])
      .then(([nextSuggestions, nextCases]) => {
        if (!active) return;
        setSuggestions(nextSuggestions);
        setCases(nextCases);
      })
      .catch((e) => active && setLoadError(e instanceof ApiError ? e.message : 'โหลดคดีที่แนะนำไม่สำเร็จ'));
    return () => {
      active = false;
    };
  }, [open, token, threadId, reloadKey]);

  const caseIdByRef = useMemo(() => new Map(cases.map((c) => [c.ownRef, c.id])), [cases]);
  const targetCaseId = chosenId === OTHER_CASE ? (caseIdByRef.get(otherRef.trim()) ?? '') : chosenId;

  const submit = async (action: (t: string) => Promise<unknown>, fallback: string) => {
    if (!token) return;
    setBusy(true);
    setError('');
    try {
      await action(token);
      setOpen(false);
      setChosenId('');
      setOtherRef('');
      onChanged();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : fallback);
    } finally {
      setBusy(false);
    }
  };

  if (linkedCase) {
    return (
      <Card className="mb-4">
        <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
          <p className="text-sm">
            ผูกกับคดี{' '}
            <Link href={caseTabHref(linkedCase.id, 'email')} className="font-medium text-primary hover:underline">
              {linkedCase.ownRef} · {linkedCase.title}
            </Link>
          </p>
          <Button
            size="sm"
            variant="outline"
            className="border-destructive/50 text-destructive hover:bg-destructive/10 hover:text-destructive"
            disabled={busy}
            onClick={() => {
              if (window.confirm(`ยกเลิกการผูกอีเมลนี้กับคดี ${linkedCase.ownRef}? อีเมลจะกลับเข้าคิว`)) {
                submit((t) => api.unlinkThreadFromCase(t, threadId), 'ยกเลิกการผูกไม่สำเร็จ');
              }
            }}
          >
            ยกเลิกการผูก
          </Button>
          {error && <p role="alert" className="w-full text-sm text-destructive">{error}</p>}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="mb-4">
      <CardContent className="space-y-3 p-4">
        {!open ? (
          <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
            <Link2 className="h-4 w-4" aria-hidden /> ผูกกับคดี
          </Button>
        ) : (
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">เลือกคดีที่จะผูกอีเมลนี้</legend>
            {suggestions === null && !loadError && <p className="text-sm text-muted-foreground">กำลังหาคดีที่เกี่ยวข้อง…</p>}
            {loadError && (
              <p role="alert" className="text-sm text-destructive">
                {loadError}{' '}
                <button type="button" className="underline" onClick={() => setReloadKey((k) => k + 1)}>
                  ลองใหม่
                </button>
              </p>
            )}
            {suggestions?.length === 0 && (
              <p className="text-sm text-muted-foreground">ไม่พบคดีที่ตรงกับผู้ส่ง/ผู้รับหรือหัวเรื่อง — เลือกคดีเองด้านล่าง</p>
            )}
            {suggestions?.map((s) => (
              <label key={s.caseId} className="flex items-start gap-2 text-sm">
                <input
                  type="radio"
                  name="link-case"
                  value={s.caseId}
                  checked={chosenId === s.caseId}
                  onChange={() => setChosenId(s.caseId)}
                  className="mt-1"
                />
                <span>
                  <span className="font-medium">{s.ownRef}</span> · {s.title}
                  <span className="block text-xs text-muted-foreground">
                    {s.reasons.map((r) => THREAD_REASON_LABELS[r]).join(' · ')}
                  </span>
                </span>
              </label>
            ))}
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="link-case"
                value={OTHER_CASE}
                checked={chosenId === OTHER_CASE}
                onChange={() => setChosenId(OTHER_CASE)}
              />
              คดีอื่น
            </label>
            {chosenId === OTHER_CASE && (
              <>
                <input
                  list="link-case-refs"
                  value={otherRef}
                  onChange={(e) => setOtherRef(e.target.value)}
                  placeholder="พิมพ์เลขอ้างอิงคดี"
                  aria-label="เลขอ้างอิงคดี"
                  className="min-h-11 w-full rounded-md border bg-background px-2 py-1.5 text-sm"
                />
                <datalist id="link-case-refs">
                  {cases.map((c) => (
                    <option key={c.id} value={c.ownRef}>
                      {c.title}
                    </option>
                  ))}
                </datalist>
              </>
            )}
            <div className="flex gap-2">
              <Button
                size="sm"
                disabled={!targetCaseId || busy}
                onClick={() => submit((t) => api.linkThreadToCase(t, threadId, targetCaseId), 'ผูกกับคดีไม่สำเร็จ')}
              >
                {busy ? 'กำลังผูก…' : 'ยืนยันผูกกับคดีนี้'}
              </Button>
              <Button size="sm" variant="outline" onClick={() => setOpen(false)}>
                ยกเลิก
              </Button>
            </div>
          </fieldset>
        )}
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      </CardContent>
    </Card>
  );
}

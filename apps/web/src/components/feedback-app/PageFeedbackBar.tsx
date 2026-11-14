'use client';
import { useEffect, useRef, useState } from 'react';
import { MessageCircleQuestion, Send, X } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { publishActionFeedback } from '@/lib/action-feedback';
import { Button } from '@/components/ui/button';
import { routePattern, shouldShowFeedback } from './feedback-logic';
import { useDashboardT } from '@/components/landing/LocaleProvider';
const day = () => {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
};
export function PageFeedbackBar({
  pathname,
  userId,
  onVisible,
}: {
  pathname: string;
  userId: string;
  onVisible: (visible: boolean) => void;
}) {
  const { token } = useAuth();
  const d = useDashboardT();
  const faces = [`😞 ${d.feedback.bad}`, `😐 ${d.feedback.okay}`, `😊 ${d.feedback.good}`];
  const prompts = [d.feedback.badPrompt, d.feedback.okayPrompt, d.feedback.goodPrompt];
  const lastVisit = useRef('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [visible, setVisible] = useState(false);
  const [rating, setRating] = useState(0);
  const [message, setMessage] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const route = routePattern(pathname);
  const key = `app-feedback:${userId}:${route}`;
  const daily = `app-feedback:${userId}:day`;
  useEffect(() => {
    if (lastVisit.current === pathname) return;
    lastVisit.current = pathname;
    setVisible(false);
    setRating(0);
    setMessage('');
    setError('');
    if (/^\/(superadmin|auth|login|register|onboarding|portal)(\/|$)/.test(pathname)) return;
    try {
      const record = JSON.parse(localStorage.getItem(key) || '{}') as { visits?: number; asked?: number };
      const visits = (record.visits ?? 0) + 1;
      localStorage.setItem(key, JSON.stringify({ ...record, visits }));
      if (
        shouldShowFeedback(
          visits,
          record.asked ?? null,
          localStorage.getItem(daily),
          Date.now(),
          day(),
          !!document.querySelector('[role="dialog"], dialog[open]'),
        )
      ) {
        // Being shown is being asked (same rule as mobile): an ignored bar still starts this page's
        // 90 days and uses up today, or it would follow the user from page to page and day to day.
        localStorage.setItem(key, JSON.stringify({ visits, asked: Date.now() }));
        localStorage.setItem(daily, day());
        setVisible(true);
      }
    } catch {
      /* Storage unavailable: do not prompt. */
    }
  }, [pathname, key, daily]);
  useEffect(() => {
    const check = () => setDialogOpen(!!document.querySelector('[role="dialog"], dialog[open]'));
    check();
    const observer = new MutationObserver(check);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['open', 'role'],
    });
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    onVisible(visible && !dialogOpen);
    return () => onVisible(false);
  }, [visible, dialogOpen, onVisible]);
  function finish() {
    try {
      const record = JSON.parse(localStorage.getItem(key) || '{}');
      localStorage.setItem(key, JSON.stringify({ ...record, asked: Date.now() }));
      localStorage.setItem(daily, day());
    } catch {
      /* Storage unavailable. */
    }
    setVisible(false);
  }
  async function submit() {
    if (!token || !rating || pending) return;
    const form = new FormData();
    form.set('kind', 'RATING');
    form.set('rating', String(rating));
    form.set('message', message.trim());
    form.set('route', route);
    form.set('platform', 'web');
    if (process.env.NEXT_PUBLIC_APP_VERSION) form.set('appVersion', process.env.NEXT_PUBLIC_APP_VERSION);
    setPending(true);
    setError('');
    try {
      await api.createAppFeedback(token, form);
      finish();
      publishActionFeedback('success', d.feedback.success);
    } catch (err) {
      setError(err instanceof Error ? err.message : d.feedback.sendError);
    } finally {
      setPending(false);
    }
  }
  if (!visible || dialogOpen) return null;
  return (
    <div className="sticky bottom-[5.5rem] z-20 mx-auto lg:bottom-4 w-full max-w-[640px] rounded-xl border border-border bg-card p-4 shadow-lg">
      <div className="flex justify-between gap-2">
        <h2 className="flex items-center gap-2 font-semibold">
          <MessageCircleQuestion className="h-5 w-5" />
          {d.feedback.pageTitle}
        </h2>
        <button
          type="button"
          onClick={finish}
          className="flex items-center gap-1 text-sm text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
        >
          <X className="h-4 w-4" /> {d.feedback.skip}
        </button>
      </div>
      <div className="mt-3 flex gap-2">
        {faces.map((face, i) => (
          <button
            key={face}
            type="button"
            aria-pressed={rating === i + 1}
            onClick={() => setRating(i + 1)}
            className={`flex-1 basis-0 rounded-lg border-2 p-2 text-sm focus-visible:ring-2 focus-visible:ring-ring
              ${rating === i + 1 ? 'border-primary bg-primary/10' : 'border-border'}`}
          >
            {face}
          </button>
        ))}
      </div>
      {rating > 0 && (
        <div className="mt-3">
          <label htmlFor="page-feedback" className="text-sm font-medium">
            {prompts[rating - 1]} <span className="text-muted-foreground">{d.feedback.optional}</span>
          </label>
          <textarea
            id="page-feedback"
            maxLength={500}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            className="mt-1 min-h-20 w-full rounded-lg border border-input bg-background p-2 focus-visible:ring-2 focus-visible:ring-ring"
          />
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">{d.feedback.faceHint}</span>
            <Button type="button" onClick={submit} disabled={pending}>
              {d.feedback.send} <Send className="ml-2 h-4 w-4" />
            </Button>
          </div>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

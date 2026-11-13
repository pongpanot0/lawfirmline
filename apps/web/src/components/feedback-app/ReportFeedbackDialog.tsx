'use client';
import { useEffect, useRef, useState } from 'react';
import { Bug, Lightbulb, MessageCircle, MessageSquareText, ImagePlus, Info, Send, X } from 'lucide-react';
import { usePathname } from 'next/navigation';
import { api, type FeedbackKind } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { publishActionFeedback } from '@/lib/action-feedback';
import { Button } from '@/components/ui/button';
import { routePattern } from './feedback-logic';
import { useDashboardT } from '@/components/landing/LocaleProvider';

export function ReportFeedbackDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const { token } = useAuth();
  const d = useDashboardT();
  const path = usePathname();
  const [kind, setKind] = useState<FeedbackKind>('BUG');
  const [message, setMessage] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const [preview, setPreview] = useState('');
  useEffect(() => {
    if (open) ref.current?.showModal();
    else ref.current?.close();
  }, [open]);
  useEffect(() => {
    if (!file) {
      setPreview('');
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!token || !message.trim() || pending) return;
    const form = new FormData();
    form.set('kind', kind);
    form.set('message', message.trim());
    form.set('route', routePattern(path));
    form.set('platform', 'web');
    if (process.env.NEXT_PUBLIC_APP_VERSION) form.set('appVersion', process.env.NEXT_PUBLIC_APP_VERSION);
    if (file) form.set('screenshot', file);
    setPending(true);
    setError('');
    try {
      await api.createAppFeedback(token, form);
      publishActionFeedback('success', d.feedback.success);
      setMessage('');
      setFile(null);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : d.feedback.sendError);
    } finally {
      setPending(false);
    }
  }
  const kinds = [
    { value: 'BUG', label: d.feedback.bug, icon: Bug },
    { value: 'SUGGESTION', label: d.feedback.suggestion, icon: Lightbulb },
    { value: 'OTHER', label: d.feedback.other, icon: MessageCircle },
  ] as const;
  return (
    <dialog
      ref={ref}
      aria-label={d.feedback.title}
      onCancel={onClose}
      className="w-[calc(100%-2rem)] max-w-xl rounded-xl border border-border bg-card p-0 text-foreground shadow-xl backdrop:bg-black/40"
    >
      <form onSubmit={submit}>
        <header className="flex items-start justify-between border-b border-border p-6">
          <div>
            <h2 className="flex items-center gap-2 text-xl font-semibold">
              <MessageSquareText className="h-5 w-5" />
              {d.feedback.title}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">{d.feedback.subtitle}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={d.common.close}
            className="rounded p-1 focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X />
          </button>
        </header>
        <div className="space-y-5 p-6">
          <fieldset>
            <legend className="mb-2 font-medium">{d.feedback.kind}</legend>
            <div className="flex rounded-lg border border-border bg-muted p-1">
              {kinds.map(({ value, label, icon: Icon }) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={kind === value}
                  onClick={() => setKind(value)}
                  className={`flex flex-1 items-center justify-center gap-2 rounded-md px-2 py-2 text-sm
                    focus-visible:ring-2 focus-visible:ring-ring
                    ${kind === value ? 'bg-primary text-primary-foreground' : ''}`}
                >
                  <Icon className="h-4 w-4" />
                  {label}
                </button>
              ))}
            </div>
          </fieldset>
          <div>
            <label htmlFor="feedback-message" className="font-medium">
              {d.feedback.details} <span className="text-destructive">*</span>
            </label>
            <textarea
              id="feedback-message"
              required
              maxLength={500}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder={d.feedback.placeholder}
              className={'mt-2 min-h-32 w-full rounded-lg border border-input bg-background p-3 ' +
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'}
            />
            <div className="flex justify-between text-sm text-muted-foreground">
              <span>{d.feedback.detailHint}</span>
              <span>{message.length} / 500</span>
            </div>
          </div>
          <label className="flex cursor-pointer flex-col items-center gap-1 rounded-lg border border-dashed border-border bg-muted/30 p-5 text-center">
            <ImagePlus className="h-5 w-5" />
            <span>{d.feedback.attach}</span>
            <span className="text-sm text-muted-foreground">{d.feedback.imageHint}</span>
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="sr-only"
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = '';
                if (!f) return;
                if (
                  f.size > 10 * 1024 * 1024 ||
                  !['image/png', 'image/jpeg', 'image/webp'].includes(f.type)
                ) {
                  setError(d.feedback.imageError);
                  return;
                }
                setError('');
                setFile(f);
              }}
            />
          </label>
          {file && (
            <div className="flex items-center gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={preview} alt={d.feedback.imageAlt} className="h-16 w-16 rounded object-cover" />
              <span className="min-w-0 flex-1 truncate text-sm">{file.name}</span>
              <Button type="button" variant="outline" onClick={() => setFile(null)}>
                {d.feedback.removeImage}
              </Button>
            </div>
          )}
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Info className="h-4 w-4 shrink-0" /> {d.feedback.contextHint}
          </p>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
        </div>
        <footer className="flex items-center justify-between border-t border-border bg-muted/30 p-6">
          <Button type="button" variant="ghost" onClick={onClose}>
            {d.common.cancel}
          </Button>
          <div className="text-right">
            <Button type="submit" disabled={pending || !message.trim()}>
              {d.feedback.sendReport} <Send className="ml-2 h-4 w-4" />
            </Button>
            <p className="mt-1 text-xs text-muted-foreground">{d.feedback.footer}</p>
          </div>
        </footer>
      </form>
    </dialog>
  );
}

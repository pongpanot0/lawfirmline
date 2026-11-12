'use client';

import { useEffect, useRef, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { setConfirmListener, splitConfirmMessage, type ConfirmRequest } from '@/lib/confirm-dialog';
import { Button } from '@/components/ui/button';

/** Renders confirmDialog() requests one at a time in a native modal <dialog> (focus trap, Escape = cancel). */
export function ConfirmHost() {
  const [queue, setQueue] = useState<ConfirmRequest[]>([]);
  const dialog = useRef<HTMLDialogElement>(null);
  const current = queue[0];

  useEffect(() => setConfirmListener((request) => setQueue((items) => [...items, request])), []);

  useEffect(() => {
    const el = dialog.current;
    if (!el) return;
    if (current && !el.open) el.showModal();
    if (!current && el.open) el.close();
  }, [current]);

  const answer = (ok: boolean) => {
    if (!current) return;
    current.resolve(ok);
    setQueue((items) => items.slice(1));
  };

  const defaults = current ? splitConfirmMessage(current.message) : null;
  const parts = defaults && current ? { ...defaults, action: current.action ?? defaults.action, danger: current.danger ?? defaults.danger } : null;
  return (
    <dialog
      ref={dialog}
      aria-labelledby="confirm-dialog-title"
      onCancel={(event) => { event.preventDefault(); answer(false); }}
      className="w-[min(92vw,28rem)] rounded-xl border bg-card p-0 text-foreground shadow-xl backdrop:bg-black/40"
    >
      {parts && (
        <form method="dialog" className="space-y-4 p-5" onSubmit={(event) => { event.preventDefault(); answer(true); }}>
          <div className="flex gap-3">
            {parts.danger && <AlertTriangle aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />}
            <div className="min-w-0 space-y-2">
              <h2 id="confirm-dialog-title" className="text-base font-semibold [overflow-wrap:anywhere]">{parts.title}</h2>
              {parts.body && <p className="whitespace-pre-line text-sm text-muted-foreground [overflow-wrap:anywhere]">{parts.body}</p>}
            </div>
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            {/* Destructive actions start on "ยกเลิก" so Enter never deletes by accident. */}
            <Button type="button" variant="outline" className="min-h-11" autoFocus={parts.danger} onClick={() => answer(false)}>{current?.cancel ?? 'ยกเลิก'}</Button>
            <Button type="submit" variant={parts.danger ? 'destructive' : 'default'} className="min-h-11" autoFocus={!parts.danger}>{parts.action}</Button>
          </div>
        </form>
      )}
    </dialog>
  );
}

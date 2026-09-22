'use client';

import { useEffect, useRef, useState } from 'react';

type Feedback = { status: 'success' | 'error'; message: string };

export function ActionFeedback() {
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const timeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const onResult = (event: Event) => {
      const next = (event as CustomEvent<Feedback>).detail;
      if (!next?.message) return;
      if (timeout.current) clearTimeout(timeout.current);
      setFeedback(next);
      timeout.current = setTimeout(() => setFeedback(null), next.status === 'error' ? 7000 : 3500);
    };
    window.addEventListener('lawfirm:action-result', onResult);
    return () => {
      window.removeEventListener('lawfirm:action-result', onResult);
      if (timeout.current) clearTimeout(timeout.current);
    };
  }, []);

  if (!feedback) return null;
  const isError = feedback.status === 'error';
  return (
    <div
      aria-live={isError ? 'assertive' : 'polite'}
      className={`fixed inset-x-4 top-4 z-[100] mx-auto flex max-w-md items-start gap-3 rounded-lg border px-4 py-3 shadow-lg sm:left-auto sm:right-4 sm:mx-0 ${
        isError
          ? 'border-destructive/30 bg-destructive text-destructive-foreground'
          : 'border-emerald-700/30 bg-emerald-700 text-white'
      }`}
      role={isError ? 'alert' : 'status'}
    >
      <span aria-hidden="true" className="mt-0.5 text-base">{isError ? '!' : '✓'}</span>
      <p className="flex-1 text-sm font-medium">{feedback.message}</p>
      <button
        aria-label="ปิดข้อความแจ้งผล"
        className="-mr-1 -mt-1 rounded p-1 text-current/80 hover:bg-black/10 hover:text-current focus:outline-none focus:ring-2 focus:ring-current"
        onClick={() => setFeedback(null)}
        type="button"
      >
        ×
      </button>
    </div>
  );
}

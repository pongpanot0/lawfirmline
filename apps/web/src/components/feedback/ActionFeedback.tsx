'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { canBuyAddOns, hasFirmCapability } from '@lawfirm/shared';
import { useAuth } from '@/lib/auth';
import { AlertCircle, CheckCircle2, X } from 'lucide-react';

type Feedback = { status: 'success' | 'error'; message: string; aiLimit?: boolean };

export function ActionFeedback() {
  const { user } = useAuth();
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
    const onLimit = (event: Event) => onResult(new CustomEvent('lawfirm:action-result', { detail: { status: 'error', message: (event as CustomEvent<string>).detail, aiLimit: true } }));
    window.addEventListener('lawfirm:ai-limit', onLimit);
    window.addEventListener('lawfirm:action-result', onResult);
    return () => {
      window.removeEventListener('lawfirm:action-result', onResult);
      window.removeEventListener('lawfirm:ai-limit', onLimit);
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
          : 'border-success/30 bg-success text-white'
      }`}
      role={isError ? 'alert' : 'status'}
    >
      {isError
        ? <AlertCircle aria-hidden className="mt-0.5 h-4 w-4 shrink-0" />
        : <CheckCircle2 aria-hidden className="mt-0.5 h-4 w-4 shrink-0" />}
      <p className="flex-1 text-sm font-medium">{feedback.message} {feedback.aiLimit && hasFirmCapability(user?.firmRole, 'manageSubscription') && (canBuyAddOns(user?.subscriptionPlan) ? <Link className="whitespace-nowrap underline" title="ไปเติมเครดิต AI" href="/account/billing?topup=ai">เติมเครดิต AI</Link> : <Link className="whitespace-nowrap underline" title="ดูแพ็กเกจที่ใช้ AI ได้มากขึ้น" href="/account/billing#plans">อัปเกรดแพ็กเกจ</Link>)}</p>
      <button
        aria-label="ปิดข้อความแจ้งผล"
        className="-mr-2 -mt-2 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded text-current/80 hover:bg-black/10 hover:text-current focus:outline-none focus-visible:ring-2 focus-visible:ring-current"
        onClick={() => setFeedback(null)}
        type="button"
      >
        <X aria-hidden className="h-4 w-4" />
      </button>
    </div>
  );
}

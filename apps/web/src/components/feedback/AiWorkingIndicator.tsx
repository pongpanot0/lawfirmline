'use client';

import { useEffect, useRef, useState } from 'react';
import { Loader2, Sparkles } from 'lucide-react';

/** Floating "AI is working" pill with elapsed time, shown while any `ai: true` request is in flight. */
export function AiWorkingIndicator() {
  const [count, setCount] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const startedAt = useRef(0);

  useEffect(() => {
    const onBusy = (event: Event) => setCount((c) => Math.max(0, c + (event as CustomEvent<number>).detail));
    window.addEventListener('lawfirm:ai-busy', onBusy);
    return () => window.removeEventListener('lawfirm:ai-busy', onBusy);
  }, []);

  useEffect(() => {
    if (count === 0) return;
    startedAt.current = Date.now();
    setElapsed(0);
    const timer = setInterval(() => setElapsed(Math.floor((Date.now() - startedAt.current) / 1000)), 1000);
    return () => clearInterval(timer);
  }, [count > 0]); // eslint-disable-line react-hooks/exhaustive-deps -- restart only on idle ↔ busy

  if (count === 0) return null;
  const clock = `${Math.floor(elapsed / 60)}:${String(elapsed % 60).padStart(2, '0')}`;
  const hint = elapsed < 10
    ? 'กรุณารอสักครู่'
    : elapsed < 90
      ? 'อาจใช้เวลา 1–2 นาที ทำอย่างอื่นในหน้านี้ต่อได้ แต่อย่าปิดหรือรีเฟรชหน้า'
      : 'ยังทำงานอยู่ — เอกสารยาวอาจใช้เวลานานกว่าปกติ';

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-x-4 bottom-4 z-[100] mx-auto flex max-w-sm items-start gap-3 rounded-lg border border-primary/30 bg-card px-4 py-3 text-card-foreground shadow-lg sm:left-auto sm:right-4 sm:mx-0"
    >
      <span className="relative mt-0.5 h-5 w-5 shrink-0 text-primary">
        <Loader2 aria-hidden className="h-5 w-5 motion-safe:animate-spin" />
        <Sparkles aria-hidden className="absolute inset-0 m-auto h-2.5 w-2.5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="flex items-center justify-between gap-2 text-sm font-medium">
          <span>AI กำลังทำงาน{count > 1 ? ` (${count} งาน)` : ''}…</span>
          <span className="tabular-nums text-xs text-muted-foreground">{clock}</span>
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>
      </div>
    </div>
  );
}

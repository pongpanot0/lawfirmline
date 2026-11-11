'use client';

import { useEffect, useRef, useState } from 'react';
import { Lightbulb } from 'lucide-react';
import { restartTour } from '@/components/onboarding/use-product-tour';
import { hasTour } from '@/components/onboarding/PageTour';
import { expandedForVisit } from './guide-helpers';
import { getPageGuide } from './page-guides';

export function PageGuide({ pathname }: { pathname: string }) {
  const guide = getPageGuide(pathname);
  const [expanded, setExpanded] = useState(true);
  const countedRoute = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (!guide) { countedRoute.current = undefined; return; }
    if (countedRoute.current === guide.route) return;
    countedRoute.current = guide.route;
    try {
      const key = `page-guide:${guide.route}`;
      const visit = (Number(localStorage.getItem(`${key}:visits`)) || 0) + 1;
      localStorage.setItem(`${key}:visits`, String(visit));
      const preference = localStorage.getItem(`${key}:preference`);
      // On a phone the full guide would take a third of the screen: start as one line unless the user opened it.
      const phone = typeof window.matchMedia === 'function' && window.matchMedia('(max-width: 639px)').matches;
      setExpanded(phone && !preference ? false : expandedForVisit(visit, preference));
    } catch { setExpanded(true); }
  }, [guide?.route]);
  if (!guide) return null;
  const toggle = () => {
    const next = !expanded;
    setExpanded(next);
    try { localStorage.setItem(`page-guide:${guide.route}:preference`, next ? 'expanded' : 'collapsed'); } catch { /* Storage may be unavailable. */ }
  };
  // Form pages show their own step bar — one line about the page is enough; two 1-2-3 bars confuse.
  if (guide.formSteps) return <p className="mb-4 flex min-w-0 items-center gap-2 rounded-lg border border-l-4 border-l-primary bg-card px-3 py-2 text-sm print:hidden"><Lightbulb className="h-4 w-4 shrink-0 text-primary" aria-hidden /><span className="min-w-0"><span className="font-semibold">หน้านี้ใช้ทำอะไร:</span> {guide.purpose} · ทำตามขั้นตอนด้านล่าง แล้วกดปุ่มในการ์ด &quot;สิ่งที่ต้องทำก่อนส่ง&quot;</span></p>;
  const button = 'inline-flex min-h-11 items-center justify-center rounded-lg px-3 text-sm font-medium text-primary hover:bg-accent active:bg-accent/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';
  return <section aria-label="วิธีใช้หน้านี้" className="mb-5 min-w-0 rounded-lg border border-border border-l-4 border-l-primary bg-card p-3 print:hidden">
    {expanded ? <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
      <div className="lg:w-56 lg:shrink-0"><p className="text-xs font-semibold text-muted-foreground">หน้านี้ใช้ทำอะไร</p><p className="mt-1 text-sm font-medium">{guide.purpose}</p></div>
      <ol className="flex min-w-0 flex-1 flex-col gap-3 sm:flex-row sm:justify-around">{guide.steps.map((step, i) => <li key={step.title} className="flex min-w-0 items-start gap-2"><span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">{i + 1}</span><span><span className="block text-sm font-semibold">{step.title}</span><span className="block text-xs text-muted-foreground">{step.hint}</span></span></li>)}</ol>
      <div className="flex items-center gap-1"><button type="button" onClick={toggle} className={button}>ซ่อนคำแนะนำ</button>{hasTour(pathname) && <button type="button" onClick={restartTour} className={button} aria-label="ดูวิธีใช้แบบละเอียด">?</button>}</div>
    </div> : <div className="flex min-w-0 items-center gap-2"><span className="min-w-0 flex-1 truncate text-sm" title={guide.steps.map(s => s.title).join(' → ')}><Lightbulb className="mr-1.5 inline h-4 w-4 align-[-2px] text-primary" aria-hidden />{guide.steps.map(s => s.title).join(' → ')}</span><button type="button" onClick={toggle} className={`${button} shrink-0`}>แสดงคำแนะนำ</button></div>}
  </section>;
}

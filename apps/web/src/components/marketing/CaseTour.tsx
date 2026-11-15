'use client';
import { useEffect, useRef, useState } from 'react';
import { getStages, type FeatureKey } from '@/lib/marketing/features';
import { localePath, type Lang } from '@/lib/marketing/i18n';
import { AppPanel } from './AppPanels';

const copy = {
  th: {
    s0: 'ขั้นตอนของคดี',
    s1: 'ดูรายละเอียด →',
    s2: 'ตัวอย่างหน้าจอ · ข้อมูลสมมติ',
  },
  en: {
    s0: 'Stages of a case',
    s1: 'Details →',
    s2: 'Sample screen · fictional data',
  },
};

export function CaseTour({ active, autoplay, lang = 'th' }: { active: FeatureKey; autoplay: boolean; lang?: Lang }) {
  const c = copy[lang];
  const stages = getStages(lang);
  const [current, setCurrent] = useState(active);
  const root = useRef<HTMLDivElement>(null);
  const stopped = useRef(false);
  useEffect(() => {
    const element = root.current;
    if (
      !element ||
      !autoplay ||
      matchMedia('(prefers-reduced-motion: reduce)').matches ||
      !('IntersectionObserver' in window)
    )
      return;
    let timer: ReturnType<typeof setInterval> | undefined;
    const stopTimer = () => {
      if (timer) clearInterval(timer);
      timer = undefined;
    };
    const stop = () => {
      stopped.current = true;
      stopTimer();
    };
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.intersectionRatio >= 0.4 && !stopped.current) {
          if (!timer)
            timer = setInterval(
              () => setCurrent((value) => stages[(stages.findIndex((s) => s.key === value) + 1) % stages.length].key),
              4200,
            );
        } else stopTimer();
      },
      { threshold: 0.4 },
    );
    observer.observe(element);
    // Any pointer, click or keyboard focus hands control to the visitor.
    const events = ['pointerenter', 'click', 'focusin'] as const;
    events.forEach((e) => element.addEventListener(e, stop));
    return () => {
      observer.disconnect();
      stopTimer();
      events.forEach((e) => element.removeEventListener(e, stop));
    };
  }, [autoplay, lang]);
  useEffect(() => {
    const panel = root.current?.querySelector<HTMLElement>(`#panel-${current}`);
    if (!panel) return;
    const rows = panel.querySelectorAll<HTMLElement>('.tour-row');
    rows.forEach((row, index) => {
      row.style.setProperty('--d', `${index * 60}ms`);
      row.classList.remove('row-in');
      void row.offsetWidth;
      row.classList.add('row-in');
    });
    const count = panel.querySelector<HTMLElement>('.count');
    if (!count || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let frame = 0;
    const start = performance.now();
    const tick = (time: number) => {
      const k = Math.min(1, (time - start) / 700);
      count.textContent = Math.round(53500 * (1 - (1 - k) ** 3)).toLocaleString(lang === 'th' ? 'th-TH' : 'en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });
      if (k < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [current, lang]);
  // Roving tabindex: arrows/Home/End move between stages (WAI-ARIA tabs pattern, vertical).
  const onKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    const index = stages.findIndex((s) => s.key === current);
    const next = {
      ArrowDown: index + 1,
      ArrowRight: index + 1,
      ArrowUp: index - 1,
      ArrowLeft: index - 1,
      Home: 0,
      End: stages.length - 1,
    }[event.key];
    if (next === undefined) return;
    event.preventDefault();
    const key = stages[(next + stages.length) % stages.length].key;
    setCurrent(key);
    root.current?.querySelector<HTMLButtonElement>(`#tab-${key}`)?.focus();
  };
  return (
    <div ref={root} className="tour grid items-start gap-8 lg:grid-cols-12">
      <div
        role="tablist"
        aria-orientation="vertical"
        aria-label={c.s0}
        className="divide-y divide-mk-rule border-y border-mk-rule lg:sticky lg:top-24 lg:col-span-4"
      >
        {stages.map((s, i) => (
          <div key={s.key} className={`tour-step rounded-lg ${current === s.key ? 'is-active' : ''}`}>
            <button
              type="button"
              role="tab"
              id={`tab-${s.key}`}
              onClick={() => setCurrent(s.key)}
              onKeyDown={onKeyDown}
              aria-selected={current === s.key}
              aria-controls={`panel-${s.key}`}
              tabIndex={current === s.key ? 0 : -1}
              className="group w-full px-4 py-4 text-left"
            >
              <span className="flex items-baseline gap-3">
                <span className="step-num text-xs tabular-nums text-mk-ink-2">{i + 1}/6</span>
                <span className="step-label font-medium text-mk-ink-2 group-hover:text-mk-ink">{s.label}</span>
              </span>
            </button>
            {current === s.key && (
              <div className="step-content px-4 pb-4 pl-12 text-sm leading-relaxed text-mk-ink-2">
                {s.line}
                <a
                  href={localePath(lang, `/features/${s.slug}`)}
                  className="mt-2 block min-h-11 whitespace-nowrap font-semibold text-mk-brass hover:underline"
                >
                  {c.s1}
                </a>
              </div>
            )}
          </div>
        ))}
      </div>
      <div className="lg:sticky lg:top-24 lg:col-span-8">
        <figure>
          <div className="tour-stage rounded-xl border border-mk-rule bg-mk-surface p-5 md:p-7">
            {stages.map((s) => (
              <div
                id={`panel-${s.key}`}
                key={s.key}
                role="tabpanel"
                aria-labelledby={`tab-${s.key}`}
                className={`tour-panel ${current === s.key ? 'is-on' : ''}`}
              >
                <AppPanel stage={s.key} lang={lang} />
              </div>
            ))}
          </div>
          <figcaption className="mt-3 text-center text-xs text-mk-ink-2">{c.s2}</figcaption>
        </figure>
        <div className="tour-progress mt-4 flex gap-1.5" aria-hidden="true">
          {stages.map((s) => (
            <span key={s.key} className={`h-1 flex-1 rounded-full ${current === s.key ? 'bg-mk-ink' : 'bg-mk-rule'}`} />
          ))}
        </div>
      </div>
    </div>
  );
}

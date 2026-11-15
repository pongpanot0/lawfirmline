'use client';
import { useEffect, useRef, type ReactNode } from 'react';
export function CountUp({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const count = ref.current?.querySelector<HTMLElement>('.count');
    if (!count || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let frame = 0;
    const start = performance.now();
    const tick = (time: number) => {
      const k = Math.min(1, (time - start) / 700);
      count.textContent = Math.round(53500 * (1 - (1 - k) ** 3)).toLocaleString('th-TH', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });
      if (k < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, []);
  return <div ref={ref}>{children}</div>;
}

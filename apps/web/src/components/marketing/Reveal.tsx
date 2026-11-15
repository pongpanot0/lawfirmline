'use client';
import { useEffect, useRef, type ReactNode } from 'react';
export function Reveal({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = ref.current;
    if (!element || matchMedia('(prefers-reduced-motion: reduce)').matches || !('IntersectionObserver' in window))
      return;
    element.classList.add('reveal-armed');
    const show = () => element.classList.add('is-in');
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          show();
          observer.disconnect();
        }
      },
      { threshold: 0, rootMargin: '0px 0px -8% 0px' },
    );
    observer.observe(element);
    const timer = setTimeout(show, 2500);
    return () => {
      observer.disconnect();
      clearTimeout(timer);
    };
  }, []);
  return (
    <div ref={ref} className="reveal">
      {children}
    </div>
  );
}

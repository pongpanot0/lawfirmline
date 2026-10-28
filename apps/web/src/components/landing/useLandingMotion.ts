'use client';

import { useRef } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { useGSAP } from '@gsap/react';

gsap.registerPlugin(ScrollTrigger, useGSAP);

/**
 * The page's one authored moment: the real dashboard screenshot grows from slightly small to
 * full size as it scrolls into view (scrubbed to the scroll, inside the page's own scroll
 * container). Everything else is rendered visible from the server; nothing waits for script.
 */
export function useLandingMotion() {
  const scope = useRef<HTMLDivElement>(null);
  useGSAP(() => {
    const mm = gsap.matchMedia();
    mm.add('(prefers-reduced-motion: no-preference)', () => {
      gsap.fromTo(
        '[data-motion="tour-main"]',
        { scale: 0.9 },
        {
          scale: 1,
          ease: 'none',
          scrollTrigger: { trigger: '[data-motion="tour-main"]', scroller: scope.current, start: 'top bottom', end: 'top 35%', scrub: 0.6 },
        },
      );
    });
    return () => mm.revert();
  }, { scope });
  return scope;
}

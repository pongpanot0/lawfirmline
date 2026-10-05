'use client';

import { useRef } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { useGSAP } from '@gsap/react';

gsap.registerPlugin(ScrollTrigger, useGSAP);

/** Quiet entrances inside the landing page's existing scroll container. */
export function useLandingMotion() {
  const scope = useRef<HTMLDivElement>(null);
  useGSAP(() => {
    const mm = gsap.matchMedia();
    mm.add('(prefers-reduced-motion: no-preference)', () => {
      gsap.from('[data-motion^="hero-"]', { opacity: 0, y: 8, duration: 0.4, stagger: 0.04, ease: 'power2.out' });
      ScrollTrigger.batch('[data-motion="bento-tile"], [data-motion="price-card"], [data-motion="tour-main"]', {
        scroller: scope.current,
        start: 'top 90%',
        once: true,
        onEnter: els => gsap.fromTo(els, { opacity: 0, y: 8 }, { opacity: 1, y: 0, duration: 0.4, stagger: 0.04, ease: 'power2.out' }),
      });
    });
    return () => mm.revert();
  }, { scope });
  return scope;
}

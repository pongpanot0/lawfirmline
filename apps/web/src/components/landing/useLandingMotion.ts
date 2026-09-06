'use client';

import { useRef } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { useGSAP } from '@gsap/react';

gsap.registerPlugin(ScrollTrigger, useGSAP);

/**
 * GSAP motion for the landing page.
 *
 * `.lf-landing` is its own scroll container (see landing-tokens.css —
 * height: 100dvh + overflow-y: auto + scroll-snap) so every ScrollTrigger
 * here must pass `scroller: scope.current` instead of defaulting to the
 * window, or triggers would fire on the wrong scroll position.
 *
 * Everything is gated behind `prefers-reduced-motion: no-preference`.
 */
export function useLandingMotion() {
  const scope = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const scroller = scope.current;
      const mm = gsap.matchMedia();

      mm.add('(prefers-reduced-motion: no-preference)', () => {
        const heroTl = gsap.timeline({ defaults: { ease: 'power3.out', duration: 0.8 } });
        heroTl
          .from('[data-motion="hero-eyebrow"]', { opacity: 0, y: 14 })
          .from('[data-motion="hero-title"]', { opacity: 0, y: 22 }, '-=0.55')
          .from('[data-motion="hero-subtitle"]', { opacity: 0, y: 18 }, '-=0.55')
          .from('[data-motion="hero-cta"]', { opacity: 0, y: 16 }, '-=0.5')
          .from('[data-motion="hero-note"]', { opacity: 0 }, '-=0.45')
          .from('[data-motion="hero-card"]', { opacity: 0, y: 32, scale: 0.96 }, '-=0.65');

        // Product tour — the main dashboard shot rises and settles centered
        // FIRST; only once it's in place do the two supporting screens peek
        // out from behind it. Aux frames travel only a short distance from
        // near-centre to their resting spot, so they never pass over the
        // heading above the stage.
        const tourTl = gsap.timeline({
          scrollTrigger: {
            trigger: '[data-motion="tour-stage"]',
            start: 'top 78%',
            scroller,
          },
        });
        tourTl
          .fromTo(
            '[data-motion="tour-main"]',
            { opacity: 0, y: 70, scale: 0.94 },
            { opacity: 1, y: 0, scale: 1, duration: 0.9, ease: 'power3.out' },
          )
          .fromTo(
            '[data-motion="tour-aux-a"]',
            { opacity: 0, x: 26, y: 18, rotate: 0 },
            { opacity: 1, x: 0, y: 0, rotate: -6, duration: 0.7, ease: 'power2.out' },
            '-=0.4',
          )
          .fromTo(
            '[data-motion="tour-aux-b"]',
            { opacity: 0, x: -26, y: -18, rotate: 0 },
            { opacity: 1, x: 0, y: 0, rotate: 5, duration: 0.7, ease: 'power2.out' },
            '-=0.55',
          );

        gsap.set('[data-motion="bento-tile"]', { opacity: 0, y: 24 });
        ScrollTrigger.batch('[data-motion="bento-tile"]', {
          scroller,
          start: 'top 88%',
          onEnter: (els) =>
            gsap.to(els, { opacity: 1, y: 0, duration: 0.6, ease: 'power2.out', stagger: 0.08, overwrite: true }),
        });

        gsap.set('[data-motion="price-card"]', { opacity: 0, y: 24 });
        ScrollTrigger.batch('[data-motion="price-card"]', {
          scroller,
          start: 'top 88%',
          onEnter: (els) =>
            gsap.to(els, { opacity: 1, y: 0, duration: 0.6, ease: 'power2.out', stagger: 0.08, overwrite: true }),
        });
      });

      return () => mm.revert();
    },
    { scope },
  );

  return scope;
}

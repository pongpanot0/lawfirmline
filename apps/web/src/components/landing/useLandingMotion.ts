'use client';

import { useRef } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { useGSAP } from '@gsap/react';

gsap.registerPlugin(ScrollTrigger, useGSAP);

const EASE = 'expo.out';

/**
 * Scroll-driven motion for everything below the hero (the hero animates in CSS so it never
 * waits for script). All triggers run inside the page's own scroll container. Elements only
 * take their start state when their trigger is created, and every reveal sits below the first
 * screen, so nothing visible on load is hidden. Reduced motion skips all of it.
 */
export function useLandingMotion() {
  const scope = useRef<HTMLDivElement>(null);
  useGSAP(() => {
    const scroller = scope.current;
    const mm = gsap.matchMedia();
    mm.add({ motion: '(prefers-reduced-motion: no-preference)', wide: '(min-width: 40rem)' }, (ctx) => {
      const { motion, wide } = ctx.conditions as { motion: boolean; wide: boolean };
      if (!motion) return;
      // Section headings wipe up from a clipped baseline.
      gsap.utils.toArray<HTMLElement>('[data-motion="head"]').forEach((el) => {
        gsap.fromTo(
          el,
          { clipPath: 'inset(0 0 100% 0)', y: 24 },
          { clipPath: 'inset(0 0 0% 0)', y: 0, duration: 1, ease: EASE, scrollTrigger: { trigger: el, scroller, start: 'top 88%', once: true } },
        );
      });

      // Lists of cards arrive as a group, one beat apart.
      for (const group of ['problem', 'tile', 'price-card']) {
        ScrollTrigger.batch(`[data-motion="${group}"]`, {
          scroller,
          start: 'top 90%',
          once: true,
          onEnter: (els) =>
            gsap.fromTo(els, { opacity: 0, y: 40 }, { opacity: 1, y: 0, duration: 0.9, stagger: 0.08, ease: EASE, overwrite: true }),
        });
      }

      // The product: the dashboard grows to full size as it scrolls in, the two supporting
      // screens drift against it (parallax) on wide screens.
      gsap.fromTo(
        '[data-motion="tour-main"]',
        { scale: 0.88 },
        { scale: 1, ease: 'none', scrollTrigger: { trigger: '[data-motion="tour-main"]', scroller, start: 'top bottom', end: 'top 30%', scrub: 0.6 } },
      );
      if (wide) {
        for (const [sel, dy] of [['aux-a', -60], ['aux-b', 60]] as const) {
          gsap.fromTo(
            `[data-motion="${sel}"]`,
            { y: -dy },
            { y: dy, ease: 'none', scrollTrigger: { trigger: '[data-motion="tour-main"]', scroller, start: 'top bottom', end: 'bottom top', scrub: 0.8 } },
          );
        }
      }

      // The closing call to action settles into place as the band arrives.
      gsap.fromTo(
        '[data-motion="cta"]',
        { scale: 0.92, opacity: 0.4 },
        { scale: 1, opacity: 1, ease: 'none', scrollTrigger: { trigger: '[data-motion="cta"]', scroller, start: 'top bottom', end: 'top 60%', scrub: 0.5 } },
      );
    });
    return () => mm.revert();
  }, { scope });
  return scope;
}

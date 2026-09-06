'use client';

import { useRef } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { useGSAP } from '@gsap/react';

gsap.registerPlugin(ScrollTrigger, useGSAP);

/**
 * GSAP motion for the landing page: a hero entrance timeline, a scroll-triggered
 * convergence of the real-product screenshot stack, and batched reveal for the
 * bento tiles and pricing cards. Everything is gated behind
 * `prefers-reduced-motion: no-preference` — reduced-motion visitors see the
 * page fully rendered with no animation at all.
 */
export function useLandingMotion() {
  const scope = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
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

        gsap.set('[data-motion="tour-main"]', { opacity: 0, y: 64, scale: 0.96 });
        gsap.set('[data-motion="tour-aux-a"]', { opacity: 0, x: -56, y: -28, rotate: -18 });
        gsap.set('[data-motion="tour-aux-b"]', { opacity: 0, x: 56, y: 28, rotate: 16 });

        gsap.to('[data-motion="tour-main"]', {
          opacity: 1,
          y: 0,
          scale: 1,
          duration: 1,
          ease: 'power3.out',
          scrollTrigger: { trigger: '[data-motion="tour-stage"]', start: 'top 78%' },
        });
        gsap.to('[data-motion="tour-aux-a"]', {
          opacity: 1,
          x: 0,
          y: 0,
          rotate: -6,
          duration: 1,
          ease: 'power3.out',
          scrollTrigger: { trigger: '[data-motion="tour-stage"]', start: 'top 72%' },
        });
        gsap.to('[data-motion="tour-aux-b"]', {
          opacity: 1,
          x: 0,
          y: 0,
          rotate: 5,
          duration: 1,
          ease: 'power3.out',
          scrollTrigger: { trigger: '[data-motion="tour-stage"]', start: 'top 72%' },
        });

        gsap.set('[data-motion="bento-tile"]', { opacity: 0, y: 24 });
        ScrollTrigger.batch('[data-motion="bento-tile"]', {
          start: 'top 88%',
          onEnter: (els) =>
            gsap.to(els, { opacity: 1, y: 0, duration: 0.6, ease: 'power2.out', stagger: 0.08, overwrite: true }),
        });

        gsap.set('[data-motion="price-card"]', { opacity: 0, y: 24 });
        ScrollTrigger.batch('[data-motion="price-card"]', {
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

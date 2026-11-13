'use client';

import { useRef } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { ScrollToPlugin } from 'gsap/ScrollToPlugin';
import { useGSAP } from '@gsap/react';

gsap.registerPlugin(ScrollTrigger, ScrollToPlugin, useGSAP);

export function useLandingMotion() {
  const scope = useRef<HTMLDivElement>(null);
  useGSAP(() => {
    const mm = gsap.matchMedia();
    // One matchMedia with conditions: nested matchMedia/contexts made Context.getTweens
    // recurse forever on unmount (crashed client-side navigation to /register).
    mm.add({
      motion: '(prefers-reduced-motion: no-preference)',
      desktop: '(min-width: 900px) and (pointer: fine)',
      hover: '(hover: hover) and (pointer: fine)',
    }, (mmContext) => {
      const { motion, desktop, hover } = mmContext.conditions as { motion: boolean; desktop: boolean; hover: boolean };
      if (!motion) return;
      const teardowns: (() => void)[] = [];
      gsap.timeline().from('[data-title]', { yPercent: 110, opacity: 0, duration: 1, stagger: 0.15, ease: 'power4.out' })
        .from('[data-hero]', { y: 24, opacity: 0, duration: 0.8, stagger: 0.09, ease: 'power3.out' }, 0.15)
        .from('[data-hero-visual]', { y: 60, opacity: 0, rotationX: 10, duration: 1.6, ease: 'power4.out' }, 0.2)
        .fromTo('.tech-hero-visual .tech-sheen', { xPercent: -130 }, { xPercent: 130, duration: 1.6, ease: 'power2.out' }, 0.4);
      gsap.to('.tech-progress', { scaleX: 1, ease: 'none', scrollTrigger: { trigger: scope.current, start: 'top top', end: 'bottom bottom', scrub: true } });
      const marquee = gsap.to('.tech-strip-track', { xPercent: -50, duration: 28, ease: 'none', repeat: -1, paused: true });
      ScrollTrigger.create({ trigger: '.tech-strip', start: 'top bottom', end: 'bottom top', onEnter: () => marquee.play(), onEnterBack: () => marquee.play(), onLeave: () => marquee.pause(), onLeaveBack: () => marquee.pause() });
      if (desktop) {
        const root = scope.current!;
        const sections = Array.from(root.querySelectorAll<HTMLElement>('[data-section]'));
        const links = Array.from(root.querySelectorAll<HTMLAnchorElement>('.tech-section-nav a'));
        let scene: gsap.Context | undefined;
        let positions: { section: HTMLElement; trigger?: ScrollTrigger; settled: number }[] = [];
        let scrollTween: gsap.core.Tween | undefined;
        let resizeTimer = 0;
        const build = () => {
          scene?.revert();
          root.classList.remove('tech-tour-pinned');
          positions = [];
          scene = gsap.context(() => {
            sections.forEach((section) => {
              const isTour = section.id === 'tour';
              if (isTour) root.classList.add('tech-tour-pinned');
              const fits = section.offsetHeight <= window.innerHeight - 72;
              const content = section.querySelector<HTMLElement>('.lf-shell');
              // The tour is the point of the page: pin it even when taller than the viewport,
              // starting once its bottom (the screenshot stage) is on screen.
              if ((!fits && !isTour) || !content) {
                if (isTour) root.classList.remove('tech-tour-pinned');
                section.querySelectorAll<HTMLElement>('[data-reveal], [data-motion="price-card"], [data-motion="head"]').forEach(el => {
                  gsap.from(el, { y: 30, opacity: 0, duration: 0.8, scrollTrigger: { trigger: el, start: 'top 90%', once: true } });
                });
                positions.push({ section, settled: 0 });
                return;
              }
              const timeline = gsap.timeline({ scrollTrigger: {
                trigger: section, start: fits ? 'top 64px' : 'bottom bottom', end: () => `+=${window.innerHeight * (isTour ? 3.4 : 1.3)}`,
                pin: true, scrub: true, anticipatePin: 1,
                snap: { snapTo: 'labelsDirectional', duration: { min: 0.6, max: 1 }, delay: 0.1, ease: 'power2.inOut' },
              } });
              timeline.from(content, { y: 40, opacity: 0, clipPath: 'inset(8% 0 0 0 round 16px)', duration: 0.3, ease: 'power2.out' });
              const heading = content.querySelector('h1, h2');
              const body = content.querySelector('h1 + p, h2 + p');
              const cards = content.querySelectorAll('.tech-feature, .lf-pricing-card');
              if (heading && section.id !== 'hero') timeline.from(heading, { y: 18, opacity: 0, duration: 0.2 }, 0);
              if (body) timeline.from(body, { y: 16, opacity: 0, duration: 0.2 }, 0.1);
              if (cards.length) timeline.from(cards, { y: 20, opacity: 0, stagger: 0.04, duration: 0.2 }, 0.16);
              timeline.addLabel('settled').to({}, { duration: 0.6 });
              if (isTour) {
                const shots = Array.from(section.querySelectorAll<HTMLElement>('[data-shot]'));
                const captions = Array.from(section.querySelectorAll<HTMLElement>('.tech-tour-caption'));
                gsap.set(shots.slice(1), { yPercent: 110 });
                gsap.set(captions.slice(1), { autoAlpha: 0 });
                shots.slice(1).forEach((shot, i) => {
                  timeline.to(shots[i], { scale: 0.9, opacity: 0.55, duration: 0.35 })
                    .to(shot, { yPercent: 0, duration: 0.35 }, '<')
                    .set(captions[i], { autoAlpha: 0 }).set(captions[i + 1], { autoAlpha: 1 })
                    .addLabel(`shot${i + 2}`).to({}, { duration: 0.6 });
                });
              }
              timeline.to(content, { scale: 0.94, opacity: 0.6, y: -24, duration: 0.35, ease: 'power2.inOut' });
              // Snap target past the exit, so a forward scroll can leave the section (without it
              // labelsDirectional snapped back to 'settled' and trapped the reader in the hero).
              timeline.addLabel('exit');
              positions.push({ section, trigger: timeline.scrollTrigger, settled: timeline.labels.settled / timeline.duration() });
            });
          }, root);
          ScrollTrigger.refresh();
          update();
        };
        const destination = (entry: typeof positions[number]) => entry.trigger
          ? entry.trigger.start + (entry.trigger.end - entry.trigger.start) * entry.settled
          : window.scrollY + entry.section.getBoundingClientRect().top - 64;
        const update = () => {
          let active = 0;
          positions.forEach((entry, i) => { if (window.scrollY + 100 >= (entry.trigger?.start ?? destination(entry))) active = i; });
          links.forEach((link, i) => { if (i === active) link.setAttribute('aria-current', 'location'); else link.removeAttribute('aria-current'); });
        };
        const navigate = (event: MouseEvent) => {
          const anchor = (event.target as Element).closest<HTMLAnchorElement>('a[href^="#"]');
          const entry = anchor && positions.find(item => `#${item.section.id}` === anchor.getAttribute('href'));
          if (!anchor || !entry || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
          event.preventDefault();
          history.replaceState(null, '', anchor.getAttribute('href'));
          scrollTween?.kill();
          scrollTween = gsap.to(window, { scrollTo: { y: destination(entry), autoKill: true }, duration: 0.8, ease: 'power2.inOut' });
        };
        const rebuild = () => { window.clearTimeout(resizeTimer); resizeTimer = window.setTimeout(build, 200); };
        root.addEventListener('click', navigate);
        window.addEventListener('scroll', update, { passive: true });
        window.addEventListener('resize', rebuild);
        const images = Array.from(root.querySelectorAll('img'));
        images.forEach(image => image.addEventListener('load', rebuild));
        // First build runs outside the matchMedia context so `scene` is never nested in it.
        const firstBuild = requestAnimationFrame(build);
        teardowns.push(() => {
          cancelAnimationFrame(firstBuild);
          window.clearTimeout(resizeTimer);
          scrollTween?.kill();
          root.removeEventListener('click', navigate);
          window.removeEventListener('scroll', update);
          window.removeEventListener('resize', rebuild);
          images.forEach(image => image.removeEventListener('load', rebuild));
          scene?.revert();
          root.classList.remove('tech-tour-pinned');
        });
      } else {
        gsap.utils.toArray<HTMLElement>('[data-reveal], [data-motion="price-card"], [data-motion="head"]').forEach(el => {
          gsap.from(el, { y: 30, opacity: 0, duration: 0.8, scrollTrigger: { trigger: el, start: 'top 90%', once: true } });
        });
      }
      if (hover) {
        const elements = gsap.utils.toArray<HTMLElement>('.tech-feature, .tech-hero-visual, .tech-shot-tilt, .tech-actions .lf-btn--primary');
        const cleanups = elements.map((el) => {
          let frame = 0;
          const move = (event: PointerEvent) => {
            cancelAnimationFrame(frame);
            frame = requestAnimationFrame(() => {
              const rect = el.getBoundingClientRect();
              const x = (event.clientX - rect.left) / rect.width - 0.5;
              const y = (event.clientY - rect.top) / rect.height - 0.5;
              const spot = el.querySelector<HTMLElement>('.tech-spotlight');
              if (spot) gsap.set(spot, { x: event.clientX - rect.left, y: event.clientY - rect.top, opacity: 1 });
              else if ((el.classList.contains('tech-hero-visual') || el.classList.contains('tech-shot-tilt'))) gsap.to(el, { rotationY: x * 8, rotationX: -y * 6, transformPerspective: 1200, duration: 0.5, overwrite: true });
              else gsap.to(el, { x: x * 8, y: y * 6, duration: 0.4, overwrite: true });
            });
          };
          const leave = () => {
            cancelAnimationFrame(frame);
            const spot = el.querySelector<HTMLElement>('.tech-spotlight');
            if (spot) gsap.set(spot, { opacity: 0 });
            else gsap.to(el, { x: 0, y: 0, rotationX: 0, rotationY: 0, duration: 0.5, overwrite: true });
          };
          el.addEventListener('pointermove', move);
          el.addEventListener('pointerleave', leave);
          return () => { cancelAnimationFrame(frame); el.removeEventListener('pointermove', move); el.removeEventListener('pointerleave', leave); gsap.killTweensOf(el); el.style.transform = ''; /* no gsap.set here: a tween made during revert recurses */ };
        });
        teardowns.push(() => cleanups.forEach(cleanup => cleanup()));
      }
      // Guard: reverting `scene` can call back into this cleanup (GSAP registers it on the
      // active context), which looped forever and crashed client-side navigation.
      let tornDown = false;
      return () => {
        if (tornDown) return;
        tornDown = true;
        teardowns.forEach(teardown => teardown());
      };
    });
    return () => mm.revert();
  }, { scope });
  return scope;
}

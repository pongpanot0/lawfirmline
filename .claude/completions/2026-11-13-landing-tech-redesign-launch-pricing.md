# 2026-11-13 — Landing tech redesign + launch pricing

## What
- Landing page redesigned: dark "global tech premium" look, GSAP motion (hero reveal, 3D product shots, floating chips, marquee, spotlight/tilt), desktop section lock + directional snap, section dots.
- Launch pricing in `PLAN_CONFIG` (single source for landing, billing page, Stripe `price_data`): Team 299 / Firm 699 / Professional 1,490. Yearly = 10 months (2,990 / 6,990 / 14,900). Existing Stripe subscriptions keep their old price.
- Copy per owner's review doc (no outcome promises, consistent CTAs, demo CTA removed, register heading copy).
- Pricing cards aligned with CSS subgrid; per-person yearly math fixed (`pricing-math.ts` + node test).
- Marketing screenshots retaken with placeholder names (นาย A, นางสาว B …).

## Gotchas
- GSAP: never nest `gsap.matchMedia()` / create tweens (`gsap.set`) inside a context cleanup — `Context.revert` recursed forever and crashed client navigation to /register. One `matchMedia` with conditions + a run-once teardown guard.
- `snap: 'labelsDirectional'` needs an `exit` label at the end of each pinned timeline or forward scroll snaps back (hero trap).
- Page-level `metadata.openGraph` replaces the layout's whole object (loses og.png) — change the description in `app/layout.tsx`.
- Local screenshots: mock user `landing-shots@samnuan.test` (samnuan-demo firm, local DB only); demo names were renamed in the local DB only, `seed-app-review-demo.cjs` unchanged.

## Verify
`apps/web`: `npx tsc --noEmit -p .`, `node --test --experimental-strip-types src/components/landing/pricing-math.test.ts`; `apps/api`: `npx jest --runInBand src/saas` (16 suites).

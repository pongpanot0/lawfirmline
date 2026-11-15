# 2026-11-15 — Cream marketing home + 6 feature landing pages

- New public home (`apps/web/src/components/marketing/MarketingHome.tsx`) replaces the dark landing on `/`; old `components/landing/*` kept untouched.
- `/features/[slug]` (6 static pages) from `lib/marketing/features.ts`; copy only from `docs/seo/2026-11-15-landing-pages-fact-sheet.md`.
- Case tour = WAI-ARIA tabs, autoplay only while visible and stops on pointer/click/focus; court-fee estimator uses `estimateCourtFee` from shared.
- Design source of truth: `docs/design/2026-11-15-seo-pages/prototype/` (user-approved), PRODUCT.md, DESIGN.md.
- Gotchas: rebuild `packages/shared` dist in a fresh worktree before tsc/build; `next dev` here hits a duplicate-React `useInsertionEffect` error, verify with `next build && next start`.
- Follow-ups: real app screenshots instead of coded mock panels, `/en` pages, `/pricing` + `/articles` routes, LINE-invoice claim still unverified.

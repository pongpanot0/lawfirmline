---
version: 1
slug: "apps-web-src-app-features"
primary_target: "apps/web/src/app/features"
related_targets: ["apps/web/src/app/page.tsx"]
---

# Surface brief: public marketing home + problem-based feature pages (/, /features/*)

Scope: home page and six feature pages: case-management, court-calendar, deadlines, team-workload, client-portal, billing. Visitor mode: Persuade.
Audience: owners of small/mid Thai law firms and solo lawyers deciding to try Samnuan. Action: start the 30-day free trial.
Proof/content: verified facts in docs/seo/2026-11-15-landing-pages-fact-sheet.md only. No testimonials, logos, counts, security certifications.
Constraints: DESIGN.md (Editorial Juris) world is fixed; plan names/prices from PLAN_CONFIG; Thai only for now (EN pages are a follow-up).
Approved artifact: docs/design/2026-11-15-seo-pages/prototype/ (animated HTML, user-approved 2026-11-15).

## Direction contract

seed: 25488d8c29fcfb3372bc76038c37d528 (first lock "case file tabs" was superseded by the user: "it should show the whole program")

THESIS: Show the whole product, the way Attio/Linear do: a real-looking app screen first, then one case followed through every stage. Refuses the single-feature hero + three icon cards template.

OWN-WORLD: Cream paper, navy ink, brass only for the active stage number, court emphasis and small markers. Upright Trirong headings, Noto Sans Thai body. Hairline rules, flat panels, no gradients except the hero screen's fade into paper.

STRUCTURE: Home = hero, full "วันนี้" app figure, six-stage case tour (autoplay while visible, click/keyboard takes over), Thai-law ruled strip, phone screens, real pricing, CTA. Feature page = hero + that stage's screen, customer-voice quote, three ruled detail rows, optional live court-fee estimator, the same tour with this stage active, FAQ, CTA.

MEMORABLE MOMENT: The tour: screens swap with rows sliding in while the stage list follows, so a visitor sees one case move from file to invoice.

VOICE: Plain Thai a firm owner would say; legal terms used correctly; no translated phrasing; no hype or invented numbers.

AVOID: fake browser/phone chrome, side-tab colour bars, numbered eyebrows, icon-tile grids, italic headings, claims outside the fact sheet, real company names in demo data.

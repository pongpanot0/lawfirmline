# 2026-10-18 — Pricing Model B + landing redesign

Source: Samnuan_Pricing_Competitive_Strategy_2026.md (§5.1, §9).

- `PLAN_CONFIG` (packages/shared) is the single price source for checkout and landing:
  Solo 149/1, Team 499/3 (new), Firm 1,290/10, Professional 2,990/20.
- New `SubscriptionPlan.TEAM` — migration `20261018120000_subscription_plan_team` (enum ADD VALUE).
- Trial firms get Team seats (3) instead of Solo.
- Landing: centered hero + price strip, numbered pain points, 2×2 features, 5 pricing cards
  (Team = แนะนำ), fine print, no comparison table. Early Access 50% promo removed.
- Not done: Free plan (needs quotas — doc Phase 2), VAT wording (depends on registration status).
- Stitch generation timed out 3× (projects 394194744767221958, 6737914094852607318) — design done in code.

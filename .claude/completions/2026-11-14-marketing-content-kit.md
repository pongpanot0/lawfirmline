# 2026-11-14 — Marketing plan + weekly content kit (0 THB)

## What
- `docs/research/2026-11-14-samnuan-ads-customer-acquisition.md`: 0-baht acquisition plan, ICP = small litigation offices (1–10 lawyers), free channels, automation stack, 90-day plan (Codex Sol research, 2 passes).
- `marketing/`: weekly job (launchd, Mon 09:00) → Codex drafts 3 Thai FB posts ("ปัญหาเงียบ" angle, Thai social-caption rules baked into the prompt) → Playwright renders brand cards + one Codex-generated promo photo with HTML text overlay → schedules all 3 on the FB Page via Graph API (`/photos`, `published=false`, `scheduled_publish_time`) → feed-style email via Resend.

## Decisions
- AI never posts unseen: posts are *scheduled*; reviewer deletes/edits in Meta Business Suite › Planner before publish time.
- Image model never draws Thai text (unreliable); template overlays it.
- Codex child processes get an env without Resend/FB secrets. Token goes in request body, never URL.
- No token → email-only mode; per-post FB failures are reported in the email, never fail the run.

## Verified
- Dry run + stress render (long Thai text auto-shrinks), real Codex draft, real Resend email (HTML + inline cid images in Gmail), Codex image gen, `fb-check.mjs --live` and a scheduled `/photos` post created+deleted on page "Samnuan สำนวน".

## Ops
- Secrets in `marketing/.env` (gitignored): RESEND_API_KEY, MAIL_FROM, MAIL_TO, FB_PAGE_ID, FB_PAGE_TOKEN (non-expiring Page token, app "Samnuan Marketing" 4489180154664960, dev mode).
- Enable after merge: see `marketing/README.md` (launchd plist points at the main checkout).

# Office-manager onboarding (Hallmark redesign, usability)

Role: an office manager uses the existing FirmRole OWNER (firm-wide cases, finance, team). Multiple owners are allowed. No new role added.

Changes (web only, no API/schema):
- team/page.tsx + i18n: every invite role shows a one-line "what they can see" hint; Owner label reads "เจ้าของ / ผู้ดูแลสำนักงาน".
- SamnuanSidebar: owner-only "เริ่มต้นใช้งาน" entry (was only reachable from Settings).
- getting-started/page.tsx: 3-step setup checklist with real counts and a highlighted next step; office-manager routine (morning / during the day / weekly) linking to real pages; CSV import moved into a disclosure.
- operations/page.tsx: setup nudge while setup is incomplete; tabs split into daily (today, team overview) and "รายงาน"; title matches the nav label.
- practice-setup.ts: setupChecks() shared by both pages.

Verified: web tsc clean; preview at 3016 as seeded owner at 320/375/desktop, no horizontal scroll.
Known local issue: /operations/daily 500s locally because the shared DB lacks FirmRole EXTERNAL (unapplied migration from another branch), unrelated to this change.

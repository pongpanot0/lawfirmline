# Case pages — visual round 2 (2026-11-10)

Visual-only redesign of the 7 case pages, following the approved Stitch mockups (Editorial Juris). No API or behaviour changes and no features removed. Invented mockup content was skipped: HASH codes, "แบบร่าง" chips, breadcrumbs.

## Pages
- **Case list:** header, filter card, list/board toggle (`CaseViewToggle`), restyled table.
- **Board:** same header and toggle as the list.
- **Excel import:** step indicator, summary chips, row edit moved into expandable rows, sticky footer.
- **Case detail.**
  - Header: badges, meta line, primary and secondary actions.
  - A `⋯` menu holds the manual stage change, close/reopen and delete. The old stage-selector card no longer competes with the journey.
  - The SOP suggestion moved under the journey; stat strip; scrollable tabs.
- **Tasks tab:** grouped by stage. The current stage comes first; finished stages are collapsed.
- **Document review:** header and pass / needs-fix segmented decision. Version upload and history are kept.
- **New-case form:** 5 numbered sections and a summary card with a required-fields checklist; sticky submit bar on small screens.
- **Email-intake thread:**
  - Layout is 60/40, e-mail first.
  - Older messages and attachments collapse behind "แสดงทั้งหมด / แสดงอีก N".
  - A messages / attachments view.
- **Pre-lit card:** with many pending AI proposals (more than 4) the section starts collapsed.

## Verification
- Web: tsc clean; 209 node tests pass.
- Local click-through (built-in browser):
  - Case list, case detail (the ⋯ menu and its manual stage change), new-case form, email-intake page (60/40 checked through computed grid).
  - All five pages have scrollWidth 375 at a 375px viewport.
- Cursor review:
  - Fixed: older messages can be collapsed again; "ดำเนินการปิดคดี" from the ⋯ menu closes the menu and scrolls to the form.
  - Not changed, pre-existing on main: no bulk selection on mobile cards; close submit stays disabled if the outstanding-items check fails.
- Not verified locally: heavy threads with 5+ messages (the local DB only has single-message threads), and a document-review page with data.
